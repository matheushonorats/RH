/**
 * RH Central de Documentos v2.0
 * Módulo de Logs de Auditoria (Logs)
 */

/**
 * Registra um evento de auditoria na aba 'Logs'. Adquire o lock internamente.
 * Use esta função em chamadas externas (fora de blocos com lock já ativo).
 */
function lancarLog(acao, modulo, descricao, campoAlterado, valorAntes, valorDepois, idRegistro) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    Logger.log("Erro de concorrência ao adquirir ScriptLock para registrar Log: " + e.toString());
    return;
  }
  try {
    lancarLogInterno_(acao, modulo, descricao, campoAlterado, valorAntes, valorDepois, idRegistro);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Registra um evento de auditoria SEM adquirir lock.
 * Use esta função DENTRO de blocos que já possuem ScriptLock ativo,
 * para evitar deadlock por locks aninhados.
 */
function lancarLogSemLock_(acao, modulo, descricao, campoAlterado, valorAntes, valorDepois, idRegistro) {
  lancarLogInterno_(acao, modulo, descricao, campoAlterado, valorAntes, valorDepois, idRegistro);
}

/**
 * Lógica interna compartilhada de gravação de log. Privada.
 */
function lancarLogInterno_(acao, modulo, descricao, campoAlterado, valorAntes, valorDepois, idRegistro) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const abaLogs = ss.getSheetByName("Logs");

    if (!abaLogs) {
      Logger.log("AVISO: Aba 'Logs' não encontrada. Log não pôde ser salvo.");
      return;
    }

    let usuarioEmail = "Sistema";
    try {
      const email = Session.getActiveUser().getEmail();
      if (email) usuarioEmail = email.toLowerCase().trim();
    } catch (e) {
      usuarioEmail = "Gatilho Automático";
    }

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

    // Evita recursão: rotação nunca chama a si mesma
    if (acao.toUpperCase() !== "ROTACAO_LOGS") {
      verificarERotacionarLogs_(ss, abaLogs);
    }
  } catch (erro) {
    Logger.log("Erro grave ao salvar Log de Auditoria: " + erro.toString());
  }
}

/**
 * Verifica se a quantidade de logs ultrapassou o limite e exporta os antigos para o Drive.
 * Privada — chamada apenas por lancarLogInterno_.
 */
function verificarERotacionarLogs_(ss, abaLogs) {
  const LIMITE_LINHAS = 5000;
  const lastRow = abaLogs.getLastRow();

  if (lastRow < LIMITE_LINHAS) return;

  try {
    const range = abaLogs.getRange(2, 1, lastRow - 1, abaLogs.getLastColumn());
    const dados = range.getValues();

    let csvConteudo = "Data/Hora;Usuário;Ação;Módulo;Descrição;Campo Alterado;Valor Antes;Valor Depois;ID Registro\r\n";
    dados.forEach(linha => {
      let colunasFormatadas = linha.map(col => {
        let texto = String(col).replace(/"/g, '""');
        if (col instanceof Date) {
          texto = Utilities.formatDate(col, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
        }
        return '"' + texto + '"';
      });
      csvConteudo += colunasFormatadas.join(";") + "\r\n";
    });

    const nomePasta = "SETUR_RH_Logs_Historicos";
    let pasta = null;
    const pastasExistentes = DriveApp.getFoldersByName(nomePasta);
    if (pastasExistentes.hasNext()) {
      pasta = pastasExistentes.next();
    } else {
      pasta = DriveApp.createFolder(nomePasta);
    }

    const dataHoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
    const nomeArquivo = "Historico_Logs_SETUR_" + dataHoje + ".csv";
    const arquivo = pasta.createFile(nomeArquivo, csvConteudo, MimeType.CSV);

    if (arquivo && arquivo.getId()) {
      range.clearContent();
      // Usa a versão interna para não tentar adquirir lock novamente
      lancarLogInterno_(
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
