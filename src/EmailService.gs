/**
 * RH Central de Documentos v2.0
 * Módulo de Notificações por E-mail (EmailService)
 */

/**
 * Envia e-mail diário com as ausências e férias dos próximos dias
 * Acionado por gatilho de tempo do Apps Script
 */
function verificarEEnviarEmailsDiarios() {
  const fuso = Session.getScriptTimeZone();
  const agora = new Date();
  const chaveHoje = Utilities.formatDate(agora, fuso, "yyyy-MM-dd");
  const propriedades = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log("Rotina diária de e-mail já está em execução.");
    return;
  }

  try {
    if (propriedades.getProperty("ULTIMO_EMAIL_DIARIO_RH") === chaveHoje) {
      Logger.log("Relatório diário já processado em " + chaveHoje + ". Envio duplicado ignorado.");
      return;
    }

    const processamento = String(propriedades.getProperty("EMAIL_DIARIO_EM_PROCESSAMENTO") || "").split("|");
    const iniciadoEm = Number(processamento[1]) || 0;
    if (processamento[0] === chaveHoje && agora.getTime() - iniciadoEm < 15 * 60 * 1000) {
      Logger.log("Outro gatilho já iniciou o relatório diário de hoje. Envio duplicado ignorado.");
      return;
    }
    propriedades.setProperty("EMAIL_DIARIO_EM_PROCESSAMENTO", chaveHoje + "|" + agora.getTime());
  } finally {
    lock.releaseLock();
  }

  try {
    const rotinaConcluida = executarRelatorioEmailDiario_();
    if (rotinaConcluida !== false) propriedades.setProperty("ULTIMO_EMAIL_DIARIO_RH", chaveHoje);
  } finally {
    propriedades.deleteProperty("EMAIL_DIARIO_EM_PROCESSAMENTO");
  }
}

function executarRelatorioEmailDiario_() {
  const ss = obterPlanilha_();
  const abaConfig = ss.getSheetByName("Configuracoes");
  const abaLanc = ss.getSheetByName("Lançamentos");
  
  if (!abaConfig || !abaLanc) {
    Logger.log("Aba de Configurações ou Lançamentos não encontrada para rotina de e-mail.");
    return false;
  }
  
  // 1. Obter parâmetros das configurações
  const config = obterMapaConfiguracoes_(abaConfig);
  let rawEmail = config["EMAIL_DESTINO"] || "turismo.setur@saosebastiao.sp.gov.br, turismo.eventos@saosebastiao.sp.gov.br";
  let emailsArray = rawEmail.split(/[;,]/).map(function(e) { return e.trim(); }).filter(Boolean);
  
  if (!emailsArray.some(function(e) { return e.toLowerCase() === "turismo.eventos@saosebastiao.sp.gov.br"; })) {
    emailsArray.push("turismo.eventos@saosebastiao.sp.gov.br");
  }
  emailsArray = emailsArray.filter(function(email, indice, lista) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      lista.findIndex(function(item) { return item.toLowerCase() === email.toLowerCase(); }) === indice;
  });
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
  let todosServidoresEmail = [];
  try {
    todosServidoresEmail = obterListaServidoresInterno_();
    todosServidoresEmail.forEach(function(s) {
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
    listaCompulsorias = todosServidoresEmail.filter(function(s) {
      return s.status !== "Inativo" && s.feriasCompulsorias === true;
    }).map(function(s) {
      let ehVencido = s.dataTerceiroPeriodo === "Já vencido" || (typeof s.diasParaTerceiroPeriodo === "number" && s.diasParaTerceiroPeriodo <= 0);
      return {
        nome: s.nome,
        matricula: s.matricula,
        lotacao: s.lotacao || "-",
        saldoHoje: (s.saldoHoje || 0) + " dias",
        limite: s.dataTerceiroPeriodo || "-",
        prazo: calcularPrazoSolicitacaoEmail_(s.dataTerceiroPeriodo, ehVencido),
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
    
    let tipoNormalizado = normalizarTextoEmail_(tipo);
    let ehAbono = tipoNormalizado.includes("abono") || tipoNormalizado.includes("abonada");
    let ehFeriasOuLicenca = tipoNormalizado.includes("ferias") || tipoNormalizado.includes("licenca");
    if (ausenteHoje || (diferencaDias >= 0 && diferencaDias <= diasAlertaFerias)) {
      if (ehFeriasOuLicenca) {
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
      if (ehAbono) {
        let retornoAbono = new Date(dataInicio.getTime());
        retornoAbono.setDate(retornoAbono.getDate() + 1);
        listaAbonosProximos.push({
          nome: nomeLimpo,
          matricula: matricula,
          lotacao: infoServ.lotacao,
          tipo: tipo,
          dataFaltaObj: dataInicio,
          dataFalta: formatarDataEmail_(dataInicio),
          dataRetorno: formatarDataEmail_(retornoAbono),
          dias: 1,
          ausenteHoje: ausenteHoje,
          idoc: idoc
        });
      }
    }
  }

  // Programações futuras primeiro; ausentes hoje ficam no fim de cada lista.
  listaFeriasProximas.sort(function(a, b) {
    if (a.ausenteHoje !== b.ausenteHoje) return a.ausenteHoje ? 1 : -1;
    return a.dataSaidaObj.getTime() - b.dataSaidaObj.getTime() ||
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
  });

  listaAbonosProximos.sort(function(a, b) {
    if (a.ausenteHoje !== b.ausenteHoje) return a.ausenteHoje ? 1 : -1;
    return a.dataFaltaObj.getTime() - b.dataFaltaObj.getTime() ||
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
  });
  
  // 4. Montar e enviar e-mail se houver novidades
  if (listaFeriasProximas.length > 0 || listaAbonosProximos.length > 0 || listaCompulsorias.length > 0) {
    enviarAlertaHtmlV2_(emailDestino, listaFeriasProximas, listaAbonosProximos, listaCompulsorias);
    lancarLog("ENVIAR_ALERTA", "Email", "Alerta diário enviado com sucesso para: " + emailDestino, "", "", "", "");
  } else {
    Logger.log("Nenhum alerta de férias, abonos ou compulsórias para enviar hoje.");
  }
  return true;
}

/**
 * Relatório diário dividido entre férias/licenças e abonadas.
 * Programações futuras vêm primeiro e ausentes hoje ficam destacados ao final.
 */
function enviarAlertaHtmlV2_(email, ferias, abonos, compulsorias) {
  const abonosFormatados = (abonos || []).map(function(item) {
    return {
      nome: item.nome,
      lotacao: item.lotacao,
      tipo: item.tipo,
      dataSaida: item.dataFalta,
      dataRetorno: item.dataRetorno,
      dias: item.dias || 1,
      ausenteHoje: item.ausenteHoje
    };
  });

  const esc = escaparHtmlEmail_;
  const borda = "border:1px solid #dbe4ee;padding:8px 9px;vertical-align:middle;box-sizing:border-box;";
  let html = `<div style="font-family:Arial,sans-serif;color:#243244;max-width:920px;margin:0 auto;border:1px solid #dbe4ee;border-radius:12px;overflow:hidden;background:#fff;">
    <div style="background:#087b59;color:#fff;padding:20px 24px;text-align:center;">
      <div style="font-size:20px;font-weight:700;">RH SETUR - Relatório Diário</div>
      <div style="font-size:12px;margin-top:4px;opacity:.9;">Ausências programadas e férias compulsórias</div>
    </div>
    <div style="padding:22px 24px;">
      <p style="margin:0 0 18px;color:#526174;font-size:13px;">As programações futuras aparecem primeiro. Servidores ausentes hoje ficam destacados no fim de cada lista.</p>`;

  html += renderizarTabelaAusenciasEmail_(
    "FÉRIAS E LICENÇAS",
    ferias || [],
    "#6353a3",
    "#f5f2ff",
    "Nenhum registro de férias ou licença para o período."
  );
  html += renderizarTabelaAusenciasEmail_(
    "ABONADAS",
    abonosFormatados,
    "#1677a6",
    "#eef8fd",
    "Nenhuma abonada para o período."
  );

  if (compulsorias && compulsorias.length) {
    html += `<div style="width:100%;margin:0 0 20px;box-sizing:border-box;"><h3 style="margin:0 0 10px;color:#b91c1c;font-size:14px;border-bottom:2px solid #dc2626;padding-bottom:6px;">FÉRIAS COMPULSÓRIAS - PRÓXIMOS 6 MESES</h3>
      <table cellpadding="0" cellspacing="0" style="width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px;margin:0;box-sizing:border-box;">
        <thead><tr style="background:#fff1f2;color:#991b1b;">
          <th style="${borda}width:29%;text-align:left;">Servidor</th>
          <th style="${borda}width:25%;text-align:left;">Lotação</th>
          <th style="${borda}width:13%;text-align:center;">Saldo Atual</th>
          <th style="${borda}width:16%;text-align:center;">Prazo para solicitar</th>
          <th style="${borda}width:17%;text-align:center;">Vencimento 3ª férias</th>
        </tr></thead><tbody>`;
    compulsorias.forEach(function(item) {
      const destaque = item.ehVencido ? "background:#fff1f2;" : "";
      const corNome = corRiscoFeriasEmail_(item.diasRestantes);
      html += `<tr style="${destaque}">
        <td style="${borda}font-weight:700;overflow-wrap:anywhere;color:${corNome};">${esc(item.nome)}</td>
        <td style="${borda}overflow-wrap:anywhere;">${esc(item.lotacao || "-")}</td>
        <td style="${borda}text-align:center;font-weight:700;">${esc(item.saldoHoje)}</td>
        <td style="${borda}text-align:center;font-weight:700;color:${item.ehVencido ? "#7f1d1d" : "#b91c1c"};">${esc(item.prazo)}</td>
        <td style="${borda}text-align:center;font-weight:700;">${esc(item.limite)}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  html += `<div style="margin-top:24px;border-top:1px solid #dbe4ee;padding-top:13px;text-align:center;color:#64748b;font-size:10.5px;">
      <div style="height:24px;display:flex;justify-content:center;align-items:center;opacity:.20;color:#6366f1;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/>
        </svg>
      </div>
      Relatório automático do RH - Central de Documentos SETUR.<br>Destinatários e intervalos podem ser alterados no painel administrativo.
    </div></div></div>`;

  const copia = "turismo.eventos@saosebastiao.sp.gov.br";
  const destinatarios = String(email || "").split(/[;,]/).map(function(item) { return item.trim(); }).filter(Boolean);
  const principais = destinatarios.filter(function(item) { return item.toLowerCase() !== copia; });
  const mensagem = {
    to: principais.length ? principais.join(", ") : copia,
    subject: "Alerta de Ausências Programadas e Férias Compulsórias - RH SETUR",
    htmlBody: html
  };
  if (principais.length) mensagem.cc = copia;
  MailApp.sendEmail(mensagem);
}

/** Monta os três blocos operacionais com exatamente a mesma largura e colunas. */
function renderizarTabelaAusenciasEmail_(titulo, itens, cor, fundoCabecalho, mensagemVazia) {
  const esc = escaparHtmlEmail_;
  const borda = "border:1px solid #dbe4ee;padding:8px 9px;vertical-align:middle;box-sizing:border-box;";
  let html = `<div style="width:100%;margin:0 0 24px;box-sizing:border-box;">
    <h3 style="margin:0 0 10px;color:${cor};font-size:14px;border-bottom:2px solid ${cor};padding-bottom:6px;">${esc(titulo)}</h3>`;

  if (!itens || !itens.length) {
    return html + `<div style="width:100%;box-sizing:border-box;border:1px solid #dbe4ee;background:#f8fafc;color:#64748b;padding:11px 12px;font-size:11px;">${esc(mensagemVazia)}</div></div>`;
  }

  html += `<table cellpadding="0" cellspacing="0" style="width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px;margin:0;box-sizing:border-box;">
    <thead><tr style="background:${fundoCabecalho};color:#334155;">
      <th style="${borda}width:27%;text-align:left;">Servidor</th>
      <th style="${borda}width:19%;text-align:left;">Lotação</th>
      <th style="${borda}width:17%;text-align:left;">Tipo</th>
      <th style="${borda}width:14%;text-align:center;">Data de Saída</th>
      <th style="${borda}width:14%;text-align:center;">Data de Retorno</th>
      <th style="${borda}width:9%;text-align:center;">Dias</th>
    </tr></thead><tbody>`;

  itens.forEach(function(item) {
    const destaqueHoje = item.ausenteHoje ? "background:#edfdf6;" : "";
    const etiquetaHoje = item.ausenteHoje
      ? `<div style="margin-top:3px;color:#087b59;font-size:9px;font-weight:700;">AUSENTE HOJE</div>`
      : "";
    html += `<tr style="${destaqueHoje}">
      <td style="${borda}font-weight:700;overflow-wrap:anywhere;">${esc(item.nome)}${etiquetaHoje}</td>
      <td style="${borda}overflow-wrap:anywhere;">${esc(item.lotacao || "-")}</td>
      <td style="${borda}overflow-wrap:anywhere;">${esc(item.tipo)}</td>
      <td style="${borda}text-align:center;white-space:nowrap;">${esc(item.dataSaida)}</td>
      <td style="${borda}text-align:center;white-space:nowrap;color:${cor};font-weight:700;">${esc(item.dataRetorno)}</td>
      <td style="${borda}text-align:center;font-weight:700;">${esc(item.dias)}</td>
    </tr>`;
  });

  return html + `</tbody></table></div>`;
}

function normalizarTextoEmail_(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Escala contínua: quanto menor o prazo, mais escuro e intenso fica o vermelho. */
function corRiscoFeriasEmail_(diasRestantes) {
  let dias = Number(diasRestantes);
  if (!isFinite(dias)) dias = 180;
  dias = Math.max(0, Math.min(180, dias));
  const proximidade = 1 - (dias / 180);
  const inicio = [239, 106, 106];
  const fim = [127, 29, 29];
  const rgb = inicio.map(function(cor, indice) {
    return Math.round(cor + (fim[indice] - cor) * proximidade);
  });
  return "rgb(" + rgb.join(",") + ")";
}

/**
 * Envia o e-mail formatado com colunas e ordenação otimizadas
 */
/** @deprecated Mantido apenas como referência histórica; a rotina usa enviarAlertaHtmlV2_. */
function enviarAlertaHtmlLegado_(email, ferias, abonos, compulsorias) {
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

function calcularPrazoSolicitacaoEmail_(dataTerceiroPeriodo, ehVencido) {
  if (ehVencido || dataTerceiroPeriodo === "Já vencido") return "Imediato";
  const dataTerceiro = lerDataFormatoBR_(dataTerceiroPeriodo);
  if (!dataTerceiro) return "Revisar cadastro";
  const prazo = new Date(dataTerceiro.getTime());
  prazo.setDate(prazo.getDate() - 30);
  return formatarDataEmail_(prazo);
}

function escaparHtmlEmail_(valor) {
  return String(valor == null ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
