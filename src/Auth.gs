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

/** Novas senhas usam um sal aleatorio; hashes antigos migram no login. */
function gerarHashSenhaArmazenado_(senha) {
  const sal = Utilities.getUuid().replace(/-/g, "");
  return "v2$" + sal + "$" + gerarHashSenha(sal + "|" + String(senha));
}

function compararTextoTempoConstante_(a, b) {
  const textoA = String(a || "");
  const textoB = String(b || "");
  let diferenca = textoA.length ^ textoB.length;
  const tamanho = Math.max(textoA.length, textoB.length);
  for (let i = 0; i < tamanho; i++) {
    diferenca |= (textoA.charCodeAt(i) || 0) ^ (textoB.charCodeAt(i) || 0);
  }
  return diferenca === 0;
}

function validarSenhaArmazenada_(senha, hashSalvo) {
  const armazenado = String(hashSalvo || "");
  if (armazenado.indexOf("v2$") === 0) {
    const partes = armazenado.split("$");
    if (partes.length !== 3 || !partes[1] || !partes[2]) return false;
    return compararTextoTempoConstante_(gerarHashSenha(partes[1] + "|" + String(senha)), partes[2]);
  }
  return compararTextoTempoConstante_(gerarHashSenha(String(senha)), armazenado);
}

function chaveTentativasLogin_(email) {
  return "rh_login_" + gerarHashSenha(String(email || "").toLowerCase()).slice(0, 32);
}

function verificarBloqueioLogin_(email) {
  const bruto = CacheService.getScriptCache().get(chaveTentativasLogin_(email));
  if (!bruto) return;
  const controle = JSON.parse(bruto);
  if (Number(controle.bloqueadoAte || 0) > Date.now()) {
    throw new Error("Muitas tentativas incorretas. Aguarde 15 minutos e tente novamente.");
  }
}

function registrarFalhaLogin_(email) {
  const cache = CacheService.getScriptCache();
  const chave = chaveTentativasLogin_(email);
  let controle = { tentativas: 0, bloqueadoAte: 0 };
  try { controle = JSON.parse(cache.get(chave) || "{}") || controle; } catch (e) {}
  controle.tentativas = Number(controle.tentativas || 0) + 1;
  if (controle.tentativas >= 5) controle.bloqueadoAte = Date.now() + (15 * 60 * 1000);
  cache.put(chave, JSON.stringify(controle), 900);
}

function limparFalhasLogin_(email) {
  CacheService.getScriptCache().remove(chaveTentativasLogin_(email));
}

const SESSAO_TTL_SEGUNDOS_ = 7 * 24 * 60 * 60;
const SESSAO_CACHE_SEGUNDOS_ = 6 * 60 * 60;

function chaveSessaoPersistente_(token) {
  return "rh_sessao_persistente_" + gerarHashSenha(String(token || "")).slice(0, 48);
}

function salvarSessaoPersistente_(token, usuario) {
  const agora = Date.now();
  const registro = { usuario: usuario, criadoEm: agora, ultimoAcessoEm: agora, expiraEm: agora + (SESSAO_TTL_SEGUNDOS_ * 1000) };
  const json = JSON.stringify(registro);
  CacheService.getScriptCache().put("rh_sessao_" + token, json, SESSAO_CACHE_SEGUNDOS_);
  PropertiesService.getScriptProperties().setProperty(chaveSessaoPersistente_(token), json);
  return registro;
}

function verificarSessao(token) {
  if (!token) throw new Error("Acesso negado: Token de sessão não fornecido.");
  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();
  const chavePersistente = chaveSessaoPersistente_(token);
  let dadosString = cache.get("rh_sessao_" + token) || props.getProperty(chavePersistente);
  if (!dadosString) throw new Error("Sua sessão expirou ou é inválida. Faça login novamente.");

  let registro = JSON.parse(dadosString);
  if (registro && registro.email) registro = { usuario: registro, expiraEm: Date.now() + (SESSAO_TTL_SEGUNDOS_ * 1000) };
  if (!registro || !registro.usuario || Number(registro.expiraEm || 0) <= Date.now()) {
    cache.remove("rh_sessao_" + token);
    props.deleteProperty(chavePersistente);
    throw new Error("Sua sessão expirou por inatividade. Faça login novamente.");
  }

  const usuario = registro.usuario;
  if (!usuario || !usuario.email || !usuario.ativo) throw new Error("Sua conta de usuário está inativa no sistema.");

  const agora = Date.now();
  const renovarPersistencia = agora - Number(registro.ultimoAcessoEm || 0) >= 15 * 60 * 1000;
  if (renovarPersistencia) {
    registro.ultimoAcessoEm = agora;
    registro.expiraEm = agora + (SESSAO_TTL_SEGUNDOS_ * 1000);
  }
  const renovada = JSON.stringify(registro);
  cache.put("rh_sessao_" + token, renovada, SESSAO_CACHE_SEGUNDOS_);
  if (renovarPersistencia) props.setProperty(chavePersistente, renovada);

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

/** Lista fechada de operacoes que a interface pode solicitar ao servidor. */
function obterFuncoesApiPermitidas_() {
  return {
    verificarSessao: verificarSessao,
    obterVersaoDados: obterVersaoDados,
    obterDadosCompletos: obterDadosCompletos,
    obterConfiguracaoAutorizacaoHorasExtras: obterConfiguracaoAutorizacaoHorasExtras,
    salvarDescricaoAutorizacaoHorasExtras: salvarDescricaoAutorizacaoHorasExtras,
    gerenciarDescricaoAutorizacaoHorasExtras: gerenciarDescricaoAutorizacaoHorasExtras,
    obterListaServidores: obterListaServidores,
    salvarPenalidadePeriodoFerias: salvarPenalidadePeriodoFerias,
    salvarPenalidadeAbonosServidor: salvarPenalidadeAbonosServidor,
    listarVinculosRep: listarVinculosRep,
    salvarVinculosRep: salvarVinculosRep,
    iniciarUploadRepOnline: iniciarUploadRepOnline,
    salvarParteRepOnline: salvarParteRepOnline,
    finalizarUploadRepOnline: finalizarUploadRepOnline,
    cancelarUploadRepOnline: cancelarUploadRepOnline,
    listarArquivosRepOnline: listarArquivosRepOnline,
    obterParteArquivoRepOnline: obterParteArquivoRepOnline,
    obterInfoPastaEntradaRep: obterInfoPastaEntradaRep,
    listarArquivosPastaEntradaRep: listarArquivosPastaEntradaRep,
    obterParteArquivoPastaEntradaRep: obterParteArquivoPastaEntradaRep,
    listarApontamentosRep: listarApontamentosRep,
    listarJustificativasLancamentoRep: listarJustificativasLancamentoRep,
    salvarJustificativaLancamentoRep: salvarJustificativaLancamentoRep,
    listarCompensacoesRep: listarCompensacoesRep,
    salvarCompensacaoRep: salvarCompensacaoRep,
    listarDescartesHoraExtraRep: listarDescartesHoraExtraRep,
    salvarDescarteHoraExtraRep: salvarDescarteHoraExtraRep,
    listarValidacoesRep: listarValidacoesRep,
    salvarValidacaoRep: salvarValidacaoRep,
    listarFeriadosRep: listarFeriadosRep,
    salvarFeriadosRep: salvarFeriadosRep,
    atualizarFeriadosRep: atualizarFeriadosRep,
    listarAjustesRep: listarAjustesRep,
    salvarAjustesRep: salvarAjustesRep,
    salvarAlteracoesLoteRep: salvarAlteracoesLoteRep,
    listarConferenciasRep: listarConferenciasRep,
    salvarConferenciaRep: salvarConferenciaRep,
    salvarApontamentoRep: salvarApontamentoRep,
    definirStatusApontamentoRep: definirStatusApontamentoRep,
    excluirApontamentoRep: excluirApontamentoRep,
    obterListaLancamentos: obterListaLancamentos,
    obterListaProtocolos: obterListaProtocolos,
    obterHistoricoServidor: obterHistoricoServidor,
    desativarServidor: desativarServidor,
    salvarServidor: salvarServidor,
    validarConflitosLancamento: validarConflitosLancamento,
    salvarLancamento: salvarLancamento,
    registrarOperacaoPendente: registrarOperacaoPendente,
    marcarOperacaoPronta: marcarOperacaoPronta,
    registrarFalhaOperacaoPendente: registrarFalhaOperacaoPendente,
    cancelarOperacaoPendente: cancelarOperacaoPendente,
    obterOperacoesPendentesUsuario: obterOperacoesPendentesUsuario,
    salvarArquivoNoDrive: salvarArquivoNoDrive,
    removerArquivoDrive: removerArquivoDrive,
    obterAnexoBase64: obterAnexoBase64,
    atualizar1DocLote: atualizar1DocLote,
    obterLancamentosPendentesProtocolo: obterLancamentosPendentesProtocolo,
    criarProtocolo: criarProtocolo,
    atualizarStatusProtocolo: atualizarStatusProtocolo,
    obterHtmlFolhaProtocolo: obterHtmlFolhaProtocolo,
    obterHtmlNotificacaoFeriasCompulsorias: obterHtmlNotificacaoFeriasCompulsorias,
    obterRelatorioCompulsorias: obterRelatorioCompulsorias,
    obterRelatorioSituacaoFerias: obterRelatorioSituacaoFerias,
    obterRelatorioAusenciasCalendario: obterRelatorioAusenciasCalendario,
    obterRelatorioResumoMensal: obterRelatorioResumoMensal,
    obterRelatorioAbonosAnuais: obterRelatorioAbonosAnuais,
    obterRelatorioLogs: obterRelatorioLogs,
    obterListaUsuarios: obterListaUsuarios,
    salvarUsuario: salvarUsuario,
    resetarSenhaUsuario: resetarSenhaUsuario,
    desativarUsuario: desativarUsuario,
    obterListaConfiguracoes: obterListaConfiguracoes,
    salvarConfiguracao: salvarConfiguracao,
    obterBriefingDiarioEntidade: obterBriefingDiarioEntidade,
    marcarBriefingDiarioEntidadeComoVisto: marcarBriefingDiarioEntidadeComoVisto,
    obterInsightEntidadeAtual: obterInsightEntidadeAtual,
    marcarInsightEntidadeComoVisto: marcarInsightEntidadeComoVisto,
    chamarEntidade: chamarEntidade,
    avaliarInteracaoEntidade: avaliarInteracaoEntidade
  };
}

/** Wrapper autenticado para todas as chamadas da interface. */
function executarApiBackend(token, funcName, args) {
  verificarSessao(token);
  const func = obterFuncoesApiPermitidas_()[String(funcName || "")];
  if (typeof func !== "function") throw new Error("Operacao nao permitida pela API do sistema.");
  const argumentos = Array.isArray(args) ? args : [];
  if (argumentos.length > 20) throw new Error("Quantidade de argumentos invalida.");
  const resultado = func.apply(this, argumentos);
  if (/^(salvar|atualizar|desativar|cancelar|remover|excluir|definir|marcar|registrar|resetar|criar|gerar)/i.test(String(funcName || ""))) registrarAlteracaoDados_();
  return resultado;
}

function registrarAlteracaoDados_() {
  const versao = String(Date.now()) + "-" + Utilities.getUuid().slice(0, 8);
  PropertiesService.getScriptProperties().setProperty("RH_VERSAO_DADOS", versao);
  return versao;
}

function obterVersaoDados() {
  obterDadosUsuarioLogado();
  const props = PropertiesService.getScriptProperties();
  return props.getProperty("RH_VERSAO_DADOS") || registrarAlteracaoDados_();
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
  verificarBloqueioLogin_(emailBusca);
  
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
    registrarFalhaLogin_(emailBusca);
    throw new Error("E-mail não autorizado a acessar este sistema.");
  }
  
  if (!hashSalvo) {
    throw new Error("PRIMEIRO_ACESSO");
  }
  
  if (!validarSenhaArmazenada_(senha, hashSalvo)) {
    registrarFalhaLogin_(emailBusca);
    throw new Error("Senha incorreta.");
  }

  limparFalhasLogin_(emailBusca);
  if (hashSalvo.indexOf("v2$") !== 0 && linhaEdit > 0) {
    abaUsuarios.getRange(linhaEdit, 5).setValue(gerarHashSenhaArmazenado_(senha));
  }
  
  // Sessão renovável por atividade, sem depender apenas do cache volátil.
  const token = gerarTokenAleatorio();
  salvarSessaoPersistente_(token, usuarioValido);
  
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
    
    const hashGerado = gerarHashSenhaArmazenado_(novaSenha);
    abaUsuarios.getRange(linhaEdit, 5).setValue(hashGerado);
    
    const token = gerarTokenAleatorio();
    salvarSessaoPersistente_(token, usuarioValido);
    
    lancarLogSemLock_("PRIMEIRO_ACESSO", "Usuarios", "Usuário definiu a senha de primeiro acesso.", "", "", "", emailBusca);
    
    return {
      token: token,
      usuario: usuarioValido
    };
  } finally {
    lock.releaseLock();
  }
}
