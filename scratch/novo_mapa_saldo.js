/**
 * Constrói um mapa em memória dos saldos de férias dos servidores.
 * Retorna: { matricula: saldoEmDias }
 */
function construirMapaSaldosFerias_(ss) {
  let mapaSaldos = {};

  // 1. Somar os Créditos
  const abaCreditos = ss.getSheetByName("Creditos_Ferias");
  if (abaCreditos) {
    const dadosCreditos = abaCreditos.getDataRange().getValues();
    if (dadosCreditos.length > 1) {
      const cabecalhoCred = dadosCreditos[0];
      const colIdxMatCred = indiceCabecalho_(cabecalhoCred, ["MATRICULA"]);
      const colIdxQtdCred = indiceCabecalho_(cabecalhoCred, ["QTD DIAS", "QTD_DIAS"]);
      
      if (colIdxMatCred !== -1 && colIdxQtdCred !== -1) {
        for (let i = 1; i < dadosCreditos.length; i++) {
          let mat = String(dadosCreditos[i][colIdxMatCred]).trim();
          let qtd = parseInt(dadosCreditos[i][colIdxQtdCred]) || 0;
          if (mat) {
            mapaSaldos[mat] = (mapaSaldos[mat] || 0) + qtd;
          }
        }
      }
    }
  }

  // 2. Subtrair os Débitos (Lançamentos de Férias)
  const abaLanc = ss.getSheetByName("Lancamentos") || ss.getSheetByName("Lançamentos");
  if (abaLanc) {
    const dadosLanc = abaLanc.getDataRange().getValues();
    if (dadosLanc.length > 1) {
      const cabecalhoLanc = dadosLanc[0];
      const colIdxTipo = indiceCabecalho_(cabecalhoLanc, ["TIPO DE DOCUMENTO", "TIPO"]);
      const colIdxMatLanc = indiceCabecalho_(cabecalhoLanc, ["MATRICULA"]);
      const idxDias = indiceCabecalho_(cabecalhoLanc, ["DIAS", "QTD DIAS"]);
      const idxDiasFerias = indiceCabecalho_(cabecalhoLanc, ["QUANTIDADE FERIAS", "QTD FERIAS"]);
      
      if (colIdxTipo !== -1 && colIdxMatLanc !== -1) {
        const idxParaDias = { dias: idxDias, diasFerias: idxDiasFerias };
        for (let i = 1; i < dadosLanc.length; i++) {
          let linha = dadosLanc[i];
          let mat = String(linha[colIdxMatLanc]).trim();
          let tipoDoc = String(linha[colIdxTipo]).trim().toLowerCase();
          
          // Apenas deduz de férias que foram efetivadas
          if (tipoDoc.includes("férias") || tipoDoc.includes("ferias")) {
            if (!tipoDoc.includes("não efetivado") && !tipoDoc.includes("anulado")) {
              let dias = obterDiasLancamento_(linha, idxParaDias);
              if (mat) {
                mapaSaldos[mat] = (mapaSaldos[mat] || 0) - dias;
              }
            }
          }
        }
      }
    }
  }

  return mapaSaldos;
}
