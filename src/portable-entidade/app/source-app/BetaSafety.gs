/**
 * Protecoes da implantacao Beta Segura.
 * O projeto beta falha fechado enquanto os recursos isolados nao estiverem
 * configurados e nunca aceita os IDs conhecidos da producao.
 */
const BETA_PRODUCTION_SPREADSHEET_ID_ = '1axqp7dJCjawJ7MbfD0-M85TVCYTfFRSFoLhAS0nfoYQ';
const BETA_PRODUCTION_ATTACHMENTS_FOLDER_ID_ = '1qsf7R8HP6iEAiP-dVoIPBor1TDO5pMBO';
const BETA_SPREADSHEET_PROP_ = 'BETA_SPREADSHEET_ID';
const BETA_ROOT_FOLDER_PROP_ = 'BETA_ROOT_FOLDER_ID';
const BETA_ATTACHMENTS_FOLDER_PROP_ = 'BETA_ATTACHMENTS_FOLDER_ID';
const BETA_READ_ONLY_PROP_ = 'BETA_READ_ONLY';

/**
 * A beta e um projeto Apps Script independente, sem planilha vinculada ao
 * projeto. Nessa situacao o Apps Script pode devolver `null` para
 * getDocumentLock(). O ScriptLock mantem a exclusao mutua dentro da beta e
 * evita que uma acao de gravacao falhe antes de chegar a base conectada.
 */
function obterLockMutacaoBeta_() {
  return LockService.getDocumentLock() || LockService.getScriptLock();
}

function obterIdRecursoBeta_(chave, idsProibidos) {
  const valor = String(PropertiesService.getScriptProperties().getProperty(chave) || '').trim();
  if (!valor) throw new Error('Beta segura nao configurada: recurso ausente (' + chave + ').');
  if ((idsProibidos || []).indexOf(valor) !== -1) {
    throw new Error('BLOQUEIO DE SEGURANCA: a beta tentou acessar um recurso de producao.');
  }
  return valor;
}

function validarAmbienteBeta_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('BETA_SETUP_COMPLETE') !== 'SIM') {
    throw new Error('A Beta Segura ainda nao possui ambiente isolado configurado.');
  }
  obterIdRecursoBeta_(BETA_SPREADSHEET_PROP_, [BETA_PRODUCTION_SPREADSHEET_ID_]);
  obterIdRecursoBeta_(BETA_ROOT_FOLDER_PROP_, []);
  obterIdRecursoBeta_(BETA_ATTACHMENTS_FOLDER_PROP_, [BETA_PRODUCTION_ATTACHMENTS_FOLDER_ID_]);
  return true;
}

function betaEstaSomenteLeitura_() {
  return PropertiesService.getScriptProperties().getProperty(BETA_READ_ONLY_PROP_) !== 'NAO';
}

function bloquearMutacaoBetaSeNecessario_(nomeFuncao) {
  if (!betaEstaSomenteLeitura_()) return;
  if (!/^(verificar|obter|listar|validar)/i.test(String(nomeFuncao || ''))) {
    throw new Error('Beta Segura em modo somente leitura. Nenhuma alteracao foi enviada.');
  }
}

function obterPastaRaizBeta_() {
  validarAmbienteBeta_();
  return DriveApp.getFolderById(obterIdRecursoBeta_(BETA_ROOT_FOLDER_PROP_, []));
}

function obterOuCriarSubpastaBeta_(nome) {
  const raiz = obterPastaRaizBeta_();
  const existentes = raiz.getFoldersByName(String(nome || 'Arquivos Beta'));
  return existentes.hasNext() ? existentes.next() : raiz.createFolder(String(nome || 'Arquivos Beta'));
}

function validarArquivoNaPastaBeta_(idArquivo, idPastaPermitida) {
  const arquivo = DriveApp.getFileById(String(idArquivo || ''));
  const pastaPermitida = String(idPastaPermitida || '');
  const pais = arquivo.getParents();
  while (pais.hasNext()) {
    if (pais.next().getId() === pastaPermitida) return arquivo;
  }
  throw new Error('BLOQUEIO DE SEGURANCA: o arquivo nao pertence ao ambiente beta.');
}

function validarPastaFilhaBeta_(idPasta, idPastaPaiPermitida) {
  const pasta = DriveApp.getFolderById(String(idPasta || ''));
  const pastaPaiPermitida = String(idPastaPaiPermitida || '');
  const pais = pasta.getParents();
  while (pais.hasNext()) {
    if (pais.next().getId() === pastaPaiPermitida) return pasta;
  }
  throw new Error('BLOQUEIO DE SEGURANCA: a pasta nao pertence ao ambiente beta.');
}

/**
 * Executar uma unica vez pelo editor do NOVO projeto Apps Script beta.
 * Cria uma pasta raiz, uma copia independente da planilha e pastas vazias.
 */
function criarAmbienteBetaIsolado() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('BETA_SETUP_COMPLETE') === 'SIM') {
      validarAmbienteBeta_();
      return obterResumoAmbienteBeta_();
    }

    const sufixo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    const raiz = DriveApp.createFolder('RH SETUR - BETA SEGURA - ' + sufixo);
    raiz.setDescription('Ambiente isolado de testes. Nao e a base oficial do RH.');

    const planilhaProducao = DriveApp.getFileById(BETA_PRODUCTION_SPREADSHEET_ID_);
    const copiaPlanilha = planilhaProducao.makeCopy('RH SETUR - BASE BETA SEGURA', raiz);
    const anexos = raiz.createFolder('Lancamentos_Files_BETA');
    const protocolos = raiz.createFolder('Protocolos_BETA');
    const repArquivos = raiz.createFolder('RHV2 - Arquivos REP');
    const repEntrada = raiz.createFolder('RHV2 - Entrada de AFDs');

    props.setProperties({
      BETA_SETUP_COMPLETE: 'SIM',
      BETA_READ_ONLY: 'SIM',
      BETA_SPREADSHEET_ID: copiaPlanilha.getId(),
      BETA_ROOT_FOLDER_ID: raiz.getId(),
      BETA_ATTACHMENTS_FOLDER_ID: anexos.getId(),
      REP_ONLINE_PASTA_ID: repArquivos.getId(),
      REP_ENTRADA_PASTA_ID: repEntrada.getId(),
      BETA_PROTOCOLS_FOLDER_ID: protocolos.getId(),
      EMAIL_ADMIN_INICIAL_RH: String(Session.getEffectiveUser().getEmail() || '').toLowerCase().trim()
    }, false);

    validarAmbienteBeta_();
    return obterResumoAmbienteBeta_();
  } finally {
    lock.releaseLock();
  }
}

function obterResumoAmbienteBeta_() {
  validarAmbienteBeta_();
  const props = PropertiesService.getScriptProperties();
  const planilha = DriveApp.getFileById(props.getProperty(BETA_SPREADSHEET_PROP_));
  const raiz = DriveApp.getFolderById(props.getProperty(BETA_ROOT_FOLDER_PROP_));
  return {
    configurado: true,
    somenteLeitura: betaEstaSomenteLeitura_(),
    planilhaId: planilha.getId(),
    planilhaUrl: planilha.getUrl(),
    pastaId: raiz.getId(),
    pastaUrl: raiz.getUrl()
  };
}
