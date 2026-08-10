/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio dos Servidores (ServidoresService)
 */

/**
 * Retorna a lista de todos os servidores cadastrados para exibição na interface (Performance O(N+M))
 */
function normalizarPisCpfServidor_(valor) {
  let digitos = String(valor || "").replace(/\D/g, "");
  // Alguns AFDs reservam 12 posições para o PIS de 11 dígitos e
  // acrescentam um zero técnico à esquerda. Zeros de um PIS real de
  // 11 dígitos permanecem intactos.
  while (digitos.length > 11 && digitos.charAt(0) === "0") {
    digitos = digitos.slice(1);
  }
  // Compatibiliza cadastros antigos salvos sem o zero inicial do PIS.
  if (digitos.length === 10) digitos = "0" + digitos;
  return digitos;
}

function normalizarAniversarioServidor_(valor) {
  const texto = String(valor || '').trim();
  const partes = texto.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-]\d{2,4})?$/);
  if (!partes) return '';
  const dia = Number(partes[1]);
  const mes = Number(partes[2]);
  const teste = new Date(2000, mes - 1, dia);
  if (teste.getMonth() !== mes - 1 || teste.getDate() !== dia) return '';
  return String(dia).padStart(2, '0') + '/' + String(mes).padStart(2, '0');
}

function construirMapaAniversariosNatalicios_(ss) {
  const mapa = {};
  const aba = ss.getSheetByName('Lançamentos') || ss.getSheetByName('Lancamentos');
  if (!aba) return mapa;
  const dados = obterValoresAba_(aba);
  if (dados.length <= 1) return mapa;
  const idx = obterIndicesColunasLancamentos_(dados[0]);
  if (idx.tipo === -1 || idx.matricula === -1 || idx.dataInicio === -1) return mapa;
  for (let i = 1; i < dados.length; i++) {
    const tipo = normalizarCabecalho_(dados[i][idx.tipo]);
    if (!tipo.includes('NATALICIA') || tipo.includes('ANULAD') || tipo.includes('NAO EFETIVAD')) continue;
    const matricula = normalizarChaveMatricula_(dados[i][idx.matricula]);
    const data = dados[i][idx.dataInicio] instanceof Date ? dados[i][idx.dataInicio] : lerDataFormatoBR_(dados[i][idx.dataInicio]);
    if (!matricula || !data || isNaN(data.getTime())) continue;
    const atual = mapa[matricula];
    if (!atual || data.getTime() > atual.data.getTime()) mapa[matricula] = { data: data, aniversario: Utilities.formatDate(data, Session.getScriptTimeZone(), 'dd/MM') };
  }
  const saida = {};
  Object.keys(mapa).forEach(function(chave) { saida[chave] = mapa[chave].aniversario; });
  return saida;
}

function obterListaServidores() {
  obterDadosUsuarioLogado();
  return obterListaServidoresInterno_();
}

/** Leitura interna para gatilhos confiáveis executados sem sessão de usuário. */
function obterListaServidoresInterno_() {
  const ss = obterPlanilha_();
  const aba = ss.getSheetByName("Servidores");
  if (!aba) return [];
  
  const dados = obterValoresAba_(aba);
  if (dados.length <= 1) return [];
  
  const cabecalho = dados[0];
  
  const idxNome = indiceCabecalho_(cabecalho, ["NOME", "NOME COMPLETO"]);
  const idxMatricula = indiceCabecalho_(cabecalho, ["MATRICULA"]);
  const idxCargo = indiceCabecalho_(cabecalho, ["CARGO"]);
  const idxLotacao = indiceCabecalho_(cabecalho, ["LOTACAO"]);
  const idxAdmissao = indiceCabecalho_(cabecalho, ["DATA DE ADMISSAO", "ADMISSAO"]);
  const idxSituacao = indiceCabecalho_(cabecalho, ["SITUACAO"]);
  const idxEmail = indiceCabecalho_(cabecalho, ["E MAIL", "EMAIL"]);
  const idxPis = indiceCabecalho_(cabecalho, ["PIS", "CPF", "PIS CPF", "PIS_CPF"]);
  const idxSaldoHoje = indiceCabecalho_(cabecalho, ["FERIAS SALDO HOJE", "SALDO HOJE", "SALDO FERIAS"]);
  const idxProjetado = indiceCabecalho_(cabecalho, ["FERIAS PROJETADO ESTE ANO", "PROJETADO ESTE ANO", "PROJETADO"]);
  const idxInfoFerias = indiceCabecalho_(cabecalho, ["INFO FERIAS"]);
  const idxAtivo = indiceCabecalho_(cabecalho, ["ATIVO"]);
  const idxPenF = indiceCabecalho_(cabecalho, ["PENALIDADE FERIAS", "PENALIDADE_FERIAS"]);
  const idxPenA = indiceCabecalho_(cabecalho, ["PENALIDADE ABONOS", "PENALIDADE_ABONOS"]);
  const idxAniversario = indiceCabecalho_(cabecalho, ["ANIVERSARIO DIA MES", "ANIVERSARIO_DIA_MES", "ANIVERSARIO"]);

  if (idxNome === -1 || idxMatricula === -1) {
    throw new Error("Cabecalhos NOME/MATRICULA nao encontrados em Servidores. Encontrados: " + cabecalho.join(" | "));
  }
  
  // Otimização O(N + M): carrega status, saldos e períodos em lote.
  const mapaStatus = construirMapaStatusServidores_(ss);
  const resumoFerias = construirResumoFerias_(ss);
  const aniversariosNatalicios = construirMapaAniversariosNatalicios_(ss);
  
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
      statusText = mapaStatus[normalizarChaveMatricula_(matricula)] || "Ativo";
    }
      const chaveMatricula = normalizarChaveMatricula_(matricula);
      const feriasServidor = resumoFerias[chaveMatricula] || {
        saldo: 0,
        projetado: 0,
        periodos: []
      };

      // Mantém compatibilidade com cópias antigas que ainda possuem fórmula
      // na aba Servidores; na estrutura atual, usa o resumo auditável abaixo.
      const saldoDaPlanilha = idxSaldoHoje !== -1
        ? obterNumeroPlanilha_(linha[idxSaldoHoje])
        : null;
      const saldoCalc = saldoDaPlanilha !== null
        ? saldoDaPlanilha
        : (feriasServidor.saldo || 0);

      let penF = idxPenF !== -1 ? parseInt(linha[idxPenF]) || 0 : 0;
      let penA = idxPenA !== -1 ? parseInt(linha[idxPenA]) || 0 : 0;
      
      let saldoHojeCalculado = saldoCalc - (Number(feriasServidor.penalidadesPeriodos || 0) > 0 ? 0 : penF);
      let abonosUsadosCalculado = (feriasServidor.abonosUsados || 0) + penA;
      
      const avaliacaoCompulsoria = avaliarRiscoCompulsoriaFerias_(
        saldoHojeCalculado,
        feriasServidor.periodos,
        idxAdmissao !== -1 ? linha[idxAdmissao] : null,
        new Date()
      );

      servidores.push({
        nome: String(linha[idxNome]).trim(),
        matricula: matricula,
        cargo: idxCargo !== -1 ? String(linha[idxCargo]).trim() : "",
        lotacao: idxLotacao !== -1 ? String(linha[idxLotacao]).trim() : "",
        admissao: idxAdmissao !== -1 ? formatarDataServidor_(linha[idxAdmissao]) : "",
        admissaoBruta: idxAdmissao !== -1 && linha[idxAdmissao] instanceof Date ? linha[idxAdmissao].getTime() : (idxAdmissao !== -1 ? linha[idxAdmissao] : null),
        situacao: idxSituacao !== -1 ? String(linha[idxSituacao]).trim() : "",
        email: idxEmail !== -1 ? String(linha[idxEmail]).trim() : "",
        pis: idxPis !== -1 ? normalizarPisCpfServidor_(linha[idxPis]) : "",
        aniversario: normalizarAniversarioServidor_(idxAniversario !== -1 ? linha[idxAniversario] : '') || aniversariosNatalicios[chaveMatricula] || '',
        saldoHoje: saldoHojeCalculado,
        // Inativos permanecem no histórico, mas estão fora da gestão operacional
        // de férias e nunca devem compor alertas de compulsórias.
        feriasCompulsorias: statusText !== "Inativo" && avaliacaoCompulsoria.emRisco,
        dataTerceiroPeriodo: avaliacaoCompulsoria.dataTerceiroPeriodo,
        diasParaTerceiroPeriodo: avaliacaoCompulsoria.diasRestantes,
        projetado: parseInt(feriasServidor.projetado) || 0,
        infoFerias: idxInfoFerias !== -1 ? String(linha[idxInfoFerias] || "").trim() : "",
        periodosFerias: feriasServidor.periodos,
        abonosUsados: abonosUsadosCalculado,
        penalidadeFerias: penF,
        penalidadeAbono: penA,
        status: statusText,
      linhaPlanilha: i + 1
    });
  }
  
  // Ordena por nome
  servidores.sort((a, b) => a.nome.localeCompare(b.nome));
  return servidores;
}

/**
 * Regra única de risco compulsório:
 * - exige ao menos dois períodos disponíveis (60 dias);
 * - entra no alerta quando o período seguinte libera em até 6 meses;
 * - saldos de 90 dias ou mais já ultrapassaram o limite e permanecem no alerta.
 */
function avaliarRiscoCompulsoriaFerias_(saldoDisponivel, periodos, admissao, dataReferencia) {
  const saldo = Number(saldoDisponivel || 0);
  const hoje = dataReferencia instanceof Date ? new Date(dataReferencia) : new Date();
  hoje.setHours(0, 0, 0, 0);

  if (saldo < 60) {
    return { emRisco: false, dataTerceiroPeriodo: '', diasRestantes: null };
  }

  // Três períodos já disponíveis: o limite já foi atingido ou ultrapassado.
  if (saldo >= 90) {
    return { emRisco: true, dataTerceiroPeriodo: 'Já vencido', diasRestantes: 0 };
  }

  let dataTerceiro = null;
  const proximo = (periodos || []).find(function(periodo) {
    return periodo.status === 'Em aquisição' && periodo.dataLiberacao;
  });
  if (proximo) dataTerceiro = normalizarDataServidorObjeto_(proximo.dataLiberacao);

  // A rotina de créditos só grava períodos adquiridos; por isso, usa o próximo
  // aniversário de admissão quando o período em aquisição ainda não existe na aba.
  if (!dataTerceiro) {
    const dataAdmissao = normalizarDataServidorObjeto_(admissao);
    if (dataAdmissao) {
      dataTerceiro = new Date(hoje.getFullYear(), dataAdmissao.getMonth(), dataAdmissao.getDate());
      while (dataTerceiro <= hoje) {
        dataTerceiro.setFullYear(dataTerceiro.getFullYear() + 1);
      }
    }
  }

  if (!dataTerceiro) {
    return { emRisco: false, dataTerceiroPeriodo: '', diasRestantes: null };
  }

  dataTerceiro.setHours(0, 0, 0, 0);
  const limiteSeisMeses = new Date(hoje);
  limiteSeisMeses.setMonth(limiteSeisMeses.getMonth() + 6);
  const diasRestantes = Math.ceil((dataTerceiro.getTime() - hoje.getTime()) / 86400000);

  return {
    emRisco: dataTerceiro <= limiteSeisMeses,
    dataTerceiroPeriodo: formatarDataServidor_(dataTerceiro),
    diasRestantes: diasRestantes
  };
}

/**
 * Salva ou atualiza um cadastro de servidor com cópia automática de fórmulas e escrita em lote
 */
function salvarServidor(dadosServidor) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para salvar ou alterar cadastros de servidores.");
  }

  const situacoesPermitidas = {
    ESTATUTARIO: "ESTATUTÁRIO",
    COMISSIONADO: "COMISSIONADO",
    ESTAGIARIO: "ESTAGIÁRIO",
    PEAD: "PEAD"
  };
  const chaveSituacao = normalizarCabecalho_(dadosServidor && dadosServidor.situacao || '').toUpperCase();
  if (!situacoesPermitidas[chaveSituacao]) {
    throw new Error("Situação funcional inválida. Selecione Estatutário, Comissionado, Estagiário ou PEAD.");
  }
  dadosServidor.situacao = situacoesPermitidas[chaveSituacao];
  dadosServidor.nome = String(dadosServidor.nome || "").trim();
  dadosServidor.email = String(dadosServidor.email || "").trim();
  dadosServidor.matricula = String(dadosServidor.matricula || "").trim();
  const identificacaoOpcional = dadosServidor.situacao === "ESTAGIÁRIO" || dadosServidor.situacao === "PEAD";
  if (!dadosServidor.nome) throw new Error("Informe o nome do servidor.");
  if (!identificacaoOpcional && !dadosServidor.matricula) throw new Error("A matrícula é obrigatória para esta situação funcional.");
  if (!identificacaoOpcional && !dadosServidor.email) throw new Error("O e-mail é obrigatório para esta situação funcional.");
  if (dadosServidor.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dadosServidor.email)) throw new Error("Informe um e-mail válido ou deixe o campo vazio quando permitido.");
  dadosServidor.pis = normalizarPisCpfServidor_(dadosServidor.pis);

  const lock = LockService.getScriptLock();
  let gerarCreditosDepois = false;
  let dadosAntesAuditoria = null;
  let operacaoAuditoria = "CRIACAO";
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error("Sistema ocupado. Tente novamente em alguns segundos.");
  }

  try {
  const ss = obterPlanilha_();
  const aba = ss.getSheetByName("Servidores");
  if (!aba) throw new Error("Aba 'Servidores' não encontrada.");

  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];

  const idxNome = indiceCabecalho_(cabecalho, ["NOME", "NOME COMPLETO"]);
  const idxMatricula = indiceCabecalho_(cabecalho, ["MATRICULA"]);
  const idxCargo = indiceCabecalho_(cabecalho, ["CARGO"]);
  const idxLotacao = indiceCabecalho_(cabecalho, ["LOTACAO"]);
  const idxAdmissao = indiceCabecalho_(cabecalho, ["DATA DE ADMISSAO", "ADMISSAO"]);
  const idxSituacao = indiceCabecalho_(cabecalho, ["SITUACAO"]);
  const idxEmail = indiceCabecalho_(cabecalho, ["E MAIL", "EMAIL"]);
  let idxPis = indiceCabecalho_(cabecalho, ["PIS", "CPF", "PIS CPF", "PIS_CPF"]);
  const idxAtivo = indiceCabecalho_(cabecalho, ["ATIVO"]);

  let idxPenF = indiceCabecalho_(cabecalho, ["PENALIDADE FERIAS", "PENALIDADE_FERIAS"]);
  let idxPenA = indiceCabecalho_(cabecalho, ["PENALIDADE ABONOS", "PENALIDADE_ABONOS"]);
  let idxAniversario = indiceCabecalho_(cabecalho, ["ANIVERSARIO DIA MES", "ANIVERSARIO_DIA_MES", "ANIVERSARIO"]);

  // Cria as colunas dinamicamente se não existirem
  if (idxPenF === -1) {
    idxPenF = cabecalho.length;
    aba.getRange(1, idxPenF + 1).setValue("PENALIDADE FERIAS");
    cabecalho.push("PENALIDADE FERIAS");
  }
  if (idxPenA === -1) {
    idxPenA = cabecalho.length;
    aba.getRange(1, idxPenA + 1).setValue("PENALIDADE ABONOS");
    cabecalho.push("PENALIDADE ABONOS");
  }
  if (idxPis === -1) {
    idxPis = cabecalho.length;
    aba.getRange(1, idxPis + 1).setValue("PIS");
    cabecalho.push("PIS");
  }
  if (idxAniversario === -1) {
    idxAniversario = cabecalho.length;
    aba.getRange(1, idxAniversario + 1).setValue("ANIVERSARIO_DIA_MES");
    cabecalho.push("ANIVERSARIO_DIA_MES");
  }
  dadosServidor.aniversario = normalizarAniversarioServidor_(dadosServidor.aniversario);
  if (dadosServidor.aniversarioInformado && !dadosServidor.aniversario) throw new Error("Informe o aniversário no formato DD/MM.");

  let matriculaBusca = normalizarChaveMatricula_(dadosServidor.matricula);
  if (!matriculaBusca && identificacaoOpcional) {
    matriculaBusca = "CAD-" + Utilities.getUuid().replace(/-/g, "").slice(0, 10).toUpperCase();
    dadosServidor.matricula = matriculaBusca;
  }
  let linhaEdit = -1;
  let valorAntes = "";

  for (let i = 1; i < dados.length; i++) {
    if (normalizarChaveMatricula_(dados[i][idxMatricula]) === matriculaBusca) {
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
    operacaoAuditoria = "EDICAO";
    dadosAntesAuditoria = {
      nome: idxNome !== -1 ? dados[linhaEdit - 1][idxNome] : "",
      matricula: idxMatricula !== -1 ? dados[linhaEdit - 1][idxMatricula] : "",
      cargo: idxCargo !== -1 ? dados[linhaEdit - 1][idxCargo] : "",
      lotacao: idxLotacao !== -1 ? dados[linhaEdit - 1][idxLotacao] : "",
      admissao: idxAdmissao !== -1 ? dados[linhaEdit - 1][idxAdmissao] : "",
      situacao: idxSituacao !== -1 ? dados[linhaEdit - 1][idxSituacao] : "",
      email: idxEmail !== -1 ? dados[linhaEdit - 1][idxEmail] : "",
      pis: idxPis !== -1 ? dados[linhaEdit - 1][idxPis] : "",
      ativo: idxAtivo !== -1 ? dados[linhaEdit - 1][idxAtivo] : ""
    };
    // MODO EDIÇÃO: Atualiza apenas as células de dados usando lote por segurança de fórmulas
    if (idxNome !== -1) aba.getRange(linhaEdit, idxNome + 1).setValue(dadosServidor.nome.toUpperCase());
    if (idxCargo !== -1) aba.getRange(linhaEdit, idxCargo + 1).setValue(dadosServidor.cargo);
    if (idxLotacao !== -1) aba.getRange(linhaEdit, idxLotacao + 1).setValue(dadosServidor.lotacao);
    if (idxAdmissao !== -1 && dataAdmissao) aba.getRange(linhaEdit, idxAdmissao + 1).setValue(dataAdmissao);
    if (idxSituacao !== -1) aba.getRange(linhaEdit, idxSituacao + 1).setValue(dadosServidor.situacao);
    if (idxEmail !== -1) aba.getRange(linhaEdit, idxEmail + 1).setValue(dadosServidor.email);
    aba.getRange(linhaEdit, idxPis + 1).setValue(dadosServidor.pis);
    aba.getRange(linhaEdit, idxAniversario + 1).setValue(dadosServidor.aniversario || '');
    if (idxAtivo !== -1) aba.getRange(linhaEdit, idxAtivo + 1).setValue(dadosServidor.ativo || "Sim");
    
    aba.getRange(linhaEdit, idxPenF + 1).setValue(dadosServidor.penalidadeFerias || 0);
    aba.getRange(linhaEdit, idxPenA + 1).setValue(dadosServidor.penalidadeAbono || 0);

    lancarLogSemLock_("EDITAR_SERVIDOR", "Servidores", "Atualizou dados do servidor: " + dadosServidor.nome + " (Matrícula: " + matriculaBusca + ")", "Cadastro", valorAntes, JSON.stringify(dadosServidor), matriculaBusca);
  } else {
    // MODO CRIAÇÃO: Valida duplicidade de matrícula e adiciona nova linha copiando fórmulas da superior
    // Validação de matrícula única (dentro do lock para thread-safety)
    if (linhaEdit === -1) {
      // garante que nenhuma outra requisição concorrente inseriu a mesma matrícula
      const dadosAtual = aba.getDataRange().getValues();
      for (let k = 1; k < dadosAtual.length; k++) {
        if (normalizarChaveMatricula_(dadosAtual[k][idxMatricula]) === matriculaBusca) {
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
    aba.getRange(novaLinhaIndex, idxPis + 1).setValue(dadosServidor.pis);
    aba.getRange(novaLinhaIndex, idxAniversario + 1).setValue(dadosServidor.aniversario || '');
    if (idxAtivo !== -1) aba.getRange(novaLinhaIndex, idxAtivo + 1).setValue("Sim");
    
    aba.getRange(novaLinhaIndex, idxPenF + 1).setValue(dadosServidor.penalidadeFerias || 0);
    aba.getRange(novaLinhaIndex, idxPenA + 1).setValue(dadosServidor.penalidadeAbono || 0);

    lancarLogSemLock_("CRIAR_SERVIDOR", "Servidores", "Cadastrou novo servidor: " + dadosServidor.nome + " (Matrícula: " + matriculaBusca + ")", "", "", JSON.stringify(dadosServidor), matriculaBusca);

    gerarCreditosDepois = true;
  }
  } finally {
    lock.releaseLock();
  }

  if (gerarCreditosDepois) {
    try {
      gerarCreditosAutomaticos();
    } catch(e) {
      lancarLog("ERRO_AUTO_CREDITOS", "Creditos_Ferias", "Erro ao gerar créditos automáticos para novo cadastro: " + e.toString(), "", "", "", String(dadosServidor.matricula).trim());
    }
  }

  try {
    auditarCadastroServidor_(dadosServidor, dadosAntesAuditoria, operacaoAuditoria);
    CacheService.getScriptCache().remove('entidade_contexto_planilha_v7');
    PropertiesService.getScriptProperties().deleteProperty('ENTIDADE_ULTIMO_INSIGHT');
  } catch (e) {
    lancarLog("ERRO_AUDITORIA_CADASTRO", "Servidores", "Não foi possível auditar o cadastro salvo: " + e.toString(), "", "", "", String(dadosServidor.matricula || ""));
  }

  return true;
}

function salvarPenalidadeAbonosServidor(dados) {
  if (!verificarSeEhOperador()) throw new Error('Você não possui permissão para alterar penalidades de abonos.');
  dados = dados || {};
  const matricula = normalizarChaveMatricula_(dados.matricula);
  const dias = Math.max(0, Math.min(5, parseInt(dados.dias, 10) || 0));
  if (!matricula) throw new Error('Servidor inválido.');
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) throw new Error('Sistema ocupado. Tente novamente em alguns segundos.');
  try {
    const aba = obterPlanilha_().getSheetByName('Servidores');
    const valores = aba.getDataRange().getValues();
    const cabecalho = valores[0];
    const idxMatricula = indiceCabecalho_(cabecalho, ['MATRICULA']);
    let idxPenalidade = indiceCabecalho_(cabecalho, ['PENALIDADE ABONOS', 'PENALIDADE_ABONOS']);
    if (idxPenalidade === -1) { idxPenalidade = cabecalho.length; aba.getRange(1, idxPenalidade + 1).setValue('PENALIDADE ABONOS'); }
    let linha = -1;
    for (let i = 1; i < valores.length; i++) if (normalizarChaveMatricula_(valores[i][idxMatricula]) === matricula) { linha = i + 1; break; }
    if (linha < 0) throw new Error('Servidor não encontrado.');
    const antes = Number(aba.getRange(linha, idxPenalidade + 1).getValue() || 0);
    aba.getRange(linha, idxPenalidade + 1).setValue(dias);
    lancarLogSemLock_('PENALIDADE_ABONOS', 'Servidores', 'Atualizou penalidade de abonos na ficha individual.', 'Dias', String(antes), String(dias), matricula);
    return { sucesso: true, matricula: matricula, dias: dias };
  } finally { lock.releaseLock(); }
}

/**
 * Desativa um servidor (Soft Delete) para manter consistência de histórico
 */
function desativarServidor(matricula) {
  if (!verificarSeEhOperador()) {
    throw new Error("Você não possui permissão para desativar cadastros de servidores.");
  }
  
  const ss = obterPlanilha_();
  const aba = ss.getSheetByName("Servidores");
  if (!aba) throw new Error("Aba 'Servidores' não encontrada.");
  
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  const idxMatricula = indiceCabecalho_(cabecalho, ["MATRICULA"]);
  const idxAtivo = indiceCabecalho_(cabecalho, ["ATIVO"]);
  
  if (idxAtivo === -1) {
    throw new Error("Coluna 'Ativo' de controle de status não encontrada. Execute o setup novamente.");
  }
  
  for (let i = 1; i < dados.length; i++) {
    if (normalizarChaveMatricula_(dados[i][idxMatricula]) === normalizarChaveMatricula_(matricula)) {
      const linhaPlanilha = i + 1;
      aba.getRange(linhaPlanilha, idxAtivo + 1).setValue("Não");
      
      let nome = dados[i][indiceCabecalho_(cabecalho, ["NOME", "NOME COMPLETO"])];
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
  
  const dadosLanc = obterValoresAba_(abaLanc);
  if (dadosLanc.length <= 1) return {};
  
  const cabecalho = dadosLanc[0];
  const colIdxTipo = indiceCabecalho_(cabecalho, ["TIPO DE DOCUMENTO", "TIPO"]);
  const colIdxMat = indiceCabecalho_(cabecalho, ["MATRICULA"]);
  const colIdxDataIni = indiceCabecalho_(cabecalho, ["DATA INICIO", "DATA DE INICIO", "DATA DE SAIDA FALTA"]);
  const idxDias = indiceCabecalho_(cabecalho, ["DIAS", "QTD DIAS"]);
  const idxDiasFerias = indiceCabecalho_(cabecalho, ["QUANTIDADE FERIAS", "QTD FERIAS"]);

  if (colIdxTipo === -1 || colIdxMat === -1 || colIdxDataIni === -1) return {};
  
  const idxParaDias = { dias: idxDias, diasFerias: idxDiasFerias };
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  let mapa = {};
  
  for (let i = 1; i < dadosLanc.length; i++) {
    let linha = dadosLanc[i];
    let mat = normalizarChaveMatricula_(linha[colIdxMat]);
    let tipoDoc = normalizarCabecalho_(linha[colIdxTipo]);
    
    // Ignora anulados
    if (tipoDoc.includes("NAO EFETIVADO") || tipoDoc.includes("ANULADO")) continue;
    
    let dataInicio = normalizarDataServidorObjeto_(linha[colIdxDataIni]);
    if (!dataInicio) continue;
    
    let dias = obterDiasLancamento_(linha, idxParaDias);
    let dataFim = new Date(dataInicio);
    dataFim.setDate(dataInicio.getDate() + (dias > 0 ? dias - 1 : 0));
    dataFim.setHours(0, 0, 0, 0);
    
    // Verifica se a ausência está ocorrendo hoje
    if (hoje >= dataInicio && hoje <= dataFim) {
      if (tipoDoc.includes("FERIAS")) {
        mapa[mat] = "Férias";
      } else if (tipoDoc.includes("ABONADA") || tipoDoc.includes("ABONO")) {
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

/**
 * Gera uma chave única para matrícula, tolerando número, texto e referências
 * produzidas pelo AppSheet (ex.: "86916: NOME DO SERVIDOR").
 */
/** Converte números e textos como "30 dias" sem transformar vazio em zero. */
function obterNumeroPlanilha_(valor) {
  if (typeof valor === "number" && isFinite(valor)) return valor;
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;

  const encontrado = String(valor).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return encontrado ? Number(encontrado[0]) : null;
}
/**
 * Consolida créditos liberados, créditos futuros e férias utilizadas.
 * Os débitos são consumidos dos períodos mais antigos primeiro (FIFO).
 */
function construirResumoFerias_(ss) {
  const resumo = {};
  const referenciasLidas = new Set();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  function obterRegistro_(matricula) {
    if (!resumo[matricula]) {
      resumo[matricula] = { creditos: [], debitos: 0, saldo: 0, projetado: 0, periodos: [] };
    }
    return resumo[matricula];
  }

  const abaCreditos = ss.getSheetByName("Creditos_Ferias");
  if (abaCreditos) {
    const dadosCreditos = obterValoresAba_(abaCreditos);
    if (dadosCreditos.length > 1) {
      const cabecalho = dadosCreditos[0];
      const idxMatricula = indiceCabecalho_(cabecalho, ["MATRICULA"]);
      const idxQtd = indiceCabecalho_(cabecalho, ["QTD DIAS", "QUANTIDADE DIAS"]);
      const idxReferencia = indiceCabecalho_(cabecalho, ["REFERENCIA", "PERIODO AQUISITIVO"]);
      const idxPenalidade = indiceCabecalho_(cabecalho, ["PENALIDADE", "PENALIDADE DIAS"]);
      const idxLiberacao = indiceCabecalho_(cabecalho, [
        "DATA LIBERACAO",
        "DATA LIMITE AQUISITIVO",
        "DATA LIMITE",
        "VENCIMENTO",
        "AQUISITIVO FIM"
      ]);

      if (idxMatricula !== -1 && idxQtd !== -1 && idxLiberacao !== -1) {
        for (let i = 1; i < dadosCreditos.length; i++) {
          const matricula = normalizarChaveMatricula_(dadosCreditos[i][idxMatricula]);
          const quantidade = parseInt(dadosCreditos[i][idxQtd], 10) || 0;
          const penalidade = idxPenalidade !== -1 ? Math.max(0, parseInt(dadosCreditos[i][idxPenalidade], 10) || 0) : 0;
          const referencia = idxReferencia !== -1
            ? String(dadosCreditos[i][idxReferencia] || "").trim()
            : "Período aquisitivo";
          const dataLiberacao = normalizarDataServidorObjeto_(dadosCreditos[i][idxLiberacao]);

          if (!matricula || quantidade <= 0 || !dataLiberacao) continue;

          // Evita somar duas vezes o mesmo período caso haja linhas duplicadas.
          const chaveReferencia = matricula + "|" + normalizarCabecalho_(referencia);
          if (referenciasLidas.has(chaveReferencia)) continue;
          referenciasLidas.add(chaveReferencia);

          obterRegistro_(matricula).creditos.push({
            referencia: referencia,
            quantidade: quantidade,
            penalidade: Math.min(quantidade, penalidade),
            dataLiberacao: dataLiberacao
          });
        }
      }
    }
  }

  const abaLancamentos = ss.getSheetByName("Lançamentos") || ss.getSheetByName("Lancamentos");
  if (abaLancamentos) {
    const dadosLancamentos = obterValoresAba_(abaLancamentos);
    if (dadosLancamentos.length > 1) {
      const idx = obterIndicesColunasLancamentos_(dadosLancamentos[0]);

      if (idx.tipo !== -1 && idx.matricula !== -1) {
        for (let i = 1; i < dadosLancamentos.length; i++) {
          const linha = dadosLancamentos[i];
          const matricula = normalizarChaveMatricula_(linha[idx.matricula]);
          const tipo = normalizarCabecalho_(linha[idx.tipo]);
          const efetivado = !tipo.includes("NAO EFETIVAD") && !tipo.includes("ANULAD");
          const descontaFerias = tipo.includes("FERIAS") || tipo.includes("PENALIDADE") || tipo.includes("AJUSTE");
          const eAbono = (tipo.includes("ABONADA") || tipo.includes("ABONO")) && !tipo.includes("NATALICIA") && !tipo.includes("ELEITORAL");
          const dias = descontaFerias
            ? obterTotalDebitoFerias_(linha, idx)
            : obterDiasLancamento_(linha, idx);

          if (matricula && efetivado) {
            if (descontaFerias && dias > 0) {
              obterRegistro_(matricula).debitos += dias;
            }
            if (eAbono) {
              let dataInicioStr = idx.dataInicio !== -1 ? String(linha[idx.dataInicio]) : "";
              let dataInicioObj = lerDataFormatoBR_(dataInicioStr);
              if (!dataInicioObj) {
                // Tenta fallback para obj Date nativo caso ja venha formatado
                if (linha[idx.dataInicio] instanceof Date && !isNaN(linha[idx.dataInicio].getTime())) {
                  dataInicioObj = linha[idx.dataInicio];
                }
              }
              let anoInicio = dataInicioObj ? String(dataInicioObj.getFullYear()) : "";
              if (anoInicio === String(hoje.getFullYear())) {
                let reg = obterRegistro_(matricula);
                reg.abonosUsados = (reg.abonosUsados || 0) + 1;
              }
            }
          }
        }
      }
    }
  }

  Object.keys(resumo).forEach(matricula => {
    const registro = resumo[matricula];
    registro.creditos.sort((a, b) => a.dataLiberacao.getTime() - b.dataLiberacao.getTime());

    let debitoRestante = registro.debitos;
    registro.penalidadesPeriodos = 0;
    registro.creditos.forEach(credito => {
      const liberado = credito.dataLiberacao <= hoje;
      const quantidadeDisponivel = Math.max(0, credito.quantidade - Number(credito.penalidade || 0));
      registro.penalidadesPeriodos += Number(credito.penalidade || 0);
      let diasUsados = 0;
      let saldoPeriodo = 0;

      if (liberado) {
        diasUsados = Math.min(debitoRestante, quantidadeDisponivel);
        debitoRestante -= diasUsados;
        saldoPeriodo = quantidadeDisponivel - diasUsados;
        registro.saldo += saldoPeriodo;
      } else {
        registro.projetado += quantidadeDisponivel;
      }

      registro.periodos.push({
        referencia: credito.referencia,
        dataLiberacao: formatarDataServidor_(credito.dataLiberacao),
        diasOriginais: credito.quantidade,
        penalidade: Number(credito.penalidade || 0),
        diasUsados: diasUsados,
        saldo: saldoPeriodo,
        status: !liberado ? "Em aquisição" : (saldoPeriodo > 0 ? "Disponível" : "Usufruído")
      });
    });

    delete registro.creditos;
    delete registro.debitos;
  });

  return resumo;
}

/** Mantém compatibilidade com Dashboard e outros serviços existentes. */
function construirMapaSaldosFerias_(ss) {
  const resumo = construirResumoFerias_(ss);
  const mapa = {};
  Object.keys(resumo).forEach(matricula => {
    mapa[matricula] = resumo[matricula].saldo;
  });
  return mapa;
}
