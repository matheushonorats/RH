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
    s.feriasCompulsorias === true
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
  
  const ss = obterPlanilha_();
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (!abaLanc) return [];
  
  let dataInicio = parseInputDate_(dataInicioStr);
  let dataFim = parseInputDate_(dataFimStr);
  
  if (!dataInicio || !dataFim) {
    throw new Error("Intervalo de datas inválido.");
  }
  
  const dados = abaLanc.getDataRange().getValues();
  let resultados = [];
  const idx = obterIndicesColunasLancamentos_(dados[0]);

  if (idx.tipo === -1 || idx.nome === -1 || idx.matricula === -1 || idx.dataInicio === -1) {
    throw new Error("Cabecalhos obrigatorios nao encontrados na aba Lancamentos.");
  }
  
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    let tipo = String(linha[idx.tipo]).trim();
    if (!tipo || tipo.toLowerCase().includes("não efetivado") || tipo.toLowerCase().includes("anulado")) continue;
    
    let inicioLanc = lerDataFormatoBR_(linha[idx.dataInicio]);
    if (!inicioLanc) continue;
    
    let dias = obterDiasLancamento_(linha, idx) || 1;
    let fimLanc = new Date(inicioLanc);
    fimLanc.setDate(inicioLanc.getDate() + (dias - 1));
    fimLanc.setHours(0,0,0,0);
    
    // Verifica sobreposição de intervalos
    if (inicioLanc <= dataFim && fimLanc >= dataInicio) {
      let nomeBruto = String(linha[idx.nome]).trim();
      let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
      
      resultados.push({
        nome: nomeLimpo,
        matricula: normalizarChaveMatricula_(linha[idx.matricula]),
        tipo: tipo,
        inicio: formatarDataRelatorios_(inicioLanc),
        fim: formatarDataRelatorios_(fimLanc),
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
  
  const ss = obterPlanilha_();
  const abaServ = ss.getSheetByName("Servidores");
  const abaLanc = ss.getSheetByName("Lançamentos");
  
  if (!abaServ || !abaLanc) return [];
  
  const servidores = abaServ.getDataRange().getValues();
  const lancamentos = abaLanc.getDataRange().getValues();
  const anoAtual = String(new Date().getFullYear());
  const idxLanc = obterIndicesColunasLancamentos_(lancamentos[0]);

  if (idxLanc.tipo === -1 || idxLanc.matricula === -1 || idxLanc.dataInicio === -1) {
    throw new Error("Cabecalhos TIPO/MATRICULA/DATA INICIO nao encontrados em Lancamentos.");
  }
  
  let mapaAbonos = {};
  
  // 1. Processar lançamentos de abono ativos do ano
  for (let i = 1; i < lancamentos.length; i++) {
    let linha = lancamentos[i];
    let tipo = normalizarCabecalho_(linha[idxLanc.tipo]);
    let mat = normalizarChaveMatricula_(linha[idxLanc.matricula]);
    let dataInicio = lerDataFormatoBR_(linha[idxLanc.dataInicio]);
    let ano = dataInicio ? String(dataInicio.getFullYear()) : "";
    
    // Considera apenas tipos de abono que tenham marcação de conta abono
    // e ignora anulados
    if (tipo.includes("ABONADA") && !tipo.includes("NAO EFETIVADO") && !tipo.includes("ANULADO") && ano === anoAtual) {
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
  const idxNome = indiceCabecalho_(cabecalho, ["NOME", "NOME COMPLETO"]);
  const idxMat = indiceCabecalho_(cabecalho, ["MATRICULA"]);
  const idxLot = indiceCabecalho_(cabecalho, ["LOTACAO"]);
  const idxAtivo = indiceCabecalho_(cabecalho, ["ATIVO"]);

  if (idxNome === -1 || idxMat === -1) {
    throw new Error("Cabecalhos NOME/MATRICULA nao encontrados em Servidores.");
  }
  
  for (let i = 1; i < servidores.length; i++) {
    let mat = normalizarChaveMatricula_(servidores[i][idxMat]);
    let ativo = idxAtivo !== -1 ? String(servidores[i][idxAtivo]).trim() : "Sim";
    
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
  
  const ss = obterPlanilha_();
  const abaLogs = ss.getSheetByName("Logs");
  if (!abaLogs) return [];
  
  const dados = abaLogs.getDataRange().getValues();
  let logs = [];
  
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    logs.push({
      dataHora: formatarDataLogs_(linha[0]),
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

function formatarDataRelatorios_(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  return String(data);
}

function formatarDataLogs_(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  }
  return String(data);
}
