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
    const colInfoFeriasIdx = indiceCabecalho_(cabecalho, ["INFO FERIAS"]);
    const colMatriculaIdx = indiceCabecalho_(cabecalho, ["MATRICULA"]);

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
      
      // Férias Compulsórias (analisando o texto do Info_Férias)
      if (colInfoFeriasIdx !== -1) {
        let infoFerias = String(dadosServ[i][colInfoFeriasIdx]).toLowerCase();
        if (infoFerias.includes("vencido") || infoFerias.includes("crítico") || infoFerias.includes("risco")) {
          totalCompulsorias++;
        }
      }
    }
  }
  
  // 2. Processar Protocolos
  const abaProt = ss.getSheetByName("Protocolos");
  if (abaProt) {
    const dadosProt = abaProt.getDataRange().getValues();
    const cabecalhoProt = dadosProt[0] || [];
    const idxStatusProt = indiceCabecalho_(cabecalhoProt, ["STATUS", "STATUS DE ENVIO"]);
    for (let i = 1; i < dadosProt.length; i++) {
      let status = idxStatusProt !== -1 ? String(dadosProt[i][idxStatusProt]).trim().toLowerCase() : "";
      if (status === "pendente" || status === "aguardando assinatura") {
        totalProtocolosPendentes++;
      }
    }
  }
  
  // 3. Processar Lançamentos & Ausências de Hoje
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
          periodoStr += " ate " + formatarDataDashboard(dataFim);
        }
        
        listaAusentes.push({
          nome: nomeLimpo,
          matricula: matricula,
          tipo: tipoDoc,
          periodo: periodoStr,
          dias: diasLanc
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
