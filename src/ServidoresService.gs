/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio dos Servidores (ServidoresService)
 */

/**
 * Retorna a lista de todos os servidores cadastrados para exibição na interface (Performance O(N+M))
 */
function obterListaServidores() {
  obterDadosUsuarioLogado();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Servidores");
  if (!aba) return [];
  
  const dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];
  
  const cabecalho = dados[0];
  
  const idxNome = cabecalho.indexOf("NOME");
  const idxMatricula = cabecalho.indexOf("MATRÍCULA");
  const idxCargo = cabecalho.indexOf("CARGO");
  const idxLotacao = cabecalho.indexOf("LOTAÇÃO");
  const idxAdmissao = cabecalho.indexOf("Data de Admissão");
  const idxSituacao = cabecalho.indexOf("SITUAÇÃO");
  const idxEmail = cabecalho.indexOf("E-mail");
  const idxSaldoHoje = cabecalho.indexOf("Férias | Saldo Hoje");
  const idxProjetado = cabecalho.indexOf("Projetado (este ano)");
  const idxInfoFerias = cabecalho.indexOf("Info_Férias");
  const idxAtivo = cabecalho.indexOf("Ativo");
  
  // Otimização O(N + M): Carrega status de ausentes em lote para evitar leituras consecutivas
  const mapaStatus = construirMapaStatusServidores_(ss);
  
  let servidores = [];
  
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    let matricula = String(linha[idxMatricula]).trim();
    if (!matricula) continue;
    
    let ativo = idxAtivo !== -1 ? String(linha[idxAtivo]).trim() : "Sim";
    let statusText = "Ativo";
    
    if (ativo === "Não") {
      statusText = "Inativo";
    } else {
      statusText = mapaStatus[matricula] || "Ativo";
    }
    
    servidores.push({
      nome: String(linha[idxNome]).trim(),
      matricula: matricula,
      cargo: idxCargo !== -1 ? String(linha[idxCargo]).trim() : "",
      lotacao: idxLotacao !== -1 ? String(linha[idxLotacao]).trim() : "",
      admissao: idxAdmissao !== -1 ? formatarDataServidor_(linha[idxAdmissao]) : "",
      admissaoBruta: idxAdmissao !== -1 ? linha[idxAdmissao] : null,
      situacao: idxSituacao !== -1 ? String(linha[idxSituacao]).trim() : "",
      email: idxEmail !== -1 ? String(linha[idxEmail]).trim() : "",
      saldoHoje: idxSaldoHoje !== -1 ? parseInt(linha[idxSaldoHoje]) || 0 : 0,
      projetado: idxProjetado !== -1 ? parseInt(linha[idxProjetado]) || 0 : 0,
      infoFerias: idxInfoFerias !== -1 ? String(linha[idxInfoFerias]).trim() : "",
      status: statusText,
      linhaPlanilha: i + 1
    });
  }
  
  // Ordena por nome
  servidores.sort((a, b) => a.nome.localeCompare(b.nome));
  return servidores;
}

/**
 * Salva ou atualiza um cadastro de servidor com cópia automática de fórmulas e escrita em lote
 */
function salvarServidor(dadosServidor) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para salvar ou alterar cadastros de servidores.");
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error("Sistema ocupado. Tente novamente em alguns segundos.");
  }

  try {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Servidores");
  if (!aba) throw new Error("Aba 'Servidores' não encontrada.");

  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];

  const idxNome = cabecalho.indexOf("NOME");
  const idxMatricula = cabecalho.indexOf("MATRÍCULA");
  const idxCargo = cabecalho.indexOf("CARGO");
  const idxLotacao = cabecalho.indexOf("LOTAÇÃO");
  const idxAdmissao = cabecalho.indexOf("Data de Admissão");
  const idxSituacao = cabecalho.indexOf("SITUAÇÃO");
  const idxEmail = cabecalho.indexOf("E-mail");
  const idxAtivo = cabecalho.indexOf("Ativo");

  const matriculaBusca = String(dadosServidor.matricula).trim();
  let linhaEdit = -1;
  let valorAntes = "";

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idxMatricula]).trim() === matriculaBusca) {
      linhaEdit = i + 1;
      valorAntes = JSON.stringify(dados[i]);
      break;
    }
  }

  // Trata a Data de Admissão
  let dataAdmissao = null;
  if (dadosServidor.admissao) {
    let partes = dadosServidor.admissao.split('-');
    if (partes.length === 3) {
      dataAdmissao = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
      dataAdmissao.setHours(0,0,0,0);
    }
  }
  
  if (linhaEdit !== -1) {
    // MODO EDIÇÃO: Atualiza apenas as células de dados usando lote por segurança de fórmulas
    if (idxNome !== -1) aba.getRange(linhaEdit, idxNome + 1).setValue(dadosServidor.nome.toUpperCase());
    if (idxCargo !== -1) aba.getRange(linhaEdit, idxCargo + 1).setValue(dadosServidor.cargo);
    if (idxLotacao !== -1) aba.getRange(linhaEdit, idxLotacao + 1).setValue(dadosServidor.lotacao);
    if (idxAdmissao !== -1 && dataAdmissao) aba.getRange(linhaEdit, idxAdmissao + 1).setValue(dataAdmissao);
    if (idxSituacao !== -1) aba.getRange(linhaEdit, idxSituacao + 1).setValue(dadosServidor.situacao);
    if (idxEmail !== -1) aba.getRange(linhaEdit, idxEmail + 1).setValue(dadosServidor.email);
    if (idxAtivo !== -1) aba.getRange(linhaEdit, idxAtivo + 1).setValue(dadosServidor.ativo || "Sim");

    lancarLogSemLock_("EDITAR_SERVIDOR", "Servidores", "Atualizou dados do servidor: " + dadosServidor.nome + " (Matrícula: " + matriculaBusca + ")", "Cadastro", valorAntes, JSON.stringify(dadosServidor), matriculaBusca);
  } else {
    // MODO CRIAÇÃO: Valida duplicidade de matrícula e adiciona nova linha copiando fórmulas da superior
    // Validação de matrícula única (dentro do lock para thread-safety)
    if (linhaEdit === -1) {
      // garante que nenhuma outra requisição concorrente inseriu a mesma matrícula
      const dadosAtual = aba.getDataRange().getValues();
      for (let k = 1; k < dadosAtual.length; k++) {
        if (String(dadosAtual[k][idxMatricula]).trim() === matriculaBusca) {
          throw new Error("Já existe um servidor cadastrado com a matrícula " + matriculaBusca + ".");
        }
      }
    }

    const novaLinhaIndex = aba.getLastRow() + 1;

    if (novaLinhaIndex > 2) {
      const rangeOrigem = aba.getRange(novaLinhaIndex - 1, 1, 1, cabecalho.length);
      const rangeDestino = aba.getRange(novaLinhaIndex, 1, 1, cabecalho.length);
      rangeOrigem.copyTo(rangeDestino, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
      rangeOrigem.copyTo(rangeDestino, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }

    if (idxNome !== -1) aba.getRange(novaLinhaIndex, idxNome + 1).setValue(dadosServidor.nome.toUpperCase());
    if (idxMatricula !== -1) aba.getRange(novaLinhaIndex, idxMatricula + 1).setValue(matriculaBusca);
    if (idxCargo !== -1) aba.getRange(novaLinhaIndex, idxCargo + 1).setValue(dadosServidor.cargo);
    if (idxLotacao !== -1) aba.getRange(novaLinhaIndex, idxLotacao + 1).setValue(dadosServidor.lotacao);
    if (idxAdmissao !== -1 && dataAdmissao) aba.getRange(novaLinhaIndex, idxAdmissao + 1).setValue(dataAdmissao);
    if (idxSituacao !== -1) aba.getRange(novaLinhaIndex, idxSituacao + 1).setValue(dadosServidor.situacao);
    if (idxEmail !== -1) aba.getRange(novaLinhaIndex, idxEmail + 1).setValue(dadosServidor.email);
    if (idxAtivo !== -1) aba.getRange(novaLinhaIndex, idxAtivo + 1).setValue("Sim");

    lancarLogSemLock_("CRIAR_SERVIDOR", "Servidores", "Cadastrou novo servidor: " + dadosServidor.nome + " (Matrícula: " + matriculaBusca + ")", "", "", JSON.stringify(dadosServidor), matriculaBusca);

    try {
      gerarCreditosAutomaticos();
    } catch(e) {
      lancarLogSemLock_("ERRO_AUTO_CREDITOS", "Creditos_Ferias", "Erro ao gerar créditos automáticos para novo cadastro: " + e.toString(), "", "", "", matriculaBusca);
    }
  }

  return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Desativa um servidor (Soft Delete) para manter consistência de histórico
 */
function desativarServidor(matricula) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para desativar cadastros de servidores.");
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Servidores");
  if (!aba) throw new Error("Aba 'Servidores' não encontrada.");
  
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  const idxMatricula = cabecalho.indexOf("MATRÍCULA");
  const idxAtivo = cabecalho.indexOf("Ativo");
  
  if (idxAtivo === -1) {
    throw new Error("Coluna 'Ativo' de controle de status não encontrada. Execute o setup novamente.");
  }
  
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idxMatricula]).trim() === String(matricula).trim()) {
      const linhaPlanilha = i + 1;
      aba.getRange(linhaPlanilha, idxAtivo + 1).setValue("Não");
      
      let nome = dados[i][cabecalho.indexOf("NOME")];
      lancarLog("DESATIVAR_SERVIDOR", "Servidores", "Desativou cadastro do servidor: " + nome + " (Matrícula: " + matricula + ")", "Ativo", "Sim", "Não", matricula);
      return true;
    }
  }
  
  throw new Error("Servidor com matrícula " + matricula + " não encontrado.");
}

/**
 * Constrói um mapa em memória dos status dos servidores (Evitando NxM leituras na planilha)
 */
function construirMapaStatusServidores_(ss) {
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (!abaLanc) return {};
  
  const dadosLanc = abaLanc.getDataRange().getValues();
  if (dadosLanc.length <= 1) return {};
  
  const cabecalho = dadosLanc[0];
  const colIdxTipo = cabecalho.indexOf("Tipo");
  const colIdxMat = cabecalho.indexOf("MATRÍCULA");
  const colIdxDataIni = cabecalho.indexOf("Data de Início");
  const colIdxDias = cabecalho.indexOf("Dias");
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  let mapa = {};
  
  for (let i = 1; i < dadosLanc.length; i++) {
    let linha = dadosLanc[i];
    let mat = String(linha[colIdxMat]).trim();
    let tipoDoc = String(linha[colIdxTipo]).trim().toLowerCase();
    
    // Ignora anulados
    if (tipoDoc.includes("não efetivado") || tipoDoc.includes("anulado")) continue;
    
    let dataInicio = normalizarDataServidorObjeto_(linha[colIdxDataIni]);
    if (!dataInicio) continue;
    
    let dias = parseInt(linha[colIdxDias]) || 1;
    let dataFim = new Date(dataInicio);
    dataFim.setDate(dataInicio.getDate() + (dias - 1));
    dataFim.setHours(0, 0, 0, 0);
    
    // Verifica se a ausência está ocorrendo hoje
    if (hoje >= dataInicio && hoje <= dataFim) {
      if (tipoDoc.includes("férias") || tipoDoc.includes("ferias")) {
        mapa[mat] = "Férias";
      } else if (tipoDoc.includes("abonada") || tipoDoc.includes("abono")) {
        mapa[mat] = "Abono";
      }
    }
  }
  
  return mapa;
}

/**
 * Função auxiliar privada de normalização de data
 */
function normalizarDataServidorObjeto_(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    valor.setHours(0, 0, 0, 0);
    return valor;
  }
  let stringData = String(valor).trim().split(" ")[0];
  if (stringData.includes('/')) {
    var partes = stringData.split('/');
    if (partes.length === 3) {
      var d = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  return null;
}

/**
 * Formata datas em string BR
 */
function formatarDataServidor_(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  return String(data);
}
