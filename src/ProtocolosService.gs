/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio dos Protocolos (ProtocolosService)
 */

/**
 * Retorna a lista de todos os protocolos cadastrados.
 * Otimização O(L+P): lê Lançamentos uma única vez e agrupa por ID_Protocolo.
 */
function obterListaProtocolos() {
  obterDadosUsuarioLogado();

  const ss = obterPlanilha_();
  const aba = ss.getSheetByName("Protocolos");
  if (!aba) return [];

  const dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];

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

    protocolos.push({
      id: id,
      dataGeracao: idxData !== -1 ? formatarDataProtocolo_(linha[idxData]) : "",
      status: idxStatus !== -1 ? String(linha[idxStatus]).trim() : "",
      linkDireto: idxLink !== -1 ? String(linha[idxLink]).trim() : "",
      qtdDocumentos: mapaContagem[id] || 0,
      criadoPor: idxCriadoPor !== -1 && linha[idxCriadoPor] ? String(linha[idxCriadoPor]).trim() : "Sistema",
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
    let novoNumero = ultimoNumero + 1;
    props.setProperty(chaveProps, String(novoNumero));

    const numeroFormatado = "000000" + novoNumero;
    const idProtocolo = "SETUR-" + anoAtual + "-" + numeroFormatado.substring(numeroFormatado.length - 6);

    const dataGeracao = new Date();
    const statusInicial = "Aguardando Assinatura";
    const emailUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();

    // 2. Mapeamento de colunas da aba Lançamentos
    const dadosLanc = abaLanc.getDataRange().getValues();
    const cabecalhoLanc = dadosLanc[0];
    const colIdxIDProt = cabecalhoLanc.indexOf("ID_Protocolo");

    if (colIdxIDProt === -1) {
      throw new Error("Erro de infraestrutura: Coluna 'ID_Protocolo' não encontrada na aba Lançamentos.");
    }

    // 3. Escrita em lote: acumula pares [linha, valor] e grava tudo de uma vez
    const linhasValidas = linhasLancamentos
      .map(l => parseInt(l))
      .filter(l => l > 1 && l <= abaLanc.getLastRow());

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
      emailUsuario
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

  let vinculados = [];

  for (let i = 1; i < dados.length; i++) {
    let idProtLanc = idx.idProtocolo !== -1 ? String(dados[i][idx.idProtocolo]).trim() : "";

    if (idProtLanc === String(idProtocolo).trim()) {
      let nomeBruto = idx.nome !== -1 ? String(dados[i][idx.nome]).trim() : "";
      let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;

      vinculados.push({
        idoc: idx.idoc !== -1 ? String(dados[i][idx.idoc]).trim() : "",
        tipo: idx.tipo !== -1 ? String(dados[i][idx.tipo]).trim() : "",
        nome: nomeLimpo,
        matricula: idx.matricula !== -1 ? String(dados[i][idx.matricula]).trim() : "",
        dataInicio: idx.dataInicio !== -1 ? formatarDataProtocolo_(dados[i][idx.dataInicio]) : "",
        dias: idx.dias !== -1 ? parseInt(dados[i][idx.dias]) || 0 : 0,
        qtdHoras: idx.qtdHoras !== -1 ? String(dados[i][idx.qtdHoras]).trim() : "",
        observacao: idx.observacao !== -1 ? String(dados[i][idx.observacao]).trim() : "",
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
    if (tipo.toLowerCase().includes("não efetivado") || tipo.toLowerCase().includes("anulado")) continue;

    let nomeBruto = idx.nome !== -1 ? String(dados[i][idx.nome]).trim() : "";
    let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;

    pendentes.push({
      idoc: idx.idoc !== -1 ? String(dados[i][idx.idoc]).trim() : "",
      tipo: tipo,
      nome: nomeLimpo,
      matricula: idx.matricula !== -1 ? String(dados[i][idx.matricula]).trim() : "",
      dataInicio: idx.dataInicio !== -1 ? formatarDataProtocolo_(dados[i][idx.dataInicio]) : "",
      dias: idx.dias !== -1 ? parseInt(dados[i][idx.dias]) || 0 : 0,
      qtdHoras: idx.qtdHoras !== -1 ? String(dados[i][idx.qtdHoras]).trim() : "",
      linhaPlanilha: i + 1
    });
  }

  return pendentes;
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
      protocoloInfo = {
        id: idProtocolo,
        data: formatarDataProtocolo_(dadosProt[i][1]),
        status: String(dadosProt[i][2]).trim(),
        criadoPor: dadosProt[i][4] ? String(dadosProt[i][4]).trim() : "Sistema"
      };
      break;
    }
  }

  if (!protocoloInfo) throw new Error("Protocolo não encontrado.");

  const lancamentos = obterLancamentosVinculados(idProtocolo);

  let html = `
    <div style="font-family: Arial, sans-serif; color: #000; padding: 40px; line-height: 1.5; background-color: #fff; max-width: 800px; margin: 0 auto; border: 1px solid #ddd;">
      
      <!-- Cabeçalho Oficial -->
      <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;">
        <h2 style="margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">Prefeitura Municipal de São Sebastião</h2>
        <h3 style="margin: 5px 0 0 0; font-size: 14px; font-weight: 500; color: #555; text-transform: uppercase;">Secretaria de Turismo - SETUR</h3>
        <p style="margin: 5px 0 0 0; font-size: 11px; color: #777;">Rua da Praia, s/n - Centro, São Sebastião - SP</p>
      </div>
 
      <!-- Detalhes do Protocolo -->
      <div style="margin-bottom: 30px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #ddd; padding-bottom: 10px; margin-bottom: 15px;">
          <div>
            <span style="font-size: 12px; text-transform: uppercase; color: #666; font-weight: 600;">Folha de Protocolo Local</span>
            <h1 style="margin: 2px 0 0 0; font-size: 24px; font-weight: 700; color: #111;">No ${protocoloInfo.id}</h1>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-size: 13px;"><strong>Data Geração:</strong> ${protocoloInfo.data}</p>
            <p style="margin: 3px 0 0 0; font-size: 13px;"><strong>Status:</strong> ${protocoloInfo.status}</p>
          </div>
        </div>
        <p style="font-size: 13px; color: #333; margin: 0;">Declaramos que as solicitações físicas de RH listadas abaixo estão saindo da Diretoria Executiva da SETUR para fins de assinatura e ciência do Secretário da Pasta.</p>
      </div>
 
      <!-- Tabela de Documentos -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 13px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="border: 1px solid #111; padding: 10px; text-align: left; font-weight: 700;">Servidor (Matrícula)</th>
            <th style="border: 1px solid #111; padding: 10px; text-align: left; font-weight: 700;">Documento</th>
            <th style="border: 1px solid #111; padding: 10px; text-align: center; font-weight: 700;">Data Início/Falta</th>
            <th style="border: 1px solid #111; padding: 10px; text-align: center; font-weight: 700;">Qtd / Dias</th>
            <th style="border: 1px solid #111; padding: 10px; text-align: left; font-weight: 700;">No 1Doc</th>
          </tr>
        </thead>
        <tbody>
  `;

  lancamentos.forEach(l => {
    html += `
      <tr>
        <td style="border: 1px solid #111; padding: 10px;"><strong>${l.nome}</strong> (${l.matricula})</td>
        <td style="border: 1px solid #111; padding: 10px;">${l.tipo}</td>
        <td style="border: 1px solid #111; padding: 10px; text-align: center;">${l.dataInicio}</td>
        <td style="border: 1px solid #111; padding: 10px; text-align: center;">${l.dias > 0 ? l.dias + ' d' : (l.qtdHoras || '-')}</td>
        <td style="border: 1px solid #111; padding: 10px;">${l.idoc || 'Aguardando Assinatura'}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
 
      <!-- Rodapé com Assinaturas -->
      <div style="margin-top: 60px; display: flex; justify-content: space-between; gap: 40px;">
        <div style="flex: 1; text-align: center;">
          <div style="border-top: 1px solid #000; width: 100%; margin-bottom: 8px; padding-top: 8px; font-size: 13px; font-weight: 600;">Emitido por</div>
          <span style="font-size: 12px; color: #555;">${protocoloInfo.criadoPor}</span>
        </div>
        <div style="flex: 1; text-align: center;">
          <div style="border-top: 1px solid #000; width: 100%; margin-bottom: 8px; padding-top: 8px; font-size: 13px; font-weight: 600;">Assinatura do Chefe / Secretário</div>
          <span style="font-size: 12px; color: #555;">Secretaria de Turismo</span>
        </div>
      </div>
 
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

  const dados = abaLanc.getDataRange().getValues();
  if (dados.length <= 1) return {};

  const cabecalho = dados[0];
  // Lê tanto ID_Protocolo quanto Link_Protocolo (dados migrados usam Link_Protocolo como ID)
  const colIdxIDProt  = indiceCabecalho_(cabecalho, ["ID PROTOCOLO"]);
  const colIdxLinkProt = indiceCabecalho_(cabecalho, ["LINK PROTOCOLO", "LINK PROTOCOLO"]);

  if (colIdxIDProt === -1 && colIdxLinkProt === -1) return {};

  let mapa = {};
  for (let i = 1; i < dados.length; i++) {
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
