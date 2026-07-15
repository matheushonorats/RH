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
    
    // Evita recursão infinita se o log gerado for o da própria rotação
    if (acao.toUpperCase() !== "ROTACAO_LOGS") {
      verificarERotacionarLogs(ss, abaLogs);
    }
    
  } catch (erro) {
    // Evita travar a operação principal do usuário por falha ao escrever o log
    Logger.log("Erro grave ao salvar Log de Auditoria: " + erro.toString());
  }
}

/**
 * Verifica se a quantidade de logs ultrapassou o limite e exporta os antigos para o Drive
 */
function verificarERotacionarLogs(ss, abaLogs) {
  const LIMITE_LINHAS = 5000; // Define limite resiliente antes de rotacionar
  const lastRow = abaLogs.getLastRow();
  
  if (lastRow < LIMITE_LINHAS) {
    return;
  }
  
  try {
    // Obter todos os logs (excluindo a linha de cabeçalho)
    const range = abaLogs.getRange(2, 1, lastRow - 1, abaLogs.getLastColumn());
    const dados = range.getValues();
    
    // Formatar em estrutura CSV para compatibilidade universal
    let csvConteudo = "Data/Hora;Usuário;Ação;Módulo;Descrição;Campo Alterado;Valor Antes;Valor Depois;ID Registro\r\n";
    dados.forEach(linha => {
      let colunasFormatadas = linha.map(col => {
        let texto = String(col).replace(/"/g, '""'); // escapa aspas internas
        if (col instanceof Date) {
          texto = Utilities.formatDate(col, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
        }
        return '"' + texto + '"';
      });
      csvConteudo += colunasFormatadas.join(";") + "\r\n";
    });
    
    // Procura ou cria a pasta 'SETUR_RH_Logs_Historicos' no Google Drive
    const nomePasta = "SETUR_RH_Logs_Historicos";
    let pasta = null;
    const pastasExistentes = DriveApp.getFoldersByName(nomePasta);
    if (pastasExistentes.hasNext()) {
      pasta = pastasExistentes.next();
    } else {
      pasta = DriveApp.createFolder(nomePasta);
    }
    
    // Cria o arquivo CSV
    const dataHoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
    const nomeArquivo = "Historico_Logs_SETUR_" + dataHoje + ".csv";
    const arquivo = pasta.createFile(nomeArquivo, csvConteudo, MimeType.CSV);
    
    // Compartilha permissão para leitura com link de forma interna
    arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Limpa todas as linhas de logs da tabela mantendo apenas a linha de cabeçalho
    abaLogs.deleteRows(2, lastRow - 1);
    
    // Registra o evento de rotação indicando o link do arquivo gerado
    lancarLog(
      "ROTACAO_LOGS", 
      "Logs", 
      "Logs de auditoria antigos rotacionados com sucesso para o Drive: " + nomeArquivo + " (Link: " + arquivo.getUrl() + ")",
      "Limpeza de Linhas", 
      "Registros antigos: " + (lastRow - 1), 
      "Registros atuais: 0", 
      arquivo.getId()
    );
    
  } catch (erroRotacao) {
    Logger.log("Erro ao processar rotação de logs: " + erroRotacao.toString());
  }
}
