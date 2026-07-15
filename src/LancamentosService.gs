/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio dos Lançamentos (LancamentosService)
 */

/**
 * Retorna os índices das colunas baseados no cabeçalho atual da planilha
 */
function obterIndicesColunasLancamentos_(cabecalho) {
  return {
    idoc: cabecalho.indexOf("1Doc"),
    dataSolicitacao: cabecalho.indexOf("Data"),
    tipo: cabecalho.indexOf("Tipo"),
    nome: cabecalho.indexOf("Nome"),
    matricula: cabecalho.indexOf("MATRÍCULA"),
    dataInicio: cabecalho.indexOf("Data de Início"),
    dias: cabecalho.indexOf("Dias"),
    mes: cabecalho.indexOf("Mês"),
    ano: cabecalho.indexOf("Ano"),
    qtdHoras: cabecalho.indexOf("Quant. Horas"),
    anexo1: cabecalho.indexOf("anexo1"),
    anexo2: cabecalho.indexOf("anexo2"),
    anexo3: cabecalho.indexOf("anexo3"),
    despacho: cabecalho.indexOf("Despacho"),
    observacao: cabecalho.indexOf("Observação"),
    idProtocolo: cabecalho.indexOf("ID_Protocolo"), // Coluna adicionada no Setup
    criadoPor: cabecalho.indexOf("Criado_Por"),
    criadoEm: cabecalho.indexOf("Criado_Em"),
    editadoPor: cabecalho.indexOf("Editado_Por"),
    editadoEm: cabecalho.indexOf("Editado_Em")
  };
}

/**
 * Retorna a lista completa de Lançamentos cadastrados para a tabela da interface
 */
function obterListaLancamentos() {
  obterDadosUsuarioLogado();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Lançamentos");
  if (!aba) return [];
  
  const dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];
  
  const cabecalho = dados[0];
  const idx = obterIndicesColunasLancamentos_(cabecalho);
  
  let lancamentos = [];
  
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    let tipo = idx.tipo !== -1 ? String(linha[idx.tipo]).trim() : "";
    if (!tipo) continue; // ignora linhas vazias
    
    let nomeBruto = idx.nome !== -1 ? String(linha[idx.nome]).trim() : "";
    let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
    
    let statusText = "Ativo";
    if (tipo.toLowerCase().includes("não efetivado") || tipo.toLowerCase().includes("anulado")) {
      statusText = "Anulado";
    }
    
    lancamentos.push({
      idoc: idx.idoc !== -1 ? String(linha[idx.idoc]).trim() : "",
      dataSolicitacao: idx.dataSolicitacao !== -1 ? formatarDataLancamento_(linha[idx.dataSolicitacao]) : "",
      tipo: tipo,
      nome: nomeLimpo,
      matricula: idx.matricula !== -1 ? String(linha[idx.matricula]).trim() : "",
      dataInicio: idx.dataInicio !== -1 ? formatarDataLancamento_(linha[idx.dataInicio]) : "",
      dias: idx.dias !== -1 ? parseInt(linha[idx.dias]) || 0 : 0,
      mes: idx.mes !== -1 ? String(linha[idx.mes]).trim() : "",
      ano: idx.ano !== -1 ? String(linha[idx.ano]).trim() : "",
      qtdHoras: idx.qtdHoras !== -1 ? String(linha[idx.qtdHoras]).trim() : "",
      anexo1: idx.anexo1 !== -1 ? String(linha[idx.anexo1]).trim() : "",
      anexo2: idx.anexo2 !== -1 ? String(linha[idx.anexo2]).trim() : "",
      anexo3: idx.anexo3 !== -1 ? String(linha[idx.anexo3]).trim() : "",
      despacho: idx.despacho !== -1 ? String(linha[idx.despacho]).trim() : "",
      observacao: idx.observacao !== -1 ? String(linha[idx.observacao]).trim() : "",
      idProtocolo: idx.idProtocolo !== -1 ? String(linha[idx.idProtocolo]).trim() : "",
      status: statusText,
      linhaPlanilha: i + 1
    });
  }
  
  // Ordena por ordem de inserção inversa (mais recentes primeiro)
  return lancamentos.reverse();
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
 * Salva um novo lançamento ou atualiza um existente (thread-safe e com escrita em lote)
 */
function salvarLancamento(dadosLanc) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para criar ou editar lançamentos de RH.");
  }
  
  // Obtém o ScriptLock para controle de concorrência concorrente
  const lock = LockService.getScriptLock();
  try {
    // Tenta obter o bloqueio por até 15 segundos
    lock.waitLock(15000);
  } catch (e) {
    throw new Error("Sistema ocupado no momento. Por favor, tente novamente em alguns segundos.");
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName("Lançamentos");
    if (!aba) throw new Error("Aba 'Lançamentos' não encontrada.");
    
    const dados = aba.getDataRange().getValues();
    const cabecalho = dados[0];
    const idx = obterIndicesColunasLancamentos_(cabecalho);
    const matricula = String(dadosLanc.matricula).trim();
    const tipoDoc = String(dadosLanc.tipo).trim();
    
    // 1. Validar servidor
    const servidor = obterInfoServidorBasico_(ss, matricula);
    if (!servidor) {
      throw new Error("Servidor com matrícula " + matricula + " não está cadastrado.");
    }
    
    // 2. Preparar datas
    let dataSolicitacao = parseInputDate_(dadosLanc.dataSolicitacao) || new Date();
    let dataInicio = parseInputDate_(dadosLanc.dataInicio);
    
    let mesNome = "";
    let anoNumero = "";
    if (dataInicio) {
      const meses = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
      mesNome = meses[dataInicio.getMonth()];
      anoNumero = String(dataInicio.getFullYear());
    }
    
    const emailUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();
    const timestamp = new Date();
    const nomePlanilha = matricula + " : " + servidor.nome;
    
    let linhaEdit = -1;
    let valorAntes = "";
    
    if (dadosLanc.linhaPlanilha && dadosLanc.linhaPlanilha > 1) {
      linhaEdit = parseInt(dadosLanc.linhaPlanilha);
      valorAntes = JSON.stringify(dados[linhaEdit - 1]);
    }
    
    // Constrói a linha completa para escrita em lote
    let valoresLinha = new Array(cabecalho.length).fill("");
    
    // Se for edição, aproveitamos valores existentes de auditoria que não mudam
    if (linhaEdit !== -1) {
      valoresLinha = [...dados[linhaEdit - 1]];
    }
    
    // Preenche os índices dinamicamente
    if (idx.idoc !== -1) valoresLinha[idx.idoc] = dadosLanc.idoc || "";
    if (idx.dataSolicitacao !== -1) valoresLinha[idx.dataSolicitacao] = dataSolicitacao;
    if (idx.tipo !== -1) valoresLinha[idx.tipo] = tipoDoc;
    if (idx.nome !== -1) valoresLinha[idx.nome] = nomePlanilha;
    if (idx.matricula !== -1) valoresLinha[idx.matricula] = matricula;
    if (idx.dataInicio !== -1) valoresLinha[idx.dataInicio] = dataInicio || "";
    if (idx.dias !== -1) valoresLinha[idx.dias] = parseInt(dadosLanc.dias) || 0;
    if (idx.mes !== -1) valoresLinha[idx.mes] = mesNome;
    if (idx.ano !== -1) valoresLinha[idx.ano] = anoNumero;
    if (idx.qtdHoras !== -1) valoresLinha[idx.qtdHoras] = dadosLanc.qtdHoras || "";
    
    // Atualiza links de anexos apenas se novos foram passados
    if (dadosLanc.anexo1 && idx.anexo1 !== -1) valoresLinha[idx.anexo1] = dadosLanc.anexo1;
    if (dadosLanc.anexo2 && idx.anexo2 !== -1) valoresLinha[idx.anexo2] = dadosLanc.anexo2;
    if (dadosLanc.anexo3 && idx.anexo3 !== -1) valoresLinha[idx.anexo3] = dadosLanc.anexo3;
    
    if (idx.despacho !== -1) valoresLinha[idx.despacho] = dadosLanc.despacho || "";
    if (idx.observacao !== -1) valoresLinha[idx.observacao] = dadosLanc.observacao || "";
    if (idx.idProtocolo !== -1) valoresLinha[idx.idProtocolo] = dadosLanc.idProtocolo || (linhaEdit !== -1 ? dados[linhaEdit - 1][idx.idProtocolo] : "");
    
    if (linhaEdit !== -1) {
      // MODO EDIÇÃO: Atualiza auditoria e grava a linha inteira em lote
      if (idx.editadoPor !== -1) valoresLinha[idx.editadoPor] = emailUsuario;
      if (idx.editadoEm !== -1) valoresLinha[idx.editadoEm] = timestamp;
      
      const rangeLote = aba.getRange(linhaEdit, 1, 1, cabecalho.length);
      rangeLote.setValues([valoresLinha]);
      
      lancarLogSemLock_("EDITAR_LANCAMENTO", "Lançamentos", "Atualizou lançamento de " + tipoDoc + " para " + servidor.nome, "Lançamento", valorAntes, JSON.stringify(dadosLanc), dadosLanc.idoc || "");
    } else {
      // MODO CRIAÇÃO: Grava informações do criador e anexa a linha
      if (idx.criadoPor !== -1) valoresLinha[idx.criadoPor] = emailUsuario;
      if (idx.criadoEm !== -1) valoresLinha[idx.criadoEm] = timestamp;
      if (idx.editadoPor !== -1) valoresLinha[idx.editadoPor] = emailUsuario;
      if (idx.editadoEm !== -1) valoresLinha[idx.editadoEm] = timestamp;
      
      aba.appendRow(valoresLinha);
      lancarLogSemLock_("CRIAR_LANCAMENTO", "Lançamentos", "Criou novo lançamento de " + tipoDoc + " para " + servidor.nome, "", "", JSON.stringify(dadosLanc), dadosLanc.idoc || "");
    }
    
    return true;
  } finally {
    // Garante que o script lock seja liberado
    lock.releaseLock();
  }
}

/**
 * Salva arquivos de anexo em PDF de forma privada no Google Drive
 */
function salvarArquivoNoDrive(conteudoBase64, nomeArquivo, tipoMime) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para fazer uploads de arquivos no Drive.");
  }
  
  // 1. Validação de formato MIME (Apenas PDFs) e Extensão
  if (tipoMime !== "application/pdf" || !nomeArquivo.toLowerCase().endsWith(".pdf")) {
    throw new Error("Formatos inválidos. Apenas arquivos PDF (.pdf) são autorizados.");
  }
  
  // 2. Validação de tamanho no servidor (limite de 10 MB para evitar timeout do GAS)
  const dadosLimpos = conteudoBase64.split(",")[1] || conteudoBase64;
  const tamanhoBytes = (dadosLimpos.length * 3) / 4;
  const tamanhoMB = tamanhoBytes / (1024 * 1024);
  if (tamanhoMB > 10.0) {
    throw new Error("O tamanho do arquivo excede o limite máximo permitido de 10 Megabytes.");
  }
  
  try {
    const nomePasta = "SETUR_RH_Anexos";
    let pasta = null;
    const pastasExistentes = DriveApp.getFoldersByName(nomePasta);
    
    if (pastasExistentes.hasNext()) {
      pasta = pastasExistentes.next();
    } else {
      pasta = DriveApp.createFolder(nomePasta);
    }
    
    // Converte e cria arquivo de forma privada (sem setSharing "Anyone with link" - herda pasta)
    const blob = Utilities.newBlob(Utilities.base64Decode(dadosLimpos), tipoMime, nomeArquivo);
    const arquivo = pasta.createFile(blob);
    
    return {
      nome: nomeArquivo,
      url: arquivo.getUrl(),
      id: arquivo.getId()
    };
  } catch (e) {
    throw new Error("Falha interna ao gravar anexo no Drive: " + e.toString());
  }
}

/**
 * Exclui um arquivo do Drive se o salvamento do lançamento falhar (mitigando órfãos)
 */
function removerArquivoDrive(idArquivo) {
  if (!verificarSeEhOperador()) return;
  try {
    const arquivo = DriveApp.getFileById(idArquivo);
    arquivo.setTrashed(true);
    Logger.log("Arquivo órfão apagado do Drive: " + idArquivo);
  } catch (e) {
    Logger.log("Erro ao remover arquivo órfão: " + e.toString());
  }
}

/**
 * Auxiliar privado para obter dados básicos de nome do servidor
 */
function obterInfoServidorBasico_(ss, matricula) {
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

/**
 * Converte data de input do browser (yyyy-mm-dd) para Date objeto
 */
function parseInputDate_(stringData) {
  if (!stringData) return null;
  let partes = stringData.split('-');
  if (partes.length === 3) {
    let d = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

/**
 * Formata datas do Sheets para o padrão do cliente
 */
function formatarDataLancamento_(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  return String(data);
}
