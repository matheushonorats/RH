/**
 * Fila operacional deterministica da Entidade.
 *
 * Uma ocorrencia representa um fato verificado na leitura atual, nao uma
 * mensagem gerada por IA. O ID permanece estavel enquanto a regra e os
 * registros envolvidos forem os mesmos; a revisao muda quando a evidencia
 * muda. Leitura por usuario e resolucao do fato sao estados independentes.
 */

const ENTIDADE_OCORRENCIAS_ABA_ = 'Entidade_Ocorrencias';
const ENTIDADE_EVENTOS_ABA_ = 'Entidade_Eventos';
const ENTIDADE_LEITURAS_ABA_ = 'Entidade_Leituras';
const ENTIDADE_OCORRENCIAS_CABECALHO_ = [
  'ID', 'REGRA', 'VERSAO_REGRA', 'MATRICULA', 'NOME', 'TITULO', 'DESCRICAO',
  'SEVERIDADE', 'SITUACAO', 'EVIDENCIA_JSON', 'REVISAO_EVIDENCIA',
  'DETECTADA_EM', 'VERIFICADA_EM', 'PRAZO', 'RESPONSAVEL', 'ADIADA_ATE',
  'MOTIVO', 'RESOLVIDA_EM', 'ATUALIZADA_EM', 'ACAO_JSON'
];
const ENTIDADE_EVENTOS_CABECALHO_ = ['ID', 'OCORRENCIA_ID', 'DATA', 'TIPO', 'USUARIO', 'DETALHES'];
const ENTIDADE_LEITURAS_CABECALHO_ = ['CHAVE', 'OCORRENCIA_ID', 'REVISAO_EVIDENCIA', 'USUARIO', 'ENTREGUE_EM', 'LIDO_EM'];

function obterOuCriarAbaEntidade_(nome, cabecalho) {
  const ss = obterPlanilha_();
  let aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    aba.setFrozenRows(1);
  } else if (aba.getLastColumn() < cabecalho.length) {
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  }
  return aba;
}

function hashEntidadeOcorrencia_(valor) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(valor || ''), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 24);
}

function serializarEvidenciaEntidade_(evidencia) {
  function ordenar(valor) {
    if (Array.isArray(valor)) return valor.map(ordenar);
    if (!valor || typeof valor !== 'object' || valor instanceof Date) return valor;
    return Object.keys(valor).sort().reduce(function(saida, chave) {
      saida[chave] = ordenar(valor[chave]);
      return saida;
    }, {});
  }
  return JSON.stringify(ordenar(evidencia || {}));
}

function criarOcorrenciaEntidade_(regra, identidade, dados) {
  const evidenciaJson = serializarEvidenciaEntidade_(dados.evidencia || {});
  return {
    id: 'ENT-' + hashEntidadeOcorrencia_(regra + '|' + identidade),
    regra: regra,
    versaoRegra: String(dados.versaoRegra || '1'),
    matricula: String(dados.matricula || ''),
    nome: String(dados.nome || 'Registro não identificado'),
    titulo: String(dados.titulo || 'Conferência necessária'),
    descricao: String(dados.descricao || ''),
    severidade: Math.max(1, Math.min(4, Number(dados.severidade || 1))),
    situacao: 'ABERTA',
    evidenciaJson: evidenciaJson,
    revisaoEvidencia: hashEntidadeOcorrencia_(evidenciaJson),
    prazo: dados.prazo || '',
    acao: dados.acao || { tipo: 'LANCAMENTOS', matricula: String(dados.matricula || '') }
  };
}

function parseDataOcorrenciaEntidade_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return new Date(valor.getTime());
  const texto = String(valor || '').trim().split(' ')[0];
  let partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let ano, mes, dia;
  if (partes) {
    dia = Number(partes[1]); mes = Number(partes[2]); ano = Number(partes[3]);
  } else {
    partes = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!partes) return null;
    ano = Number(partes[1]); mes = Number(partes[2]); dia = Number(partes[3]);
  }
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
  data.setHours(0, 0, 0, 0);
  return data;
}

function detectarOcorrenciasEntidade_(contexto) {
  const ocorrencias = [];

  (contexto.divergenciasIdentificacaoLancamentos || []).forEach(function(item) {
    const linha = Number(item.linhaPlanilha || 0);
    const identidade = String(linha || '') + '|' + String(item.matriculaColuna || '') + '|' + String(item.matriculaNoNome || '');
    ocorrencias.push(criarOcorrenciaEntidade_('DIVERGENCIA_IDENTIFICACAO_LANCAMENTO', identidade, {
      versaoRegra: '2', matricula: item.matriculaColuna, nome: item.nome,
      titulo: 'Identificação divergente no lançamento', severidade: 4,
      descricao: 'A linha ' + linha + ' informa a matrícula ' + String(item.matriculaColuna || '-') + ' na coluna de matrícula, mas o nome aponta para ' + String(item.matriculaNoNome || '-') + '. Corrija a origem antes de atribuir o lançamento.',
      evidencia: item,
      acao: { tipo: 'LANCAMENTO', linhaPlanilha: linha, matricula: String(item.matriculaColuna || '') }
    }));
  });

  (contexto.conflitosDeAfastamentos || []).forEach(function(item) {
    const ids = [String(item.primeiroId || ''), String(item.segundoId || '')].sort();
    const linhas = (item.linhasPlanilha || []).map(Number).sort(function(a, b) { return a - b; });
    const identidade = normalizarChaveMatricula_(item.matricula) + '|' + (ids.join('|') || linhas.join('|'));
    ocorrencias.push(criarOcorrenciaEntidade_('SOBREPOSICAO_AFASTAMENTOS', identidade, {
      versaoRegra: '3', matricula: item.matricula, nome: item.nome,
      titulo: 'Sobreposição de afastamentos', severidade: 4,
      descricao: String(item.primeiroTipo || 'Afastamento') + ' (' + String(item.primeiroPeriodo || '-') + ') coincide com ' + String(item.segundoTipo || 'outro afastamento') + ' (' + String(item.segundoPeriodo || '-') + '). Confira qual registro precisa ser corrigido ou anulado.',
      evidencia: item,
      prazo: item.inicioSobreposicao || '',
      acao: { tipo: 'LANCAMENTOS', linhasPlanilha: linhas, matricula: String(item.matricula || '') }
    }));
  });

  (contexto.servidoresEmFeriasCompulsorias || []).forEach(function(item) {
    const dias = Number(item.diasParaTerceiroPeriodo);
    const severidade = isFinite(dias) && dias <= 30 ? 4 : (isFinite(dias) && dias <= 90 ? 3 : 2);
    const titulo = isFinite(dias) && dias <= 0 ? 'Prazo de férias atingido' : 'Programação preventiva de férias';
    ocorrencias.push(criarOcorrenciaEntidade_('PRAZO_FERIAS_TERCEIRO_PERIODO', normalizarChaveMatricula_(item.matricula), {
      versaoRegra: '2', matricula: item.matricula, nome: item.nome,
      titulo: titulo, severidade: severidade,
      descricao: (isFinite(dias) ? (dias < 0 ? 'Prazo vencido há ' + Math.abs(dias) + ' dia(s).' : 'Faltam ' + dias + ' dia(s) para o marco informado.') : 'O prazo precisa de conferência.') + ' Saldo atual: ' + Number(item.saldoDisponivelDias || 0) + ' dia(s).',
      evidencia: item,
      prazo: item.dataTerceiroPeriodo || '',
      acao: { tipo: 'SERVIDOR', matricula: String(item.matricula || '') }
    }));
  });

  (contexto.pendenciasDe1Doc || []).forEach(function(item) {
    const dias = Number(item.diasPendente || 0);
    const identidade = String(item.id || item.linhaPlanilha || '') + '|' + normalizarChaveMatricula_(item.matricula) + '|' + String(item.dataSolicitacao || '') + '|' + String(item.tipo || '');
    ocorrencias.push(criarOcorrenciaEntidade_('LANCAMENTO_SEM_1DOC', identidade, {
      versaoRegra: '2', matricula: item.matricula, nome: item.nome,
      titulo: 'Número 1DOC pendente', severidade: dias >= 15 ? 3 : (dias >= 7 ? 2 : 1),
      descricao: String(item.tipo || 'Lançamento') + ' solicitado em ' + String(item.dataSolicitacao || 'data não informada') + (dias ? ', pendente há ' + dias + ' dia(s).' : ', ainda sem número 1DOC.'),
      evidencia: item,
      prazo: item.dataInicio || item.dataSolicitacao || '',
      acao: { tipo: 'LANCAMENTO', linhaPlanilha: Number(item.linhaPlanilha || 0), matricula: String(item.matricula || '') }
    }));
  });

  const alertasCadastro = (((contexto || {}).sinaisCruzados || {}).qualidadeCadastral || {}).alertasRecentesDeCadastroOuAlteracao || [];
  alertasCadastro.forEach(function(item) {
    const matricula = normalizarChaveMatricula_(item.matricula);
    const identidade = matricula + '|' + String(item.campo || '') + '|' + String(item.motivo || '');
    ocorrencias.push(criarOcorrenciaEntidade_('CADASTRO_REQUER_CONFERENCIA', identidade, {
      versaoRegra: '2', matricula: matricula, nome: item.nome,
      titulo: 'Cadastro requer conferência', severidade: String(item.severidade || '') === 'ERRO' ? 4 : 2,
      descricao: String(item.campo || 'Campo') + ': ' + String(item.motivo || 'valor precisa ser conferido.'),
      evidencia: item,
      acao: { tipo: 'SERVIDOR', matricula: matricula }
    }));
  });

  (contexto.coberturaInsuficiente || []).forEach(function(item) {
    const identidade = normalizarCabecalho_(item.lotacao || '').toUpperCase();
    ocorrencias.push(criarOcorrenciaEntidade_('COBERTURA_MINIMA', identidade, {
      versaoRegra: '1', nome: item.lotacao, titulo: 'Cobertura abaixo do mínimo configurado', severidade: 3,
      descricao: 'Em ' + String(item.data || '-') + ', estão previstos ' + Number(item.disponiveis || 0) + ' servidor(es) disponíveis; mínimo configurado: ' + Number(item.minimo || 0) + '.',
      evidencia: item, prazo: item.data || '', acao: { tipo: 'RELATORIOS', lotacao: String(item.lotacao || '') }
    }));
  });

  return ocorrencias.sort(ordenarOcorrenciasEntidade_);
}

function ordenarOcorrenciasEntidade_(a, b) {
  const severidade = Number(b.severidade || 0) - Number(a.severidade || 0);
  if (severidade) return severidade;
  const prazoA = parseDataOcorrenciaEntidade_(a.prazo);
  const prazoB = parseDataOcorrenciaEntidade_(b.prazo);
  const valorA = prazoA ? prazoA.getTime() : Number.MAX_VALUE;
  const valorB = prazoB ? prazoB.getTime() : Number.MAX_VALUE;
  if (valorA !== valorB) return valorA - valorB;
  return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' });
}

function linhaParaOcorrenciaEntidade_(linha) {
  let acao = {};
  try { acao = JSON.parse(String(linha[19] || '{}')); } catch (e) {}
  return {
    id: String(linha[0] || ''), regra: String(linha[1] || ''), versaoRegra: String(linha[2] || ''),
    matricula: String(linha[3] || ''), nome: String(linha[4] || ''), titulo: String(linha[5] || ''),
    descricao: String(linha[6] || ''), severidade: Number(linha[7] || 1), situacao: String(linha[8] || 'ABERTA'),
    evidenciaJson: String(linha[9] || '{}'), revisaoEvidencia: String(linha[10] || ''), detectadaEm: linha[11] || '',
    verificadaEm: linha[12] || '', prazo: linha[13] || '', responsavel: String(linha[14] || ''),
    adiadaAte: linha[15] || '', motivo: String(linha[16] || ''), resolvidaEm: linha[17] || '',
    atualizadaEm: linha[18] || '', acao: acao
  };
}

function ocorrenciaParaLinhaEntidade_(item) {
  return [item.id, item.regra, item.versaoRegra, item.matricula, item.nome, item.titulo, item.descricao,
    item.severidade, item.situacao, item.evidenciaJson, item.revisaoEvidencia, item.detectadaEm,
    item.verificadaEm, item.prazo, item.responsavel || '', item.adiadaAte || '', item.motivo || '',
    item.resolvidaEm || '', item.atualizadaEm, JSON.stringify(item.acao || {})];
}

function usuarioOcorrenciaEntidade_() {
  try {
    const usuario = obterDadosUsuarioLogado();
    return String(usuario.email || usuario.nome || 'usuario').trim() || 'usuario';
  } catch (e) {
    return 'rotina.interna@setur';
  }
}

function adicionarEventoOcorrenciaEntidade_(eventos, id, tipo, detalhes) {
  eventos.push([Utilities.getUuid(), id, new Date(), tipo, usuarioOcorrenciaEntidade_(), String(detalhes || '')]);
}

function reconciliarOcorrenciasEntidade_(contexto) {
  const detectadas = detectarOcorrenciasEntidade_(contexto || {});
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = obterOuCriarAbaEntidade_(ENTIDADE_OCORRENCIAS_ABA_, ENTIDADE_OCORRENCIAS_CABECALHO_);
    const existentes = aba.getLastRow() > 1
      ? aba.getRange(2, 1, aba.getLastRow() - 1, ENTIDADE_OCORRENCIAS_CABECALHO_.length).getValues().map(linhaParaOcorrenciaEntidade_)
      : [];
    const porId = {};
    existentes.forEach(function(item) { porId[item.id] = item; });
    const idsAtivos = {};
    const eventos = [];
    const agora = new Date();

    detectadas.forEach(function(nova) {
      idsAtivos[nova.id] = true;
      const atual = porId[nova.id];
      if (!atual) {
        nova.detectadaEm = agora; nova.verificadaEm = agora; nova.atualizadaEm = agora;
        existentes.push(nova); porId[nova.id] = nova;
        adicionarEventoOcorrenciaEntidade_(eventos, nova.id, 'CRIADA', nova.titulo);
        return;
      }
      const revisaoMudou = atual.revisaoEvidencia !== nova.revisaoEvidencia || atual.versaoRegra !== nova.versaoRegra;
      atual.regra = nova.regra; atual.versaoRegra = nova.versaoRegra; atual.matricula = nova.matricula;
      atual.nome = nova.nome; atual.titulo = nova.titulo; atual.descricao = nova.descricao;
      atual.severidade = nova.severidade; atual.evidenciaJson = nova.evidenciaJson;
      atual.revisaoEvidencia = nova.revisaoEvidencia; atual.verificadaEm = agora; atual.prazo = nova.prazo;
      atual.acao = nova.acao; atual.atualizadaEm = agora;
      const estavaResolvida = atual.situacao === 'RESOLVIDA';
      if (estavaResolvida || revisaoMudou) {
        atual.situacao = 'ABERTA'; atual.resolvidaEm = ''; atual.adiadaAte = ''; atual.motivo = '';
        adicionarEventoOcorrenciaEntidade_(eventos, atual.id, estavaResolvida ? 'REABERTA' : 'ATUALIZADA', atual.titulo);
      }
    });

    existentes.forEach(function(item) {
      if (idsAtivos[item.id] || item.situacao === 'RESOLVIDA') return;
      item.situacao = 'RESOLVIDA'; item.verificadaEm = agora; item.resolvidaEm = agora; item.atualizadaEm = agora;
      adicionarEventoOcorrenciaEntidade_(eventos, item.id, 'RESOLVIDA_POR_REVALIDACAO', item.titulo);
    });

    if (existentes.length) {
      aba.getRange(2, 1, existentes.length, ENTIDADE_OCORRENCIAS_CABECALHO_.length)
        .setValues(existentes.map(ocorrenciaParaLinhaEntidade_));
    }
    if (eventos.length) {
      const abaEventos = obterOuCriarAbaEntidade_(ENTIDADE_EVENTOS_ABA_, ENTIDADE_EVENTOS_CABECALHO_);
      abaEventos.getRange(abaEventos.getLastRow() + 1, 1, eventos.length, ENTIDADE_EVENTOS_CABECALHO_.length).setValues(eventos);
    }
    const agoraMs = Date.now();
    return existentes.filter(function(item) {
      if (item.situacao === 'RESOLVIDA') return false;
      const adiada = parseDataOcorrenciaEntidade_(item.adiadaAte);
      return !(item.situacao === 'ADIADA' && adiada && adiada.getTime() > agoraMs);
    }).sort(ordenarOcorrenciasEntidade_);
  } finally {
    lock.releaseLock();
  }
}

function obterLeiturasOcorrenciasEntidade_(usuario) {
  const aba = obterOuCriarAbaEntidade_(ENTIDADE_LEITURAS_ABA_, ENTIDADE_LEITURAS_CABECALHO_);
  const mapa = {};
  if (aba.getLastRow() <= 1) return mapa;
  aba.getRange(2, 1, aba.getLastRow() - 1, ENTIDADE_LEITURAS_CABECALHO_.length).getValues().forEach(function(linha) {
    if (String(linha[3] || '') === usuario && linha[5]) mapa[String(linha[0] || '')] = true;
  });
  return mapa;
}

function prepararOcorrenciasParaClienteEntidade_(ocorrencias, usuario) {
  const leituras = obterLeiturasOcorrenciasEntidade_(usuario);
  return (ocorrencias || []).map(function(item) {
    const chave = item.id + '|' + item.revisaoEvidencia + '|' + usuario;
    return {
      id: item.id, revisao: item.revisaoEvidencia, regra: item.regra, matricula: item.matricula,
      nome: item.nome, titulo: item.titulo, descricao: item.descricao, severidade: item.severidade,
      situacao: item.situacao, prazo: item.prazo || '', responsavel: item.responsavel || '',
      lida: Boolean(leituras[chave]), acao: item.acao || {}
    };
  });
}

function gerarResumoOcorrenciasEntidade_(ocorrencias) {
  const lista = (ocorrencias || []).slice().sort(ordenarOcorrenciasEntidade_);
  if (!lista.length) return '';
  const principais = lista.slice(0, 3);
  const linhas = principais.map(function(item, indice) {
    return (indice + 1) + '. **' + item.titulo + ':** ' + item.nome + (item.matricula ? ' (matrícula ' + item.matricula + ')' : '') + ' — ' + item.descricao;
  });
  if (lista.length > principais.length) linhas.push('Mais ' + (lista.length - principais.length) + ' pendência(s) estão na fila da Entidade.');
  return ['**Prioridades verificadas agora**'].concat(linhas).join('\n');
}

function gerarBriefingPorOcorrenciasEntidade_(contexto, ocorrencias) {
  const resumo = (contexto && contexto.resumoOficial) || {};
  const lista = (ocorrencias || []).slice().sort(ordenarOcorrenciasEntidade_);
  const cabecalho = Number(resumo.servidoresAtivos || 0) + ' servidores ativos · ' +
    Number(resumo.ausentesHoje || 0) + ' ausentes hoje · ' +
    Number(resumo.lancamentosSem1Doc || 0) + ' sem 1DOC.';
  if (!lista.length) {
    return ['**Resumo da equipe hoje**', cabecalho, '', '**Situação operacional**',
      'Nenhuma pendência ativa foi encontrada na conferência atual.'].join('\n');
  }
  const principal = lista[0];
  return ['**Resumo da equipe hoje**', cabecalho, '', gerarResumoOcorrenciasEntidade_(lista), '',
    '**Próximo passo**', 'Comece por **' + principal.titulo + '** de ' + principal.nome +
      (principal.matricula ? ' (matrícula ' + principal.matricula + ')' : '') + '.'].join('\n');
}

function listarOcorrenciasEntidade(limite) {
  const usuario = usuarioOcorrenciaEntidade_();
  const contexto = obterContextoEntidadeServidor_();
  const ocorrencias = reconciliarOcorrenciasEntidade_(contexto);
  const maximo = Math.max(1, Math.min(100, Number(limite || 30)));
  return { total: ocorrencias.length, ocorrencias: prepararOcorrenciasParaClienteEntidade_(ocorrencias.slice(0, maximo), usuario), verificadoEm: Date.now() };
}

function marcarOcorrenciaEntidadeComoLida(id, revisao) {
  const ocorrenciaId = String(id || '').trim();
  const revisaoAtual = String(revisao || '').trim();
  if (!ocorrenciaId || !revisaoAtual) throw new Error('Ocorrência ou revisão não informada.');
  const usuario = usuarioOcorrenciaEntidade_();
  const chave = ocorrenciaId + '|' + revisaoAtual + '|' + usuario;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const aba = obterOuCriarAbaEntidade_(ENTIDADE_LEITURAS_ABA_, ENTIDADE_LEITURAS_CABECALHO_);
    if (aba.getLastRow() > 1) {
      const chaves = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues();
      if (chaves.some(function(linha) { return linha[0] === chave; })) return true;
    }
    aba.appendRow([chave, ocorrenciaId, revisaoAtual, usuario, new Date(), new Date()]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function adiarOcorrenciaEntidade(id, dataAte, motivo) {
  if (!verificarSeEhOperador()) throw new Error('Você não possui permissão para adiar ocorrências.');
  const ocorrenciaId = String(id || '').trim();
  const data = parseDataOcorrenciaEntidade_(dataAte);
  const justificativa = String(motivo || '').trim();
  if (!ocorrenciaId || !data || data.getTime() <= Date.now()) throw new Error('Informe uma data futura válida para o adiamento.');
  if (justificativa.length < 5) throw new Error('Informe brevemente o motivo do adiamento.');
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const aba = obterOuCriarAbaEntidade_(ENTIDADE_OCORRENCIAS_ABA_, ENTIDADE_OCORRENCIAS_CABECALHO_);
    if (aba.getLastRow() <= 1) throw new Error('Ocorrência não encontrada.');
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, ENTIDADE_OCORRENCIAS_CABECALHO_.length).getValues();
    const indice = dados.findIndex(function(linha) { return String(linha[0] || '') === ocorrenciaId; });
    if (indice < 0) throw new Error('Ocorrência não encontrada.');
    const item = linhaParaOcorrenciaEntidade_(dados[indice]);
    if (item.situacao === 'RESOLVIDA') throw new Error('Esta ocorrência já foi encerrada pela conferência dos dados.');
    item.situacao = 'ADIADA'; item.adiadaAte = data; item.motivo = justificativa; item.atualizadaEm = new Date();
    aba.getRange(indice + 2, 1, 1, ENTIDADE_OCORRENCIAS_CABECALHO_.length).setValues([ocorrenciaParaLinhaEntidade_(item)]);
    const eventos = [];
    adicionarEventoOcorrenciaEntidade_(eventos, item.id, 'ADIADA', justificativa);
    const abaEventos = obterOuCriarAbaEntidade_(ENTIDADE_EVENTOS_ABA_, ENTIDADE_EVENTOS_CABECALHO_);
    abaEventos.getRange(abaEventos.getLastRow() + 1, 1, 1, ENTIDADE_EVENTOS_CABECALHO_.length).setValues(eventos);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function assumirOcorrenciaEntidade(id) {
  if (!verificarSeEhOperador()) throw new Error('Você não possui permissão para assumir ocorrências.');
  const ocorrenciaId = String(id || '').trim();
  const usuario = usuarioOcorrenciaEntidade_();
  const aba = obterOuCriarAbaEntidade_(ENTIDADE_OCORRENCIAS_ABA_, ENTIDADE_OCORRENCIAS_CABECALHO_);
  if (aba.getLastRow() <= 1) throw new Error('Ocorrência não encontrada.');
  const ids = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues();
  const indice = ids.findIndex(function(linha) { return linha[0] === ocorrenciaId; });
  if (indice < 0) throw new Error('Ocorrência não encontrada.');
  aba.getRange(indice + 2, 15).setValue(usuario);
  aba.getRange(indice + 2, 19).setValue(new Date());
  const eventos = [];
  adicionarEventoOcorrenciaEntidade_(eventos, ocorrenciaId, 'ASSUMIDA', usuario);
  const abaEventos = obterOuCriarAbaEntidade_(ENTIDADE_EVENTOS_ABA_, ENTIDADE_EVENTOS_CABECALHO_);
  abaEventos.getRange(abaEventos.getLastRow() + 1, 1, 1, ENTIDADE_EVENTOS_CABECALHO_.length).setValues(eventos);
  return true;
}

/** Agrupa gravacoes proximas invalidando somente leituras derivadas. */
function solicitarReconferenciaEntidade_(origem) {
  CacheService.getScriptCache().remove('entidade_contexto_planilha_v7');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('ENTIDADE_RECONFERENCIA_PENDENTE', JSON.stringify({
    desde: Date.now(), origem: String(origem || 'ALTERACAO_DADOS').slice(0, 80)
  }));
}

function obterAbaSaudeEntidade_() {
  return obterOuCriarAbaEntidade_('Entidade_Saude', [
    'ROTINA', 'STATUS', 'INICIO', 'FIM', 'DURACAO_MS', 'ERRO', 'PROXIMA_PREVISTA', 'ATUALIZADO_EM'
  ]);
}

function registrarSaudeMonitorEntidade_(status, inicio, erro) {
  const fim = new Date();
  const proxima = new Date(fim.getTime() + 60 * 60 * 1000);
  const linha = ['VIGIA_HORARIA', status, inicio, fim, Math.max(0, fim.getTime() - inicio.getTime()),
    String(erro || '').slice(0, 1000), proxima, fim];
  const aba = obterAbaSaudeEntidade_();
  if (aba.getLastRow() <= 1) aba.getRange(2, 1, 1, linha.length).setValues([linha]);
  else aba.getRange(2, 1, 1, linha.length).setValues([linha]);
  return linha;
}

function obterSaudeMonitorEntidade_() {
  try {
    const aba = obterAbaSaudeEntidade_();
    if (aba.getLastRow() <= 1) return { status: 'NAO_EXECUTADA' };
    const linha = aba.getRange(2, 1, 1, 8).getDisplayValues()[0];
    return { status: linha[1], inicio: linha[2], fim: linha[3], duracaoMs: Number(linha[4] || 0), erro: linha[5], proximaPrevista: linha[6] };
  } catch (e) {
    return { status: 'INDISPONIVEL', erro: e.toString() };
  }
}
