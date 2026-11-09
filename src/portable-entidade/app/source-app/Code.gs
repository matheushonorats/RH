/**
 * RH Central de Documentos v2.0
 * Ponto de Entrada Principal (Web App)
 */

/**
 * Função executada ao acessar a URL pública do Web App
 */
function doGet(e) {
  validarAmbienteBeta_();
  // Uma aba aberta em uma implantação anterior continua consultando o próprio
  // código antigo. Este marcador compartilhado mostra a versão mais recente.
  const propsVersao = PropertiesService.getScriptProperties();
  if (propsVersao.getProperty('ENTIDADE_VERSAO_PUBLICADA') !== APP_VERSION) {
    propsVersao.setProperty('ENTIDADE_VERSAO_PUBLICADA', APP_VERSION);
  }
  // Marcador monotônico: abrir um link antigo não pode rebaixar a versão
  // anunciada aos clientes novos.
  const chaveVersaoAtual = 'ENTIDADE_VERSAO_ATUAL';
  const versaoRegistrada = propsVersao.getProperty(chaveVersaoAtual);
  const partes = valor => String(valor || '').match(/\d+(?:\.\d+)*/)?.[0]?.split('.').map(Number) || [];
  const publicada = partes(APP_VERSION);
  const registrada = partes(versaoRegistrada);
  const maisRecente = publicada.some((numero, indice) => numero !== (registrada[indice] || 0)
    && publicada.slice(0, indice).every((anterior, i) => anterior === (registrada[i] || 0))
    && numero > (registrada[indice] || 0));
  if (!versaoRegistrada || maisRecente) propsVersao.setProperty(chaveVersaoAtual, APP_VERSION);
  // Configuração para servir o HTML principal
  const template = HtmlService.createTemplateFromFile("index");
  template.modoLaboratorioEntidade = Boolean(
    e && e.parameter && String(e.parameter.testeAnimacoesEntidade || "") === "1"
  );
  
  return template.evaluate()
    .setTitle("Entidade.V1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

const CHAVE_ID_PLANILHA = "ID_PLANILHA_RH";
const CHAVE_ADMIN_INICIAL = "EMAIL_ADMIN_INICIAL_RH";

let _leiturasEmLoteAtivas_ = false;
let _cacheLeiturasEmLote_ = {};

function iniciarLeiturasEmLote_() {
  _leiturasEmLoteAtivas_ = true;
  _cacheLeiturasEmLote_ = {};
}

function finalizarLeiturasEmLote_() {
  _leiturasEmLoteAtivas_ = false;
  _cacheLeiturasEmLote_ = {};
}

/** Reaproveita uma leitura da mesma aba apenas durante uma consulta completa. */
function obterValoresAba_(aba) {
  if (!aba) return [];
  if (!_leiturasEmLoteAtivas_) return aba.getDataRange().getValues();
  const chave = String(aba.getSheetId());
  if (!Object.prototype.hasOwnProperty.call(_cacheLeiturasEmLote_, chave)) {
    _cacheLeiturasEmLote_[chave] = aba.getDataRange().getValues();
  }
  return _cacheLeiturasEmLote_[chave];
}

/**
 * Retorna a planilha vinculada mesmo quando o codigo roda como Web App.
 * Nesse contexto, getActiveSpreadsheet() pode retornar null.
 */
function obterPlanilha_() {
  validarAmbienteBeta_();
  if (betaConectadaProducao_()) {
    return SpreadsheetApp.openById(BETA_PRODUCTION_SPREADSHEET_ID_);
  }
  const idPlanilha = obterIdRecursoBeta_(BETA_SPREADSHEET_PROP_, [BETA_PRODUCTION_SPREADSHEET_ID_]);

  if (idPlanilha) {
    return SpreadsheetApp.openById(idPlanilha);
  }
  throw new Error('Planilha beta isolada nao configurada.');
}

/** Registra o vinculo enquanto o script esta sendo executado pela planilha. */
function registrarPlanilhaAtual_() {
  const planilhaAtiva = SpreadsheetApp.getActiveSpreadsheet();
  if (!planilhaAtiva) {
    throw new Error("Abra este script a partir da planilha para realizar o vinculo.");
  }

  const propriedades = PropertiesService.getScriptProperties();
  propriedades.setProperty(CHAVE_ID_PLANILHA, planilhaAtiva.getId());

  const emailExecutor = Session.getEffectiveUser().getEmail().toLowerCase().trim();
  if (emailExecutor && !propriedades.getProperty(CHAVE_ADMIN_INICIAL)) {
    propriedades.setProperty(CHAVE_ADMIN_INICIAL, emailExecutor);
  }

  return planilhaAtiva;
}

function vincularPlanilhaAtual() {
  registrarPlanilhaAtual_();
  SpreadsheetApp.getUi().alert("Planilha vinculada ao Web App com sucesso.");
}

/**
 * Função utilitária privada para incluir outros arquivos HTML dentro de templates (CSS/JS)
 */
function incluir(caminhoArquivo) {
  const permitidos = ['Styles', 'SafeMode', 'WorkspaceLayout', 'Scripts', 'HeModelAssets', 'RepEnhancements', 'RepHorasExtrasAssets', 'RepHorasExtras'];
  const nome = String(caminhoArquivo || '');
  if (permitidos.indexOf(nome) === -1) throw new Error('Componente de interface não permitido.');
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

/** Normaliza cabecalhos para tolerar acentos, espacos e pequenas variacoes. */
function normalizarCabecalho_(valor) {
  return String(valor == null ? "" : valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function indiceCabecalho_(cabecalho, alternativas) {
  const normalizados = cabecalho.map(normalizarCabecalho_);
  const procurados = alternativas.map(normalizarCabecalho_);
  for (let i = 0; i < procurados.length; i++) {
    const indice = normalizados.indexOf(procurados[i]);
    if (indice !== -1) return indice;
  }
  return -1;
}

/** Chave canônica usada para relacionar todas as abas do sistema. */
function normalizarChaveMatricula_(valor) {
  const texto = String(valor == null ? "" : valor).trim();
  if (!texto) return "";

  const numeroInicial = texto.match(/^0*(\d+)/);
  if (numeroInicial) return numeroInicial[1];

  return normalizarCabecalho_(texto);
}

/**
 * Cria o menu de utilitários na planilha para o Administrador
 */
function onOpen() {
  try {
    registrarPlanilhaAtual_();
  } catch (e) {
    Logger.log("Nao foi possivel registrar o vinculo da planilha: " + e.message);
  }

  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    Logger.log("UI não disponível.");
    return;
  }
  ui.createMenu("RH SETUR 2.0")
    .addItem("Executar Configuracao Inicial (Setup)", "executarConfiguracaoInicial")
    .addItem("Vincular planilha ao Web App", "vincularPlanilhaAtual")
    .addSeparator()
    .addItem("Gerar Creditos de Ferias (Manual)", "menuGerarGeral")
    .addToUi();
}
