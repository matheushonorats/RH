/**
 * Manutenção automática das tabelas auxiliares da Entidade.
 * Executada diariamente por gatilho instalável.
 */

const MANUTENCAO_SISTEMA = {
  pastaArquivo: 'SETUR_RH_Arquivos_Historicos',
  diasMemoriaBruta: 180,
  diasInsightsFinalizados: 365,
  linhasMinimasAba: 100,
  versaoGatilho: 'manutencao-diaria-v1'
};

function garantirGatilhoManutencaoSistema_() {
  const props = PropertiesService.getScriptProperties();
  const existentes = ScriptApp.getProjectTriggers().filter(function(gatilho) {
    return gatilho.getHandlerFunction() === 'executarManutencaoAutomaticaSistema';
  });

  if (props.getProperty('MANUTENCAO_GATILHO_VERSAO') !== MANUTENCAO_SISTEMA.versaoGatilho) {
    existentes.forEach(function(gatilho) { ScriptApp.deleteTrigger(gatilho); });
    ScriptApp.newTrigger('executarManutencaoAutomaticaSistema').timeBased().everyDays(1).atHour(2).create();
    props.setProperty('MANUTENCAO_GATILHO_VERSAO', MANUTENCAO_SISTEMA.versaoGatilho);
  } else if (!existentes.length) {
    ScriptApp.newTrigger('executarManutencaoAutomaticaSistema').timeBased().everyDays(1).atHour(2).create();
  }
}

function executarManutencaoAutomaticaSistema() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  const usuarioAnterior = _usuarioSessaoAtual;
  try {
    _usuarioSessaoAtual = { email: 'rotina.interna@setur', nome: 'Manutenção Automática', papel: 'Administrador', ativo: true };
    const ss = obterPlanilha_();
    const memoria = manterMemoriaEntidade_(ss);
    const insights = manterInsightsEntidade_(ss);

    lancarLogSemLock_(
      'MANUTENCAO_AUTOMATICA',
      'Sistema',
      'Manutenção das tabelas auxiliares concluída.',
      'Linhas arquivadas',
      '',
      'IA_Memoria: ' + memoria.arquivadas + '; IA_Insights: ' + insights.arquivadas,
      'ROTINA_AUTOMATICA'
    );
  } catch (e) {
    Logger.log('Erro na manutenção automática: ' + e.toString());
  } finally {
    _usuarioSessaoAtual = usuarioAnterior;
    lock.releaseLock();
  }
}

function manterMemoriaEntidade_(ss) {
  const aba = ss.getSheetByName('IA_Memoria');
  if (!aba || aba.getLastRow() <= 1) return { arquivadas: 0 };

  const cabecalho = aba.getRange(1, 1, 1, 8).getDisplayValues()[0];
  const valores = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
  const limite = new Date(Date.now() - MANUTENCAO_SISTEMA.diasMemoriaBruta * 86400000);
  const arquivar = [];
  const manter = [];

  valores.forEach(function(linha) {
    const data = normalizarDataManutencao_(linha[1]);
    if (data && data < limite) {
      consolidarAprendizadoMemoria_(ss, linha);
      arquivar.push(linha);
    } else {
      manter.push(linha);
    }
  });

  if (!arquivar.length) return { arquivadas: 0 };
  const arquivo = arquivarTabelaCsv_(cabecalho, arquivar, 'IA_Memoria');
  regravarTabelaCompactada_(aba, manter, 8);
  return { arquivadas: arquivar.length, arquivoId: arquivo.getId() };
}

function manterInsightsEntidade_(ss) {
  const aba = ss.getSheetByName('IA_Insights');
  if (!aba || aba.getLastRow() <= 1) return { arquivadas: 0 };

  const cabecalho = aba.getRange(1, 1, 1, 9).getDisplayValues()[0];
  const valores = aba.getRange(2, 1, aba.getLastRow() - 1, 9).getValues();
  const limite = new Date(Date.now() - MANUTENCAO_SISTEMA.diasInsightsFinalizados * 86400000);
  const arquivar = [];
  const manter = [];
  const fingerprintsMantidos = {};

  // Do mais recente para o mais antigo: elimina duplicatas antigas do mesmo estado.
  valores.slice().reverse().forEach(function(linha) {
    const data = normalizarDataManutencao_(linha[1]);
    const fingerprint = String(linha[2] || '').trim();
    const status = String(linha[6] || '').trim().toLowerCase();
    const pendente = status === 'pendente';
    const duplicado = fingerprint && fingerprintsMantidos[fingerprint];
    const finalizadoAntigo = !pendente && data && data < limite;

    if (duplicado || finalizadoAntigo) {
      arquivar.push(linha);
    } else {
      manter.push(linha);
      if (fingerprint) fingerprintsMantidos[fingerprint] = true;
    }
  });
  manter.reverse();

  if (!arquivar.length) return { arquivadas: 0 };
  arquivar.reverse();
  const arquivo = arquivarTabelaCsv_(cabecalho, arquivar, 'IA_Insights');
  regravarTabelaCompactada_(aba, manter, 9);
  return { arquivadas: arquivar.length, arquivoId: arquivo.getId() };
}

function obterAbaConhecimentoEntidade_(ss) {
  let aba = ss.getSheetByName('IA_Conhecimento');
  if (!aba) {
    aba = ss.insertSheet('IA_Conhecimento');
    aba.getRange(1, 1, 1, 5).setValues([['CHAVE', 'DATA_ATUALIZACAO', 'PERGUNTA_REFERENCIA', 'ORIENTACAO_VALIDADA', 'ATIVO']]);
    aba.setFrozenRows(1);
  }
  return aba;
}

function consolidarAprendizadoMemoria_(ss, linha) {
  const avaliacao = String(linha[5] || '').toUpperCase();
  const correcao = String(linha[6] || '').trim();
  if (avaliacao !== 'UTIL' && !correcao) return;

  const pergunta = String(linha[3] || '').trim();
  const orientacao = String(correcao || linha[4] || '').trim();
  if (!pergunta || !orientacao) return;

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalizarCabecalho_(pergunta + '|' + orientacao).toLowerCase(),
    Utilities.Charset.UTF_8
  );
  const chave = Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
  const aba = obterAbaConhecimentoEntidade_(ss);
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha > 1) {
    const chaves = aba.getRange(2, 1, ultimaLinha - 1, 1).getDisplayValues();
    for (let i = 0; i < chaves.length; i++) {
      if (chaves[i][0] === chave) {
        aba.getRange(i + 2, 2, 1, 4).setValues([[new Date(), pergunta.slice(0, 1000), orientacao.slice(0, 4000), 'Sim']]);
        return;
      }
    }
  }

  aba.appendRow([chave, new Date(), pergunta.slice(0, 1000), orientacao.slice(0, 4000), 'Sim']);
}

function arquivarTabelaCsv_(cabecalho, linhas, origem) {
  const pasta = obterPastaArquivosHistoricos_();
  const data = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm-ss');
  const nome = origem + '_' + data + '.csv';
  const conteudo = [cabecalho].concat(linhas).map(function(linha) {
    return linha.map(formatarCelulaCsvManutencao_).join(';');
  }).join('\r\n') + '\r\n';
  const arquivo = pasta.createFile(nome, conteudo, MimeType.CSV);
  if (!arquivo || !arquivo.getId()) throw new Error('Falha ao confirmar o arquivo histórico de ' + origem + '.');
  return arquivo;
}

function obterPastaArquivosHistoricos_() {
  const nome = MANUTENCAO_SISTEMA.pastaArquivo;
  const existentes = DriveApp.getFoldersByName(nome);
  return existentes.hasNext() ? existentes.next() : DriveApp.createFolder(nome);
}

function formatarCelulaCsvManutencao_(valor) {
  let texto = valor instanceof Date
    ? Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
    : String(valor == null ? '' : valor);
  // Impede que planilhas executem fórmulas ao abrir o arquivo exportado.
  if (/^[=+\-@]/.test(texto)) texto = "'" + texto;
  return '"' + texto.replace(/"/g, '""') + '"';
}

function regravarTabelaCompactada_(aba, linhas, colunas) {
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha > 1) aba.getRange(2, 1, ultimaLinha - 1, colunas).clearContent();
  if (linhas.length) aba.getRange(2, 1, linhas.length, colunas).setValues(linhas);

  const linhasDesejadas = Math.max(MANUTENCAO_SISTEMA.linhasMinimasAba, linhas.length + 1);
  const excesso = aba.getMaxRows() - linhasDesejadas;
  if (excesso > 0) aba.deleteRows(linhasDesejadas + 1, excesso);
}

function normalizarDataManutencao_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
  const data = new Date(valor);
  return isNaN(data.getTime()) ? null : data;
}
