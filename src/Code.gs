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
    .setTitle("RH - Central de Documentos")
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * Função utilitária privada para incluir outros arquivos HTML dentro de templates (CSS/JS)
 */
function incluir(caminhoArquivo) {
  return HtmlService.createHtmlOutputFromFile(caminhoArquivo).getContent();
}

/**
 * Cria o menu de utilitários na planilha para o Administrador
 */
function onOpen() {
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    Logger.log("UI não disponível.");
    return;
  }
  ui.createMenu("RH SETUR 2.0")
    .addItem("Executar Configuracao Inicial (Setup)", "executarConfiguracaoInicial")
    .addSeparator()
    .addItem("Gerar Creditos de Ferias (Manual)", "menuGerarGeral")
    .addToUi();
}
