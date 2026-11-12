/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio dos Protocolos (ProtocolosService)
 */

/**
 * Retorna a lista de todos os protocolos cadastrados.
 * Otimização O(L+P): lê Lançamentos uma única vez e agrupa por ID_Protocolo.
 */
function obterListaProtocolos() {
  const usuarioAtual = (function() {
    try { return obterDadosUsuarioLogado(); } catch(e) { return null; }
  })();

  const ss = obterPlanilha_();
  const aba = ss.getSheetByName("Protocolos");
  if (!aba) return [];

  const dados = obterValoresAba_(aba);
  if (dados.length <= 1) return [];

  // Mapeia e-mails para nomes cadastrados a partir da aba Usuarios
  const mapaUsuarios = (function() {
    try {
      const abaU = ss.getSheetByName("Usuarios");
      if (!abaU) return {};
      const dU = obterValoresAba_(abaU);
      const m = {};
      for (let u = 1; u < dU.length; u++) {
        const em = String(dU[u][0] || "").toLowerCase().trim();
        const nm = String(dU[u][1] || "").trim();
        if (em && nm) m[em] = nm;
      }
      return m;
    } catch(e) { return {}; }
  })();

  // Constrói mapa de contagem em única leitura da aba Lançamentos
  const mapaContagem = contarLancamentosPorProtocolo_(ss);
  const cabecalho = dados[0];
  const idxId = indiceCabecalho_(cabecalho, ["ID", "ID PROTOCOLO", "PROTOCOLO"]);
  const idxData = indiceCabecalho_(cabecalho, ["DATA GERACAO", "DATA", "TIMESTAMP"]);
  const idxStatus = indiceCabecalho_(cabecalho, ["STATUS", "STATUS DE ENVIO"]);
  const idxLink = indiceCabecalho_(cabecalho, ["LINK DIRETO", "LINK", "ARQUIVO", "PDF"]);
  const idxCriadoPor = indiceCabecalho_(cabecalho, ["CRIADO POR", "EMITIDO POR", "USUARIO"]);

  let protocolos = [];

  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    let id = String(linha[idxId !== -1 ? idxId : 0]).trim();
    if (!id) continue;

    let criadorBruto = idxCriadoPor !== -1 && linha[idxCriadoPor] ? String(linha[idxCriadoPor]).trim() : "";
    let criadorFinal = "Sistema";
    if (criadorBruto) {
      const criadorLower = criadorBruto.toLowerCase();
      if (mapaUsuarios[criadorLower]) {
        criadorFinal = mapaUsuarios[criadorLower];
      } else if (criadorBruto !== "Sistema") {
        criadorFinal = criadorBruto;
      }
    }
    // Fallback: se o criador gravado na planilha for vazio ou "Sistema", resolve para o nome do usuário ativo
    if ((!criadorFinal || criadorFinal === "Sistema") && usuarioAtual && usuarioAtual.nome) {
      criadorFinal = usuarioAtual.nome;
    }

    protocolos.push({
      id: id,
      dataGeracao: idxData !== -1 ? formatarDataProtocolo_(linha[idxData]) : "",
      status: idxStatus !== -1 ? String(linha[idxStatus]).trim() : "",
      linkDireto: idxLink !== -1 ? String(linha[idxLink]).trim() : "",
      qtdDocumentos: mapaContagem[id] || 0,
      criadoPor: criadorFinal,
      linhaPlanilha: i + 1
    });
  }

  return protocolos.reverse();
}

/**
 * Cria um novo protocolo agrupando múltiplos lançamentos (thread-safe, sequencial atômico e lote).
 * @param {Array} linhasLancamentos - números de linha dos lançamentos a vincular
 */
function criarProtocolo(linhasLancamentos) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para criar protocolos.");
  }

  if (!linhasLancamentos || linhasLancamentos.length === 0) {
    throw new Error("Selecione pelo menos um lançamento para criar o protocolo.");
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error("Sistema ocupado gerando outro protocolo. Tente novamente.");
  }

  try {
    const ss = obterPlanilha_();
    const abaProt = ss.getSheetByName("Protocolos");
    const abaLanc = ss.getSheetByName("Lançamentos");

    if (!abaProt || !abaLanc) {
      throw new Error("Aba 'Protocolos' ou 'Lançamentos' não encontrada.");
    }

    // 1. Geração de ID Sequencial Atômico (SETUR-YYYY-XXXXXX)
    const props = PropertiesService.getScriptProperties();
    const anoAtual = new Date().getFullYear();
    const chaveProps = "ULTIMO_NUMERO_PROTOCOLO_" + anoAtual;

    let ultimoNumero = parseInt(props.getProperty(chaveProps)) || 0;
    const padraoAno = new RegExp('^SETUR-' + anoAtual + '-(\\d{6})$');
    const considerarId = function(valor) { const match = String(valor || '').trim().match(padraoAno); if (match) ultimoNumero = Math.max(ultimoNumero, parseInt(match[1], 10) || 0); };
    if (abaProt.getLastRow() > 1) abaProt.getRange(2, 1, abaProt.getLastRow() - 1, 1).getDisplayValues().forEach(function(linha) { considerarId(linha[0]); });
    const cabLancAtual = abaLanc.getRange(1, 1, 1, abaLanc.getLastColumn()).getValues()[0];
    const idxProtLancAtual = indiceCabecalho_(cabLancAtual, ["ID_PROTOCOLO", "ID PROTOCOLO"]);
    if (idxProtLancAtual !== -1 && abaLanc.getLastRow() > 1) abaLanc.getRange(2, idxProtLancAtual + 1, abaLanc.getLastRow() - 1, 1).getDisplayValues().forEach(function(linha) { considerarId(linha[0]); });
    let novoNumero = ultimoNumero + 1;
    props.setProperty(chaveProps, String(novoNumero));

    const numeroFormatado = "000000" + novoNumero;
    const idProtocolo = "SETUR-" + anoAtual + "-" + numeroFormatado.substring(numeroFormatado.length - 6);

    const dataGeracao = new Date();
    const statusInicial = "Aguardando Assinatura";
    let emitenteNome = "";
    try {
      const usuarioLogado = (typeof obterDadosUsuarioLogado === "function") ? obterDadosUsuarioLogado() : null;
      if (usuarioLogado) {
        emitenteNome = String(usuarioLogado.nome || usuarioLogado.email || "").trim();
      }
    } catch (eAuth) {}
    if (!emitenteNome) {
      const emailSessao = Session.getActiveUser().getEmail().toLowerCase().trim();
      emitenteNome = emailSessao || "Sistema";
    }

    // 2. Mapeamento de colunas da aba Lançamentos
    const dadosLanc = abaLanc.getDataRange().getValues();
    const cabecalhoLanc = dadosLanc[0];
    let colIdxIDProt = cabecalhoLanc.indexOf("ID_Protocolo");
    if (colIdxIDProt === -1) {
      colIdxIDProt = cabecalhoLanc.indexOf("ID PROTOCOLO");
    }

    if (colIdxIDProt === -1) {
      throw new Error("Erro de infraestrutura: Coluna 'ID_Protocolo' ou 'ID PROTOCOLO' não encontrada na aba Lançamentos.");
    }

    // 3. Escrita em lote: acumula pares [linha, valor] e grava tudo de uma vez
    const linhasValidas = linhasLancamentos
      .map(l => parseInt(l))
      .filter(l => l > 1 && l <= abaLanc.getLastRow());
    const indicesLanc = obterIndicesColunasLancamentos_(cabecalhoLanc);
    if (linhasValidas.some(function(linha) { return ehLancamentoAnulado_(dadosLanc[linha - 1], indicesLanc); })) throw new Error('Há lançamento cancelado na seleção. Atualize a lista antes de criar o protocolo.');

    const jaVinculadas = linhasValidas.filter(function(linha) {
      return String(dadosLanc[linha - 1][colIdxIDProt] || '').trim() !== '';
    });
    if (jaVinculadas.length) throw new Error('Um ou mais documentos selecionados já pertencem a outro protocolo. Atualize a lista e tente novamente.');

    // Usa setValues em ranges individuais agrupados - mais eficiente que setValue em loop
    linhasValidas.forEach(linha => {
      abaLanc.getRange(linha, colIdxIDProt + 1).setValue(idProtocolo);
    });

    // 4. Gravar o novo protocolo
    abaProt.appendRow([
      idProtocolo,
      dataGeracao,
      statusInicial,
      "",
      emitenteNome
    ]);

    // 5. Log sem lock (lock já está ativo)
    lancarLogSemLock_("CRIAR_PROTOCOLO", "Protocolos",
      "Criou protocolo local " + idProtocolo + " vinculando " + linhasValidas.length + " lançamentos.",
      "", "", "", idProtocolo);

    return idProtocolo;
  } finally {
    lock.releaseLock();
  }
}

/** Retorna os itens atuais e disponíveis para corrigir uma folha de protocolo. */
function obterDadosEdicaoProtocolo(idProtocolo, linhaProtocolo) {
  obterDadosUsuarioLogado();
  const atuais = obterLancamentosVinculados(idProtocolo);
  const pendentes = obterLancamentosPendentesProtocolo();
  return {
    id: String(idProtocolo || ''),
    linhaProtocolo: Number(linhaProtocolo) || 0,
    itens: atuais.map(function(item) { item.selecionado = true; return item; })
      .concat(pendentes.map(function(item) { item.selecionado = false; return item; }))
  };
}

/**
 * Corrige os documentos de uma folha. Se o ID estiver duplicado, separa a
 * linha editada com o próximo número livre, preservando a folha antiga.
 */
function salvarEdicaoProtocolo(idProtocolo, linhaProtocolo, linhasSelecionadas) {
  if (!verificarSeEhOperador()) throw new Error('Você não possui permissão para editar protocolos.');
  const idOriginal = String(idProtocolo || '').trim();
  const linhaProt = Number(linhaProtocolo);
  const selecionadas = Array.from(new Set((linhasSelecionadas || []).map(Number).filter(function(v) { return Number.isInteger(v) && v > 1; })));
  if (!idOriginal || !linhaProt || !selecionadas.length) throw new Error('Mantenha ao menos um documento na folha de protocolo.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = obterPlanilha_();
    const abaProt = ss.getSheetByName('Protocolos');
    const abaLanc = ss.getSheetByName('Lançamentos');
    if (!abaProt || !abaLanc || linhaProt > abaProt.getLastRow()) throw new Error('Protocolo não localizado.');
    if (String(abaProt.getRange(linhaProt, 1).getDisplayValue()).trim() !== idOriginal) throw new Error('A folha mudou desde que foi aberta. Atualize a página e tente novamente.');

    const dadosLanc = abaLanc.getDataRange().getValues();
    const idxProt = indiceCabecalho_(dadosLanc[0], ['ID_PROTOCOLO', 'ID PROTOCOLO']);
    if (idxProt === -1) throw new Error("Coluna 'ID_Protocolo' não encontrada.");
    const conjunto = {};
    selecionadas.forEach(function(linha) {
      if (linha > abaLanc.getLastRow()) throw new Error('Um documento selecionado não existe mais.');
      const vinculo = String(dadosLanc[linha - 1][idxProt] || '').trim();
      if (vinculo && vinculo !== idOriginal) throw new Error('Um documento selecionado passou a pertencer a outra folha. Atualize e tente novamente.');
      conjunto[linha] = true;
    });

    const idsProt = abaProt.getLastRow() > 1
      ? abaProt.getRange(2, 1, abaProt.getLastRow() - 1, 1).getDisplayValues().map(function(l) { return String(l[0] || '').trim(); })
      : [];
    const duplicado = idsProt.filter(function(id) { return id === idOriginal; }).length > 1;
    let idFinal = idOriginal;
    if (duplicado) {
      const ano = (idOriginal.match(/^SETUR-(\d{4})-/) || [])[1] || String(new Date().getFullYear());
      let maior = 0;
      const padrao = new RegExp('^SETUR-' + ano + '-(\\d{6})$');
      idsProt.forEach(function(id) { const m = id.match(padrao); if (m) maior = Math.max(maior, Number(m[1]) || 0); });
      dadosLanc.slice(1).forEach(function(l) { const m = String(l[idxProt] || '').trim().match(padrao); if (m) maior = Math.max(maior, Number(m[1]) || 0); });
      idFinal = 'SETUR-' + ano + '-' + String(maior + 1).padStart(6, '0');
      abaProt.getRange(linhaProt, 1).setValue(idFinal);
    }

    const alteracoes = [];
    for (let i = 1; i < dadosLanc.length; i++) {
      const linha = i + 1;
      const atual = String(dadosLanc[i][idxProt] || '').trim();
      if (conjunto[linha]) alteracoes.push({ linha: linha, valor: idFinal });
      else if (!duplicado && atual === idOriginal) alteracoes.push({ linha: linha, valor: '' });
    }
    alteracoes.forEach(function(item) { abaLanc.getRange(item.linha, idxProt + 1).setValue(item.valor); });
    lancarLogSemLock_('EDITAR_PROTOCOLO', 'Protocolos', 'Corrigiu os documentos da folha ' + idOriginal + (idFinal !== idOriginal ? ' e separou-a como ' + idFinal : '') + '.', '', idOriginal, idFinal, idFinal);
    return { sucesso: true, idOriginal: idOriginal, idProtocolo: idFinal, separado: duplicado, quantidade: selecionadas.length };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza o status de tramitação de um protocolo
 */
function atualizarStatusProtocolo(idProtocolo, novoStatus) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para alterar o status de protocolos.");
  }

  const ss = obterPlanilha_();
  const aba = ss.getSheetByName("Protocolos");
  if (!aba) throw new Error("Aba 'Protocolos' não encontrada.");

  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() === String(idProtocolo).trim()) {
      const linhaPlanilha = i + 1;
      const statusAnterior = dados[i][2];

      aba.getRange(linhaPlanilha, 3).setValue(novoStatus);

      lancarLog("STATUS_PROTOCOLO", "Protocolos",
        "Alterou status do protocolo " + idProtocolo + " de '" + statusAnterior + "' para '" + novoStatus + "'",
        "Status", statusAnterior, novoStatus, idProtocolo);
      return true;
    }
  }

  throw new Error("Protocolo " + idProtocolo + " não encontrado.");
}

/**
 * Retorna todos os lançamentos vinculados a um protocolo específico
 */
function obterLancamentosVinculados(idProtocolo) {
  obterDadosUsuarioLogado();
  const ss = obterPlanilha_();
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (!abaLanc) return [];

  const dados = abaLanc.getDataRange().getValues();
  if (dados.length <= 1) return [];

  const cabecalho = dados[0];
  const idx = obterIndicesColunasLancamentos_(cabecalho);
  const colIdxLinkProt = indiceCabecalho_(cabecalho, ["LINK PROTOCOLO", "LINK PROTOCOLO"]);

  let vinculados = [];

  for (let i = 1; i < dados.length; i++) {
    if (ehLancamentoAnulado_(dados[i], idx)) continue;
    let idProtLanc = idx.idProtocolo !== -1 ? String(dados[i][idx.idProtocolo]).trim() : "";
    if (!idProtLanc && colIdxLinkProt !== -1) {
      idProtLanc = String(dados[i][colIdxLinkProt]).trim();
    }

    if (idProtLanc === String(idProtocolo).trim()) {
      let nomeBruto = idx.nome !== -1 ? String(dados[i][idx.nome]).trim() : "";
      let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;

      let despacho = idx.despacho !== -1 ? String(dados[i][idx.despacho]).trim() : "";
      let observacao = idx.observacao !== -1 ? String(dados[i][idx.observacao]).trim() : "";
      let tipo = idx.tipo !== -1 ? String(dados[i][idx.tipo]).trim() : "";
      let diasL = obterDiasLancamento_(dados[i], idx);
      let diasPecuniaL = obterDiasPecuniaLancamento_(dados[i], idx);
      
      let retornoStr = "";
      if (normalizarCabecalho_(tipo).includes("FERIAS") && diasL > 0 && idx.dataInicio !== -1) {
        let dataInicioObj = lerDataFormatoBR_(String(dados[i][idx.dataInicio]));
        if (!dataInicioObj && dados[i][idx.dataInicio] instanceof Date) dataInicioObj = dados[i][idx.dataInicio];
        if (dataInicioObj && !isNaN(dataInicioObj.getTime())) {
          let dataRetornoObj = new Date(dataInicioObj.getTime());
          dataRetornoObj.setDate(dataRetornoObj.getDate() + diasL);
          retornoStr = Utilities.formatDate(dataRetornoObj, Session.getScriptTimeZone(), "dd/MM/yyyy");
        }
      }

      vinculados.push({
        idoc: idx.idoc !== -1 ? String(dados[i][idx.idoc]).trim() : "",
        tipo: tipo,
        nome: nomeLimpo,
        matricula: idx.matricula !== -1 ? String(dados[i][idx.matricula]).trim() : "",
        dataInicio: idx.dataInicio !== -1 ? formatarDataApenas_(dados[i][idx.dataInicio]) : "",
        retorno: retornoStr,
        dias: diasL,
        diasPecunia: diasPecuniaL,
        diasDebitados: diasL + diasPecuniaL,
        qtdHoras: idx.qtdHoras !== -1 ? String(dados[i][idx.qtdHoras]).trim() : "",
        despacho: despacho,
        observacao: observacao,
        idProtocolo: idProtLanc,
        linhaPlanilha: i + 1
      });
    }
  }

  return vinculados;
}

/**
 * Retorna os lançamentos pendentes de protocolo (sem ID_Protocolo)
 */
function obterLancamentosPendentesProtocolo() {
  obterDadosUsuarioLogado();
  const ss = obterPlanilha_();
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (!abaLanc) return [];

  const dados = abaLanc.getDataRange().getValues();
  if (dados.length <= 1) return [];

  const cabecalho = dados[0];
  const idx = obterIndicesColunasLancamentos_(cabecalho);

  let pendentes = [];

  for (let i = 1; i < dados.length; i++) {
    let idProtLanc = idx.idProtocolo !== -1 ? String(dados[i][idx.idProtocolo]).trim() : "";
    let tipo = idx.tipo !== -1 ? String(dados[i][idx.tipo]).trim() : "";
    if (!tipo) continue;

    if (idProtLanc) continue;
    let idoc = idx.idoc !== -1 ? String(dados[i][idx.idoc]).trim() : "";
    if (idoc) continue;
    if (ehLancamentoAnulado_(dados[i], idx)) continue;

    let nomeBruto = idx.nome !== -1 ? String(dados[i][idx.nome]).trim() : "";
    let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;

    pendentes.push({
      idoc: idx.idoc !== -1 ? String(dados[i][idx.idoc]).trim() : "",
      tipo: tipo,
      nome: nomeLimpo,
      matricula: idx.matricula !== -1 ? String(dados[i][idx.matricula]).trim() : "",
      dataInicio: idx.dataInicio !== -1 ? formatarDataApenas_(dados[i][idx.dataInicio]) : "",
      dias: obterDiasLancamento_(dados[i], idx),
      diasPecunia: obterDiasPecuniaLancamento_(dados[i], idx),
      qtdHoras: idx.qtdHoras !== -1 ? String(dados[i][idx.qtdHoras]).trim() : "",
      linhaPlanilha: i + 1
    });
  }

  return pendentes;
}

/** Escapa caracteres especiais HTML para impressão segura da folha de protocolo. */
function escapeHtmlProtocolo_(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Identifica ausências simultâneas na mesma lotação envolvendo itens do protocolo.
 */
function obterAlertasAusenciaLotacaoProtocolo_(ss, lancamentosProtocolo) {
  const lista = Array.isArray(lancamentosProtocolo) ? lancamentosProtocolo : [];
  if (!lista.length || typeof coletarContextoAusenciasLotacao_ !== 'function') return [];

  const contexto = coletarContextoAusenciasLotacao_(ss);
  const vistos = new Set();
  const alertas = [];

  lista.forEach(function(item) {
    if (Number(item.diasPecunia || 0) > 0 && Number(item.dias || 0) <= 0) return;
    const candidato = criarIntervaloAusenciaLancamento_({
      matricula: item.matricula,
      nome: item.nome,
      tipo: item.tipo,
      dataInicio: item.dataInicio,
      dias: item.dias,
      status: 'Ativo',
      linhaPlanilha: item.linhaPlanilha
    });
    if (!candidato) return;
    const resultado = encontrarAusenciasLotacaoParaIntervalo_(candidato, contexto);
    if (!resultado.temAlerta) return;

    const linhaItem = Number(item.linhaPlanilha || 0);
    resultado.ausentes.forEach(function(colega) {
      const linhaColega = Number(colega.linhaPlanilha || 0);
      const idA = linhaItem ? 'L' + linhaItem : candidato.matricula + '|' + resultado.periodoNovo;
      const idB = linhaColega ? 'L' + linhaColega : normalizarChaveMatricula_(colega.matricula) + '|' + colega.periodo;
      const chave = [idA, idB].sort().join('<>') + '|' + colega.sobreposicao;
      if (vistos.has(chave)) return;
      vistos.add(chave);
      alertas.push({
        lotacao: resultado.lotacao,
        servidorNome: String(item.nome || candidato.nome || '').trim(),
        servidorTipo: String(item.tipo || '').trim(),
        servidorPeriodo: resultado.periodoNovo,
        colegaNome: colega.nome,
        colegaTipo: colega.tipo,
        colegaPeriodo: colega.periodo,
        sobreposicao: colega.sobreposicao
      });
    });
  });

  return alertas;
}

/**
 * Gera o conteúdo HTML formatado para impressão da Folha de Protocolo
 */
function obterHtmlFolhaProtocolo(idProtocolo) {
  obterDadosUsuarioLogado();

  const ss = obterPlanilha_();
  const abaProt = ss.getSheetByName("Protocolos");
  if (!abaProt) throw new Error("Aba 'Protocolos' não encontrada.");

  let protocoloInfo = null;
  const dadosProt = abaProt.getDataRange().getValues();
  for (let i = 1; i < dadosProt.length; i++) {
    if (String(dadosProt[i][0]).trim() === idProtocolo) {
      let emitenteFolha = dadosProt[i][4] ? String(dadosProt[i][4]).trim() : "";
      if (!emitenteFolha || emitenteFolha === "Sistema") {
        try {
          const uLog = (typeof obterDadosUsuarioLogado === "function") ? obterDadosUsuarioLogado() : null;
          if (uLog && uLog.nome) emitenteFolha = uLog.nome;
        } catch(e) {}
      }
      protocoloInfo = {
        id: idProtocolo,
        data: formatarDataProtocolo_(dadosProt[i][1]),
        status: String(dadosProt[i][2]).trim(),
        criadoPor: emitenteFolha || "Sistema"
      };
      break;
    }
  }

  if (!protocoloInfo) throw new Error("Protocolo não encontrado.");

  const lancamentos = obterLancamentosVinculados(idProtocolo);
  const alertasLotacao = obterAlertasAusenciaLotacaoProtocolo_(ss, lancamentos);

  let html = `
    <div style="font-family: Arial, sans-serif; color: #000; padding: 10px 22px; line-height: 1.35; background-color: #fff; width: 100%; box-sizing: border-box;">
      
      <!-- Detalhes do Protocolo -->
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid #000; padding-bottom: 6px; margin-bottom: 8px; gap: 12px;">
          <div>
            <span style="font-size: 14px; text-transform: uppercase; color: #111; font-weight: 700;">Folha de Protocolo Local - No ${escapeHtmlProtocolo_(protocoloInfo.id)}</span>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-size: 11.5px;"><strong>Data de Entrega dos documentos:</strong> ${escapeHtmlProtocolo_(protocoloInfo.data)}</p>
          </div>
        </div>
        <p style="font-size: 11.5px; line-height: 1.35; color: #222; margin: 0;">Declaramos que as solicitações físicas entregues ao recursos humanos listadas abaixo foram repassadas anexa a este docuemento para ciência da respectiva chefia.</p>
      </div>
  `;

  // Agrupar por tipo
  let porTipo = {};
  lancamentos.forEach(l => {
    let tipo = l.tipo || "Outros";
    if (!porTipo[tipo]) porTipo[tipo] = [];
    porTipo[tipo].push(l);
  });

  for (let tipo in porTipo) {
    let headerPeriodo = "Data / Período";
    if (tipo.toUpperCase().includes("FÉRIAS") || tipo.toUpperCase().includes("FERIAS")) {
      headerPeriodo = "Início / Retorno";
    } else if (tipo.toUpperCase().includes("ABONO") || tipo.toUpperCase().includes("ABONADA")) {
      headerPeriodo = "Falta";
    }

    html += `
      <div style="margin-bottom: 14px;">
        <h3 style="margin: 0 0 5px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #000; border-bottom: 1px dashed #bbb; padding-bottom: 2px; page-break-after: avoid; break-after: avoid;">${escapeHtmlProtocolo_(tipo)}</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; line-height: 1.3;">
          <thead>
            <tr style="background-color: #f4f4f4;">
              <th style="border: 1px solid #222; padding: 4px 6px; text-align: left; font-weight: 700; width: 30%;">Servidor (Matrícula)</th>
              <th style="border: 1px solid #222; padding: 4px 6px; text-align: center; font-weight: 700; width: 16%;">${headerPeriodo}</th>
              <th style="border: 1px solid #222; padding: 4px 6px; text-align: center; font-weight: 700; width: 13%;">Qtd / Dias</th>
              <th style="border: 1px solid #222; padding: 4px 6px; text-align: left; font-weight: 700; width: 41%;">Info Adicional (Despacho / Obs)</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (tipo.toUpperCase().includes("ABONO") || tipo.toUpperCase().includes("ABONADA")) {
      ajustarDespachosAbonadasDuplicadasProtocolo_(porTipo[tipo]);
    }

    porTipo[tipo].forEach(l => {
      let infoAdicional = "";
      if (l.despacho) infoAdicional += `<strong>Despacho:</strong> ${escapeHtmlProtocolo_(l.despacho)}<br>`;
      if (l.observacao) infoAdicional += `<strong>Obs:</strong> ${escapeHtmlProtocolo_(l.observacao)}`;
      
      let retornoHtml = "";
      if (l.retorno) retornoHtml = ` - ${escapeHtmlProtocolo_(l.retorno)}`;
      
      html += `
        <tr>
          <td style="border: 1px solid #222; padding: 4px 6px;"><strong>${escapeHtmlProtocolo_(l.nome)}</strong><br><span style="color:#444; font-size:9.5px;">${escapeHtmlProtocolo_(l.matricula)}</span></td>
          <td style="border: 1px solid #222; padding: 4px 6px; text-align: center;">${escapeHtmlProtocolo_(l.dataInicio)}${retornoHtml}</td>
          <td style="border: 1px solid #222; padding: 4px 6px; text-align: center;">${l.diasPecunia > 0 ? l.dias + ' gozo + ' + l.diasPecunia + ' pecúnia' : (l.dias > 0 ? l.dias + ' d' : (escapeHtmlProtocolo_(l.qtdHoras) || '-'))}</td>
          <td style="border: 1px solid #222; padding: 4px 6px;">${infoAdicional || '-'}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
  }

  if (alertasLotacao.length) {
    html += `
      <div style="margin-top: 10px; padding: 7px 10px; border: 1px solid #888; border-left: 3px solid #111; background-color: #f7f7f7; font-size: 9.5px; line-height: 1.35; color: #111; break-inside: avoid; page-break-inside: avoid;">
        <div style="font-weight: 700; text-transform: uppercase; letter-spacing: 0.2px; margin-bottom: 3px;">Alertas de ausência simultânea na mesma lotação (${alertasLotacao.length})</div>
        <ul style="margin: 0; padding-left: 14px;">
          ${alertasLotacao.map(function(alerta) {
            return `<li style="margin-bottom: 2px;"><strong>${escapeHtmlProtocolo_(alerta.lotacao)}:</strong> ${escapeHtmlProtocolo_(alerta.servidorNome)} (${escapeHtmlProtocolo_(alerta.servidorTipo)} · ${escapeHtmlProtocolo_(alerta.servidorPeriodo)}) coincide com ${escapeHtmlProtocolo_(alerta.colegaNome)} (${escapeHtmlProtocolo_(alerta.colegaTipo)} · ${escapeHtmlProtocolo_(alerta.colegaPeriodo)}) — período em comum: <strong>${escapeHtmlProtocolo_(alerta.sobreposicao)}</strong>.</li>`;
          }).join('')}
        </ul>
      </div>
    `;
  }

  html += `
    </div>
  `;

  return html;
}

// --- AUXILIARES PRIVADOS ---

/**
 * Constrói mapa { idProtocolo -> count } lendo Lançamentos uma única vez. O(L). Privada.
 */
function contarLancamentosPorProtocolo_(ss) {
  const abaLanc = ss.getSheetByName("Lancamentos") || ss.getSheetByName("Lançamentos");
  if (!abaLanc) return {};

  const dados = obterValoresAba_(abaLanc);
  if (dados.length <= 1) return {};

  const cabecalho = dados[0];
  // Lê tanto ID_Protocolo quanto Link_Protocolo (dados migrados usam Link_Protocolo como ID)
  const idxLanc = obterIndicesColunasLancamentos_(cabecalho);
  const colIdxIDProt  = indiceCabecalho_(cabecalho, ["ID_PROTOCOLO", "ID PROTOCOLO"]);
  const colIdxLinkProt = indiceCabecalho_(cabecalho, ["LINK PROTOCOLO", "LINK PROTOCOLO"]);

  if (colIdxIDProt === -1 && colIdxLinkProt === -1) return {};

  let mapa = {};
  for (let i = 1; i < dados.length; i++) {
    if (ehLancamentoAnulado_(dados[i], idxLanc)) continue;
    let id = "";
    if (colIdxIDProt !== -1) id = String(dados[i][colIdxIDProt]).trim();
    if (!id && colIdxLinkProt !== -1) id = String(dados[i][colIdxLinkProt]).trim();
    // Ignora valores vazios ou "null"
    if (!id || id === "null" || id === "undefined") continue;
    mapa[id] = (mapa[id] || 0) + 1;
  }
  return mapa;
}

function formatarDataProtocolo_(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  }
  return String(data);
}

function formatarDataApenas_(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  
  if (typeof data === "string" && data.includes("T")) {
    let d = new Date(data);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  
  return String(data);
}

/**
 * Ajusta despachos de abonadas duplicadas para o mesmo servidor no mesmo protocolo,
 * garantindo ordenação e sequência corretas (ex.: 3ª abonada -> 4ª abonada).
 */
function ajustarDespachosAbonadasDuplicadasProtocolo_(listaLancamentos) {
  if (!Array.isArray(listaLancamentos) || listaLancamentos.length <= 1) return;
  const mapaPorServidor = {};
  listaLancamentos.forEach(function(l) {
    const mat = String(l.matricula || '').trim();
    if (!mapaPorServidor[mat]) mapaPorServidor[mat] = [];
    mapaPorServidor[mat].push(l);
  });

  Object.keys(mapaPorServidor).forEach(function(mat) {
    const itens = mapaPorServidor[mat];
    if (itens.length <= 1) return;
    
    const numerosVistos = {};
    itens.forEach(function(l) {
      if (!l.despacho) return;
      const m = l.despacho.match(/Solicitou a (\d+)ª abonada\. Restam (\d+)\./i);
      if (m) {
        let numAbonada = parseInt(m[1], 10);
        let restam = parseInt(m[2], 10);
        if (numerosVistos[numAbonada]) {
          let novoNum = numAbonada;
          while (numerosVistos[novoNum]) {
            novoNum++;
            restam = Math.max(0, restam - 1);
          }
          l.despacho = l.despacho.replace(
            /Solicitou a \d+ª abonada\. Restam \d+\./i,
            'Solicitou a ' + novoNum + 'ª abonada. Restam ' + restam + '.'
          );
          numerosVistos[novoNum] = true;
        } else {
          numerosVistos[numAbonada] = true;
        }
      }
    });
  });
}
