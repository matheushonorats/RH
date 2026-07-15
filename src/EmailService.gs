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
  const emailDestino = config["EMAIL_DESTINO"] || "";
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
  
  // 2. Filtrar Lançamentos
  const dadosLanc = abaLanc.getDataRange().getValues();
  const COL_TIPO = 3;        // Col C
  const COL_NOME = 5;        // Col E
  const COL_DATA_INICIO = 9; // Col I
  const COL_DIAS = 13;       // Col M
  const COL_MATRICULA = 6;   // Col F
  const COL_IDOC = 1;        // Col A
  
  for (let i = 1; i < dadosLanc.length; i++) {
    let linha = dadosLanc[i];
    let tipo = String(linha[COL_TIPO - 1]).trim();
    if (!tipo || tipo.toLowerCase().includes("não efetivado") || tipo.toLowerCase().includes("anulado")) {
      continue;
    }
    
    let dataInicio = lerDataFormatoBR_(linha[COL_DATA_INICIO - 1]);
    if (!dataInicio) continue;
    
    let dias = parseInt(linha[COL_DIAS - 1]) || 1;
    let nomeBruto = String(linha[COL_NOME - 1]).trim();
    let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
    let matricula = String(linha[COL_MATRICULA - 1]).trim();
    let idoc = String(linha[COL_IDOC - 1]).trim() || "Sem 1Doc";
    
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
  
  // 3. Montar e enviar e-mail se houver novidades
  if (listaFeriasProximas.length > 0 || listaAbonosProximos.length > 0) {
    enviarAlertaHtml_(emailDestino, listaFeriasProximas, listaAbonosProximos);
    lancarLog("ENVIAR_ALERTA", "Email", "Alerta diário enviado com sucesso para: " + emailDestino, "", "", "", "");
  } else {
    Logger.log("Nenhum alerta de férias ou abonos para enviar hoje.");
  }
}

/**
 * Envia o e-mail formatado
 */
function enviarAlertaHtml_(email, ferias, abonos) {
  let html = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 650px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background-color: #00875f; color: #ffffff; padding: 24px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">RH SETUR - Alertas Diários</h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Prefeitura Municipal de São Sebastião</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 14px; color: #555; margin-bottom: 20px;">Seguem as ausências programadas para os próximos dias no setor de Turismo:</p>
  `;
  
  // FÉRIAS
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
  
  // ABONOS
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
