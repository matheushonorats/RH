/**
 * RH Central de Documentos v2.0
 * Módulo de Autenticação e Controle de Acesso (Auth)
 */

/**
 * Retorna as informações do usuário atualmente logado no Google.
 * Esta função é chamada pela interface do cliente ao iniciar.
 * 
 * Se o usuário for o proprietário do script/planilha e a tabela Usuarios estiver vazia
 * ou ele não estiver nela, ele será automaticamente inserido como Administrador.
 */
function obterDadosUsuarioLogado() {
  const emailAtivo = Session.getActiveUser().getEmail().toLowerCase().trim();
  const emailAdminInicial = String(
    PropertiesService.getScriptProperties().getProperty(CHAVE_ADMIN_INICIAL) || ""
  ).toLowerCase().trim();
  
  if (!emailAtivo) {
    throw new Error("Não foi possível identificar seu e-mail do Google. Certifique-se de estar logado.");
  }
  
  const ss = obterPlanilha_();
  const abaUsuarios = ss.getSheetByName("Usuarios");
  
  if (!abaUsuarios) {
    throw new Error("Aba 'Usuarios' de controle de acesso não encontrada.");
  }
  
  const dados = abaUsuarios.getDataRange().getValues();
  let usuarioEncontrado = null;
  
  // Procura o e-mail na aba de Usuários (ignora cabeçalho na linha 1)
  for (let i = 1; i < dados.length; i++) {
    let emailCadastrado = String(dados[i][0]).toLowerCase().trim();
    let ativo = String(dados[i][3]).trim();
    
    if (emailCadastrado === emailAtivo) {
      if (ativo === "Sim") {
        usuarioEncontrado = {
          email: emailAtivo,
          nome: String(dados[i][1]).trim(),
          papel: String(dados[i][2]).trim(),
          ativo: true
        };
      } else {
        throw new Error("Sua conta de usuário está inativa no sistema.");
      }
      break;
    }
  }
  
  // BOOTSTRAP AUTO-ADMIN: Se o usuário logado for o dono da planilha
  // e não estiver cadastrado, cadastra-o automaticamente como Administrador.
  if (!usuarioEncontrado && emailAdminInicial && emailAtivo === emailAdminInicial) {
    const nomePadrao = emailAtivo.split("@")[0].toUpperCase();
    abaUsuarios.appendRow([
      emailAtivo,
      nomePadrao,
      "Administrador",
      "Sim"
    ]);
    
    // Registra no Log
    lancarLog("BOOTSTRAP_ADMIN", "Usuarios", "Administrador inicial criado via autenticação automática do proprietário.", "", "", "", emailAtivo);
    
    return {
      email: emailAtivo,
      nome: nomePadrao,
      papel: "Administrador",
      ativo: true
    };
  }
  
  if (!usuarioEncontrado) {
    throw new Error("Seu e-mail (" + emailAtivo + ") não está autorizado a acessar este sistema.");
  }
  
  return usuarioEncontrado;
}

/**
 * Verifica se o usuário ativo possui perfil de Administrador
 */
function verificarSeEhAdmin() {
  try {
    const usuario = obterDadosUsuarioLogado();
    return usuario.papel === "Administrador" || usuario.papel === "Admin";
  } catch (e) {
    return false;
  }
}

/**
 * Verifica se o usuário ativo possui perfil de Operador ou superior
 */
function verificarSeEhOperador() {
  try {
    const usuario = obterDadosUsuarioLogado();
    return usuario.papel === "Administrador" || usuario.papel === "Admin" || usuario.papel === "Operador";
  } catch (e) {
    return false;
  }
}
