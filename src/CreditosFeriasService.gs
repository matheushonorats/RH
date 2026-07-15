/**
 * RH Central de Documentos v2.0
 * Módulo de Gestão de Créditos de Férias (CreditosFeriasService)
 * 
 * Portado e aprimorado do robô diário original da planilha com concorrência e lote.
 */

/**
 * Executa a varredura diária automática para gerar créditos de novos períodos aquisitivos
 * Acionado por gatilho de tempo do Apps Script
 */
function gerarCreditosAutomaticos() {
  processarCreditosGerais_(365, false);
}

/**
 * Menu manual executado pelo Administrador da interface
 */
function menuGerarGeral() {
  if (!verificarSeEhAdmin()) {
    throw new Error("Apenas Administradores podem forçar a geração em massa de créditos de férias.");
  }
  processarCreditosGerais_(365, true);
  return true;
}

/**
 * Lógica Central de Processamento de Créditos de Férias (Com LockService e Lote)
 */
function processarCreditosGerais_(diasFuturos, exibirAlertas) {
  const lock = LockService.getScriptLock();
  try {
    // Tenta obter o bloqueio por até 15 segundos
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("Erro de concorrência: Outro processo está gerando créditos de férias.");
    return { novos: 0, duplicados: 0, erros: 0, status: "ocupado" };
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const abaServ = ss.getSheetByName("Servidores");
    const abaCred = ss.getSheetByName("Creditos_Ferias");
    
    if (!abaServ || !abaCred) {
      lancarLog("ERRO_CREDITOS", "Creditos_Ferias", "Erro ao executar rotina: abas Servidores ou Creditos_Ferias não encontradas.", "", "", "", "");
      return { novos: 0, duplicados: 0, erros: 0 };
    }
    
    const dados = abaServ.getDataRange().getValues();
    const cabecalho = dados[0];
    
    const colMatriculaIdx = cabecalho.indexOf("MATRÍCULA");
    const colAdmissaoIdx = cabecalho.indexOf("Data de Admissão");
    const colAtivoIdx = cabecalho.indexOf("Ativo");
    
    let gerados = 0;
    let erros = 0;
    let duplicados = 0;
    
    const hoje = new Date();
    const dataLimiteFuturo = new Date();
    dataLimiteFuturo.setDate(hoje.getDate() + diasFuturos);
    
    // Carrega chaves de duplicidade em memória
    const creditosExistentes = obterChavesCreditosExistentesLocal_(abaCred);
    
    // Acumula os novos registros para inserção em lote ao final
    let novosCreditosLote = [];
    
    for (let i = 1; i < dados.length; i++) {
      let matricula = String(dados[i][colMatriculaIdx]).trim();
      let dataBruta = dados[i][colAdmissaoIdx];
      let ativo = colAtivoIdx !== -1 ? String(dados[i][colAtivoIdx]).trim() : "Sim";
      
      if (!matricula || ativo === "Não") continue; // Ignora inativos ou vazios
      
      let admissao = lerDataFormatoBR_(dataBruta);
      if (!admissao) {
        erros++;
        continue;
      }
      
      // Loop de períodos: Admissão + 1 ano até Data Limite Futura
      let cursorData = new Date(admissao);
      cursorData.setFullYear(cursorData.getFullYear() + 1);
      cursorData.setHours(0, 0, 0, 0);
      
      while (cursorData <= dataLimiteFuturo) {
        let anoFim = cursorData.getFullYear();
        let anoInicio = anoFim - 1;
        let referencia = "Aquisitivo " + anoInicio + "-" + anoFim;
        let chaveUnica = matricula + "|" + referencia;
        
        if (!creditosExistentes.has(chaveUnica)) {
          let id = Utilities.getUuid();
          novosCreditosLote.push([
            id,
            new Date(),
            matricula,
            referencia,
            30,
            new Date(cursorData)
          ]);
          creditosExistentes.add(chaveUnica);
          gerados++;
        } else {
          duplicados++;
        }
        
        cursorData.setFullYear(cursorData.getFullYear() + 1);
      }
    }
    
    // Executa a escrita em lote de todos os novos períodos aquisitivos gerados de uma só vez
    if (novosCreditosLote.length > 0) {
      const proximaLinha = abaCred.getLastRow() + 1;
      const rangeLote = abaCred.getRange(proximaLinha, 1, novosCreditosLote.length, 6);
      rangeLote.setValues(novosCreditosLote);
    }
    
    // Log sem lock (lock já está ativo neste bloco)
    lancarLogSemLock_(
      "GERAR_CREDITOS",
      "Creditos_Ferias",
      "Executou rotina de créditos de férias. Novos: " + gerados + " | Duplicados pulados: " + duplicados + " | Erros: " + erros,
      "", "", "", ""
    );
    
    return {
      novos: gerados,
      duplicados: duplicados,
      erros: erros
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lê objetos de data no formato de data nativo ou texto BR. Privada.
 */
function lerDataFormatoBR_(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (!isNaN(valor.getTime())) return valor;
    return null;
  }
  
  const str = String(valor).trim();
  const partes = str.split('/');
  if (partes.length === 3) {
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const ano = parseInt(partes[2], 10);
    const data = new Date(ano, mes, dia);
    if (!isNaN(data.getTime())) return data;
  }
  return null;
}

/**
 * Coleta chaves de duplicidade em lote. Privada.
 */
function obterChavesCreditosExistentesLocal_(abaCred) {
  const dados = abaCred.getDataRange().getValues();
  const chaves = new Set();
  for (let i = 1; i < dados.length; i++) {
    let mat = String(dados[i][2]).trim(); 
    let ref = String(dados[i][3]).trim();
    if (mat && ref) chaves.add(mat + "|" + ref);
  }
  return chaves;
}
