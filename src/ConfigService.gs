/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio Administrativo e Configurações (ConfigService)
 */

/**
 * Retorna todos os usuários cadastrados no sistema
 */
function obterListaUsuarios() {
  if (!verificarSeEhAdmin()) {
    throw new Error("Você não possui permissão para gerenciar usuários.");
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Usuarios");
  if (!aba) return [];
  
  const dados = aba.getDataRange().getValues();
  let usuarios = [];
  
  for (let i = 1; i < dados.length; i++) {
    usuarios.push({
      email: String(dados[i][0]).toLowerCase().trim(),
      nome: String(dados[i][1]).trim(),
      papel: String(dados[i][2]).trim(),
      ativo: String(dados[i][3]).trim(),
      linhaPlanilha: i + 1
    });
  }
  
  return usuarios;
}

/**
 * Cadastra ou edita um usuário do sistema (com LockService para concorrência)
 */
function salvarUsuario(usuario) {
  if (!verificarSeEhAdmin()) {
    throw new Error("Você não possui permissão para gerenciar usuários.");
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error("Sistema ocupado. Não foi possível gerenciar o usuário agora.");
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName("Usuarios");
    if (!aba) throw new Error("Aba 'Usuarios' não encontrada.");
    
    const dados = aba.getDataRange().getValues();
    const emailBusca = String(usuario.email).toLowerCase().trim();
    let linhaEdit = -1;
    let valorAntes = "";
    
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).toLowerCase().trim() === emailBusca) {
        linhaEdit = i + 1;
        valorAntes = JSON.stringify(dados[i]);
        break;
      }
    }
    
    if (linhaEdit !== -1) {
      aba.getRange(linhaEdit, 2).setValue(usuario.nome.toUpperCase());
      aba.getRange(linhaEdit, 3).setValue(usuario.papel);
      aba.getRange(linhaEdit, 4).setValue(usuario.ativo);
      
      lancarLog("EDITAR_USUARIO", "Usuarios", "Atualizou permissões do e-mail " + emailBusca, "Usuário", valorAntes, JSON.stringify(usuario), emailBusca);
    } else {
      aba.appendRow([
        emailBusca,
        usuario.nome.toUpperCase(),
        usuario.papel,
        "Sim" // Novo usuário inicia Ativo por padrão
      ]);
      lancarLog("CRIAR_USUARIO", "Usuarios", "Cadastrou novo usuário: " + emailBusca, "", "", JSON.stringify(usuario), emailBusca);
    }
    
    return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Desativa/Exclui logicamente um usuário
 */
function desativarUsuario(email) {
  if (!verificarSeEhAdmin()) {
    throw new Error("Você não possui permissão para gerenciar usuários.");
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Usuarios");
  if (!aba) throw new Error("Aba 'Usuarios' não encontrada.");
  
  const dados = aba.getDataRange().getValues();
  const emailBusca = String(email).toLowerCase().trim();
  
  // Impede que o usuário logado desative a si próprio
  const emailAtivo = Session.getActiveUser().getEmail().toLowerCase().trim();
  if (emailBusca === emailAtivo) {
    throw new Error("Você não pode desativar o seu próprio usuário administrador.");
  }
  
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).toLowerCase().trim() === emailBusca) {
      const linhaPlanilha = i + 1;
      aba.getRange(linhaPlanilha, 4).setValue("Não");
      lancarLog("DESATIVAR_USUARIO", "Usuarios", "Desativou acesso do usuário " + emailBusca, "Ativo", "Sim", "Não", emailBusca);
      return true;
    }
  }
  
  throw new Error("Usuário não encontrado.");
}

/**
 * Retorna todos os tipos de documentos cadastrados
 */
function obterListaTiposDocumento() {
  obterDadosUsuarioLogado();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Tipos_Documento");
  if (!aba) return [];
  
  const dados = aba.getDataRange().getValues();
  let tipos = [];
  
  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    tipos.push({
      id: String(linha[0]).trim(),
      nome: String(linha[1]).trim(),
      contaFerias: String(linha[2]).trim(),
      contaAbonadas: String(linha[3]).trim(),
      camposVisiveis: String(linha[4]).trim(),
      ativo: String(linha[5]).trim(),
      linhaPlanilha: i + 1
    });
  }
  
  return tipos;
}

/**
 * Retorna todas as configurações globais do sistema
 */
function obterListaConfiguracoes() {
  if (!verificarSeEhAdmin()) {
    throw new Error("Você não possui permissão para visualizar configurações.");
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("Configuracoes");
  if (!aba) return [];
  
  const dados = aba.getDataRange().getValues();
  let configs = [];
  
  for (let i = 1; i < dados.length; i++) {
    configs.push({
      chave: String(dados[i][0]).trim(),
      valor: String(dados[i][1]).trim(),
      descricao: String(dados[i][2]).trim(),
      linhaPlanilha: i + 1
    });
  }
  
  return configs;
}

/**
 * Atualiza um valor de parametrização geral (com LockService para concorrência)
 */
function salvarConfiguracao(config) {
  if (!verificarSeEhAdmin()) {
    throw new Error("Você não possui permissão para alterar configurações.");
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error("Sistema ocupado. Não foi possível salvar a configuração agora.");
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName("Configuracoes");
    if (!aba) throw new Error("Aba 'Configuracoes' não encontrada.");
    
    const linha = parseInt(config.linhaPlanilha);
    if (linha > 1) {
      const valorAntes = aba.getRange(linha, 2).getValue();
      aba.getRange(linha, 2).setValue(config.valor);
      
      lancarLog(
        "EDITAR_CONFIG", 
        "Configuracoes", 
        "Alterou configuração da chave " + config.chave + " para: " + config.valor, 
        config.chave, 
        String(valorAntes), 
        String(config.valor), 
        config.chave
      );
      return true;
    }
    
    throw new Error("Configuração inválida.");
  } finally {
    lock.releaseLock();
  }
}
