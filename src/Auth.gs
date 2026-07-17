/**
 * RH Central de Documentos v2.0
 * Módulo de Autenticação Customizada e Sessão
 */

let _usuarioSessaoAtual = null;

function gerarHashSenha(senha) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha, Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    const v = (byte < 0) ? 256 + byte : byte;
    return ("0" + v.toString(16)).slice(-2);
  }).join("");
}

function gerarTokenAleatorio() {
  return Utilities.getUuid();
}

function verificarSessao(token) {
  if (!token) throw new Error("Acesso negado: Token de sessão não fornecido.");
  const cache = CacheService.getScriptCache();
  const dadosString = cache.get("rh_sessao_" + token);
  if (!dadosString) {
    throw new Error("Sua sessão expirou ou é inválida. Faça login novamente.");
  }
  
  const usuario = JSON.parse(dadosString);
  if (!usuario || !usuario.email || !usuario.ativo) {
    throw new Error("Sua conta de usuário está inativa no sistema.");
  }
  
  _usuarioSessaoAtual = usuario;
  return usuario;
}

function obterDadosUsuarioLogado() {
  if (_usuarioSessaoAtual) return _usuarioSessaoAtual;
  
  const emailAtivo = Session.getEffectiveUser().getEmail();
  const ss = obterPlanilha_();
  throw new Error("Usuário não autenticado na sessão atual.");
}

function verificarSeEhAdmin() {
  try {
    const usuario = obterDadosUsuarioLogado();
    return usuario.papel === "Administrador" || usuario.papel === "Admin";
  } catch (e) {
    return false;
  }
}

function verificarSeEhOperador() {
  try {
    const usuario = obterDadosUsuarioLogado();
    return usuario.papel === "Administrador" || usuario.papel === "Admin" || usuario.papel === "Operador";
  } catch (e) {
    return false;
  }
}

/** 
 * Wrapper para TODAS as chamadas do frontend
 */
function executarApiBackend(token, funcName, args) {
  // Validate token BEFORE calling the function
  verificarSessao(token);
  
  const func = globalThis[funcName] || this[funcName];
  if (typeof func !== 'function') {
    throw new Error("Função não encontrada no servidor: " + funcName);
  }
  
  return func.apply(this, args);
}

/**
 * Verifica o status de um e-mail para o fluxo de login em 2 etapas
 */
function verificarStatusEmail(email) {
  const emailBusca = String(email).toLowerCase().trim();
  if (!emailBusca) throw new Error("E-mail é obrigatório.");
  
  const ss = obterPlanilha_();
  const abaUsuarios = ss.getSheetByName("Usuarios");
  const dados = abaUsuarios.getDataRange().getValues();
  
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).toLowerCase().trim() === emailBusca) {
      if (String(dados[i][3]).trim() !== "Sim") {
        throw new Error("Sua conta de usuário está inativa no sistema.");
      }
      return { 
        existe: true, 
        temSenha: !!String(dados[i][4] || "").trim() 
      };
    }
  }
  
  // Verifica se é o Admin Inicial
  const emailAdminInicial = String(PropertiesService.getScriptProperties().getProperty("EMAIL_ADMIN_INICIAL_RH") || "").toLowerCase().trim();
  if (emailAdminInicial && emailBusca === emailAdminInicial) {
    return { existe: true, temSenha: false };
  }
  
  throw new Error("E-mail não encontrado ou não autorizado.");
}

/**
 * Função de Login
 */
function fazerLogin(email, senha) {
  const emailBusca = String(email).toLowerCase().trim();
  if (!emailBusca || !senha) throw new Error("E-mail e senha são obrigatórios.");
  
  const ss = obterPlanilha_();
  const abaUsuarios = ss.getSheetByName("Usuarios");
  if (!abaUsuarios) throw new Error("Aba 'Usuarios' de controle de acesso não encontrada.");
  
  const dados = abaUsuarios.getDataRange().getValues();
  let usuarioValido = null;
  let linhaEdit = -1;
  let hashSalvo = "";
  
  for (let i = 1; i < dados.length; i++) {
    let emailCadastrado = String(dados[i][0]).toLowerCase().trim();
    if (emailCadastrado === emailBusca) {
      if (String(dados[i][3]).trim() !== "Sim") {
        throw new Error("Sua conta de usuário está inativa no sistema.");
      }
      usuarioValido = {
        email: emailBusca,
        nome: String(dados[i][1]).trim(),
        papel: String(dados[i][2]).trim(),
        ativo: true
      };
      hashSalvo = String(dados[i][4] || "").trim(); // Coluna 5: SenhaHash
      linhaEdit = i + 1;
      break;
    }
  }
  
  // O Email do Admin Principal configurado no Properties pode ser criado dinamicamente se não existir
  if (!usuarioValido) {
    const emailAdminInicial = String(PropertiesService.getScriptProperties().getProperty("EMAIL_ADMIN_INICIAL_RH") || "").toLowerCase().trim();
    if (emailAdminInicial && emailBusca === emailAdminInicial) {
      const nomePadrao = emailBusca.split("@")[0].toUpperCase();
      abaUsuarios.appendRow([
        emailBusca,
        nomePadrao,
        "Administrador",
        "Sim",
        "" // Senha vazia, será pedido no primeiro login
      ]);
      throw new Error("PRIMEIRO_ACESSO");
    }
    throw new Error("E-mail não autorizado a acessar este sistema.");
  }
  
  if (!hashSalvo) {
    throw new Error("PRIMEIRO_ACESSO");
  }
  
  const hashTentativa = gerarHashSenha(senha);
  if (hashTentativa !== hashSalvo) {
    throw new Error("Senha incorreta.");
  }
  
  // Sucesso no login, gerar token válido por 24h
  const token = gerarTokenAleatorio();
  CacheService.getScriptCache().put("rh_sessao_" + token, JSON.stringify(usuarioValido), 86400);
  
  return {
    token: token,
    usuario: usuarioValido
  };
}

function definirSenhaPrimeiroAcesso(email, novaSenha) {
  const emailBusca = String(email).toLowerCase().trim();
  if (!emailBusca || !novaSenha) throw new Error("E-mail e senha são obrigatórios.");
  if (novaSenha.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = obterPlanilha_();
    const abaUsuarios = ss.getSheetByName("Usuarios");
    const dados = abaUsuarios.getDataRange().getValues();
    
    let usuarioValido = null;
    let linhaEdit = -1;
    let hashSalvo = "";
    
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).toLowerCase().trim() === emailBusca) {
        if (String(dados[i][3]).trim() !== "Sim") throw new Error("Sua conta está inativa.");
        usuarioValido = {
          email: emailBusca,
          nome: String(dados[i][1]).trim(),
          papel: String(dados[i][2]).trim(),
          ativo: true
        };
        hashSalvo = String(dados[i][4] || "").trim();
        linhaEdit = i + 1;
        break;
      }
    }
    
    if (!usuarioValido) throw new Error("E-mail não encontrado no sistema.");
    if (hashSalvo) throw new Error("A senha já foi definida para este usuário. Use a tela de login normal.");
    
    const hashGerado = gerarHashSenha(novaSenha);
    abaUsuarios.getRange(linhaEdit, 5).setValue(hashGerado);
    
    const token = gerarTokenAleatorio();
    CacheService.getScriptCache().put("rh_sessao_" + token, JSON.stringify(usuarioValido), 86400);
    
    lancarLogSemLock_("PRIMEIRO_ACESSO", "Usuarios", "Usuário definiu a senha de primeiro acesso.", "", "", "", emailBusca);
    
    return {
      token: token,
      usuario: usuarioValido
    };
  } finally {
    lock.releaseLock();
  }
}
