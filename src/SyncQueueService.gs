/**
 * Fila persistente de sincronização.
 * Mantém no Sheets os lançamentos preparados e os anexos já enviados ao Drive.
 */

const CABECALHO_FILA_SINCRONIZACAO = [
  "ID_OPERACAO",
  "CRIADO_EM",
  "ATUALIZADO_EM",
  "USUARIO",
  "TIPO_OPERACAO",
  "DESCRICAO",
  "PAYLOAD_JSON",
  "STATUS",
  "TENTATIVAS",
  "ULTIMO_ERRO",
  "ANEXOS_ESPERADOS",
  "ANEXO_1_ID",
  "ANEXO_1_URL",
  "ANEXO_2_ID",
  "ANEXO_2_URL",
  "ANEXO_3_ID",
  "ANEXO_3_URL",
  "CONCLUIDO_EM"
];

function garantirAbaFilaSincronizacao_(ss) {
  let aba = ss.getSheetByName("Fila_Sincronizacao");
  if (!aba) {
    aba = ss.insertSheet("Fila_Sincronizacao");
    aba.getRange(1, 1, 1, CABECALHO_FILA_SINCRONIZACAO.length)
      .setValues([CABECALHO_FILA_SINCRONIZACAO])
      .setFontWeight("bold")
      .setBackground("#434343")
      .setFontColor("#ffffff")
      .setHorizontalAlignment("center");
    aba.setFrozenRows(1);
    aba.hideSheet();
  }
  return aba;
}

function validarIdOperacao_(idOperacao) {
  const id = String(idOperacao || "").trim();
  if (!/^[A-Za-z0-9-]{10,80}$/.test(id)) {
    throw new Error("Identificador de sincronização inválido.");
  }
  return id;
}

function obterEmailFilaAtual_() {
  const usuario = obterDadosUsuarioLogado();
  return String(usuario.email || "").toLowerCase().trim();
}

function localizarLinhaFila_(aba, idOperacao) {
  if (aba.getLastRow() <= 1) return -1;
  const ids = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === idOperacao) return i + 2;
  }
  return -1;
}

function contarLinksFila_(linha) {
  return [linha[12], linha[14], linha[16]].filter(valor => String(valor || "").trim()).length;
}

function validarProprietarioFila_(linha) {
  const proprietario = String(linha[3] || "").toLowerCase().trim();
  if (!proprietario || proprietario !== obterEmailFilaAtual_()) {
    throw new Error("Esta operação pertence a outro usuário.");
  }
}

function registrarOperacaoPendente(dadosOperacao) {
  if (!verificarSeEhOperador()) throw new Error("Você não possui permissão para registrar operações pendentes.");

  const idOperacao = validarIdOperacao_(dadosOperacao && dadosOperacao.idOperacao);
  const tipo = String(dadosOperacao.tipoOperacao || "").trim();
  if (tipo !== "salvar_lancamento") throw new Error("Tipo de operação persistente não permitido.");

  const payload = dadosOperacao.payload || {};
  payload.operacaoId = idOperacao;
  const payloadJson = JSON.stringify(payload);
  if (payloadJson.length > 45000) throw new Error("Os dados do lançamento excedem o limite da fila persistente.");

  const anexosEsperados = Math.max(0, Math.min(3, parseInt(dadosOperacao.anexosEsperados, 10) || 0));
  // A fila pertence ao usuário autenticado. Um UserLock impede duplo envio
  // em abas do mesmo usuário sem disputar o bloqueio global com relatórios,
  // créditos, protocolos e outras rotinas independentes.
  const lock = LockService.getUserLock();
  lock.waitLock(15000);
  try {
    const ss = obterPlanilha_();
    const aba = garantirAbaFilaSincronizacao_(ss);
    const agora = new Date();
    const email = obterEmailFilaAtual_();
    const linhaExistente = localizarLinhaFila_(aba, idOperacao);

    if (linhaExistente !== -1) {
      const linha = aba.getRange(linhaExistente, 1, 1, CABECALHO_FILA_SINCRONIZACAO.length).getValues()[0];
      if (String(linha[7]) === "CONCLUIDA") return { idOperacao: idOperacao, status: "CONCLUIDA" };
      if (String(linha[3]).toLowerCase().trim() !== email) throw new Error("Esta operação pertence a outro usuário.");
      linha[2] = agora;
      linha[5] = String(dadosOperacao.descricao || "Salvar lançamento");
      linha[6] = payloadJson;
      linha[7] = anexosEsperados === 0 ? "PRONTA" : "AGUARDANDO_UPLOAD";
      linha[10] = anexosEsperados;
      aba.getRange(linhaExistente, 1, 1, linha.length).setValues([linha]);
      return { idOperacao: idOperacao, status: linha[7] };
    }

    const novaLinha = new Array(CABECALHO_FILA_SINCRONIZACAO.length).fill("");
    novaLinha[0] = idOperacao;
    novaLinha[1] = agora;
    novaLinha[2] = agora;
    novaLinha[3] = email;
    novaLinha[4] = tipo;
    novaLinha[5] = String(dadosOperacao.descricao || "Salvar lançamento");
    novaLinha[6] = payloadJson;
    novaLinha[7] = anexosEsperados === 0 ? "PRONTA" : "AGUARDANDO_UPLOAD";
    novaLinha[8] = 0;
    novaLinha[10] = anexosEsperados;
    aba.appendRow(novaLinha);
    return { idOperacao: idOperacao, status: novaLinha[7] };
  } finally {
    lock.releaseLock();
  }
}

function registrarAnexoOperacaoPendente_(idOperacao, posicao, idArquivo, urlArquivo) {
  const id = validarIdOperacao_(idOperacao);
  const slot = parseInt(posicao, 10);
  if (slot < 1 || slot > 3) throw new Error("Posição de anexo inválida.");

  const lock = LockService.getUserLock();
  lock.waitLock(15000);
  try {
    const aba = garantirAbaFilaSincronizacao_(obterPlanilha_());
    const numeroLinha = localizarLinhaFila_(aba, id);
    if (numeroLinha === -1) throw new Error("Operação pendente não encontrada para vincular o anexo.");
    const linha = aba.getRange(numeroLinha, 1, 1, CABECALHO_FILA_SINCRONIZACAO.length).getValues()[0];
    validarProprietarioFila_(linha);
    const indiceId = 11 + ((slot - 1) * 2);
    linha[indiceId] = idArquivo;
    linha[indiceId + 1] = urlArquivo;
    linha[2] = new Date();
    const esperados = parseInt(linha[10], 10) || 0;
    if (contarLinksFila_(linha) >= esperados) linha[7] = "PRONTA";
    aba.getRange(numeroLinha, 1, 1, linha.length).setValues([linha]);
  } finally {
    lock.releaseLock();
  }
}

function marcarOperacaoPronta(dadosLancamento) {
  if (!verificarSeEhOperador()) throw new Error("Você não possui permissão para atualizar a fila.");
  const id = validarIdOperacao_(dadosLancamento && dadosLancamento.operacaoId);
  const payloadJson = JSON.stringify(dadosLancamento || {});
  if (payloadJson.length > 45000) throw new Error("Os dados do lançamento excedem o limite da fila persistente.");

  const lock = LockService.getUserLock();
  lock.waitLock(15000);
  try {
    const aba = garantirAbaFilaSincronizacao_(obterPlanilha_());
    const numeroLinha = localizarLinhaFila_(aba, id);
    if (numeroLinha === -1) throw new Error("Operação pendente não encontrada.");
    const linha = aba.getRange(numeroLinha, 1, 1, CABECALHO_FILA_SINCRONIZACAO.length).getValues()[0];
    validarProprietarioFila_(linha);
    linha[2] = new Date();
    linha[6] = payloadJson;
    linha[7] = "PRONTA";
    linha[9] = "";
    if (dadosLancamento.anexo1) linha[12] = dadosLancamento.anexo1;
    if (dadosLancamento.anexo2) linha[14] = dadosLancamento.anexo2;
    if (dadosLancamento.anexo3) linha[16] = dadosLancamento.anexo3;
    aba.getRange(numeroLinha, 1, 1, linha.length).setValues([linha]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function registrarFalhaOperacaoPendente(idOperacao, mensagem) {
  const id = validarIdOperacao_(idOperacao);
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  try {
    const aba = garantirAbaFilaSincronizacao_(obterPlanilha_());
    const numeroLinha = localizarLinhaFila_(aba, id);
    if (numeroLinha === -1) return false;
    const linha = aba.getRange(numeroLinha, 1, 1, CABECALHO_FILA_SINCRONIZACAO.length).getValues()[0];
    validarProprietarioFila_(linha);
    if (String(linha[7]) === "CONCLUIDA" || String(linha[7]) === "CANCELADA") return true;
    linha[2] = new Date();
    linha[7] = "ERRO";
    linha[8] = (parseInt(linha[8], 10) || 0) + 1;
    linha[9] = String(mensagem || "Falha não informada").slice(0, 2000);
    aba.getRange(numeroLinha, 1, 1, linha.length).setValues([linha]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function marcarOperacaoConcluidaSemLock_(idOperacao) {
  if (!idOperacao) return;
  const id = validarIdOperacao_(idOperacao);
  const aba = garantirAbaFilaSincronizacao_(obterPlanilha_());
  const numeroLinha = localizarLinhaFila_(aba, id);
  if (numeroLinha === -1) return;
  const linha = aba.getRange(numeroLinha, 1, 1, CABECALHO_FILA_SINCRONIZACAO.length).getValues()[0];
  validarProprietarioFila_(linha);
  linha[2] = new Date();
  linha[7] = "CONCLUIDA";
  linha[9] = "";
  linha[17] = new Date();
  aba.getRange(numeroLinha, 1, 1, linha.length).setValues([linha]);
}

function obterOperacoesPendentesUsuario() {
  const email = obterEmailFilaAtual_();
  const ss = obterPlanilha_();
  let aba = ss.getSheetByName("Fila_Sincronizacao");
  if (!aba) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      aba = garantirAbaFilaSincronizacao_(ss);
    } finally {
      lock.releaseLock();
    }
  }
  if (aba.getLastRow() <= 1) return [];
  const valores = aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_FILA_SINCRONIZACAO.length).getValues();

  return valores.filter(linha => {
    const status = String(linha[7] || "");
    return String(linha[3] || "").toLowerCase().trim() === email && status !== "CONCLUIDA" && status !== "CANCELADA";
  }).map(linha => {
    let payload = {};
    try { payload = JSON.parse(String(linha[6] || "{}")); } catch (e) { payload = {}; }
    payload.operacaoId = String(linha[0]);
    payload.anexo1 = String(linha[12] || payload.anexo1 || "");
    payload.anexo2 = String(linha[14] || payload.anexo2 || "");
    payload.anexo3 = String(linha[16] || payload.anexo3 || "");
    const esperados = parseInt(linha[10], 10) || 0;
    const enviados = contarLinksFila_(linha);
    return {
      idOperacao: String(linha[0]),
      criadoEm: formatarDataFila_(linha[1]),
      atualizadoEm: formatarDataFila_(linha[2]),
      tipoOperacao: String(linha[4]),
      descricao: String(linha[5]),
      status: String(linha[7]),
      tentativas: parseInt(linha[8], 10) || 0,
      ultimoErro: String(linha[9] || ""),
      anexosEsperados: esperados,
      anexosEnviados: enviados,
      pronta: enviados >= esperados,
      payload: payload,
      anexos: [payload.anexo1, payload.anexo2, payload.anexo3].filter(Boolean)
    };
  }).sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
}

function cancelarOperacaoPendente(idOperacao) {
  if (!verificarSeEhOperador()) throw new Error("Você não possui permissão para cancelar esta pendência.");
  const id = validarIdOperacao_(idOperacao);
  const email = obterEmailFilaAtual_();
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  try {
    const aba = garantirAbaFilaSincronizacao_(obterPlanilha_());
    const numeroLinha = localizarLinhaFila_(aba, id);
    if (numeroLinha === -1) return true;
    const linha = aba.getRange(numeroLinha, 1, 1, CABECALHO_FILA_SINCRONIZACAO.length).getValues()[0];
    if (String(linha[3]).toLowerCase().trim() !== email) throw new Error("Esta operação pertence a outro usuário.");
    linha[2] = new Date();
    linha[7] = "CANCELADA";
    linha[9] = "Cancelada manualmente. Anexos preservados no Drive.";
    aba.getRange(numeroLinha, 1, 1, linha.length).setValues([linha]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function formatarDataFila_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  }
  return String(valor || "");
}
