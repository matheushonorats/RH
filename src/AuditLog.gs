/**
 * RH Central de Documentos v2.0
 * Módulo de Logs de Auditoria (Logs)
 */

/**
 * Registra um evento de auditoria na aba 'Logs' da planilha.
 * 
 * @param {string} acao O tipo de ação (CRIAR, EDITAR, EXCLUIR, LOGIN, etc.)
 * @param {string} modulo O nome do módulo (Servidores, Lançamentos, Protocolos, etc.)
 * @param {string} descricao Texto explicativo resumindo a ação
 * @param {string} campoAlterado Opcional. O nome do campo que foi modificado (se aplicável)
 * @param {string} valorAntes Opcional. O valor original antes da alteração
 * @param {string} valorDepois Opcional. O novo valor após a alteração
 * @param {string} idRegistro Opcional. O ID da linha/registro associado na planilha
 */
function lancarLog(acao, modulo, descricao, campoAlterado, valorAntes, valorDepois, idRegistro) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const abaLogs = ss.getSheetByName("Logs");
    
    if (!abaLogs) {
      Logger.log("AVISO: Aba 'Logs' não encontrada. Log não pôde ser salvo.");
      return;
    }
    
    // Identifica o usuário de forma resiliente
    let usuarioEmail = "Sistema";
    try {
      const email = Session.getActiveUser().getEmail();
      if (email) {
        usuarioEmail = email.toLowerCase().trim();
      }
    } catch(e) {
      // Ignora erro se executado fora do contexto de usuário ativo (ex: gatilho de tempo)
      usuarioEmail = "Gatilho Automático";
    }
    
    // Adiciona a linha ao final dos logs
    abaLogs.appendRow([
      new Date(),
      usuarioEmail,
      acao.toUpperCase(),
      modulo,
      descricao,
      campoAlterado || "",
      valorAntes || "",
      valorDepois || "",
      idRegistro || ""
    ]);
    
  } catch (erro) {
    // Evita travar a operação principal do usuário por falha ao escrever o log
    Logger.log("Erro grave ao salvar Log de Auditoria: " + erro.toString());
  }
}
