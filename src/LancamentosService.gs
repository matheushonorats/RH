/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio dos Lançamentos (LancamentosService)
 */

// Mapeamento de colunas da tabela de Lançamentos baseado no script original
const COL_INDEX = {
  IDOC: 0,            // Coluna A
  DATA_SOLICITACAO: 1, // Coluna B
  TIPO: 2,            // Coluna C
  NOME: 4,            // Coluna E (formato "MATRICULA : NOME" ou similar)
  MATRICULA: 5,       // Coluna F
  DATA_INICIO: 8,     // Coluna I
  DIAS: 12,           // Coluna M
  MES: 13,            // Coluna N
  ANO: 14,            // Coluna O
  QTD_HORAS: 15,      // Coluna P
  ANEXO1: 16,         // Coluna Q
  ANEXO2: 17,         // Coluna R
  ANEXO3: 18,         // Coluna S
  DESPACHO: 19,       // Coluna T
  OBSERVACAO: 20,     // Coluna U
  CRIADO_POR: 21,     // Coluna V (adicionada no setup)
  CRIADO_EM: 22,      // Coluna W (adicionada no setup)
  EDITADO_POR: 23,    // Coluna X (adicionada no setup)
  EDITADO_EM: 24      // Coluna Y (adicionada no setup)
};

/**
 * Retorna a lista completa de Lançamentos cadastrados para a tabela da interface
 */
function obterListaLancamentos() {
  obterDadosUsuarioLogado();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Lançamentos");
  if (!aba) return [];
  
  const dados = aba.getDataRange().getValues();
  let lancamentos = [];
  
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    let idoc = String(linha[COL_INDEX.IDOC]).trim();
    let tipo = String(linha[COL_INDEX.TIPO]).trim();
    if (!tipo) continue; // ignora linhas em branco
    
    // Tratamento do nome
    let nomeBruto = String(linha[COL_INDEX.NOME]).trim();
    let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
    
    // Status visual do lançamento
    let statusText = "Ativo";
    if (tipo.toLowerCase().includes("não efetivado") || tipo.toLowerCase().includes("anulado")) {
      statusText = "Anulado";
    }
    
    lancamentos.push({
      idoc: idoc,
      dataSolicitacao: formatarDataLancamento(linha[COL_INDEX.DATA_SOLICITACAO]),
      tipo: tipo,
      nome: nomeLimpo,
      matricula: String(linha[COL_INDEX.MATRICULA]).trim(),
      dataInicio: formatarDataLancamento(linha[COL_INDEX.DATA_INICIO]),
      dias: parseInt(linha[COL_INDEX.DIAS]) || 0,
      mes: linha[COL_INDEX.MES] ? String(linha[COL_INDEX.MES]).trim() : "",
      ano: linha[COL_INDEX.ANO] ? String(linha[COL_INDEX.ANO]).trim() : "",
      qtdHoras: linha[COL_INDEX.QTD_HORAS] ? String(linha[COL_INDEX.QTD_HORAS]).trim() : "",
      anexo1: String(linha[COL_INDEX.ANEXO1]).trim(),
      anexo2: String(linha[COL_INDEX.ANEXO2]).trim(),
      anexo3: String(linha[COL_INDEX.ANEXO3]).trim(),
      despacho: String(linha[COL_INDEX.DESPACHO]).trim(),
      observacao: String(linha[COL_INDEX.OBSERVACAO]).trim(),
      status: statusText,
      linhaPlanilha: i + 1
    });
  }
  
  // Ordena por data de solicitação mais recente
  lancamentos.sort((a, b) => b.linhaPlanilha - a.linhaPlanilha);
  return lancamentos;
}

/**
 * Retorna o histórico de lançamentos de um servidor específico
 */
function obterHistoricoServidor(matricula) {
  obterDadosUsuarioLogado();
  const todos = obterListaLancamentos();
  return todos.filter(l => l.matricula === String(matricula).trim());
}

/**
 * Salva um novo lançamento ou atualiza um existente
 */
function salvarLancamento(dadosLanc) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para criar ou editar lançamentos de RH.");
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Lançamentos");
  if (!aba) throw new Error("Aba 'Lançamentos' não encontrada.");
  
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  const matricula = String(dadosLanc.matricula).trim();
  const tipoDoc = String(dadosLanc.tipo).trim();
  
  // 1. Validar servidor
  const servidor = obterInfoServidorBasico(ss, matricula);
  if (!servidor) {
    throw new Error("Servidor com matrícula " + matricula + " não está cadastrado.");
  }
  
  // 2. Preparar datas
  let dataSolicitacao = parseInputDate(dadosLanc.dataSolicitacao) || new Date();
  let dataInicio = parseInputDate(dadosLanc.dataInicio);
  
  // Calcular Mês e Ano automaticamente a partir da Data de Início
  let mesNome = "";
  let anoNumero = "";
  if (dataInicio) {
    const meses = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    mesNome = meses[dataInicio.getMonth()];
    anoNumero = String(dataInicio.getFullYear());
  }
  
  const emailUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();
  const timestamp = new Date();
  
  // Cria a chave "MATRICULA : NOME" para bater com o padrão atual do banco
  const nomePlanilha = matricula + " : " + servidor.nome;
  
  let linhaEdit = -1;
  let valorAntes = "";
  
  // Se informou linha e ela for válida, edita. Senão, cria novo.
  if (dadosLanc.linhaPlanilha && dadosLanc.linhaPlanilha > 1) {
    linhaEdit = parseInt(dadosLanc.linhaPlanilha);
    valorAntes = JSON.stringify(dados[linhaEdit - 1]);
  }
  
  // Se for uma edição e mudar o tipo para "Não Efetivado", registrar anulação
  
  if (linhaEdit !== -1) {
    // MODO EDIÇÃO
    aba.getRange(linhaEdit, COL_INDEX.IDOC + 1).setValue(dadosLanc.idoc || "");
    aba.getRange(linhaEdit, COL_INDEX.DATA_SOLICITACAO + 1).setValue(dataSolicitacao);
    aba.getRange(linhaEdit, COL_INDEX.TIPO + 1).setValue(tipoDoc);
    aba.getRange(linhaEdit, COL_INDEX.NOME + 1).setValue(nomePlanilha);
    aba.getRange(linhaEdit, COL_INDEX.MATRICULA + 1).setValue(matricula);
    if (dataInicio) aba.getRange(linhaEdit, COL_INDEX.DATA_INICIO + 1).setValue(dataInicio);
    aba.getRange(linhaEdit, COL_INDEX.DIAS + 1).setValue(parseInt(dadosLanc.dias) || 0);
    aba.getRange(linhaEdit, COL_INDEX.MES + 1).setValue(mesNome);
    aba.getRange(linhaEdit, COL_INDEX.ANO + 1).setValue(anoNumero);
    aba.getRange(linhaEdit, COL_INDEX.QTD_HORAS + 1).setValue(dadosLanc.qtdHoras || "");
    
    // Anexos (se enviados no formato de link, atualiza)
    if (dadosLanc.anexo1) aba.getRange(linhaEdit, COL_INDEX.ANEXO1 + 1).setValue(dadosLanc.anexo1);
    if (dadosLanc.anexo2) aba.getRange(linhaEdit, COL_INDEX.ANEXO2 + 1).setValue(dadosLanc.anexo2);
    if (dadosLanc.anexo3) aba.getRange(linhaEdit, COL_INDEX.ANEXO3 + 1).setValue(dadosLanc.anexo3);
    
    aba.getRange(linhaEdit, COL_INDEX.DESPACHO + 1).setValue(dadosLanc.despacho || "");
    aba.getRange(linhaEdit, COL_INDEX.OBSERVACAO + 1).setValue(dadosLanc.observacao || "");
    
    // Auditoria
    aba.getRange(linhaEdit, COL_INDEX.EDITADO_POR + 1).setValue(emailUsuario);
    aba.getRange(linhaEdit, COL_INDEX.EDITADO_EM + 1).setValue(timestamp);
    
    lancarLog("EDITAR_LANCAMENTO", "Lançamentos", "Atualizou lançamento de " + tipoDoc + " para " + servidor.nome, "Lançamento", valorAntes, JSON.stringify(dadosLanc), dadosLanc.idoc || "");
  } else {
    // MODO CRIAÇÃO
    let novaLinha = [];
    cabecalho.forEach((col, idx) => {
      if (idx === COL_INDEX.IDOC) novaLinha.push(dadosLanc.idoc || "");
      else if (idx === COL_INDEX.DATA_SOLICITACAO) novaLinha.push(dataSolicitacao);
      else if (idx === COL_INDEX.TIPO) novaLinha.push(tipoDoc);
      else if (idx === COL_INDEX.NOME) novaLinha.push(nomePlanilha);
      else if (idx === COL_INDEX.MATRICULA) novaLinha.push(matricula);
      else if (idx === COL_INDEX.DATA_INICIO) novaLinha.push(dataInicio);
      else if (idx === COL_INDEX.DIAS) novaLinha.push(parseInt(dadosLanc.dias) || 0);
      else if (idx === COL_INDEX.MES) novaLinha.push(mesNome);
      else if (idx === COL_INDEX.ANO) novaLinha.push(anoNumero);
      else if (idx === COL_INDEX.QTD_HORAS) novaLinha.push(dadosLanc.qtdHoras || "");
      else if (idx === COL_INDEX.ANEXO1) novaLinha.push(dadosLanc.anexo1 || "");
      else if (idx === COL_INDEX.ANEXO2) novaLinha.push(dadosLanc.anexo2 || "");
      else if (idx === COL_INDEX.ANEXO3) novaLinha.push(dadosLanc.anexo3 || "");
      else if (idx === COL_INDEX.DESPACHO) novaLinha.push(dadosLanc.despacho || "");
      else if (idx === COL_INDEX.OBSERVACAO) novaLinha.push(dadosLanc.observacao || "");
      else if (idx === COL_INDEX.CRIADO_POR) novaLinha.push(emailUsuario);
      else if (idx === COL_INDEX.CRIADO_EM) novaLinha.push(timestamp);
      else if (idx === COL_INDEX.EDITADO_POR) novaLinha.push(emailUsuario);
      else if (idx === COL_INDEX.EDITADO_EM) novaLinha.push(timestamp);
      else novaLinha.push("");
    });
    
    aba.appendRow(novaLinha);
    lancarLog("CRIAR_LANCAMENTO", "Lançamentos", "Criou novo lançamento de " + tipoDoc + " para " + servidor.nome, "", "", JSON.stringify(dadosLanc), dadosLanc.idoc || "");
  }
  
  return true;
}

/**
 * Salva arquivos de anexo enviados em Base64 para uma pasta no Google Drive 
 * e retorna o link público de acesso para ser registrado no Sheets.
 */
function salvarArquivoNoDrive(conteudoBase64, nomeArquivo, tipoMime) {
  obterDadosUsuarioLogado();
  
  try {
    // Pasta do sistema no Google Drive (procura pasta com nome 'SETUR_RH_Anexos' ou cria uma)
    const nomePasta = "SETUR_RH_Anexos";
    let pasta = null;
    const pastasExistentes = DriveApp.getFoldersByName(nomePasta);
    
    if (pastasExistentes.hasNext()) {
      pasta = pastasExistentes.next();
    } else {
      pasta = DriveApp.createFolder(nomePasta);
    }
    
    // Converte de base64 para Blob
    const dadosLimpos = conteudoBase64.split(",")[1] || conteudoBase64;
    const blob = Utilities.newBlob(Utilities.base64Decode(dadosLimpos), tipoMime, nomeArquivo);
    
    // Cria o arquivo na pasta
    const arquivo = pasta.createFile(blob);
    arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return {
      nome: nomeArquivo,
      url: arquivo.getUrl(),
      id: arquivo.getId()
    };
  } catch (e) {
    throw new Error("Erro ao fazer upload do anexo para o Google Drive: " + e.toString());
  }
}

/**
 * Auxiliar para obter dados básicos de nome do servidor
 */
function obterInfoServidorBasico(ss, matricula) {
  const abaServ = ss.getSheetByName("Servidores");
  if (!abaServ) return null;
  const dados = abaServ.getDataRange().getValues();
  const cabecalho = dados[0];
  const idxMat = cabecalho.indexOf("MATRÍCULA");
  const idxNome = cabecalho.indexOf("NOME");
  
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idxMat]).trim() === matricula) {
      return {
        nome: String(dados[i][idxNome]).trim(),
        matricula: matricula
      };
    }
  }
  return null;
}

function parseInputDate(stringData) {
  if (!stringData) return null;
  let partes = stringData.split('-');
  if (partes.length === 3) {
    let d = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

function formatarDataLancamento(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  return String(data);
}
