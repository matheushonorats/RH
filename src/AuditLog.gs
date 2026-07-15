/**
 * RH Central de Documentos v2.0
 * Módulo de Logs de Auditoria (Logs)
 */

/**
 * Registra um evento de auditoria na aba 'Logs' da planilha com controle de concorrência.
 */
function lancarLog(acao, modulo, descricao, campoAlterado, valorAntes, valorDepois, idRegistro) {
  const lock = LockService.getScriptLock();
  try {
    // Tenta obter o bloqueio por até 10 segundos para concorrência
    lock.waitLock(10000);
  } catch (e) {
    Logger.log("Erro de concorrência ao adquirir ScriptLock para registrar Log: " + e.toString());
    return; // Evita travar o fluxo principal se a escrita de logs falhar por travamento
  }
  
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
      verificarERotacionarLogs_(ss, abaLogs);
    }
    
  } catch (erro) {
    Logger.log("Erro grave ao salvar Log de Auditoria: " + erro.toString());
  } finally {
    lock.releaseLock();
  }
}

/**
 * Verifica se a quantidade de logs ultrapassou o limite e exporta os antigos para o Drive.
 * Esta função é privada (termina com "_").
 */
function verificarERotacionarLogs_(ss, abaLogs) {
  const LIMITE_LINHAS = 5000;
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
    
    // Cria o arquivo CSV privado (sem compartilhamento público Everyone com link)
    const dataHoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
    const nomeArquivo = "Historico_Logs_SETUR_" + dataHoje + ".csv";
    const arquivo = pasta.createFile(nomeArquivo, csvConteudo, MimeType.CSV);
    
    // Confirmação de segurança: apenas limpa a planilha se o arquivo foi criado com sucesso no Drive
    if (arquivo && arquivo.getId()) {
      // Limpa os valores das células antigas rapidamente sem deletar as linhas físicas (mantém cabeçalhos)
      range.clearContent();
      
      // Registra o evento de rotação indicando o ID do arquivo gerado
      lancarLog(
        "ROTACAO_LOGS", 
        "Logs", 
        "Logs de auditoria antigos rotacionados com sucesso para o Drive: " + nomeArquivo,
        "Limpeza de Linhas", 
        "Registros antigos: " + (lastRow - 1), 
        "Registros atuais: 0", 
        arquivo.getId()
      );
    } else {
      throw new Error("Gravação no Drive não retornou um identificador de arquivo válido.");
    }
    
  } catch (erroRotacao) {
    Logger.log("Erro ao processar rotação de logs: " + erroRotacao.toString());
  }
}
