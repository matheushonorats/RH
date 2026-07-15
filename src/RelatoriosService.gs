/**
 * RH Central de Documentos v2.0
 * Módulo de Geração de Relatórios (RelatoriosService)
 */

/**
 * Retorna os dados do relatório de Férias Compulsórias (servidores com 2 períodos vencidos)
 */
function obterRelatorioCompulsorias() {
  obterDadosUsuarioLogado();
  const servidores = obterListaServidores();
  
  // Filtra apenas servidores Ativos que possuem 2 períodos vencidos
  return servidores.filter(s => 
    s.status !== "Inativo" && 
    (s.infoFerias.toLowerCase().includes("2 período") || 
     s.infoFerias.toLowerCase().includes("crítico") || 
     s.infoFerias.toLowerCase().includes("2 p."))
  );
}

/**
 * Retorna dados sobre a Situação Geral de Férias de todos os servidores ativos
 */
function obterRelatorioSituacaoFerias() {
  obterDadosUsuarioLogado();
  const servidores = obterListaServidores();
  return servidores.filter(s => s.status !== "Inativo");
}

/**
 * Retorna ausências programadas em um intervalo de datas (escala)
 */
function obterRelatorioAusenciasCalendario(dataInicioStr, dataFimStr) {
  obterDadosUsuarioLogado();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (!abaLanc) return [];
  
  let dataInicio = parseInputDate(dataInicioStr);
  let dataFim = parseInputDate(dataFimStr);
  
  if (!dataInicio || !dataFim) {
    throw new Error("Intervalo de datas inválido.");
  }
  
  const dados = abaLanc.getDataRange().getValues();
  let resultados = [];
  
  const COL_TIPO = 3;        // Col C
  const COL_NOME = 5;        // Col E
  const COL_DATA_INICIO = 9; // Col I
  const COL_DIAS = 13;       // Col M
  const COL_MATRICULA = 6;   // Col F
  
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    let tipo = String(linha[COL_TIPO - 1]).trim();
    if (!tipo || tipo.toLowerCase().includes("não efetivado") || tipo.toLowerCase().includes("anulado")) continue;
    
    let inicioLanc = lerDataFormatoBR(linha[COL_DATA_INICIO - 1]);
    if (!inicioLanc) continue;
    
    let dias = parseInt(linha[COL_DIAS - 1]) || 1;
    let fimLanc = new Date(inicioLanc);
    fimLanc.setDate(inicioLanc.getDate() + (dias - 1));
    fimLanc.setHours(0,0,0,0);
    
    // Verifica sobreposição de intervalos
    if (inicioLanc <= dataFim && fimLanc >= dataInicio) {
      let nomeBruto = String(linha[COL_NOME - 1]).trim();
      let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
      
      resultados.push({
        nome: nomeLimpo,
        matricula: String(linha[COL_MATRICULA - 1]).trim(),
        tipo: tipo,
        inicio: formatarDataRelatorios(inicioLanc),
        fim: formatarDataRelatorios(fimLanc),
        dias: dias
      });
    }
  }
  
  return resultados;
}

/**
 * Retorna o resumo de todos os lançamentos ocorridos em um mês/ano selecionado
 */
function obterRelatorioResumoMensal(mes, ano) {
  obterDadosUsuarioLogado();
  const todos = obterListaLancamentos();
  
  return todos.filter(l => 
    l.mes.toUpperCase() === String(mes).toUpperCase() && 
    l.ano === String(ano)
  );
}

/**
 * Retorna a cota de abonos utilizados por servidor no ano corrente
 */
function obterRelatorioAbonosAnuais() {
  obterDadosUsuarioLogado();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaServ = ss.getSheetByName("Servidores");
  const abaLanc = ss.getSheetByName("Lançamentos");
  
  if (!abaServ || !abaLanc) return [];
  
  const servidores = abaServ.getDataRange().getValues();
  const lancamentos = abaLanc.getDataRange().getValues();
  const anoAtual = String(new Date().getFullYear());
  
  const COL_TIPO = 3;        // Col C
  const COL_MATRICULA = 6;   // Col F
  const COL_ANO = 15;        // Col O
  
  let mapaAbonos = {};
  
  // 1. Processar lançamentos de abono ativos do ano
  for (let i = 1; i < lancamentos.length; i++) {
    let linha = lancamentos[i];
    let tipo = String(linha[COL_TIPO - 1]).trim().toLowerCase();
    let mat = String(linha[COL_MATRICULA - 1]).trim();
    let ano = String(linha[COL_ANO - 1]).trim();
    
    // Considera apenas tipos de abono que tenham marcação de conta abono
    // e ignora anulados
    if (tipo.includes("abonada") && !tipo.includes("não efetivado") && !tipo.includes("anulado") && ano === anoAtual) {
      if (!mapaAbonos[mat]) mapaAbonos[mat] = 0;
      mapaAbonos[mat]++;
    }
  }
  
  // Obter limite de abonos configurado na aba Configuracoes
  let limiteAbonos = 5;
  const abaConfig = ss.getSheetByName("Configuracoes");
  if (abaConfig) {
    const dadosConfig = abaConfig.getDataRange().getValues();
    for (let j = 1; j < dadosConfig.length; j++) {
      if (String(dadosConfig[j][0]).trim() === "LIMITE_ABONADAS_ANO") {
        limiteAbonos = parseInt(dadosConfig[j][1]) || 5;
        break;
      }
    }
  }
  
  // 2. Mesclar com servidores
  let relatorio = [];
  const cabecalho = servidores[0];
  const idxNome = cabecalho.indexOf("NOME");
  const idxMat = cabecalho.indexOf("MATRÍCULA");
  const idxLot = cabecalho.indexOf("LOTAÇÃO");
  
  for (let i = 1; i < servidores.length; i++) {
    let mat = String(servidores[i][idxMat]).trim();
    let ativo = cabecalho.indexOf("Ativo") !== -1 ? String(servidores[i][cabecalho.indexOf("Ativo")]).trim() : "Sim";
    
    if (!mat || ativo === "Não") continue;
    
    let abonosUsados = mapaAbonos[mat] || 0;
    
    relatorio.push({
      nome: String(servidores[i][idxNome]).trim(),
      matricula: mat,
      lotacao: idxLot !== -1 ? String(servidores[i][idxLot]).trim() : "",
      abonosUsados: abonosUsados,
      limiteAnual: limiteAbonos,
      saldoRestante: Math.max(0, limiteAbonos - abonosUsados)
    });
  }
  
  return relatorio.sort((a,b) => b.abonosUsados - a.abonosUsados);
}

/**
 * Retorna os logs de auditoria detalhados
 */
function obterRelatorioLogs() {
  if (!verificarSeEhAdmin()) {
    throw new Error("Apenas Administradores têm permissão para ver os logs de auditoria.");
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaLogs = ss.getSheetByName("Logs");
  if (!abaLogs) return [];
  
  const dados = abaLogs.getDataRange().getValues();
  let logs = [];
  
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    logs.push({
      dataHora: formatarDataLogs(linha[0]),
      usuario: String(linha[1]).trim(),
      acao: String(linha[2]).trim(),
      modulo: String(linha[3]).trim(),
      descricao: String(linha[4]).trim(),
      campoAlterado: String(linha[5]).trim(),
      valorAntes: String(linha[6]).trim(),
      valorDepois: String(linha[7]).trim(),
      idRegistro: String(linha[8]).trim(),
      linha: i + 1
    });
  }
  
  // Ordena por log mais recente
  logs.sort((a,b) => b.linha - a.linha);
  return logs;
}

// --- AUXILIARES ---

function formatarDataRelatorios(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  return String(data);
}

function formatarDataLogs(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  }
  return String(data);
}
