/**
 * RH Central de Documentos v2.0
 * Módulo de Negócio dos Servidores (ServidoresService)
 */

/**
 * Retorna a lista de todos os servidores cadastrados para exibição na interface (Performance O(N+M))
 */
function obterListaServidores() {
  obterDadosUsuarioLogado();
  
  const ss = obterPlanilha_();
  const aba = ss.getSheetByName("Servidores");
  if (!aba) return [];
  
  const dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];
  
  const cabecalho = dados[0];
  
  const idxNome = indiceCabecalho_(cabecalho, ["NOME", "NOME COMPLETO"]);
  const idxMatricula = indiceCabecalho_(cabecalho, ["MATRICULA"]);
  const idxCargo = indiceCabecalho_(cabecalho, ["CARGO"]);
  const idxLotacao = indiceCabecalho_(cabecalho, ["LOTACAO"]);
  const idxAdmissao = indiceCabecalho_(cabecalho, ["DATA DE ADMISSAO", "ADMISSAO"]);
  const idxSituacao = indiceCabecalho_(cabecalho, ["SITUACAO"]);
  const idxEmail = indiceCabecalho_(cabecalho, ["E MAIL", "EMAIL"]);
  const idxSaldoHoje = indiceCabecalho_(cabecalho, ["FERIAS SALDO HOJE", "SALDO HOJE", "SALDO FERIAS"]);
  const idxProjetado = indiceCabecalho_(cabecalho, ["FERIAS PROJETADO ESTE ANO", "PROJETADO ESTE ANO", "PROJETADO"]);
  const idxInfoFerias = indiceCabecalho_(cabecalho, ["INFO FERIAS"]);
  const idxAtivo = indiceCabecalho_(cabecalho, ["ATIVO"]);
  const idxPenF = indiceCabecalho_(cabecalho, ["PENALIDADE FERIAS", "PENALIDADE_FERIAS"]);
  const idxPenA = indiceCabecalho_(cabecalho, ["PENALIDADE ABONOS", "PENALIDADE_ABONOS"]);

  if (idxNome === -1 || idxMatricula === -1) {
    throw new Error("Cabecalhos NOME/MATRICULA nao encontrados em Servidores. Encontrados: " + cabecalho.join(" | "));
  }
  
  // Otimização O(N + M): carrega status, saldos e períodos em lote.
  const mapaStatus = construirMapaStatusServidores_(ss);
  const resumoFerias = construirResumoFerias_(ss);
  
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
      
      let saldoHojeCalculado = saldoCalc - penF;
      let abonosUsadosCalculado = (feriasServidor.abonosUsados || 0) + penA;
      
      servidores.push({
        nome: String(linha[idxNome]).trim(),
        matricula: matricula,
        cargo: idxCargo !== -1 ? String(linha[idxCargo]).trim() : "",
        lotacao: idxLotacao !== -1 ? String(linha[idxLotacao]).trim() : "",
        admissao: idxAdmissao !== -1 ? formatarDataServidor_(linha[idxAdmissao]) : "",
        admissaoBruta: idxAdmissao !== -1 && linha[idxAdmissao] instanceof Date ? linha[idxAdmissao].getTime() : (idxAdmissao !== -1 ? linha[idxAdmissao] : null),
        situacao: idxSituacao !== -1 ? String(linha[idxSituacao]).trim() : "",
        email: idxEmail !== -1 ? String(linha[idxEmail]).trim() : "",
        saldoHoje: saldoHojeCalculado,
        feriasCompulsorias: saldoHojeCalculado >= 60,
        projetado: parseInt(feriasServidor.projetado) || 0,
        infoFerias: idxInfoFerias !== -1 ? String(linha[idxInfoFerias] || "").trim() : "",
        periodosFerias: feriasServidor.periodos,
        abonosUsados: abonosUsadosCalculado,
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
  let gerarCreditosDepois = false;
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
  const idxAtivo = indiceCabecalho_(cabecalho, ["ATIVO"]);

  let idxPenF = indiceCabecalho_(cabecalho, ["PENALIDADE FERIAS", "PENALIDADE_FERIAS"]);
  let idxPenA = indiceCabecalho_(cabecalho, ["PENALIDADE ABONOS", "PENALIDADE_ABONOS"]);

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

  const matriculaBusca = normalizarChaveMatricula_(dadosServidor.matricula);
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
    // MODO EDIÇÃO: Atualiza apenas as células de dados usando lote por segurança de fórmulas
    if (idxNome !== -1) aba.getRange(linhaEdit, idxNome + 1).setValue(dadosServidor.nome.toUpperCase());
    if (idxCargo !== -1) aba.getRange(linhaEdit, idxCargo + 1).setValue(dadosServidor.cargo);
    if (idxLotacao !== -1) aba.getRange(linhaEdit, idxLotacao + 1).setValue(dadosServidor.lotacao);
    if (idxAdmissao !== -1 && dataAdmissao) aba.getRange(linhaEdit, idxAdmissao + 1).setValue(dataAdmissao);
    if (idxSituacao !== -1) aba.getRange(linhaEdit, idxSituacao + 1).setValue(dadosServidor.situacao);
    if (idxEmail !== -1) aba.getRange(linhaEdit, idxEmail + 1).setValue(dadosServidor.email);
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

  return true;
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
  
  const dadosLanc = abaLanc.getDataRange().getValues();
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
    const dadosCreditos = abaCreditos.getDataRange().getValues();
    if (dadosCreditos.length > 1) {
      const cabecalho = dadosCreditos[0];
      const idxMatricula = indiceCabecalho_(cabecalho, ["MATRICULA"]);
      const idxQtd = indiceCabecalho_(cabecalho, ["QTD DIAS", "QUANTIDADE DIAS"]);
      const idxReferencia = indiceCabecalho_(cabecalho, ["REFERENCIA", "PERIODO AQUISITIVO"]);
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
            dataLiberacao: dataLiberacao
          });
        }
      }
    }
  }

  const abaLancamentos = ss.getSheetByName("Lançamentos") || ss.getSheetByName("Lancamentos");
  if (abaLancamentos) {
    const dadosLancamentos = abaLancamentos.getDataRange().getValues();
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
          const dias = obterDiasLancamento_(linha, idx);

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
    registro.creditos.forEach(credito => {
      const liberado = credito.dataLiberacao <= hoje;
      let diasUsados = 0;
      let saldoPeriodo = 0;

      if (liberado) {
        diasUsados = Math.min(debitoRestante, credito.quantidade);
        debitoRestante -= diasUsados;
        saldoPeriodo = credito.quantidade - diasUsados;
        registro.saldo += saldoPeriodo;
      } else {
        registro.projetado += credito.quantidade;
      }

      registro.periodos.push({
        referencia: credito.referencia,
        dataLiberacao: formatarDataServidor_(credito.dataLiberacao),
        diasOriginais: credito.quantidade,
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
