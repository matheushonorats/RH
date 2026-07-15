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
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    const colAtivoIdx = cabecalho.indexOf("Ativo");
    const colInfoFeriasIdx = cabecalho.indexOf("Info_Férias");
    const colMatriculaIdx = cabecalho.indexOf("MATRÍCULA");
    
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
    // Coluna 2 (index 2) = Status
    for (let i = 1; i < dadosProt.length; i++) {
      let status = String(dadosProt[i][2]).trim().toLowerCase();
      if (status === "pendente" || status === "aguardando assinatura") {
        totalProtocolosPendentes++;
      }
    }
  }
  
  // 3. Processar Lançamentos & Ausências de Hoje
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (abaLanc) {
    const dadosLanc = abaLanc.getDataRange().getValues();
    
    // Mapeamento de colunas baseado nas constantes do script original
    const COL_TIPO = 3;        // Coluna C (índice 2)
    const COL_NOME = 5;        // Coluna E (índice 4)
    const COL_DATA_INICIO = 9; // Coluna I (índice 8)
    const COL_DIAS = 13;       // Coluna M (índice 12)
    const COL_MATRICULA = 6;   // Coluna F (índice 5)
    
    for (let i = 1; i < dadosLanc.length; i++) {
      let linha = dadosLanc[i];
      let tipoDoc = String(linha[COL_TIPO - 1]).trim();
      let nomeBruto = String(linha[COL_NOME - 1]).trim();
      let matricula = String(linha[COL_MATRICULA - 1]).trim();
      let dias = parseInt(linha[COL_DIAS - 1]) || 1;
      
      // Ignora lançamentos anulados ou de tipo "Não efetivado"
      if (!tipoDoc || tipoDoc.toLowerCase().includes("não efetivado") || tipoDoc.toLowerCase().includes("anulado")) {
        continue;
      }
      
      let dataInicio = normalizarDataDashboard(linha[COL_DATA_INICIO - 1]);
      if (!dataInicio) continue;
      
      // Calcula data de término da ausência
      let dataFim = new Date(dataInicio);
      dataFim.setDate(dataInicio.getDate() + (dias - 1));
      dataFim.setHours(0, 0, 0, 0);
      
      // Verifica se HOJE está entre a Data de Início e Fim da ausência
      if (hoje >= dataInicio && hoje <= dataFim) {
        totalAusentesHoje++;
        
        let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
        let periodoStr = formatarDataDashboard(dataInicio);
        if (dias > 1) {
          periodoStr += " até " + formatarDataDashboard(dataFim);
        }
        
        listaAusentes.push({
          nome: nomeLimpo,
          matricula: matricula,
          tipo: tipoDoc,
          periodo: periodoStr,
          dias: dias
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
