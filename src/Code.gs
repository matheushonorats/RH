/**
 * RH Central de Documentos v2.0
 * Ponto de Entrada Principal (Web App)
 */

/**
 * Função executada ao acessar a URL pública do Web App
 */
function doGet(e) {
  // Configuração para servir o HTML principal
  const template = HtmlService.createTemplateFromFile("index");
  
  return template.evaluate()
    .setTitle("RHv2")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

const CHAVE_ID_PLANILHA = "ID_PLANILHA_RH";
const CHAVE_ADMIN_INICIAL = "EMAIL_ADMIN_INICIAL_RH";

/**
 * Retorna a planilha vinculada mesmo quando o codigo roda como Web App.
 * Nesse contexto, getActiveSpreadsheet() pode retornar null.
 */
function obterPlanilha_() {
  const propriedades = PropertiesService.getScriptProperties();
  const idPlanilha = "1axqp7dJCjawJ7MbfD0-M85TVCYTfFRSFoLhAS0nfoYQ";

  if (idPlanilha) {
    return SpreadsheetApp.openById(idPlanilha);
  }

  const planilhaAtiva = SpreadsheetApp.getActiveSpreadsheet();
  if (planilhaAtiva) {
    propriedades.setProperty(CHAVE_ID_PLANILHA, planilhaAtiva.getId());
    return planilhaAtiva;
  }

  throw new Error("Planilha nao vinculada. Abra a planilha e execute 'Configuracao Inicial' no menu RH SETUR 2.0.");
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
  return HtmlService.createHtmlOutputFromFile(caminhoArquivo).getContent();
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
