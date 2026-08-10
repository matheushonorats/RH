/**
 * RH Central de Documentos v2.0
 * Módulo de Gestão de Créditos de Férias (CreditosFeriasService)
 * 
 * Portado e aprimorado do robô diário original da planilha com concorrência e lote.
 */

/**
 * Executa a varredura diária automática para gerar créditos de novos períodos aquisitivos
 * Acionado por gatilho de tempo do Apps Script
 */
function gerarCreditosAutomaticos() {
  processarCreditosGerais_(0, false);
}

/**
 * Menu manual executado pelo Administrador da interface
 */
function menuGerarGeral() {
  if (!verificarSeEhAdmin()) {
    throw new Error("Apenas Administradores podem forçar a geração em massa de créditos de férias.");
  }
  processarCreditosGerais_(0, true);
  return true;
}

/**
 * Lógica Central de Processamento de Créditos de Férias (Com LockService e Lote)
 */
function processarCreditosGerais_(diasFuturos, exibirAlertas) {
  const lock = LockService.getScriptLock();
  try {
    // Tenta obter o bloqueio por até 15 segundos
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("Erro de concorrência: Outro processo está gerando créditos de férias.");
    return { novos: 0, duplicados: 0, erros: 0, status: "ocupado" };
  }
  
  try {
    const ss = obterPlanilha_();
    const abaServ = ss.getSheetByName("Servidores");
    const abaCred = ss.getSheetByName("Creditos_Ferias");
    
    if (!abaServ || !abaCred) {
      lancarLogSemLock_("ERRO_CREDITOS", "Creditos_Ferias", "Erro ao executar rotina: abas Servidores ou Creditos_Ferias não encontradas.", "", "", "", "");
      return { novos: 0, duplicados: 0, erros: 0 };
    }
    
    const dados = abaServ.getDataRange().getValues();
    const cabecalho = dados[0];
    
    const colMatriculaIdx = indiceCabecalho_(cabecalho, ["MATRICULA"]);
    const colAdmissaoIdx = indiceCabecalho_(cabecalho, ["DATA DE ADMISSAO", "ADMISSAO"]);
    const colAtivoIdx = indiceCabecalho_(cabecalho, ["ATIVO"]);

    if (colMatriculaIdx === -1 || colAdmissaoIdx === -1) {
      throw new Error("Cabecalhos MATRICULA/DATA DE ADMISSAO nao encontrados em Servidores.");
    }
    
    let gerados = 0;
    let erros = 0;
    let duplicados = 0;
    
    const hoje = new Date();
    const dataLimiteFuturo = new Date();
    dataLimiteFuturo.setDate(hoje.getDate() + diasFuturos);
    
    // Carrega chaves de duplicidade em memória
    const creditosExistentes = obterChavesCreditosExistentesLocal_(abaCred);
    
    // Acumula os novos registros para inserção em lote ao final
    let novosCreditosLote = [];
    
    for (let i = 1; i < dados.length; i++) {
      let matricula = normalizarChaveMatricula_(dados[i][colMatriculaIdx]);
      let dataBruta = dados[i][colAdmissaoIdx];
      let ativo = colAtivoIdx !== -1 ? String(dados[i][colAtivoIdx]).trim() : "Sim";
      
      if (!matricula || ativo === "Não") continue; // Ignora inativos ou vazios
      
      let admissao = lerDataFormatoBR_(dataBruta);
      if (!admissao) {
        erros++;
        continue;
      }
      
      // Loop de períodos: Admissão + 1 ano até Data Limite Futura
      let cursorData = new Date(admissao);
      cursorData.setFullYear(cursorData.getFullYear() + 1);
      cursorData.setHours(0, 0, 0, 0);
      
      while (cursorData <= dataLimiteFuturo) {
        let anoFim = cursorData.getFullYear();
        let anoInicio = anoFim - 1;
        let referencia = "Aquisitivo " + anoInicio + "-" + anoFim;
        let chaveUnica = matricula + "|" + referencia;
        
        if (!creditosExistentes.has(chaveUnica)) {
          let id = Utilities.getUuid();
          novosCreditosLote.push([
            id,
            new Date(),
            matricula,
            referencia,
            30,
            new Date(cursorData)
          ]);
          creditosExistentes.add(chaveUnica);
          gerados++;
        } else {
          duplicados++;
        }
        
        cursorData.setFullYear(cursorData.getFullYear() + 1);
      }
    }
    
    // Executa a escrita em lote de todos os novos períodos aquisitivos gerados de uma só vez
    if (novosCreditosLote.length > 0) {
      const proximaLinha = abaCred.getLastRow() + 1;
      const rangeLote = abaCred.getRange(proximaLinha, 1, novosCreditosLote.length, 6);
      rangeLote.setValues(novosCreditosLote);
    }
    
    // Log sem lock (lock já está ativo neste bloco)
    lancarLogSemLock_(
      "GERAR_CREDITOS",
      "Creditos_Ferias",
      "Executou rotina de créditos de férias. Novos: " + gerados + " | Duplicados pulados: " + duplicados + " | Erros: " + erros,
      "", "", "", ""
    );
    
    return {
      novos: gerados,
      duplicados: duplicados,
      erros: erros
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lê objetos de data no formato de data nativo ou texto BR. Privada.
 */
function lerDataFormatoBR_(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (!isNaN(valor.getTime())) return valor;
    return null;
  }
  
  const str = String(valor).trim();
  const partes = str.split('/');
  if (partes.length === 3) {
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const ano = parseInt(partes[2], 10);
    const data = new Date(ano, mes, dia);
    if (!isNaN(data.getTime())) return data;
  }
  return null;
}

/**
 * Coleta chaves de duplicidade em lote. Privada.
 */
function obterChavesCreditosExistentesLocal_(abaCred) {
  const dados = abaCred.getDataRange().getValues();
  const chaves = new Set();
  for (let i = 1; i < dados.length; i++) {
    let mat = normalizarChaveMatricula_(dados[i][2]); 
    let ref = String(dados[i][3]).trim();
    if (mat && ref) chaves.add(mat + "|" + ref);
  }
  return chaves;
}

function salvarPenalidadePeriodoFerias(dados) {
  if (!verificarSeEhOperador()) throw new Error('Você não possui permissão para alterar penalidades de férias.');
  dados = dados || {};
  const matricula = normalizarChaveMatricula_(dados.matricula);
  const referencia = String(dados.referencia || '').trim();
  const dias = Math.max(0, Math.min(30, parseInt(dados.dias, 10) || 0));
  if (!matricula || !referencia) throw new Error('Período aquisitivo inválido.');
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) throw new Error('Sistema ocupado. Tente novamente em alguns segundos.');
  try {
    const aba = obterPlanilha_().getSheetByName('Creditos_Ferias');
    if (!aba) throw new Error("Aba 'Creditos_Ferias' não encontrada.");
    const dadosAba = aba.getDataRange().getValues();
    const cabecalho = dadosAba[0];
    const idxMatricula = indiceCabecalho_(cabecalho, ['MATRICULA']);
    const idxReferencia = indiceCabecalho_(cabecalho, ['REFERENCIA', 'PERIODO AQUISITIVO']);
    let idxPenalidade = indiceCabecalho_(cabecalho, ['PENALIDADE', 'PENALIDADE DIAS']);
    if (idxPenalidade === -1) {
      idxPenalidade = cabecalho.length;
      aba.getRange(1, idxPenalidade + 1).setValue('PENALIDADE_DIAS');
    }
    let linha = -1;
    for (let i = 1; i < dadosAba.length; i++) {
      if (normalizarChaveMatricula_(dadosAba[i][idxMatricula]) === matricula && String(dadosAba[i][idxReferencia] || '').trim() === referencia) { linha = i + 1; break; }
    }
    if (linha < 0) throw new Error('O período aquisitivo não foi encontrado.');
    const antes = Number(aba.getRange(linha, idxPenalidade + 1).getValue() || 0);
    aba.getRange(linha, idxPenalidade + 1).setValue(dias);
    lancarLogSemLock_('PENALIDADE_FERIAS', 'Creditos_Ferias', 'Atualizou penalidade do período ' + referencia + '.', 'Dias', String(antes), String(dias), matricula);
    return { sucesso: true, matricula: matricula, referencia: referencia, dias: dias };
  } finally { lock.releaseLock(); }
}
