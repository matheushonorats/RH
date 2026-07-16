/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio do Dashboard (DashboardService)
 */

/**
 * Retorna os dados consolidados do dashboard inicial
 */
function obterResumoDashboard() {
  // Garante que o usuário tem acesso antes de prosseguir
  obterDadosUsuarioLogado();
  
  const ss = obterPlanilha_();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  let totalAtivos = 0;
  let totalCompulsorias = 0;
  let totalAusentesHoje = 0;
  let totalProtocolosPendentes = 0;
  let listaAusentes = [];
  
  // 1. Processar Servidores
  const abaServ = ss.getSheetByName("Servidores");
  if (abaServ) {
    const dadosServ = abaServ.getDataRange().getValues();
    // Identificar a posição das colunas
    const cabecalho = dadosServ[0];
    const colAtivoIdx = indiceCabecalho_(cabecalho, ["ATIVO"]);
    const colMatriculaIdx = indiceCabecalho_(cabecalho, ["MATRICULA"]);
    const colSaldoFeriasIdx = indiceCabecalho_(cabecalho, ["FERIAS SALDO HOJE", "SALDO HOJE", "SALDO FERIAS"]);
    
    // Calcula saldos de todos os servidores em lote
    const mapaSaldos = construirMapaSaldosFerias_(ss);

    if (colMatriculaIdx === -1) {
      throw new Error("Cabecalho MATRICULA nao encontrado na aba Servidores.");
    }
    
    for (let i = 1; i < dadosServ.length; i++) {
      let matricula = String(dadosServ[i][colMatriculaIdx]).trim();
      if (!matricula) continue;
      
      // Servidores Ativos
      let ativo = colAtivoIdx !== -1 ? String(dadosServ[i][colAtivoIdx]).trim() : "Sim";
      if (ativo === "Sim") {
        totalAtivos++;
      }
      
      // Férias Compulsórias (Saldo de férias >= 60 dias)
      const saldoPlanilha = colSaldoFeriasIdx !== -1
        ? obterNumeroPlanilha_(dadosServ[i][colSaldoFeriasIdx])
        : null;
      const saldoFerias = saldoPlanilha !== null
        ? saldoPlanilha
        : (mapaSaldos[normalizarChaveMatricula_(matricula)] || 0);
      if (saldoFerias >= 60) {
        totalCompulsorias++;
      }
    }
  }
  
  // 2. Processar Protocolos Pendentes (Agora: Lançamentos Sem 1DOC)
  // Removemos a leitura da aba Protocolos, pois contaremos direto na aba Lançamentos
  
  // 3. Processar Lançamentos (Ausências e Pendentes de 1DOC)
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (abaLanc) {
    const dadosLanc = abaLanc.getDataRange().getValues();
    
    const cabecalhoLanc = dadosLanc[0];
    const idxLanc = obterIndicesColunasLancamentos_(cabecalhoLanc);
    
    for (let i = 1; i < dadosLanc.length; i++) {
      let linha = dadosLanc[i];
      let tipoDoc = idxLanc.tipo !== -1 ? String(linha[idxLanc.tipo]).trim() : "";
      let nomeBruto = idxLanc.nome !== -1 ? String(linha[idxLanc.nome]).trim() : "";
      let matricula = idxLanc.matricula !== -1 ? String(linha[idxLanc.matricula]).trim() : "";
      let diasLanc = obterDiasLancamento_(linha, idxLanc);
      
      // Ignora lançamentos anulados ou de tipo "Não efetivado"
      if (!tipoDoc || tipoDoc.toLowerCase().includes("não efetivado") || tipoDoc.toLowerCase().includes("anulado")) {
        continue;
      }
      // Verifica pendência de 1DOC (não tem número preenchido), desconsiderando lançamentos > 1 ano
      let num1Doc = idxLanc.idoc !== -1 ? String(linha[idxLanc.idoc]).trim() : "";
      if (!num1Doc) {
        let dataLancObj = idxLanc.dataSolicitacao !== -1 ? normalizarDataDashboard(linha[idxLanc.dataSolicitacao]) : null;
        let diffDias = 0;
        if (dataLancObj) {
          diffDias = (hoje.getTime() - dataLancObj.getTime()) / (1000 * 3600 * 24);
        }
        if (diffDias <= 365) {
          totalProtocolosPendentes++;
        }
      }
      
      let dataInicio = idxLanc.dataInicio !== -1 ? normalizarDataDashboard(linha[idxLanc.dataInicio]) : null;
      if (!dataInicio) continue;
      
      // Calcula data de término da ausência
      let dataFim = new Date(dataInicio);
      dataFim.setDate(dataInicio.getDate() + (diasLanc - 1));
      dataFim.setHours(0, 0, 0, 0);
      
      if (hoje >= dataInicio && hoje <= dataFim) {
        totalAusentesHoje++;
        
        let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
        let periodoStr = formatarDataDashboard(dataInicio);
        if (diasLanc > 1) {
          periodoStr += " até " + formatarDataDashboard(dataFim);
        }
        
        listaAusentes.push({
          idoc: num1Doc,
          nome: nomeLimpo,
          matricula: matricula,
          tipo: tipoDoc,
          periodo: periodoStr,
          dias: diasLanc,
          linhaPlanilha: i + 1
        });
      }
    }
  }
  
  return {
    ativos: totalAtivos,
    compulsorias: totalCompulsorias,
    ausentesHoje: totalAusentesHoje,
    protocolosPendentes: totalProtocolosPendentes,
    listaAusentes: listaAusentes
  };
}

/**
 * Normaliza objetos de data de forma robusta
 */
function normalizarDataDashboard(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    valor.setHours(0, 0, 0, 0);
    return valor;
  }
  let stringData = String(valor).trim().split(" ")[0];
  if (stringData.includes('/')) {
    var partes = stringData.split('/');
    if (partes.length === 3) {
      var d = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  return null;
}

/**
 * Formata data no padrão brasileiro
 */
function formatarDataDashboard(data) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
}
