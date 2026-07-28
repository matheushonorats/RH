/**
 * RH Central de Documentos v2.0
 * Módulo de Notificações por E-mail (EmailService)
 */

/**
 * Envia e-mail diário com as ausências e férias dos próximos dias
 * Acionado por gatilho de tempo do Apps Script
 */
function verificarEEnviarEmailsDiarios() {
  const ss = obterPlanilha_();
  const abaConfig = ss.getSheetByName("Configuracoes");
  const abaLanc = ss.getSheetByName("Lançamentos");
  
  if (!abaConfig || !abaLanc) {
    Logger.log("Aba de Configurações ou Lançamentos não encontrada para rotina de e-mail.");
    return;
  }
  
  // 1. Obter parâmetros das configurações
  const config = obterMapaConfiguracoes_(abaConfig);
  let rawEmail = config["EMAIL_DESTINO"] || "turismo.setur@saosebastiao.sp.gov.br, turismo.eventos@saosebastiao.sp.gov.br";
  let emailsArray = rawEmail.split(/[;,]/).map(function(e) { return e.trim(); }).filter(Boolean);
  
  if (!emailsArray.some(function(e) { return e.toLowerCase() === "turismo.eventos@saosebastiao.sp.gov.br"; })) {
    emailsArray.push("turismo.eventos@saosebastiao.sp.gov.br");
  }
  const emailDestino = emailsArray.join(", ");
  const diasAlertaFerias = parseInt(config["DIAS_INTERVALO_FERIAS"]) || 15;
  const diasAlertaAbono = parseInt(config["DIAS_INTERVALO_ABONO"]) || 5;
  
  if (!emailDestino) {
    Logger.log("Nenhum e-mail de destino configurado nas configurações.");
    return;
  }
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  let listaFeriasProximas = [];
  let listaAbonosProximos = [];
  let listaCompulsorias = [];
  
  // 2. Obter Servidores em risco de Férias Compulsórias (6 meses ou vencidos)
  try {
    const todosServidores = obterListaServidores();
    listaCompulsorias = todosServidores.filter(function(s) {
      return s.status !== "Inativo" && s.feriasCompulsorias === true;
    }).map(function(s) {
      let statusPrazo = "";
      if (s.dataTerceiroPeriodo === "Já vencido" || (typeof s.diasParaTerceiroPeriodo === "number" && s.diasParaTerceiroPeriodo <= 0)) {
        statusPrazo = "Vencido! (3º período)";
      } else if (typeof s.diasParaTerceiroPeriodo === "number") {
        statusPrazo = "Faltam " + s.diasParaTerceiroPeriodo + " dias";
      } else {
        statusPrazo = "Em risco";
      }
      return {
        nome: s.nome,
        matricula: s.matricula,
        lotacao: s.lotacao || "-",
        saldoHoje: s.saldoHoje || 0,
        limite: s.dataTerceiroPeriodo || "-",
        prazo: statusPrazo
      };
    });
  } catch (eComp) {
    Logger.log("Erro ao compilar lista de férias compulsórias para o e-mail: " + eComp.toString());
  }
  
  // 3. Filtrar Lançamentos usando os cabeçalhos reais da planilha.
  const dadosLanc = abaLanc.getDataRange().getValues();
  const idx = obterIndicesColunasLancamentos_(dadosLanc[0]);

  if (idx.tipo === -1 || idx.nome === -1 || idx.matricula === -1 || idx.dataInicio === -1) {
    throw new Error("Cabecalhos obrigatorios nao encontrados na aba Lancamentos.");
  }
  
  for (let i = 1; i < dadosLanc.length; i++) {
    let linha = dadosLanc[i];
    let tipo = String(linha[idx.tipo]).trim();
    if (!tipo || tipo.toLowerCase().includes("não efetivado") || tipo.toLowerCase().includes("anulado")) {
      continue;
    }
    
    let dataInicio = lerDataFormatoBR_(linha[idx.dataInicio]);
    if (!dataInicio) continue;
    
    let dias = obterDiasLancamento_(linha, idx) || 1;
    let nomeBruto = String(linha[idx.nome]).trim();
    let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
    let idoc = idx.idoc !== -1 ? String(linha[idx.idoc]).trim() : "";
    idoc = idoc || "Sem 1Doc";
    
    // Calcula diferença em dias
    let diferencaTempo = dataInicio.getTime() - hoje.getTime();
    let diferencaDias = Math.ceil(diferencaTempo / (1000 * 60 * 60 * 24));
    
    if (diferencaDias >= 0) {
      if (tipo.toLowerCase().includes("férias") || tipo.toLowerCase().includes("ferias") || tipo.toLowerCase().includes("licença prêmio")) {
        if (diferencaDias <= diasAlertaFerias) {
          listaFeriasProximas.push({
            nome: nomeLimpo,
            tipo: tipo,
            data: formatarDataEmail_(dataInicio),
            dias: dias,
            diasFaltando: diferencaDias,
            idoc: idoc
          });
        }
      } else if (tipo.toLowerCase().includes("abonada") || tipo.toLowerCase().includes("abono")) {
        if (diferencaDias <= diasAlertaAbono) {
          listaAbonosProximos.push({
            nome: nomeLimpo,
            tipo: tipo,
            data: formatarDataEmail_(dataInicio),
            diasFaltando: diferencaDias,
            idoc: idoc
          });
        }
      }
    }
  }
  
  // 4. Montar e enviar e-mail se houver novidades
  if (listaFeriasProximas.length > 0 || listaAbonosProximos.length > 0 || listaCompulsorias.length > 0) {
    enviarAlertaHtml_(emailDestino, listaFeriasProximas, listaAbonosProximos, listaCompulsorias);
    lancarLog("ENVIAR_ALERTA", "Email", "Alerta diário enviado com sucesso para: " + emailDestino, "", "", "", "");
  } else {
    Logger.log("Nenhum alerta de férias, abonos ou compulsórias para enviar hoje.");
  }
}

/**
 * Envia o e-mail formatado
 */
function enviarAlertaHtml_(email, ferias, abonos, compulsorias) {
  let html = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 650px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background-color: #00875f; color: #ffffff; padding: 24px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">RH SETUR - Alertas Diários</h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Prefeitura Municipal de São Sebastião</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 14px; color: #555; margin-bottom: 20px;">Seguem os alertas de ausências programadas e risco de férias compulsórias no setor de Turismo:</p>
  `;
  
  // FÉRIAS PRÓXIMAS
  if (ferias.length > 0) {
    html += `
      <h3 style="color: #00875f; font-size: 15px; border-bottom: 2px solid #00875f; padding-bottom: 6px; margin-top: 20px; margin-bottom: 12px; text-transform: uppercase;">Férias e Licenças Próximas</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="border: 1px solid #ddd; padding: 10px; text-align: left; font-weight: 700;">Servidor</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: left; font-weight: 700;">Tipo</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: center; font-weight: 700;">Data Saída</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: center; font-weight: 700;">Dias</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: center; font-weight: 700;">Dias Restantes</th>
          </tr>
        </thead>
        <tbody>
    `;
    ferias.forEach(f => {
      html += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 10px;"><strong>${f.nome}</strong></td>
          <td style="border: 1px solid #ddd; padding: 10px;">${f.tipo}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${f.data}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${f.dias}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: center; font-weight: bold; color: ${f.diasFaltando <= 5 ? '#f75a5a' : '#555'}">${f.diasFaltando} dias</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
  }
  
  // ABONOS PRÓXIMOS
  if (abonos.length > 0) {
    html += `
      <h3 style="color: #0784b5; font-size: 15px; border-bottom: 2px solid #0784b5; padding-bottom: 6px; margin-top: 20px; margin-bottom: 12px; text-transform: uppercase;">Abonadas Próximas</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="border: 1px solid #ddd; padding: 10px; text-align: left; font-weight: 700;">Servidor</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: left; font-weight: 700;">Tipo</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: center; font-weight: 700;">Data Falta</th>
            <th style="border: 1px solid #ddd; padding: 10px; text-align: center; font-weight: 700;">Dias Restantes</th>
          </tr>
        </thead>
        <tbody>
    `;
    abonos.forEach(a => {
      html += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 10px;"><strong>${a.nome}</strong></td>
          <td style="border: 1px solid #ddd; padding: 10px;">${a.tipo}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${a.data}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: center; font-weight: bold; color: ${a.diasFaltando <= 2 ? '#feb408' : '#555'}">${a.diasFaltando} dias</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
  }

  // FÉRIAS COMPULSÓRIAS (RISCO / PRÓXIMOS 6 MESES / VENCIDOS)
  if (compulsorias && compulsorias.length > 0) {
    html += `
      <h3 style="color: #d97706; font-size: 15px; border-bottom: 2px solid #d97706; padding-bottom: 6px; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase;">Risco de Férias Compulsórias (Próximos 6 meses / Vencidos)</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
        <thead>
          <tr style="background-color: #fef3c7;">
            <th style="border: 1px solid #fde68a; padding: 10px; text-align: left; font-weight: 700; color: #92400e;">Servidor</th>
            <th style="border: 1px solid #fde68a; padding: 10px; text-align: left; font-weight: 700; color: #92400e;">Lotação</th>
            <th style="border: 1px solid #fde68a; padding: 10px; text-align: center; font-weight: 700; color: #92400e;">Saldo Hoje</th>
            <th style="border: 1px solid #fde68a; padding: 10px; text-align: center; font-weight: 700; color: #92400e;">Limite 3º Período</th>
            <th style="border: 1px solid #fde68a; padding: 10px; text-align: center; font-weight: 700; color: #92400e;">Situação</th>
          </tr>
        </thead>
        <tbody>
    `;
    compulsorias.forEach(c => {
      const ehVencido = c.prazo.includes("Vencido");
      html += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 10px;"><strong>${c.nome}</strong><br><span style="font-size: 11px; color: #666;">Mat: ${c.matricula}</span></td>
          <td style="border: 1px solid #ddd; padding: 10px;">${c.lotacao}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: center; font-weight: bold;">${c.saldoHoje} dias</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${c.limite}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: center; font-weight: bold; color: ${ehVencido ? '#dc2626' : '#d97706'}">${c.prazo}</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
  }
  
  html += `
        <div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 16px; font-size: 12px; color: #777; text-align: center;">
          Este e-mail é gerado automaticamente pelo sistema de RH - Central de Documentos SETUR v2.0.<br>
          Para configurar os destinatários ou intervalos, acesse o painel administrativo do sistema.
        </div>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: email,
    subject: "Alerta de Ausências Programadas - RH SETUR",
    htmlBody: html
  });
}

function obterMapaConfiguracoes_(abaConfig) {
  const dados = abaConfig.getDataRange().getValues();
  let mapa = {};
  for (let i = 1; i < dados.length; i++) {
    let chave = String(dados[i][0]).trim();
    let valor = String(dados[i][1]).trim();
    if (chave) mapa[chave] = valor;
  }
  return mapa;
}

function formatarDataEmail_(data) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
}
