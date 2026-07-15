/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio dos Protocolos (ProtocolosService)
 */

/**
 * Retorna a lista de todos os protocolos cadastrados
 */
function obterListaProtocolos() {
  obterDadosUsuarioLogado();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Protocolos");
  if (!aba) return [];
  
  const dados = aba.getDataRange().getValues();
  let protocolos = [];
  
  // Assume colunas: ID_Protocolo (A), Data_Geracao (B), Status (C), Link Direto (D)
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    let id = String(linha[0]).trim();
    if (!id) continue;
    
    // Conta quantos lançamentos estão atrelados a este protocolo
    const qtdDocs = contarLancamentosDoProtocolo(ss, id);
    
    protocolos.push({
      id: id,
      dataGeracao: formatarDataProtocolo(linha[1]),
      status: String(linha[2]).trim(),
      linkDireto: String(linha[3]).trim(),
      qtdDocumentos: qtdDocs,
      criadoPor: linha[4] ? String(linha[4]).trim() : "Sistema",
      linhaPlanilha: i + 1
    });
  }
  
  // Ordena pelos mais recentes
  protocolos.sort((a, b) => b.linhaPlanilha - a.linhaPlanilha);
  return protocolos;
}

/**
 * Cria um novo protocolo agrupando múltiplos lançamentos
 * 
 * @param {Array} idsLancamentos Lista com os números de linha dos lançamentos a vincular
 */
function criarProtocolo(idsLancamentos) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para criar protocolos.");
  }
  
  if (!idsLancamentos || idsLancamentos.length === 0) {
    throw new Error("Selecione pelo menos um lançamento para criar o protocolo.");
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaProt = ss.getSheetByName("Protocolos");
  const abaLanc = ss.getSheetByName("Lançamentos");
  
  if (!abaProt || !abaLanc) {
    throw new Error("Aba 'Protocolos' ou 'Lançamentos' não encontrada.");
  }
  
  // Gera ID curto único de 8 caracteres
  const idProtocolo = Utilities.getUuid().substring(0, 8);
  const dataGeracao = new Date();
  const statusInicial = "Aguardando Assinatura";
  const emailUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();
  
  // 1. Atualizar cada Lançamento vinculando o ID_Protocolo na linha
  // O ID do protocolo será inserido na primeira coluna (1Doc / Protocolo) se estiver vazia ou atrelado.
  // Wait, no fluxo original o 1Doc é o número de protocolo do DGP. O ID do protocolo físico gerado localmente fica em outra coluna ou é colocado no campo despacho/obs.
  // Vamos ver: no screenshot "Tela Protocolo - Detalhe.png" vemos que o Lançamento atrelado possui o campo 1Doc com valor de status, e no detalhe do protocolo ele lista os lançamentos vinculados.
  // A vinculação lógica no Sheets é feita escrevendo o ID do protocolo em uma coluna do lançamento.
  // Vamos identificar qual coluna. No Apps Script antigo, não há referência direta, mas no setup adicionamos "ID_Protocolo" ou usamos o ID do protocolo no campo específico.
  // Para fins de simplicidade e eficiência, vamos salvar a relação de lançamentos atrelados.
  // O ID do protocolo físico será salvo na coluna ID_Protocolo do lançamento (que é uma nova coluna de controle ou fica em um campo específico).
  // Vamos colocar na coluna ID_Protocolo. Deixe-me ver qual coluna de Lançamentos podemos usar. No Setup nós adicionamos controle de autoria, mas podemos gravar a vinculação de forma flexível.
  // Vamos colocar o ID do protocolo na coluna de Observações ou usar uma busca por ID do Protocolo.
  // Para ficar robusto, vamos adicionar o idProtocolo no campo de Observação/Despacho ou criar uma lógica que atualize os lançamentos selecionados.
  // Vamos atualizar a aba 'Lançamentos' escrevendo o idProtocolo na primeira coluna se o 1Doc físico for o ID (ex: "Protocolo abc123").
  // Na verdade, o 1Doc é colocado manualmente depois que o secretário assina. Enquanto não tem o 1Doc, o lançamento fica vinculado ao protocolo local pelo ID.
  // Vamos salvar o ID_Protocolo na aba Lançamentos na coluna de despacho ou no fim da linha. 
  // Na aba Lançamentos, vamos criar ou gravar o ID do protocolo na coluna correspondente.
  // Espera, no setup criamos apenas controle de autoria. Vamos adicionar a gravação do idProtocolo de forma inteligente na coluna de Despacho (ex: "Protocolo: abc123") ou no fim da linha.
  // Colocaremos no campo "Observação" o texto "[Protocolo: " + idProtocolo + "]" de forma a não perder o histórico e permitir o rastreamento textual simples e eficiente.
  
  idsLancamentos.forEach(linhaIdx => {
    let linha = parseInt(linhaIdx);
    if (linha > 1) {
      let obsAtual = String(abaLanc.getRange(linha, COL_INDEX.OBSERVACAO + 1).getValue()).trim();
      let novaObs = obsAtual ? obsAtual + "\n[Protocolo: " + idProtocolo + "]" : "[Protocolo: " + idProtocolo + "]";
      abaLanc.getRange(linha, COL_INDEX.OBSERVACAO + 1).setValue(novaObs);
    }
  });
  
  // 2. Gravar o novo protocolo na aba de Protocolos
  // ID_Protocolo (A), Data_Geracao (B), Status (C), Link Direto (D), Criado_Por (E)
  abaProt.appendRow([
    idProtocolo,
    dataGeracao,
    statusInicial,
    "", // Link Direto (caso seja enviado para pasta futuramente)
    emailUsuario
  ]);
  
  lancarLog("CRIAR_PROTOCOLO", "Protocolos", "Criou protocolo local " + idProtocolo + " vinculando " + idsLancamentos.length + " lançamentos.", "", "", "", idProtocolo);
  
  return idProtocolo;
}

/**
 * Atualiza o status de tramitação de um protocolo
 */
function atualizarStatusProtocolo(idProtocolo, novoStatus) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para alterar o status de protocolos.");
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Protocolos");
  if (!aba) throw new Error("Aba 'Protocolos' não encontrada.");
  
  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).trim() === String(idProtocolo).trim()) {
      const linhaPlanilha = i + 1;
      const statusAnterior = dados[i][2];
      
      aba.getRange(linhaPlanilha, 3).setValue(novoStatus); // coluna C (Status)
      
      lancarLog("STATUS_PROTOCOLO", "Protocolos", "Alterou status do protocolo " + idProtocolo + " de '" + statusAnterior + "' para '" + novoStatus + "'", "Status", statusAnterior, novoStatus, idProtocolo);
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (!abaLanc) return [];
  
  const dados = abaLanc.getDataRange().getValues();
  let vinculados = [];
  
  for (let i = 1; i < dados.length; i++) {
    let obs = String(dados[i][COL_INDEX.OBSERVACAO]).trim();
    if (obs.includes("[Protocolo: " + idProtocolo + "]")) {
      let nomeBruto = String(dados[i][COL_INDEX.NOME]).trim();
      let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
      
      vinculados.push({
        idoc: String(dados[i][COL_INDEX.IDOC]).trim(),
        tipo: String(dados[i][COL_INDEX.TIPO]).trim(),
        nome: nomeLimpo,
        matricula: String(dados[i][COL_INDEX.MATRICULA]).trim(),
        dataInicio: formatarDataProtocolo(dados[i][COL_INDEX.DATA_INICIO]),
        dias: parseInt(dados[i][COL_INDEX.DIAS]) || 0,
        qtdHoras: String(dados[i][COL_INDEX.QTD_HORAS]).trim(),
        observacao: obs,
        linhaPlanilha: i + 1
      });
    }
  }
  
  return vinculados;
}

/**
 * Retorna os lançamentos pendentes de protocolo (que ainda não possuem marcação de protocolo nas Observações)
 */
function obterLancamentosPendentesProtocolo() {
  obterDadosUsuarioLogado();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (!abaLanc) return [];
  
  const dados = abaLanc.getDataRange().getValues();
  let pendentes = [];
  
  for (let i = 1; i < dados.length; i++) {
    let obs = String(dados[i][COL_INDEX.OBSERVACAO]).trim();
    let tipo = String(dados[i][COL_INDEX.TIPO]).trim();
    if (!tipo) continue;
    
    // Ignora lançamentos que já têm marcação de protocolo
    if (obs.includes("[Protocolo: ")) continue;
    
    // Ignora lançamentos anulados ou não efetivados
    if (tipo.toLowerCase().includes("não efetivado") || tipo.toLowerCase().includes("anulado")) continue;
    
    let nomeBruto = String(dados[i][COL_INDEX.NOME]).trim();
    let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
    
    pendentes.push({
      idoc: String(dados[i][COL_INDEX.IDOC]).trim(),
      tipo: tipo,
      nome: nomeLimpo,
      matricula: String(dados[i][COL_INDEX.MATRICULA]).trim(),
      dataInicio: formatarDataProtocolo(dados[i][COL_INDEX.DATA_INICIO]),
      dias: parseInt(dados[i][COL_INDEX.DIAS]) || 0,
      qtdHoras: String(dados[i][COL_INDEX.QTD_HORAS]).trim(),
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
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaProt = ss.getSheetByName("Protocolos");
  if (!abaProt) throw new Error("Aba 'Protocolos' não encontrada.");
  
  let protocoloInfo = null;
  const dadosProt = abaProt.getDataRange().getValues();
  for (let i = 1; i < dadosProt.length; i++) {
    if (String(dadosProt[i][0]).trim() === idProtocolo) {
      protocoloInfo = {
        id: idProtocolo,
        data: formatarDataProtocolo(dadosProt[i][1]),
        status: String(dadosProt[i][2]).trim(),
        criadoPor: dadosProt[i][4] ? String(dadosProt[i][4]).trim() : "Sistema"
      };
      break;
    }
  }
  
  if (!protocoloInfo) throw new Error("Protocolo não encontrado.");
  
  const lancamentos = obterLancamentosVinculados(idProtocolo);
  
  // Cabeçalho da SETUR baseado no Timbrado
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
            <h1 style="margin: 2px 0 0 0; font-size: 24px; font-weight: 700; color: #111;">Nº ${protocoloInfo.id}</h1>
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
            <th style="border: 1px solid #111; padding: 10px; text-align: left; font-weight: 700;">Nº 1Doc</th>
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

// --- AUXILIARES ---

function contarLancamentosDoProtocolo(ss, idProtocolo) {
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (!abaLanc) return 0;
  const dados = abaLanc.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < dados.length; i++) {
    let obs = String(dados[i][COL_INDEX.OBSERVACAO]).trim();
    if (obs.includes("[Protocolo: " + idProtocolo + "]")) {
      count++;
    }
  }
  return count;
}

function formatarDataProtocolo(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  }
  return String(data);
}
