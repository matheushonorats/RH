/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio dos Lançamentos (LancamentosService)
 */

/**
 * Retorna os índices das colunas baseados no cabeçalho atual da planilha
 */
function obterIndicesColunasLancamentos_(cabecalho) {
  return {
    id:              indiceCabecalho_(cabecalho, ["ID"]),
    idoc:            indiceCabecalho_(cabecalho, ["N PROC 1DOC", "1DOC", "PROTOCOLO", "N 1DOC"]),
    dataSolicitacao: indiceCabecalho_(cabecalho, ["DATA", "DATA SOLICITACAO"]),
    tipo:            indiceCabecalho_(cabecalho, ["TIPO DE DOCUMENTO", "TIPO"]),
    nome:            indiceCabecalho_(cabecalho, ["NOME", "SERVIDOR"]),
    matricula:       indiceCabecalho_(cabecalho, ["MATRICULA"]),
    dataInicio:      indiceCabecalho_(cabecalho, ["DATA INICIO", "DATA DE INICIO", "DATA DE SAIDA FALTA"]),
    diasFerias:      indiceCabecalho_(cabecalho, ["QUANTIDADE DIAS FERIAS", "QUANTIDADE DIAS", "QUANTIDADE FERIAS", "QTD FERIAS"]),
    dias:            indiceCabecalho_(cabecalho, ["DIAS", "QTD DIAS"]),
    diasPecunia:     indiceCabecalho_(cabecalho, ["DIAS PECUNIA", "DIAS EM PECUNIA", "QTD DIAS PECUNIA"]),
    mes:             indiceCabecalho_(cabecalho, ["MES HE", "MES"]),
    ano:             indiceCabecalho_(cabecalho, ["ANO HE", "ANO"]),
    qtdHoras:        indiceCabecalho_(cabecalho, ["QUANTIDADE HE", "QUANT HORAS", "QTD HORAS"]),
    anexo1:          indiceCabecalho_(cabecalho, ["ANEXO 1", "ANEXO1"]),
    anexo2:          indiceCabecalho_(cabecalho, ["ANEXO 2", "ANEXO2"]),
    anexo3:          indiceCabecalho_(cabecalho, ["ANEXO 3", "ANEXO3"]),
    despacho:        indiceCabecalho_(cabecalho, ["DESPACHO INDIVIDUAL", "DESPACHO"]),
    observacao:      indiceCabecalho_(cabecalho, ["OBSERVACAO INDIVIDUAL", "OBSERVACAO", "OBSERVACOES"]),
    idProtocolo:     indiceCabecalho_(cabecalho, ["ID_PROTOCOLO", "ID PROTOCOLO"]),
    criadoPor:       indiceCabecalho_(cabecalho, ["CRIADO POR"]),
    criadoEm:        indiceCabecalho_(cabecalho, ["CRIADO EM"]),
    editadoPor:      indiceCabecalho_(cabecalho, ["EDITADO POR"]),
    editadoEm:       indiceCabecalho_(cabecalho, ["EDITADO EM"])
  };
}

/**
 * Retorna a quantidade de dias de um lancamento baseado nos campos disponíveis.
 * Abonadas nao tem coluna de dias - sao sempre 1 dia.
 */
function obterDiasLancamento_(linha, idx) {
  const dias = idx.dias !== -1 ? Number(linha[idx.dias]) : 0;
  const diasFerias = idx.diasFerias !== -1 ? Number(linha[idx.diasFerias]) : 0;
  return dias > 0 ? dias : (diasFerias > 0 ? diasFerias : 0);
}

/** Dias convertidos em pecúnia. Registros antigos, sem a coluna, valem zero. */
function obterDiasPecuniaLancamento_(linha, idx) {
  if (!idx || idx.diasPecunia === undefined || idx.diasPecunia === -1) return 0;
  const dias = Number(linha[idx.diasPecunia]);
  return isFinite(dias) && dias > 0 ? dias : 0;
}

/** Total abatido do saldo: dias gozados + dias convertidos em pecúnia. */
function obterTotalDebitoFerias_(linha, idx) {
  return obterDiasLancamento_(linha, idx) + obterDiasPecuniaLancamento_(linha, idx);
}

/** Garante a coluna nova em planilhas que já passaram pelo setup inicial. */
function garantirColunaDiasPecunia_(aba) {
  const cabecalho = aba.getRange(1, 1, 1, Math.max(aba.getLastColumn(), 1)).getValues()[0];
  if (indiceCabecalho_(cabecalho, ["DIAS PECUNIA", "DIAS EM PECUNIA", "QTD DIAS PECUNIA"]) !== -1) return;

  const coluna = cabecalho.length + 1;
  aba.getRange(1, coluna)
    .setValue("Dias_Pecunia")
    .setFontWeight("bold")
    .setBackground("#434343")
    .setFontColor("#ffffff")
    .setHorizontalAlignment("center");
}

/**
 * Retorna a lista completa de Lançamentos cadastrados para a tabela da interface
 */
function obterListaLancamentos() {
  obterDadosUsuarioLogado();
  
  const ss = obterPlanilha_();
  const aba = ss.getSheetByName("Lançamentos");
  if (!aba) return [];
  
  const dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];
  
  const cabecalho = dados[0];
  const idx = obterIndicesColunasLancamentos_(cabecalho);

  if (idx.tipo === -1 || idx.nome === -1) {
    throw new Error("Cabecalhos TIPO/NOME nao encontrados em Lancamentos. Encontrados: " + cabecalho.join(" | "));
  }
  
  let lancamentos = [];
  
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    let tipo = idx.tipo !== -1 ? String(linha[idx.tipo]).trim() : "";
    if (!tipo) continue; // ignora linhas vazias
    
    let nomeBruto = idx.nome !== -1 ? String(linha[idx.nome]).trim() : "";
    let nomeLimpo = nomeBruto.includes(":") ? nomeBruto.split(":")[1].trim() : nomeBruto;
    let diasLanc = obterDiasLancamento_(linha, idx);
    let diasPecunia = obterDiasPecuniaLancamento_(linha, idx);
    
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
      dias: diasLanc,
      diasPecunia: diasPecunia,
      diasDebitados: diasLanc + diasPecunia,
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
  const chaveMatricula = normalizarChaveMatricula_(matricula);
  return todos.filter(l => normalizarChaveMatricula_(l.matricula) === chaveMatricula);
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
    const ss = obterPlanilha_();
    const aba = ss.getSheetByName("Lançamentos");
    if (!aba) throw new Error("Aba 'Lançamentos' não encontrada.");
    garantirColunaDiasPecunia_(aba);
    
    const dados = aba.getDataRange().getValues();
    const cabecalho = dados[0];
    const idx = obterIndicesColunasLancamentos_(cabecalho);
    const matricula = normalizarChaveMatricula_(dadosLanc.matricula);
    const tipoDoc = String(dadosLanc.tipo).trim();
    const tipoNormalizado = normalizarCabecalho_(tipoDoc);
    const ehFeriasPecunia = tipoNormalizado.includes("FERIAS") && tipoNormalizado.includes("PECUNIA");
    const diasGozo = parseInt(dadosLanc.dias, 10) || 0;
    const diasPecunia = parseInt(dadosLanc.diasPecunia, 10) || 0;

    if (ehFeriasPecunia && (diasGozo <= 0 || diasPecunia <= 0)) {
      throw new Error("Informe separadamente os dias de gozo e os dias convertidos em pecúnia.");
    }
    if (!ehFeriasPecunia && diasPecunia > 0) {
      throw new Error("Dias em pecúnia só podem ser informados em Férias (1/3 Pecúnia).");
    }
    
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
    
    if (tipoDoc === "Autorização de Horas Extras") {
      if (dadosLanc.mesHE) mesNome = String(dadosLanc.mesHE).toUpperCase();
      if (dadosLanc.anoHE) anoNumero = String(dadosLanc.anoHE);
    }
    
    const emailUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();
    const timestamp = new Date();
    const nomePlanilha = matricula + ": " + servidor.nome;
    
    let linhaEdit = -1;
    let valorAntes = "";
    
    if (dadosLanc.linhaPlanilha && dadosLanc.linhaPlanilha > 1) {
      linhaEdit = parseInt(dadosLanc.linhaPlanilha);
      valorAntes = JSON.stringify(dados[linhaEdit - 1]);
    }

    if (tipoNormalizado.includes("FERIAS")) {
      const totalSolicitado = diasGozo + diasPecunia;
      const resumoFerias = construirResumoFerias_(ss);
      const registroFerias = resumoFerias[matricula];
      let saldoDisponivel = registroFerias ? Number(registroFerias.saldo) || 0 : 0;

      // Na edição, recompõe o débito da própria linha antes de validar o novo valor.
      if (linhaEdit !== -1) {
        const linhaAnterior = dados[linhaEdit - 1];
        const tipoAnterior = idx.tipo !== -1 ? normalizarCabecalho_(linhaAnterior[idx.tipo]) : "";
        if (tipoAnterior.includes("FERIAS") && !tipoAnterior.includes("ANULAD") && !tipoAnterior.includes("NAO EFETIVAD")) {
          saldoDisponivel += obterTotalDebitoFerias_(linhaAnterior, idx);
        }
      }

      if (totalSolicitado <= 0) {
        throw new Error("Informe uma quantidade válida de dias de férias.");
      }
      if (totalSolicitado > saldoDisponivel) {
        throw new Error("O total solicitado (" + totalSolicitado + " dias) ultrapassa o saldo disponível (" + saldoDisponivel + " dias).");
      }
    }

    // Trava para limitar quantidade de Faltas Abonadas no mesmo mês
    const ehAbonadaNormal = (tipoNormalizado.includes("ABONADA") || tipoNormalizado.includes("ABONO")) &&
                            !tipoNormalizado.includes("NATALICIA") &&
                            !tipoNormalizado.includes("ELEITORAL") &&
                            !tipoNormalizado.includes("ANULAD") &&
                            !tipoNormalizado.includes("NAO EFETIVAD");

    if (ehAbonadaNormal && dataInicio) {
      let limiteAbonadasMes = 1;
      const abaConfig = ss.getSheetByName("Configuracoes");
      if (abaConfig) {
        const configValores = abaConfig.getDataRange().getValues();
        for (let c = 1; c < configValores.length; c++) {
          if (String(configValores[c][0]).trim() === "LIMITE_ABONADAS_MES") {
            const valConfig = parseInt(configValores[c][1], 10);
            if (!isNaN(valConfig) && valConfig > 0) limiteAbonadasMes = valConfig;
            break;
          }
        }
      }

      const targetMes = dataInicio.getMonth();
      const targetAno = dataInicio.getFullYear();

      let qtdAbonadasMesAtual = 0;
      for (let r = 1; r < dados.length; r++) {
        if (linhaEdit !== -1 && (r + 1) === linhaEdit) continue;

        const linhaReg = dados[r];
        const matReg = normalizarChaveMatricula_(idx.matricula !== -1 ? linhaReg[idx.matricula] : "");
        if (matReg !== matricula) continue;

        const tReg = idx.tipo !== -1 ? normalizarCabecalho_(linhaReg[idx.tipo]) : "";
        const regEhAbonada = (tReg.includes("ABONADA") || tReg.includes("ABONO")) &&
                              !tReg.includes("NATALICIA") &&
                              !tReg.includes("ELEITORAL") &&
                              !tReg.includes("ANULAD") &&
                              !tReg.includes("NAO EFETIVAD");

        if (regEhAbonada) {
          let dtReg = null;
          if (idx.dataInicio !== -1 && linhaReg[idx.dataInicio]) {
            dtReg = parseInputDate_(linhaReg[idx.dataInicio]);
          } else if (idx.dataSolicitacao !== -1 && linhaReg[idx.dataSolicitacao]) {
            dtReg = parseInputDate_(linhaReg[idx.dataSolicitacao]);
          }

          if (dtReg && dtReg.getFullYear() === targetAno && dtReg.getMonth() === targetMes) {
            qtdAbonadasMesAtual++;
          }
        }
      }

      if (qtdAbonadasMesAtual >= limiteAbonadasMes) {
        const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const mesFormatado = mesesNomes[targetMes] + "/" + targetAno;
        throw new Error("O servidor " + servidor.nome + " (Matrícula " + matricula + ") já possui " + qtdAbonadasMesAtual + " Falta(s) Abonada(s) cadastrada(s) no mês de " + mesFormatado + ". O limite máximo permitido é de " + limiteAbonadasMes + " por mês.");
      }
    }
    
    // Constrói a linha completa para escrita em lote
    let valoresLinha = new Array(cabecalho.length).fill("");
    
    // Se for edição, aproveitamos valores existentes de auditoria que não mudam
    if (linhaEdit !== -1) {
      valoresLinha = [...dados[linhaEdit - 1]];
    }
    
    // Preenche os índices dinamicamente
    if (idx.id !== -1 && linhaEdit === -1) valoresLinha[idx.id] = Utilities.getUuid().substring(0, 8);
    if (idx.idoc !== -1) valoresLinha[idx.idoc] = dadosLanc.idoc || "";
    if (idx.dataSolicitacao !== -1) valoresLinha[idx.dataSolicitacao] = dataSolicitacao;
    if (idx.tipo !== -1) valoresLinha[idx.tipo] = tipoDoc;
    if (idx.nome !== -1) valoresLinha[idx.nome] = nomePlanilha;
    if (idx.matricula !== -1) valoresLinha[idx.matricula] = matricula;
    if (idx.dataInicio !== -1) valoresLinha[idx.dataInicio] = dataInicio || "";
    if (idx.dias !== -1) valoresLinha[idx.dias] = diasGozo;
    if (idx.diasFerias !== -1) valoresLinha[idx.diasFerias] = diasGozo;
    if (idx.diasPecunia !== -1) valoresLinha[idx.diasPecunia] = ehFeriasPecunia ? diasPecunia : 0;
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
    const idPastaAnexos = "1qsf7R8HP6iEAiP-dVoIPBor1TDO5pMBO";
    let pasta = null;
    try {
      pasta = DriveApp.getFolderById(idPastaAnexos);
    } catch(erroFolder) {
      throw new Error("A pasta destino de anexos configurada (" + idPastaAnexos + ") não foi encontrada ou você não tem permissão de acesso a ela.");
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
  const idxMat = indiceCabecalho_(cabecalho, ["MATRICULA"]);
  const idxNome = indiceCabecalho_(cabecalho, ["NOME", "NOME COMPLETO"]);
  
  for (let i = 1; i < dados.length; i++) {
    if (normalizarChaveMatricula_(dados[i][idxMat]) === normalizarChaveMatricula_(matricula)) {
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

/**
 * Resolve caminhos relativos de anexos (gerados pelo AppSheet) para URLs reais do Google Drive em lote
 */
function resolverUrlsAnexosLote(caminhos) {
  obterDadosUsuarioLogado();
  
  if (!caminhos || !Array.isArray(caminhos)) return {};
  
  const ss = obterPlanilha_();
  let pastaPai = null;
  
  try {
    const arquivoPlanilha = DriveApp.getFileById(ss.getId());
    const pastasPais = arquivoPlanilha.getParents();
    if (pastasPais.hasNext()) {
      pastaPai = pastasPais.next();
    }
  } catch (e) {
    Logger.log("Erro ao obter pasta pai da planilha: " + e.toString());
  }
  
  let mapaResultados = {};
  
  caminhos.forEach(caminho => {
    let caminhoLimpo = String(caminho || "").trim();
    if (!caminhoLimpo) {
      mapaResultados[caminho] = "";
      return;
    }
    
    // Se já for uma URL completa, retorna ela mesma
    if (caminhoLimpo.startsWith("http://") || caminhoLimpo.startsWith("https://")) {
      mapaResultados[caminho] = caminhoLimpo;
      return;
    }
    
    // Tenta resolver o caminho relativo no Drive
    if (pastaPai) {
      try {
        const partes = caminhoLimpo.split("/");
        let cursorPasta = pastaPai;
        let encontrado = true;
        
        for (let i = 0; i < partes.length - 1; i++) {
          const nomeSubpasta = partes[i];
          if (!nomeSubpasta) continue;
          const subs = cursorPasta.getFoldersByName(nomeSubpasta);
          if (subs.hasNext()) {
            cursorPasta = subs.next();
          } else {
            encontrado = false;
            break;
          }
        }
        
        if (encontrado) {
          const nomeArquivo = partes[partes.length - 1];
          const arquivos = cursorPasta.getFilesByName(nomeArquivo);
          if (arquivos.hasNext()) {
            mapaResultados[caminho] = arquivos.next().getUrl();
            return;
          }
        }
      } catch (e) {
        Logger.log("Erro ao resolver anexo: " + caminhoLimpo + " - " + e.toString());
      }
    }
    
    mapaResultados[caminho] = ""; // Fallback se não encontrar
  });
  
  return mapaResultados;
}

/**
 * Atualiza rapidamente o número do 1Doc de um lançamento
 */
function atualizar1DocLote(linhaPlanilha, novo1Doc, novoAnexo) {
  if (!verificarSeEhOperador()) throw new Error("Acesso negado: Somente Operadores podem alterar lançamentos.");
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error("Sistema ocupado, tente novamente em alguns segundos.");
  }
  
  try {
    const ss = obterPlanilha_();
    const aba = ss.getSheetByName("Lançamentos");
    if (!aba) throw new Error("Aba 'Lançamentos' não encontrada");
    
    const cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
    const idxIdoc = indiceCabecalho_(cabecalho, ["N PROC 1DOC", "1DOC", "PROTOCOLO", "N 1DOC"]) + 1;
    const indicesAnexos = [
      indiceCabecalho_(cabecalho, ["ANEXO 1", "ANEXO1"]),
      indiceCabecalho_(cabecalho, ["ANEXO 2", "ANEXO2"]),
      indiceCabecalho_(cabecalho, ["ANEXO 3", "ANEXO3"])
    ].filter(function(indice) { return indice !== -1; });
    const idxEditadoPor = indiceCabecalho_(cabecalho, ["EDITADO POR"]) + 1;
    const idxEditadoEm = indiceCabecalho_(cabecalho, ["EDITADO EM"]) + 1;
    
    if (idxIdoc === 0) throw new Error("Coluna 1doc não encontrada");
    const linhaNumero = Number(linhaPlanilha);
    if (!Number.isInteger(linhaNumero) || linhaNumero < 2 || linhaNumero > aba.getLastRow()) {
      throw new Error("Linha do lançamento inválida.");
    }

    const anexoLimpo = String(novoAnexo || '').trim();
    if (anexoLimpo) {
      if (!extrairIdArquivoDrive_(anexoLimpo)) throw new Error("O novo anexo não é um link válido do Google Drive.");
      if (!indicesAnexos.length) throw new Error("Colunas de anexo não encontradas.");
      const anexosAtuais = indicesAnexos.map(function(indice) {
        return String(aba.getRange(linhaNumero, indice + 1).getDisplayValue() || '').trim();
      }).filter(function(valor) { return valor && valor !== 'undefined'; });
      if (anexosAtuais.length) throw new Error("Este lançamento já possui anexo. Use a edição completa para alterá-lo.");
    }
    
    aba.getRange(linhaNumero, idxIdoc).setValue(novo1Doc || "");
    if (anexoLimpo) aba.getRange(linhaNumero, indicesAnexos[0] + 1).setValue(anexoLimpo);
    
    const emailUsuario = Session.getActiveUser().getEmail();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    
    if (idxEditadoPor > 0) aba.getRange(linhaNumero, idxEditadoPor).setValue(emailUsuario);
    if (idxEditadoEm > 0) aba.getRange(linhaNumero, idxEditadoEm).setValue(timestamp);
    
    lancarLogSemLock_("ATUALIZAR_1DOC", "Lançamentos", "Atualizou o 1Doc (Linha " + linhaNumero + ") para " + (novo1Doc || "vazio") + (anexoLimpo ? " e adicionou anexo" : ""), "Lançamento", "", novo1Doc, novo1Doc);
    return { atualizado: true, anexoAdicionado: anexoLimpo };
  } finally {
    lock.releaseLock();
  }
}

/** Extrai o ID apenas de enderecos oficiais do Google Drive/Docs. */
function extrairIdArquivoDrive_(endereco) {
  const valor = String(endereco || '').trim();
  if (!/^https:\/\//i.test(valor)) return '';
  if (!/^https:\/\/(?:drive|docs)\.google\.com\//i.test(valor)) return '';
  const porCaminho = valor.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (porCaminho) return porCaminho[1];
  const porParametro = valor.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return porParametro ? porParametro[1] : '';
}

/**
 * Impede que um ID arbitrario do Drive do proprietario seja usado para baixar
 * arquivos que nao pertencem a nenhum lancamento cadastrado.
 */
function anexoEstaCadastrado_(ss, caminho, idArquivo) {
  const aba = ss.getSheetByName('Lançamentos');
  if (!aba || aba.getLastRow() < 2) return false;
  const cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  const idx = obterIndicesColunasLancamentos_(cabecalho);
  const colunas = [idx.anexo1, idx.anexo2, idx.anexo3].filter(function(indice) { return indice !== -1; });
  if (!colunas.length) return false;
  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getDisplayValues();
  const solicitado = String(caminho || '').trim();
  for (let i = 0; i < dados.length; i++) {
    for (let j = 0; j < colunas.length; j++) {
      const cadastrado = String(dados[i][colunas[j]] || '').trim();
      if (!cadastrado) continue;
      if (cadastrado === solicitado) return true;
      if (idArquivo && extrairIdArquivoDrive_(cadastrado) === idArquivo) return true;
    }
  }
  return false;
}

function respostaDownloadAnexo_(arquivo) {
  const blob = arquivo.getBlob();
  return {
    nome: arquivo.getName(),
    mimeType: blob.getContentType(),
    b64: Utilities.base64Encode(blob.getBytes())
  };
}

function obterAnexoBase64(caminho) {
  obterDadosUsuarioLogado(); // Verifica token e permissões
  
  let caminhoLimpo = String(caminho || "").trim();
  if (!caminhoLimpo) throw new Error("Caminho inválido.");
  const ss = obterPlanilha_();

  if (/^https?:\/\//i.test(caminhoLimpo)) {
    const idArquivo = extrairIdArquivoDrive_(caminhoLimpo);
    if (!idArquivo) throw new Error("O anexo não é um link válido do Google Drive.");
    if (!anexoEstaCadastrado_(ss, caminhoLimpo, idArquivo)) {
      throw new Error("Este arquivo não está vinculado a um lançamento cadastrado.");
    }
    try {
      return respostaDownloadAnexo_(DriveApp.getFileById(idArquivo));
    } catch (e) {
      throw new Error("O arquivo não foi encontrado no Drive ou o sistema não possui acesso.");
    }
  }

  if (!anexoEstaCadastrado_(ss, caminhoLimpo, '')) {
    throw new Error("Este anexo não está vinculado a um lançamento cadastrado.");
  }

  let pastaPai = null;
  try {
    pastaPai = DriveApp.getFileById(ss.getId()).getParents().next();
  } catch (e) {
    throw new Error("Erro ao obter pasta raiz do sistema.");
  }
  
  const partes = caminhoLimpo.split("/");
  let cursorPasta = pastaPai;
  
  for (let i = 0; i < partes.length - 1; i++) {
    const nomeSubpasta = partes[i];
    if (!nomeSubpasta) continue;
    const subs = cursorPasta.getFoldersByName(nomeSubpasta);
    if (subs.hasNext()) {
      cursorPasta = subs.next();
    } else {
      throw new Error("Pasta não encontrada no Drive.");
    }
  }
  
  const nomeArquivo = partes[partes.length - 1];
  const arquivos = cursorPasta.getFilesByName(nomeArquivo);
  if (arquivos.hasNext()) {
    return respostaDownloadAnexo_(arquivos.next());
  }
  
  throw new Error("Arquivo não encontrado no Drive.");
}
