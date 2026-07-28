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
  
  let mapaServidores = {};
  try {
    const todosServ = obterListaServidores();
    todosServ.forEach(function(s) {
      mapaServidores[normalizarChaveMatricula_(s.matricula)] = {
        nome: s.nome,
        lotacao: s.lotacao || "-"
      };
    });
  } catch (eServ) {
    Logger.log("Erro ao obter mapa de servidores: " + eServ.toString());
  }

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
      let ehVencido = s.dataTerceiroPeriodo === "Já vencido" || (typeof s.diasParaTerceiroPeriodo === "number" && s.diasParaTerceiroPeriodo <= 0);
      if (ehVencido) {
        statusPrazo = "Vencido!";
      } else if (typeof s.diasParaTerceiroPeriodo === "number") {
        statusPrazo = "Faltam " + s.diasParaTerceiroPeriodo + " dias";
      } else {
        statusPrazo = "Em risco";
      }
      return {
        nome: s.nome,
        matricula: s.matricula,
        lotacao: s.lotacao || "-",
        saldoHoje: (s.saldoHoje || 0) + " dias",
        limite: s.dataTerceiroPeriodo || "-",
        prazo: statusPrazo,
        ehVencido: ehVencido,
        diasRestantes: typeof s.diasParaTerceiroPeriodo === "number" ? s.diasParaTerceiroPeriodo : 999
      };
    });

    listaCompulsorias.sort(function(a, b) {
      if (a.ehVencido && !b.ehVencido) return -1;
      if (!a.ehVencido && b.ehVencido) return 1;
      return a.diasRestantes - b.diasRestantes;
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
    let matricula = normalizarChaveMatricula_(linha[idx.matricula]);
    let infoServ = mapaServidores[matricula] || { lotacao: "-" };
    let idoc = idx.idoc !== -1 ? String(linha[idx.idoc]).trim() : "";
    idoc = idoc || "Sem 1Doc";
    
    // Data de Retorno = dataInicio + dias
    let dataRetorno = new Date(dataInicio.getTime());
    dataRetorno.setDate(dataRetorno.getDate() + dias);
    
    // Verifica se a pessoa já está ausente/em férias HOJE
    let ausenteHoje = (dataInicio <= hoje && hoje < dataRetorno);
    
    // Calcula a diferença em dias para o início
    let diferencaTempo = dataInicio.getTime() - hoje.getTime();
    let diferencaDias = Math.ceil(diferencaTempo / (1000 * 60 * 60 * 24));
    
    if (ausenteHoje || (diferencaDias >= 0 && diferencaDias <= diasAlertaFerias)) {
      if (tipo.toLowerCase().includes("férias") || tipo.toLowerCase().includes("ferias") || tipo.toLowerCase().includes("licença prêmio")) {
        listaFeriasProximas.push({
          nome: nomeLimpo,
          matricula: matricula,
          lotacao: infoServ.lotacao,
          tipo: tipo,
          dataSaidaObj: dataInicio,
          dataSaida: formatarDataEmail_(dataInicio),
          dataRetorno: formatarDataEmail_(dataRetorno),
          dias: dias,
          ausenteHoje: ausenteHoje,
          idoc: idoc
        });
      }
    }
    
    if (ausenteHoje || (diferencaDias >= 0 && diferencaDias <= diasAlertaAbono)) {
      if (tipo.toLowerCase().includes("abonada") || tipo.toLowerCase().includes("abono")) {
        listaAbonosProximos.push({
          nome: nomeLimpo,
          matricula: matricula,
          lotacao: infoServ.lotacao,
          tipo: tipo,
          dataFaltaObj: dataInicio,
          dataFalta: formatarDataEmail_(dataInicio),
          ausenteHoje: ausenteHoje,
          idoc: idoc
        });
      }
    }
  }

  // Ordenação: Ausentes HOJE no topo. Demais ordenados por Data de Saída / Falta crescente.
  listaFeriasProximas.sort(function(a, b) {
    if (a.ausenteHoje && !b.ausenteHoje) return -1;
    if (!a.ausenteHoje && b.ausenteHoje) return 1;
    return a.dataSaidaObj.getTime() - b.dataSaidaObj.getTime();
  });

  listaAbonosProximos.sort(function(a, b) {
    if (a.ausenteHoje && !b.ausenteHoje) return -1;
    if (!a.ausenteHoje && b.ausenteHoje) return 1;
    return a.dataFaltaObj.getTime() - b.dataFaltaObj.getTime();
  });
  
  // 4. Montar e enviar e-mail se houver novidades
  if (listaFeriasProximas.length > 0 || listaAbonosProximos.length > 0 || listaCompulsorias.length > 0) {
    enviarAlertaHtml_(emailDestino, listaFeriasProximas, listaAbonosProximos, listaCompulsorias);
    lancarLog("ENVIAR_ALERTA", "Email", "Alerta diário enviado com sucesso para: " + emailDestino, "", "", "", "");
  } else {
    Logger.log("Nenhum alerta de férias, abonos ou compulsórias para enviar hoje.");
  }
}

/**
 * Envia o e-mail formatado com colunas e ordenação otimizadas
 */
function enviarAlertaHtml_(email, ferias, abonos, compulsorias) {
  let html = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 720px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
      <div style="background-color: #00875f; color: #ffffff; padding: 22px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">RH SETUR - Alertas Diários</h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Prefeitura Municipal de São Sebastião</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 14px; color: #475569; margin-bottom: 20px; line-height: 1.5;">
          Seguem os alertas de ausências e férias compulsórias no setor de Turismo:
        </p>
  `;
  
  // FÉRIAS E LICENÇAS
  if (ferias.length > 0) {
    html += `
      <h3 style="color: #00875f; font-size: 14px; border-bottom: 2px solid #00875f; padding-bottom: 6px; margin-top: 20px; margin-bottom: 12px; text-transform: uppercase;">
        Férias e Licenças
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12.5px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th style="border: 1px solid #cbd5e1; padding: 9px 10px; text-align: left; font-weight: 700; color: #334155;">Servidor</th>
            <th style="border: 1px solid #cbd5e1; padding: 9px 10px; text-align: left; font-weight: 700; color: #334155;">Lotação</th>
            <th style="border: 1px solid #cbd5e1; padding: 9px 10px; text-align: left; font-weight: 700; color: #334155;">Tipo</th>
            <th style="border: 1px solid #cbd5e1; padding: 9px 10px; text-align: center; font-weight: 700; color: #334155;">Data Saída</th>
            <th style="border: 1px solid #cbd5e1; padding: 9px 10px; text-align: center; font-weight: 700; color: #334155;">Data Retorno</th>
            <th style="border: 1px solid #cbd5e1; padding: 9px 10px; text-align: center; font-weight: 700; color: #334155;">Dias</th>
          </tr>
        </thead>
        <tbody>
    `;
    ferias.forEach(f => {
      const rowBg = f.ausenteHoje ? 'background-color: #f0fdf4;' : '';
      const tagAusente = f.ausenteHoje ? `<br><span style="display: inline-block; background-color: #d1fae5; color: #047857; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-top: 3px;">Ausente Hoje</span>` : '';
      html += `
        <tr style="${rowBg}">
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px;"><strong>${f.nome}</strong>${tagAusente}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px;">${f.lotacao}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px;">${f.tipo}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px; text-align: center;">${f.dataSaida}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px; text-align: center; font-weight: 600; color: #0f766e;">${f.dataRetorno}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px; text-align: center; font-weight: bold;">${f.dias}</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
  }
  
  // ABONADAS PRÓXIMAS
  if (abonos.length > 0) {
    html += `
      <h3 style="color: #0784b5; font-size: 14px; border-bottom: 2px solid #0784b5; padding-bottom: 6px; margin-top: 20px; margin-bottom: 12px; text-transform: uppercase;">
        Abonadas Próximas
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12.5px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th style="border: 1px solid #cbd5e1; padding: 9px 10px; text-align: left; font-weight: 700; color: #334155;">Servidor</th>
            <th style="border: 1px solid #cbd5e1; padding: 9px 10px; text-align: left; font-weight: 700; color: #334155;">Lotação</th>
            <th style="border: 1px solid #cbd5e1; padding: 9px 10px; text-align: left; font-weight: 700; color: #334155;">Tipo</th>
            <th style="border: 1px solid #cbd5e1; padding: 9px 10px; text-align: center; font-weight: 700; color: #334155;">Data Falta</th>
          </tr>
        </thead>
        <tbody>
    `;
    abonos.forEach(a => {
      const rowBg = a.ausenteHoje ? 'background-color: #e0f2fe;' : '';
      const tagAusente = a.ausenteHoje ? `<br><span style="display: inline-block; background-color: #bae6fd; color: #0369a1; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-top: 3px;">Falta Hoje</span>` : '';
      html += `
        <tr style="${rowBg}">
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px;"><strong>${a.nome}</strong>${tagAusente}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px;">${a.lotacao}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px;">${a.tipo}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px; text-align: center; font-weight: 600;">${a.dataFalta}</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
  }

  // FÉRIAS COMPULSÓRIAS (RISCO / PRÓXIMOS 6 MESES / VENCIDOS)
  if (compulsorias && compulsorias.length > 0) {
    html += `
      <h3 style="color: #d97706; font-size: 14px; border-bottom: 2px solid #d97706; padding-bottom: 6px; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase;">
        Risco de Férias Compulsórias (Próximos 6 meses / Vencidos)
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12.5px;">
        <thead>
          <tr style="background-color: #fef3c7;">
            <th style="border: 1px solid #fde68a; padding: 9px 10px; text-align: left; font-weight: 700; color: #92400e;">Servidor</th>
            <th style="border: 1px solid #fde68a; padding: 9px 10px; text-align: left; font-weight: 700; color: #92400e;">Lotação</th>
            <th style="border: 1px solid #fde68a; padding: 9px 10px; text-align: center; font-weight: 700; color: #92400e;">Saldo Atual</th>
            <th style="border: 1px solid #fde68a; padding: 9px 10px; text-align: center; font-weight: 700; color: #92400e;">Prazo p/ Solicitar</th>
            <th style="border: 1px solid #fde68a; padding: 9px 10px; text-align: center; font-weight: 700; color: #92400e;">Vencimento 3ª Férias</th>
          </tr>
        </thead>
        <tbody>
    `;
    compulsorias.forEach(c => {
      const rowBg = c.ehVencido ? 'background-color: #fef2f2;' : '';
      html += `
        <tr style="${rowBg}">
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px;"><strong>${c.nome}</strong></td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px;">${c.lotacao}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px; text-align: center; font-weight: bold;">${c.saldoHoje}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px; text-align: center; font-weight: bold; color: ${c.ehVencido ? '#dc2626' : '#d97706'}">${c.prazo}</td>
          <td style="border: 1px solid #e2e8f0; padding: 9px 10px; text-align: center; font-weight: 600; color: ${c.ehVencido ? '#dc2626' : '#334155'}">${c.limite}</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
  }
  
  html += `
        <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11.5px; color: #64748b; text-align: center;">
          Este e-mail é gerado automaticamente pelo sistema de RH - Central de Documentos SETUR v2.0.<br>
          Para configurar os destinatários ou intervalos, acesse o painel administrativo do sistema.
        </div>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: email,
    subject: "Alerta de Ausências Programadas e Férias Compulsórias - RH SETUR",
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
