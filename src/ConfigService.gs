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
  
  const ss = obterPlanilha_();
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
  const ss = obterPlanilha_();
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
      
      lancarLogSemLock_("EDITAR_USUARIO", "Usuarios", "Atualizou permissões do e-mail " + emailBusca, "Usuário", valorAntes, JSON.stringify(usuario), emailBusca);
    } else {
      aba.appendRow([
        emailBusca,
        usuario.nome.toUpperCase(),
        usuario.papel,
        "Sim" // Novo usuário inicia Ativo por padrão
      ]);
      lancarLogSemLock_("CRIAR_USUARIO", "Usuarios", "Cadastrou novo usuário: " + emailBusca, "", "", JSON.stringify(usuario), emailBusca);
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
  
  const ss = obterPlanilha_();
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
  
  const ss = obterPlanilha_();
  const aba = ss.getSheetByName("Tipos_Documento");
  if (!aba) return [];

  // Migração segura para planilhas já existentes: disponibiliza Atestado sem
  // exigir que o setup completo seja executado novamente.
  const existentes = aba.getLastRow() > 1 ? aba.getRange(2, 1, aba.getLastRow() - 1, 2).getDisplayValues() : [];
  const possuiAtestado = existentes.some(function(linha) {
    return String(linha[0] || '').trim().toLowerCase() === 'atestado' || String(linha[1] || '').trim().toLowerCase() === 'atestado';
  });
  if (!possuiAtestado) {
    aba.appendRow(['atestado', 'Atestado', 'Não', 'Não', '["data_inicio", "dias_ferias", "anexo1", "anexo2", "anexo3", "despacho_individual", "observacao_individual"]', 'Sim']);
  }
  
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
function garantirConfiguracaoArredondamentoRep_(aba) {
  if (!aba) return;
  const ultimaLinha = aba.getLastRow();
  const chaves = ultimaLinha > 1
    ? aba.getRange(2, 1, ultimaLinha - 1, 1).getDisplayValues().map(function(linha) { return String(linha[0] || '').trim(); })
    : [];
  const padroes = [
    ['ARREDONDAMENTO_REP', 'SIM', 'Modo legado: arredonda cada marcação do Leitor REP. Desativado, usa os minutos registrados.'],
    ['REGRA_SALDO_DIARIO_REP', 'NAO', 'Quando ativa, substitui o arredondamento por batida pela tolerância e pelas faixas aplicadas ao saldo total do dia.'],
    ['TOLERANCIA_DEFICIT_REP', '10', 'Minutos de déficit tolerados no total do dia antes de gerar horas devidas.'],
    ['CONTAGEM_DEFICIT_REP', 'INTEGRAL', 'Ao ultrapassar a tolerância: INTEGRAL conta todo o déficit; EXCEDENTE conta apenas o que superar a tolerância.'],
    ['HE_MEIA_MIN_REP', '16', 'Minuto inicial da faixa que arredonda o restante positivo do dia para 30 minutos de hora extra.'],
    ['HE_HORA_MIN_REP', '46', 'Minuto inicial da faixa que arredonda o restante positivo do dia para uma hora extra completa.']
  ];
  padroes.forEach(function(registro) {
    if (chaves.indexOf(registro[0]) === -1) aba.appendRow(registro);
  });
}

function obterConfiguracaoCalculoRep() {
  const ss = obterPlanilha_();
  const aba = ss.getSheetByName('Configuracoes');
  if (!aba) return { modo: 'LEGADO', arredondamentoAtivo: true, regraSaldoDiarioAtiva: false, toleranciaDeficitMin: 10, contagemDeficit: 'INTEGRAL', heMeiaMin: 16, heHoraMin: 46 };
  garantirConfiguracaoArredondamentoRep_(aba);
  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 2).getDisplayValues();
  const mapa = {};
  dados.forEach(function(linha) { mapa[String(linha[0] || '').trim()] = String(linha[1] || '').trim(); });
  const ehAtivo = function(valor) { return !['NAO', 'NÃO', '0', 'FALSE', 'DESATIVADO'].includes(String(valor || '').trim().toUpperCase()); };
  const numeroEntre = function(valor, padrao, minimo, maximo) {
    const numero = Math.round(Number(valor));
    return Number.isFinite(numero) && numero >= minimo && numero <= maximo ? numero : padrao;
  };
  const regraSaldoDiarioAtiva = ehAtivo(mapa.REGRA_SALDO_DIARIO_REP || 'NAO');
  const arredondamentoAtivo = ehAtivo(mapa.ARREDONDAMENTO_REP || 'SIM');
  const contagemDeficit = String(mapa.CONTAGEM_DEFICIT_REP || 'INTEGRAL').toUpperCase() === 'EXCEDENTE' ? 'EXCEDENTE' : 'INTEGRAL';
  const heMeiaMin = numeroEntre(mapa.HE_MEIA_MIN_REP, 16, 1, 59);
  const heHoraMinInformada = numeroEntre(mapa.HE_HORA_MIN_REP, 46, 2, 60);
  const heHoraMin = heHoraMinInformada > heMeiaMin ? heHoraMinInformada : Math.min(60, heMeiaMin + 1);
  return {
    modo: regraSaldoDiarioAtiva ? 'SALDO_DIARIO' : (arredondamentoAtivo ? 'LEGADO' : 'EXATO'),
    arredondamentoAtivo: arredondamentoAtivo,
    regraSaldoDiarioAtiva: regraSaldoDiarioAtiva,
    toleranciaDeficitMin: numeroEntre(mapa.TOLERANCIA_DEFICIT_REP, 10, 0, 59),
    contagemDeficit: contagemDeficit,
    heMeiaMin: heMeiaMin,
    heHoraMin: heHoraMin
  };
}

function salvarConfiguracaoCalculoRep(configuracao) {
  if (!verificarSeEhAdmin()) {
    throw new Error('Somente administradores podem alterar a política de cálculo do REP.');
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Sistema ocupado. Não foi possível alterar a política de cálculo agora.');
  }
  try {
    const ss = obterPlanilha_();
    const aba = ss.getSheetByName('Configuracoes');
    if (!aba) throw new Error("Aba 'Configuracoes' não encontrada.");
    garantirConfiguracaoArredondamentoRep_(aba);
    configuracao = configuracao || {};
    const modo = ['LEGADO', 'EXATO', 'SALDO_DIARIO'].includes(String(configuracao.modo || '').toUpperCase())
      ? String(configuracao.modo).toUpperCase()
      : (configuracao.regraSaldoDiarioAtiva ? 'SALDO_DIARIO' : (configuracao.arredondamentoAtivo === false ? 'EXATO' : 'LEGADO'));
    const inteiro = function(valor, nome, minimo, maximo) {
      const numero = Math.round(Number(valor));
      if (!Number.isFinite(numero) || numero < minimo || numero > maximo) throw new Error(nome + ' deve estar entre ' + minimo + ' e ' + maximo + '.');
      return numero;
    };
    const tolerancia = inteiro(configuracao.toleranciaDeficitMin == null ? 10 : configuracao.toleranciaDeficitMin, 'A tolerância diária', 0, 59);
    const heMeia = inteiro(configuracao.heMeiaMin == null ? 16 : configuracao.heMeiaMin, 'O início da meia hora extra', 1, 59);
    const heHora = inteiro(configuracao.heHoraMin == null ? 46 : configuracao.heHoraMin, 'O início da hora extra cheia', 2, 60);
    if (heHora <= heMeia) throw new Error('O início da hora extra cheia deve ser maior que o início da meia hora extra.');
    const contagem = String(configuracao.contagemDeficit || 'INTEGRAL').toUpperCase() === 'EXCEDENTE' ? 'EXCEDENTE' : 'INTEGRAL';
    const valores = {
      ARREDONDAMENTO_REP: modo === 'LEGADO' ? 'SIM' : 'NAO',
      REGRA_SALDO_DIARIO_REP: modo === 'SALDO_DIARIO' ? 'SIM' : 'NAO',
      TOLERANCIA_DEFICIT_REP: String(tolerancia),
      CONTAGEM_DEFICIT_REP: contagem,
      HE_MEIA_MIN_REP: String(heMeia),
      HE_HORA_MIN_REP: String(heHora)
    };
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 2).getDisplayValues();
    const antes = {};
    Object.keys(valores).forEach(function(chave) {
      const indice = dados.findIndex(function(linha) { return String(linha[0] || '').trim() === chave; });
      if (indice < 0) throw new Error('Configuração ' + chave + ' não encontrada.');
      antes[chave] = String(dados[indice][1] || '');
      aba.getRange(indice + 2, 2).setValue(valores[chave]);
    });
    lancarLogSemLock_('EDITAR_CONFIG', 'Configuracoes', 'Alterou a política de cálculo do Leitor REP para: ' + modo, 'POLITICA_CALCULO_REP', JSON.stringify(antes), JSON.stringify(valores), 'POLITICA_CALCULO_REP');
    return obterConfiguracaoCalculoRep();
  } finally {
    lock.releaseLock();
  }
}

function obterListaConfiguracoes() {
  if (!verificarSeEhAdmin()) {
    throw new Error("Você não possui permissão para visualizar configurações.");
  }
  
  const ss = obterPlanilha_();
  const aba = ss.getSheetByName("Configuracoes");
  if (!aba) return [];
  garantirConfiguracaoArredondamentoRep_(aba);
  
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
  const ss = obterPlanilha_();
    const aba = ss.getSheetByName("Configuracoes");
    if (!aba) throw new Error("Aba 'Configuracoes' não encontrada.");
    
    const linha = parseInt(config.linhaPlanilha);
    if (linha > 1) {
      const valorAntes = aba.getRange(linha, 2).getValue();
      aba.getRange(linha, 2).setValue(config.valor);
      
      lancarLogSemLock_(
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

/**
 * Reseta a senha de um usuário, exigindo novo cadastro no próximo login
 */
function resetarSenhaUsuario(email) {
  if (!verificarSeEhAdmin()) {
    throw new Error("Você não possui permissão para gerenciar usuários.");
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = obterPlanilha_();
    const aba = ss.getSheetByName("Usuarios");
    const dados = aba.getDataRange().getValues();
    const emailBusca = String(email).toLowerCase().trim();
    
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).toLowerCase().trim() === emailBusca) {
        aba.getRange(i + 1, 5).setValue(""); // Limpa a coluna SenhaHash (coluna E)
        lancarLogSemLock_("RESET_SENHA", "Usuarios", "A senha do usuário foi resetada pelo Administrador.", "", "", "", emailBusca);
        return true;
      }
    }
    throw new Error("Usuário não encontrado.");
  } finally {
    lock.releaseLock();
  }
}
