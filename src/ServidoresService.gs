/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio dos Servidores (ServidoresService)
 */

/**
 * Retorna a lista de todos os servidores cadastrados para exibição na interface
 */
function obterListaServidores() {
  // Garante acesso autorizado
  obterDadosUsuarioLogado();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Servidores");
  if (!aba) return [];
  
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  
  // Mapeamento de índices das colunas
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
  
  let servidores = [];
  
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    let matricula = String(linha[idxMatricula]).trim();
    if (!matricula) continue;
    
    // Determina o status com base em Lançamentos Ativos de Férias/Abono
    let statusText = "Ativo";
    let ativo = idxAtivo !== -1 ? String(linha[idxAtivo]).trim() : "Sim";
    
    if (ativo === "Não") {
      statusText = "Inativo";
    } else {
      statusText = determinarStatusAtualServidor(ss, matricula);
    }
    
    servidores.push({
      nome: String(linha[idxNome]).trim(),
      matricula: matricula,
      cargo: idxCargo !== -1 ? String(linha[idxCargo]).trim() : "",
      lotacao: idxLotacao !== -1 ? String(linha[idxLotacao]).trim() : "",
      admissao: idxAdmissao !== -1 ? formatarDataServidor(linha[idxAdmissao]) : "",
      admissaoBruta: idxAdmissao !== -1 ? linha[idxAdmissao] : null,
      situacao: idxSituacao !== -1 ? String(linha[idxSituacao]).trim() : "",
      email: idxEmail !== -1 ? String(linha[idxEmail]).trim() : "",
      saldoHoje: idxSaldoHoje !== -1 ? parseInt(linha[idxSaldoHoje]) || 0 : 0,
      projetado: idxProjetado !== -1 ? parseInt(linha[idxProjetado]) || 0 : 0,
      infoFerias: idxInfoFerias !== -1 ? String(linha[idxInfoFerias]).trim() : "",
      status: statusText,
      linhaPlanilha: i + 1 // útil para edições rápidas
    });
  }
  
  // Ordena por nome
  servidores.sort((a, b) => a.nome.localeCompare(b.nome));
  return servidores;
}

/**
 * Salva ou atualiza um cadastro de servidor
 */
function salvarServidor(dadosServidor) {
  // Exige perfil Operador ou superior
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para salvar ou alterar cadastros de servidores.");
  }
  
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
  
  // Procura se o servidor já existe
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
    // Modo Edição: Atualiza campos específicos
    if (idxNome !== -1) aba.getRange(linhaEdit, idxNome + 1).setValue(dadosServidor.nome);
    if (idxCargo !== -1) aba.getRange(linhaEdit, idxCargo + 1).setValue(dadosServidor.cargo);
    if (idxLotacao !== -1) aba.getRange(linhaEdit, idxLotacao + 1).setValue(dadosServidor.lotacao);
    if (idxAdmissao !== -1 && dataAdmissao) aba.getRange(linhaEdit, idxAdmissao + 1).setValue(dataAdmissao);
    if (idxSituacao !== -1) aba.getRange(linhaEdit, idxSituacao + 1).setValue(dadosServidor.situacao);
    if (idxEmail !== -1) aba.getRange(linhaEdit, idxEmail + 1).setValue(dadosServidor.email);
    if (idxAtivo !== -1) aba.getRange(linhaEdit, idxAtivo + 1).setValue(dadosServidor.ativo || "Sim");
    
    lancarLog("EDITAR_SERVIDOR", "Servidores", "Atualizou dados do servidor: " + dadosServidor.nome + " (Matrícula: " + matriculaBusca + ")", "Cadastro", valorAntes, JSON.stringify(dadosServidor), matriculaBusca);
  } else {
    // Modo Criação: Insere nova linha estruturada
    // Como a planilha possui colunas calculadas via fórmula à direita, criamos um array de linha completo
    let novaLinha = [];
    cabecalho.forEach((col, idx) => {
      if (idx === idxNome) novaLinha.push(dadosServidor.nome);
      else if (idx === idxMatricula) novaLinha.push(matriculaBusca);
      else if (idx === idxCargo) novaLinha.push(dadosServidor.cargo);
      else if (idx === idxLotacao) novaLinha.push(dadosServidor.lotacao);
      else if (idx === idxAdmissao) novaLinha.push(dataAdmissao);
      else if (idx === idxSituacao) novaLinha.push(dadosServidor.situacao);
      else if (idx === idxEmail) novaLinha.push(dadosServidor.email);
      else if (idx === idxAtivo) novaLinha.push("Sim");
      else novaLinha.push(""); // Deixa vazio para fórmulas da planilha calcularem
    });
    
    aba.appendRow(novaLinha);
    lancarLog("CRIAR_SERVIDOR", "Servidores", "Cadastrou novo servidor: " + dadosServidor.nome + " (Matrícula: " + matriculaBusca + ")", "", "", JSON.stringify(dadosServidor), matriculaBusca);
    
    // Roda automaticamente a rotina de gerar períodos aquisitivos de férias após cadastrar
    try {
      gerarCreditosAutomaticos(); 
    } catch(e) {
      lancarLog("ERRO_AUTO_CREDITOS", "Creditos_Ferias", "Erro ao gerar créditos automáticos para novo cadastro: " + e.toString(), "", "", "", matriculaBusca);
    }
  }
  
  return true;
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
 * Determina dinamicamente se o funcionário está em férias ou abono HOJE
 */
function determinarStatusAtualServidor(ss, matricula) {
  const abaLanc = ss.getSheetByName("Lançamentos");
  if (!abaLanc) return "Ativo";
  
  const dadosLanc = abaLanc.getDataRange().getValues();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  const COL_TIPO = 3;        // Coluna C
  const COL_DATA_INICIO = 9; // Coluna I
  const COL_DIAS = 13;       // Coluna M
  const COL_MATRICULA = 6;   // Coluna F
  
  for (let i = 1; i < dadosLanc.length; i++) {
    let linha = dadosLanc[i];
    let matLanc = String(linha[COL_MATRICULA - 1]).trim();
    
    if (matLanc === matricula) {
      let tipoDoc = String(linha[COL_TIPO - 1]).trim().toLowerCase();
      
      // Ignora registros anulados
      if (tipoDoc.includes("não efetivado") || tipoDoc.includes("anulado")) continue;
      
      let dataInicio = normalizarDataServidorObjeto(linha[COL_DATA_INICIO - 1]);
      if (!dataInicio) continue;
      
      let dias = parseInt(linha[COL_DIAS - 1]) || 1;
      let dataFim = new Date(dataInicio);
      dataFim.setDate(dataInicio.getDate() + (dias - 1));
      dataFim.setHours(0, 0, 0, 0);
      
      if (hoje >= dataInicio && hoje <= dataFim) {
        if (tipoDoc.includes("férias") || tipoDoc.includes("ferias")) {
          return "Férias";
        } else if (tipoDoc.includes("abonada") || tipoDoc.includes("abono")) {
          return "Abono";
        }
      }
    }
  }
  
  return "Ativo";
}

/**
 * Função auxiliar de normalização de data
 */
function normalizarDataServidorObjeto(valor) {
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

function formatarDataServidor(data) {
  if (!data) return "";
  if (data instanceof Date) {
    if (isNaN(data.getTime())) return "";
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  return String(data);
}
