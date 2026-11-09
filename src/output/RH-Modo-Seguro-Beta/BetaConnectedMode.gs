/**
 * Modo operacional conectado a producao.
 * A implantacao continua separada, mas usa a mesma base de dados oficial.
 */
const BETA_CONNECTED_PRODUCTION_PROP_ = 'BETA_CONNECTED_PRODUCTION';
const BETA_CONNECTED_AT_PROP_ = 'BETA_CONNECTED_AT';
const BETA_CONNECTED_BACKUP_ID_PROP_ = 'BETA_CONNECTED_BACKUP_ID';
const BETA_CREATED_FILE_PREFIX_ = 'BETA_CREATED_FILE_';

function betaConectadaProducao_() {
  return PropertiesService.getScriptProperties().getProperty(BETA_CONNECTED_PRODUCTION_PROP_) === 'SIM';
}

function obterVersaoFonteProducao_() {
  const atualizado = DriveApp.getFileById(BETA_PRODUCTION_SPREADSHEET_ID_).getLastUpdated().getTime();
  return 'producao-' + String(atualizado);
}

function obterIdPastaAnexosOperacionalBeta_() {
  if (betaConectadaProducao_()) return BETA_PRODUCTION_ATTACHMENTS_FOLDER_ID_;
  return obterIdRecursoBeta_(BETA_ATTACHMENTS_FOLDER_PROP_, [BETA_PRODUCTION_ATTACHMENTS_FOLDER_ID_]);
}

function registrarArquivoCriadoPelaBeta_(idArquivo) {
  if (!betaConectadaProducao_() || !idArquivo) return;
  PropertiesService.getScriptProperties().setProperty(BETA_CREATED_FILE_PREFIX_ + String(idArquivo), new Date().toISOString());
}

function validarArquivoCriadoPelaBeta_(idArquivo) {
  const chave = BETA_CREATED_FILE_PREFIX_ + String(idArquivo || '');
  if (!PropertiesService.getScriptProperties().getProperty(chave)) {
    throw new Error('Protecao da beta: somente anexos enviados por esta beta podem ser removidos por ela.');
  }
  return DriveApp.getFileById(String(idArquivo));
}

/** Executar uma unica vez para liberar o piloto conectado. */
function ativarBetaConectadaProducao() {
  validarAmbienteBeta_();
  const props = PropertiesService.getScriptProperties();
  if (betaConectadaProducao_()) return obterStatusBetaConectada();

  const raiz = obterPastaRaizBeta_();
  let backup = null;
  const backupExistenteId = props.getProperty(BETA_CONNECTED_BACKUP_ID_PROP_) || '';
  if (backupExistenteId) {
    try { backup = DriveApp.getFileById(backupExistenteId); } catch (e) { backup = null; }
  }
  if (!backup) {
    const nomeBackup = 'BACKUP ANTES DA BETA CONECTADA - ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    backup = DriveApp.getFileById(BETA_PRODUCTION_SPREADSHEET_ID_).makeCopy(nomeBackup, raiz);
  }
  if (!backup || !backup.getId()) throw new Error('Nao foi possivel confirmar o backup preventivo. A beta nao foi conectada.');

  props.setProperties({
    BETA_CONNECTED_BACKUP_ID: backup.getId(),
    BETA_CONNECTED_AT: new Date().toISOString(),
    BETA_CONNECTED_PRODUCTION: 'SIM',
    BETA_READ_ONLY: 'NAO'
  }, false);
  return obterStatusBetaConectada();
}

function obterStatusBetaConectada() {
  const props = PropertiesService.getScriptProperties();
  const backupId = props.getProperty(BETA_CONNECTED_BACKUP_ID_PROP_) || '';
  return {
    conectada: betaConectadaProducao_(),
    somenteLeitura: betaEstaSomenteLeitura_(),
    conectadaEm: props.getProperty(BETA_CONNECTED_AT_PROP_) || '',
    backupId: backupId,
    backupUrl: backupId ? DriveApp.getFileById(backupId).getUrl() : ''
  };
}

function desativarBetaConectadaEmergencia() {
  PropertiesService.getScriptProperties().setProperties({
    BETA_CONNECTED_PRODUCTION: 'NAO',
    BETA_READ_ONLY: 'SIM'
  }, false);
  return obterStatusBetaConectada();
}
