/**
 * RH Central de Documentos v2.0
 * Módulo de Gestão de Créditos de Férias (CreditosFeriasService)
 * 
 * Portado e aprimorado do robô diário original da planilha.
 */

/**
 * Executa a varredura diária automática para gerar créditos de novos períodos aquisitivos
 * Acionado por gatilho de tempo do Apps Script
 */
function gerarCreditosAutomaticos() {
  processarCreditosGerais(365, false);
}

/**
 * Menu manual executado pelo Administrador da interface
 */
function menuGerarGeral() {
  if (!verificarSeEhAdmin()) {
    throw new Error("Apenas Administradores podem forçar a geração em massa de créditos de férias.");
  }
  processarCreditosGerais(365, true);
  return true;
}

/**
 * Lógica Central de Processamento de Créditos de Férias
 */
function processarCreditosGerais(diasFuturos, exibirAlertas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaServ = ss.getSheetByName("Servidores");
  const abaCred = ss.getSheetByName("Creditos_Ferias");
  
  if (!abaServ || !abaCred) {
    lancarLog("ERRO_CREDITOS", "Creditos_Ferias", "Erro ao executar rotina: abas Servidores ou Creditos_Ferias não encontradas.", "", "", "", "");
    return;
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
  const creditosExistentes = obterChavesCreditosExistentesLocal(abaCred);
  
  for (let i = 1; i < dados.length; i++) {
    let matricula = String(dados[i][colMatriculaIdx]).trim();
    let dataBruta = dados[i][colAdmissaoIdx];
    let ativo = colAtivoIdx !== -1 ? String(dados[i][colAtivoIdx]).trim() : "Sim";
    
    if (!matricula || ativo === "Não") continue; // Ignora inativos ou vazios
    
    let admissao = lerDataFormatoBR(dataBruta);
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
        lancarCreditoTabela(abaCred, matricula, referencia, 30, new Date(cursorData));
        creditosExistentes.add(chaveUnica);
        gerados++;
      } else {
        duplicados++;
      }
      
      cursorData.setFullYear(cursorData.getFullYear() + 1);
    }
  }
  
  lancarLog(
    "GERAR_CREDITOS", 
    "Creditos_Ferias", 
    "Executou rotina de créditos de férias. Novos: " + gerados + " | Duplicados pulados: " + duplicados + " | Erros: " + erros, 
    "", 
    "", 
    "", 
    ""
  );
  
  return {
    novos: gerados,
    duplicados: duplicados,
    erros: erros
  };
}

/**
 * Lê objetos de data no formato de data nativo ou texto BR
 */
function lerDataFormatoBR(valor) {
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

function obterChavesCreditosExistentesLocal(abaCred) {
  const dados = abaCred.getDataRange().getValues();
  const chaves = new Set();
  // Assume: Col C (índice 2) = Matricula | Col D (índice 3) = Referencia
  for (let i = 1; i < dados.length; i++) {
    let mat = String(dados[i][2]).trim(); 
    let ref = String(dados[i][3]).trim();
    if (mat && ref) chaves.add(mat + "|" + ref);
  }
  return chaves;
}

function lancarCreditoTabela(abaCred, matricula, referencia, qtd, dataLiberacao) {
  let id = Utilities.getUuid();
  abaCred.appendRow([
    id, 
    new Date(), 
    matricula, 
    referencia, 
    qtd, 
    dataLiberacao
  ]);
}
