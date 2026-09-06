/**
 * Proteção da base principal. Faz cópias completas no Drive e valida a
 * estrutura antes de rotinas que compactam tabelas. Nunca restaura sozinho.
 */
const PROTECAO_DADOS_RH_ = {
  pasta: 'SETUR_RH_Backups_Automaticos',
  prefixo: 'RH_BACKUP_AUTOMATICO_',
  abasCriticas: [['Usuarios'], ['Servidores'], ['Lançamentos', 'Lancamentos'], ['Configuracoes']],
  intervaloMs: 20 * 60 * 60 * 1000
};

function obterPastaBackupsRh_() {
  const pastas = DriveApp.getFoldersByName(PROTECAO_DADOS_RH_.pasta);
  return pastas.hasNext() ? pastas.next() : DriveApp.createFolder(PROTECAO_DADOS_RH_.pasta);
}

function verificarIntegridadeEstruturalRh_(ss) {
  ss = ss || obterPlanilha_();
  const erros = [];
  const inventario = ss.getSheets().map(function(aba) {
    const ultimaColuna = aba.getLastColumn();
    const cabecalhos = ultimaColuna ? aba.getRange(1, 1, 1, ultimaColuna).getDisplayValues()[0].map(String) : [];
    const preenchidos = cabecalhos.map(function(item) { return item.trim(); }).filter(Boolean);
    const ehCritica = PROTECAO_DADOS_RH_.abasCriticas.some(function(opcoes) { return opcoes.indexOf(aba.getName()) !== -1; });
    if (ehCritica) {
      if (!preenchidos.length) erros.push('A aba ' + aba.getName() + ' está sem cabeçalho.');
      const normalizados = preenchidos.map(function(item) { return normalizarCabecalho_(item); });
      if (new Set(normalizados).size !== normalizados.length) erros.push('A aba ' + aba.getName() + ' tem colunas repetidas.');
    }
    return { nome: aba.getName(), linhas: aba.getLastRow(), colunas: ultimaColuna, cabecalhos: preenchidos };
  });
  const nomes = new Set(inventario.map(function(item) { return item.nome; }));
  PROTECAO_DADOS_RH_.abasCriticas.forEach(function(opcoes) {
    if (!opcoes.some(function(nome) { return nomes.has(nome); })) erros.push('A aba obrigatória ' + opcoes[0] + ' não existe.');
  });
  const resumo = inventario.map(function(item) { return [item.nome, item.linhas, item.colunas, item.cabecalhos.join('|')].join(':'); }).join('\n');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, resumo, Utilities.Charset.UTF_8);
  return {
    integra: !erros.length,
    erros: erros,
    assinatura: Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, ''),
    inventario: inventario,
    verificadaEm: new Date().toISOString()
  };
}

function localizarBackupMaisRecenteRh_(pasta) {
  const arquivos = pasta.getFiles();
  let atual = null;
  while (arquivos.hasNext()) {
    const arquivo = arquivos.next();
    if (arquivo.getName().indexOf(PROTECAO_DADOS_RH_.prefixo) !== 0) continue;
    if (!atual || arquivo.getDateCreated().getTime() > atual.getDateCreated().getTime()) atual = arquivo;
  }
  return atual;
}

function executarBackupAutomaticoDados_(forcar) {
  // A beta conectada usa a mesma planilha, mas a cópia agendada pertence ao
  // projeto oficial para não executar duas manutenções sobre a mesma base.
  if (!forcar && typeof betaConectadaProducao_ === 'function') return { ignorado: true, motivo: 'A cópia agendada é feita pelo projeto oficial.' };
  const props = PropertiesService.getScriptProperties();
  const ultimo = Number(props.getProperty('RH_BACKUP_ULTIMO_SUCESSO_MS') || 0);
  if (!forcar && ultimo && Date.now() - ultimo < PROTECAO_DADOS_RH_.intervaloMs) return { ignorado: true, ultimoSucessoEm: new Date(ultimo).toISOString() };
  const ss = obterPlanilha_();
  const integridade = verificarIntegridadeEstruturalRh_(ss);
  if (!integridade.integra) throw new Error('A estrutura da base precisa de revisão antes da cópia: ' + integridade.erros.join(' '));
  const pasta = obterPastaBackupsRh_();
  const agora = new Date();
  const nome = PROTECAO_DADOS_RH_.prefixo + Utilities.formatDate(agora, Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm-ss');
  const copia = DriveApp.getFileById(ss.getId()).makeCopy(nome, pasta);
  if (!copia || !copia.getId()) throw new Error('A cópia automática não foi confirmada pelo Drive.');
  props.setProperties({
    RH_BACKUP_ULTIMO_SUCESSO_MS: String(agora.getTime()),
    RH_BACKUP_ULTIMO_ARQUIVO_ID: copia.getId(),
    RH_BACKUP_ULTIMA_ASSINATURA: integridade.assinatura,
    RH_BACKUP_ULTIMO_ERRO: ''
  }, false);
  return { sucesso: true, criadoEm: agora.toISOString(), arquivoId: copia.getId(), url: copia.getUrl(), assinatura: integridade.assinatura };
}

function criarBackupAgoraProtecaoDados() {
  if (!verificarSeEhAdmin()) throw new Error('Acesso de administrador necessário.');
  const resultado = executarBackupAutomaticoDados_(true);
  try { lancarLog('BACKUP_MANUAL', 'Sistema', 'Criou uma cópia completa de segurança da base.', '', '', resultado.arquivoId, 'PROTECAO_DADOS'); } catch (e) {}
  return resultado;
}

function obterStatusProtecaoDados() {
  if (!verificarSeEhAdmin()) throw new Error('Acesso de administrador necessário.');
  const props = PropertiesService.getScriptProperties();
  const pasta = obterPastaBackupsRh_();
  const pastaHistorico = obterPastaArquivosHistoricos_();
  const recente = localizarBackupMaisRecenteRh_(pasta);
  const integridade = verificarIntegridadeEstruturalRh_(obterPlanilha_());
  const capacidade = obterDiagnosticoCapacidadePlanilha_(obterPlanilha_());
  return {
    integra: integridade.integra,
    erros: integridade.erros,
    ultimaCopiaEm: recente ? recente.getDateCreated().toISOString() : '',
    ultimaCopiaNome: recente ? recente.getName() : '',
    ultimaCopiaUrl: recente ? recente.getUrl() : '',
    pastaUrl: pasta.getUrl(),
    pastaHistoricoUrl: pastaHistorico.getUrl(),
    ultimoErro: props.getProperty('RH_BACKUP_ULTIMO_ERRO') || '',
    restauracaoAutomatica: false,
    capacidade: {
      percentual: capacidade.percentualAlocado,
      celulasAlocadas: capacidade.totalAlocado,
      limite: capacidade.limite,
      maioresAbas: capacidade.abas.slice(0, 5)
    },
    politicaCapacidade: {
      filaConcluidaDias: MANUTENCAO_SISTEMA.diasFilaConcluida,
      historicoPreservado: true,
      pendenciasNuncaArquivadas: true
    }
  };
}
