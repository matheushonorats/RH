/**
 * Espelho unidirecional da producao para a base isolada da beta.
 * A origem e aberta exclusivamente para leitura. Todas as gravacoes desta
 * rotina ocorrem na planilha beta identificada por BETA_SPREADSHEET_ID.
 */
const BETA_MIRROR_ENABLED_PROP_ = 'BETA_MIRROR_ENABLED';
const BETA_MIRROR_SOURCE_UPDATED_PROP_ = 'BETA_MIRROR_SOURCE_UPDATED_AT';
const BETA_MIRROR_LAST_SYNC_PROP_ = 'BETA_MIRROR_LAST_SYNC_AT';
const BETA_MIRROR_REP_FOLDER_PROP_ = 'BETA_MIRROR_REP_FOLDER_ID';
const BETA_MIRROR_REP_INPUT_FOLDER_PROP_ = 'BETA_MIRROR_REP_INPUT_FOLDER_ID';

function betaEspelhoAtivo_() {
  return PropertiesService.getScriptProperties().getProperty(BETA_MIRROR_ENABLED_PROP_) === 'SIM';
}

function obterSubpastaProducaoPorNome_(pastaPai, nome) {
  if (!pastaPai) return '';
  const pastas = pastaPai.getFoldersByName(nome);
  return pastas.hasNext() ? pastas.next().getId() : '';
}

/** Executar uma vez no editor do projeto beta. */
function ativarEspelhoSomenteLeitura() {
  validarAmbienteBeta_();
  const props = PropertiesService.getScriptProperties();
  const arquivoOrigem = DriveApp.getFileById(BETA_PRODUCTION_SPREADSHEET_ID_);
  let pastaPai = null;
  const pais = arquivoOrigem.getParents();
  if (pais.hasNext()) pastaPai = pais.next();

  const configuracao = {};
  configuracao[BETA_MIRROR_ENABLED_PROP_] = 'SIM';
  configuracao[BETA_MIRROR_SOURCE_UPDATED_PROP_] = '';
  configuracao[BETA_MIRROR_REP_FOLDER_PROP_] = obterSubpastaProducaoPorNome_(pastaPai, 'RHV2 - Arquivos REP');
  configuracao[BETA_MIRROR_REP_INPUT_FOLDER_PROP_] = obterSubpastaProducaoPorNome_(pastaPai, 'RHV2 - Entrada de AFDs');
  props.setProperties(configuracao, false);

  return sincronizarEspelhoProducaoBeta_(true);
}

function nomeAbaProtegidaDoEspelho_(nome) {
  const normalizado = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return normalizado === 'USUARIOS' || normalizado === 'SESSOES';
}

function copiarValoresAbaParaBeta_(abaOrigem, planilhaBeta) {
  const nome = abaOrigem.getName();
  if (nomeAbaProtegidaDoEspelho_(nome)) return false;

  let abaDestino = planilhaBeta.getSheetByName(nome);
  if (!abaDestino) abaDestino = planilhaBeta.insertSheet(nome);

  const linhas = Math.max(1, abaOrigem.getLastRow());
  const colunas = Math.max(1, abaOrigem.getLastColumn());
  if (abaDestino.getMaxRows() < linhas) abaDestino.insertRowsAfter(abaDestino.getMaxRows(), linhas - abaDestino.getMaxRows());
  if (abaDestino.getMaxColumns() < colunas) abaDestino.insertColumnsAfter(abaDestino.getMaxColumns(), colunas - abaDestino.getMaxColumns());

  abaDestino.clearContents();
  if (abaOrigem.getLastRow() > 0 && abaOrigem.getLastColumn() > 0) {
    const valores = abaOrigem.getRange(1, 1, abaOrigem.getLastRow(), abaOrigem.getLastColumn()).getValues();
    abaDestino.getRange(1, 1, valores.length, valores[0].length).setValues(valores);
  }
  return true;
}

function sincronizarEspelhoProducaoBeta_(forcar) {
  validarAmbienteBeta_();
  if (betaConectadaProducao_()) {
    return { ativo: true, conectado: true, atualizado: false, versao: obterVersaoFonteProducao_() };
  }
  if (!betaEspelhoAtivo_()) return { ativo: false, atualizado: false, versao: obterVersaoDadosBetaLocal_() };

  const props = PropertiesService.getScriptProperties();
  const arquivoOrigem = DriveApp.getFileById(BETA_PRODUCTION_SPREADSHEET_ID_);
  const atualizacaoOrigem = String(arquivoOrigem.getLastUpdated().getTime());
  if (!forcar && props.getProperty(BETA_MIRROR_SOURCE_UPDATED_PROP_) === atualizacaoOrigem) {
    return { ativo: true, atualizado: false, versao: obterVersaoDadosBetaLocal_() };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const atualizacaoConfirmada = String(arquivoOrigem.getLastUpdated().getTime());
    if (!forcar && props.getProperty(BETA_MIRROR_SOURCE_UPDATED_PROP_) === atualizacaoConfirmada) {
      return { ativo: true, atualizado: false, versao: obterVersaoDadosBetaLocal_() };
    }

    const planilhaOrigem = SpreadsheetApp.openById(BETA_PRODUCTION_SPREADSHEET_ID_);
    const planilhaBeta = SpreadsheetApp.openById(obterIdRecursoBeta_(BETA_SPREADSHEET_PROP_, [BETA_PRODUCTION_SPREADSHEET_ID_]));
    let abasCopiadas = 0;
    planilhaOrigem.getSheets().forEach(function(abaOrigem) {
      if (copiarValoresAbaParaBeta_(abaOrigem, planilhaBeta)) abasCopiadas++;
    });
    SpreadsheetApp.flush();

    const versao = registrarAlteracaoDados_();
    props.setProperties({
      BETA_MIRROR_SOURCE_UPDATED_AT: atualizacaoConfirmada,
      BETA_MIRROR_LAST_SYNC_AT: new Date().toISOString()
    }, false);
    return { ativo: true, atualizado: true, versao: versao, abasCopiadas: abasCopiadas };
  } finally {
    lock.releaseLock();
  }
}

function obterVersaoDadosBetaLocal_() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('RH_VERSAO_DADOS') || registrarAlteracaoDados_();
}

function obterPastaEntradaRepLeituraBeta_() {
  if (betaEspelhoAtivo_()) {
    const idOrigem = PropertiesService.getScriptProperties().getProperty(BETA_MIRROR_REP_INPUT_FOLDER_PROP_);
    if (idOrigem) return DriveApp.getFolderById(idOrigem);
  }
  return obterPastaEntradaRep_();
}

function obterStatusEspelhoBeta() {
  obterDadosUsuarioLogado();
  const props = PropertiesService.getScriptProperties();
  return {
    ativo: betaEspelhoAtivo_(),
    conectadoProducao: betaConectadaProducao_(),
    somenteLeitura: betaEstaSomenteLeitura_(),
    ultimaSincronizacao: props.getProperty(BETA_MIRROR_LAST_SYNC_PROP_) || '',
    pastaRepEntradaConectada: Boolean(props.getProperty(BETA_MIRROR_REP_INPUT_FOLDER_PROP_)),
    pastaRepArquivosConectada: Boolean(props.getProperty(BETA_MIRROR_REP_FOLDER_PROP_))
  };
}
