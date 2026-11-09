/** Governanca da Entidade: modos de IA, cotas, telemetria e conhecimento aprovado. */
const MODOS_IA_ENTIDADE_ = ['SEM_IA', 'IA_SOB_DEMANDA', 'IA_EDITORIAL_AGENDADA'];
const CABECALHO_TELEMETRIA_ENTIDADE_ = [
  'DATA', 'PROVEDOR', 'MODELO', 'TENTATIVA', 'RESULTADO', 'HTTP',
  'LATENCIA_MS', 'TOKENS_ENTRADA_ESTIMADOS', 'LIMITE_SAIDA', 'TOKENS_CONFIRMADOS'
];

function obterModoIaEntidade_() {
  const modo = String(obterConfigValorInterno_('ENTIDADE_MODO_IA') || 'IA_SOB_DEMANDA').toUpperCase().trim();
  return MODOS_IA_ENTIDADE_.indexOf(modo) !== -1 ? modo : 'IA_SOB_DEMANDA';
}

function obterConfiguracaoGovernancaEntidade() {
  obterDadosUsuarioLogado();
  return {
    modo: obterModoIaEntidade_(),
    modosDisponiveis: MODOS_IA_ENTIDADE_.slice(),
    observacao: 'Alertas e consultas deterministicas continuam ativos em todos os modos.'
  };
}

function salvarConfiguracaoGovernancaEntidade(modo) {
  const usuario = obterDadosUsuarioLogado();
  if (usuario.papel !== 'Administrador' && usuario.papel !== 'Admin') {
    throw new Error('Somente Administrador pode alterar o modo da IA.');
  }
  const valor = String(modo || '').toUpperCase().trim();
  if (MODOS_IA_ENTIDADE_.indexOf(valor) === -1) throw new Error('Modo de IA invalido.');
  PropertiesService.getScriptProperties().setProperty('ENTIDADE_MODO_IA', valor);
  return obterConfiguracaoGovernancaEntidade();
}

function numeroConfigEntidade_(chave, padrao, minimo, maximo) {
  const informado = Number(obterConfigValorInterno_(chave));
  const valor = isFinite(informado) && informado > 0 ? informado : padrao;
  return Math.max(minimo, Math.min(maximo, Math.floor(valor)));
}

function limitesProvedorEntidade_(provedor) {
  const prefixo = String(provedor || '').toUpperCase();
  const padraoReq = prefixo === 'GROQ' ? 900 : 45;
  const padraoTokens = prefixo === 'GROQ' ? 190000 : 60000;
  // Uma leitura visual com frente e verso reserva mais tokens que uma conversa
  // curta. O limite anterior de 8 mil barrava a chamada antes de ela chegar ao
  // OpenRouter (prompt + 2 imagens + JSON de até 31 dias passa desse valor).
  const padraoMinuto = prefixo === 'GROQ' ? 12000 : 16000;
  return {
    requisicoesDia: numeroConfigEntidade_('ENTIDADE_' + prefixo + '_REQUISICOES_DIA', padraoReq, 1, 100000),
    tokensDia: numeroConfigEntidade_('ENTIDADE_' + prefixo + '_TOKENS_DIA', padraoTokens, 1000, 10000000),
    tokensMinuto: numeroConfigEntidade_('ENTIDADE_' + prefixo + '_TOKENS_MINUTO', padraoMinuto, 500, 1000000)
  };
}

function novoUsoEntidade_(agora) {
  return {
    data: Utilities.formatDate(agora, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    minuto: Utilities.formatDate(agora, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
    provedores: {}
  };
}

function lerUsoEntidadeSemLock_(props, agora) {
  let uso = null;
  try { uso = JSON.parse(props.getProperty('ENTIDADE_USO_DIARIO_V2') || 'null'); } catch (e) {}
  const base = novoUsoEntidade_(agora);
  if (!uso || uso.data !== base.data) return base;
  if (uso.minuto !== base.minuto) {
    uso.minuto = base.minuto;
    Object.keys(uso.provedores || {}).forEach(function(nome) { uso.provedores[nome].tokensMinuto = 0; });
  }
  uso.provedores = uso.provedores || {};
  return uso;
}

/** Reserva a pior hipotese antes de cada tentativa, sob lock. */
function reservarCotaTentativaEntidade_(provedor, estimativaEntrada, limiteSaida) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { autorizado: false, motivo: 'controle de cota ocupado' };
  try {
    const agora = new Date();
    const props = PropertiesService.getScriptProperties();
    const uso = lerUsoEntidadeSemLock_(props, agora);
    const nome = String(provedor || 'Desconhecido');
    const atual = uso.provedores[nome] || { tentativas: 0, sucessos: 0, tokens: 0, tokensMinuto: 0 };
    const reserva = Math.max(1, Number(estimativaEntrada || 0)) + Math.max(1, Number(limiteSaida || 0));
    const limites = limitesProvedorEntidade_(nome);
    if (atual.tentativas + 1 > limites.requisicoesDia) return { autorizado: false, motivo: 'limite diario de tentativas' };
    if (atual.tokens + reserva > limites.tokensDia) return { autorizado: false, motivo: 'limite diario de tokens' };
    if (atual.tokensMinuto + reserva > limites.tokensMinuto) return { autorizado: false, motivo: 'limite por minuto' };
    atual.tentativas += 1;
    atual.tokens += reserva;
    atual.tokensMinuto += reserva;
    uso.provedores[nome] = atual;
    props.setProperty('ENTIDADE_USO_DIARIO_V2', JSON.stringify(uso));
    return { autorizado: true, reserva: reserva, data: uso.data, minuto: uso.minuto };
  } finally {
    lock.releaseLock();
  }
}

function reconciliarCotaTentativaEntidade_(provedor, reserva, tokensConfirmados, sucesso, codigo) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const uso = lerUsoEntidadeSemLock_(props, new Date());
    const nome = String(provedor || 'Desconhecido');
    const atual = uso.provedores[nome] || { tentativas: 0, sucessos: 0, tokens: 0, tokensMinuto: 0 };
    const confirmado = Number(tokensConfirmados || 0);
    const reservado = Number(typeof reserva === 'object' ? reserva.reserva : reserva) || 0;
    const semConsumo = !confirmado && [400, 401, 402, 403, 404, 413, 429].indexOf(Number(codigo)) !== -1;
    if (confirmado > 0 || semConsumo) {
      const diferenca = (semConsumo ? 0 : confirmado) - reservado;
      atual.tokens = Math.max(0, atual.tokens + diferenca);
      // A resposta pode chegar no minuto seguinte; nesse caso a reserva do
      // minuto anterior já expirou e não deve descontar o uso novo.
      if (!reserva || typeof reserva !== 'object' || reserva.minuto === uso.minuto) {
        atual.tokensMinuto = Math.max(0, atual.tokensMinuto + diferenca);
      }
    }
    if (sucesso) atual.sucessos = Number(atual.sucessos || 0) + 1;
    uso.provedores[nome] = atual;
    props.setProperty('ENTIDADE_USO_DIARIO_V2', JSON.stringify(uso));
  } finally {
    lock.releaseLock();
  }
}

function obterAbaTelemetriaEntidade_() {
  const ss = obterPlanilha_();
  let aba = ss.getSheetByName('Entidade_Telemetria');
  if (!aba) {
    aba = ss.insertSheet('Entidade_Telemetria');
    aba.getRange(1, 1, 1, CABECALHO_TELEMETRIA_ENTIDADE_.length).setValues([CABECALHO_TELEMETRIA_ENTIDADE_]);
    aba.setFrozenRows(1);
  }
  return aba;
}

function registrarTelemetriaTentativaEntidade_(dados) {
  try {
    obterAbaTelemetriaEntidade_().appendRow([
      new Date(), String(dados.provedor || ''), String(dados.modelo || ''), Number(dados.tentativa || 0),
      String(dados.resultado || ''), Number(dados.codigo || 0), Number(dados.latenciaMs || 0),
      Number(dados.tokensEntradaEstimados || 0), Number(dados.limiteSaida || 0), Number(dados.tokensConfirmados || 0)
    ]);
  } catch (e) {
    Logger.log('Falha ao registrar telemetria da Entidade: ' + e.toString());
  }
}

function obterAbaConhecimentoEntidade_(ss) {
  const cabecalho = ['CHAVE', 'DATA_ATUALIZACAO', 'PERGUNTA_REFERENCIA', 'ORIENTACAO_VALIDADA', 'ATIVO', 'ESCOPO', 'FONTE', 'VALIDO_ATE', 'AUTOR_APROVACAO', 'APROVADO_EM'];
  let aba = ss.getSheetByName('IA_Conhecimento');
  if (!aba) aba = ss.insertSheet('IA_Conhecimento');
  if (aba.getLastRow() === 0) aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  else if (aba.getLastColumn() < cabecalho.length) aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  aba.setFrozenRows(1);
  return aba;
}

/** Feedback mede utilidade. Publicacao como conhecimento exige esta acao separada. */
function aprovarConhecimentoEntidade(interacaoId, escopo, fonte, validoAte) {
  const usuario = obterDadosUsuarioLogado();
  if (usuario.papel !== 'Administrador' && usuario.papel !== 'Admin') {
    throw new Error('Somente Administrador pode aprovar conhecimento da Entidade.');
  }
  const origem = String(fonte || '').trim().slice(0, 500);
  if (!origem) throw new Error('Informe a fonte usada para validar a orientacao.');
  const dataLimite = String(validoAte || '').trim();
  if (dataLimite && isNaN(new Date(dataLimite + 'T12:00:00').getTime())) throw new Error('Validade invalida.');
  const ss = obterPlanilha_();
  const memoria = ss.getSheetByName('IA_Memoria');
  if (!memoria || memoria.getLastRow() <= 1) throw new Error('Interacao nao encontrada.');
  const linhas = memoria.getRange(2, 1, memoria.getLastRow() - 1, 8).getDisplayValues();
  let item = null;
  for (let i = 0; i < linhas.length; i++) if (String(linhas[i][0]) === String(interacaoId)) { item = linhas[i]; break; }
  if (!item) throw new Error('Interacao nao encontrada.');
  const pergunta = String(item[3] || '').trim();
  const orientacao = String(item[6] || item[4] || '').trim();
  if (!pergunta || !orientacao) throw new Error('A interacao nao possui conteudo suficiente para aprovacao.');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalizarCabecalho_(pergunta + '|' + orientacao).toLowerCase(), Utilities.Charset.UTF_8);
  const chave = Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
  const aba = obterAbaConhecimentoEntidade_(ss);
  const linhaNova = [chave, new Date(), pergunta.slice(0, 1000), orientacao.slice(0, 4000), 'Sim', String(escopo || 'SETUR').slice(0, 200), origem, dataLimite, usuario.email || usuario.nome || '', new Date()];
  if (aba.getLastRow() > 1) {
    const chaves = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues();
    for (let j = 0; j < chaves.length; j++) if (chaves[j][0] === chave) { aba.getRange(j + 2, 1, 1, linhaNova.length).setValues([linhaNova]); return { aprovado: true, chave: chave, atualizado: true }; }
  }
  aba.appendRow(linhaNova);
  return { aprovado: true, chave: chave, atualizado: false };
}

function filtrarHistoricoPrivadoEntidade_(linhas, identificadorUsuario, limite) {
  const id = String(identificadorUsuario || '').toLowerCase().trim();
  return (linhas || []).filter(function(linha) {
    return String(linha[2] || '').toLowerCase().trim() === id && String(linha[7] || 'Sim') !== 'Não';
  }).slice(-Math.max(1, Number(limite || 6))).reverse();
}

/** Consome proposta de forma atomica; repeticoes devolvem o resultado ja confirmado. */
function iniciarConsumoPropostaEntidade_(chave, usuarioId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    let proposta = null;
    try { proposta = JSON.parse(props.getProperty(chave) || 'null'); } catch (e) {}
    if (!proposta) throw new Error('Esta proposta não existe mais. Gere uma nova proposta.');
    if (proposta.estado === 'CONCLUIDA') return { concluida: true, resultado: proposta.resultado || { sucesso: true } };
    if (Date.now() > Number(proposta.expiraEm || 0)) {
      props.deleteProperty(chave);
      throw new Error('Esta proposta expirou. Gere uma nova proposta.');
    }
    if (String(proposta.usuario || proposta.usuarioEmail || '').toLowerCase() !== String(usuarioId || '').toLowerCase()) {
      throw new Error('Esta proposta pertence a outro usuário.');
    }
    if (proposta.estado === 'PROCESSANDO' && Number(proposta.processamentoExpiraEm || 0) > Date.now()) {
      throw new Error('Esta proposta já está sendo confirmada. Aguarde a conclusão.');
    }
    const dono = Utilities.getUuid();
    proposta.estado = 'PROCESSANDO';
    proposta.processamentoDono = dono;
    proposta.processamentoExpiraEm = Date.now() + 120000;
    props.setProperty(chave, JSON.stringify(proposta));
    return { concluida: false, dono: dono, proposta: proposta };
  } finally { lock.releaseLock(); }
}

function finalizarConsumoPropostaEntidade_(chave, dono, resultado) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    let proposta = null;
    try { proposta = JSON.parse(props.getProperty(chave) || 'null'); } catch (e) {}
    if (!proposta || proposta.processamentoDono !== dono) return;
    proposta.estado = 'CONCLUIDA';
    proposta.resultado = resultado || { sucesso: true };
    proposta.expiraEm = Date.now() + 86400000;
    delete proposta.processamentoDono;
    delete proposta.processamentoExpiraEm;
    props.setProperty(chave, JSON.stringify(proposta));
  } finally { lock.releaseLock(); }
}

function liberarConsumoPropostaEntidade_(chave, dono) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    let proposta = null;
    try { proposta = JSON.parse(props.getProperty(chave) || 'null'); } catch (e) {}
    if (!proposta || proposta.processamentoDono !== dono) return;
    proposta.estado = 'PENDENTE';
    delete proposta.processamentoDono;
    delete proposta.processamentoExpiraEm;
    props.setProperty(chave, JSON.stringify(proposta));
  } finally { lock.releaseLock(); }
}

function limparPropostasExpiradasEntidade_() {
  const props = PropertiesService.getScriptProperties();
  const todas = props.getProperties();
  let removidas = 0;
  Object.keys(todas).forEach(function(chave) {
    if (chave.indexOf('ENTIDADE_PROPOSTA_') !== 0 && chave.indexOf('ENTIDADE_LANCAMENTO_') !== 0) return;
    let item = null;
    try { item = JSON.parse(todas[chave] || 'null'); } catch (e) {}
    if (!item || Date.now() > Number(item.expiraEm || 0)) { props.deleteProperty(chave); removidas++; }
  });
  return removidas;
}
