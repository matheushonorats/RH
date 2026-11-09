/** Planejamento deterministico da Entidade. Nenhuma funcao deste modulo consome API de IA. */

function obterMinimosCoberturaEntidade_() {
  const bruto = String(obterConfigValorInterno_('ENTIDADE_MINIMO_COBERTURA_JSON') || '').trim();
  if (!bruto) return {};
  let dados = null;
  try { dados = JSON.parse(bruto); } catch (e) { return {}; }
  const saida = {};
  Object.keys(dados || {}).forEach(function(lotacao) {
    const minimo = Math.floor(Number(dados[lotacao]));
    if (isFinite(minimo) && minimo >= 1) saida[String(lotacao).trim()] = minimo;
  });
  return saida;
}

function dataPlanejamentoEntidade_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) { const copia = new Date(valor); copia.setHours(0, 0, 0, 0); return copia; }
  const texto = String(valor || '').trim();
  let p = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (p) return new Date(Number(p[3]), Number(p[2]) - 1, Number(p[1]));
  p = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return p ? new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3])) : null;
}

function ehAfastamentoCoberturaEntidade_(lancamento) {
  if (!lancamento || lancamento.identidadeConsistente === false) return false;
  const status = normalizarCabecalho_(lancamento.status || '').toUpperCase();
  if (status.indexOf('ANUL') !== -1 || status.indexOf('CANCEL') !== -1 || status.indexOf('NAO EFETIVADO') !== -1) return false;
  const tipo = normalizarCabecalho_(lancamento.tipo || '').toUpperCase();
  if (/HORA EXTRA|AUTORIZACAO/.test(tipo)) return false;
  return /FERIAS|ABONAD|LICENCA|AFASTAMENTO|FALTA|GALA|NOJO/.test(tipo);
}

function calcularPlanejamentoCoberturaEntidade_(servidores, lancamentos, minimos, dataInicial, dias) {
  const inicio = dataInicial instanceof Date ? new Date(dataInicial) : new Date();
  inicio.setHours(0, 0, 0, 0);
  const horizonte = Math.max(1, Math.min(90, Number(dias || 28)));
  const ativos = (servidores || []).filter(function(item) { return String(item.status || '') !== 'Inativo'; });
  const lotacaoCanonica = {};
  const totais = {};
  ativos.forEach(function(item) {
    const chave = normalizarCabecalho_(item.lotacao || '').toUpperCase();
    if (!chave) return;
    lotacaoCanonica[chave] = String(item.lotacao || '').trim();
    totais[chave] = Number(totais[chave] || 0) + 1;
  });
  const minimosNormalizados = {};
  Object.keys(minimos || {}).forEach(function(nome) { minimosNormalizados[normalizarCabecalho_(nome).toUpperCase()] = Number(minimos[nome]); });
  const servidorPorMatricula = {};
  ativos.forEach(function(item) { servidorPorMatricula[normalizarChaveMatricula_(item.matricula)] = item; });
  const periodos = (lancamentos || []).filter(ehAfastamentoCoberturaEntidade_).map(function(item) {
    const data = dataPlanejamentoEntidade_(item.dataInicio);
    const quantidade = Math.max(1, Number(item.dias || 1));
    if (!data) return null;
    const fim = new Date(data); fim.setDate(fim.getDate() + quantidade - 1);
    return { matricula: normalizarChaveMatricula_(item.matricula), inicio: data, fim: fim };
  }).filter(Boolean);
  const alertas = [];
  Object.keys(minimosNormalizados).forEach(function(chaveLotacao) {
    const minimo = minimosNormalizados[chaveLotacao];
    const total = Number(totais[chaveLotacao] || 0);
    let pior = null;
    for (let deslocamento = 0; deslocamento < horizonte; deslocamento++) {
      const data = new Date(inicio); data.setDate(data.getDate() + deslocamento);
      const ausentes = {};
      periodos.forEach(function(periodo) {
        const servidor = servidorPorMatricula[periodo.matricula];
        if (!servidor || normalizarCabecalho_(servidor.lotacao || '').toUpperCase() !== chaveLotacao) return;
        if (periodo.inicio <= data && periodo.fim >= data) ausentes[periodo.matricula] = true;
      });
      const quantidadeAusentes = Object.keys(ausentes).length;
      const disponiveis = Math.max(0, total - quantidadeAusentes);
      if (disponiveis < minimo && (!pior || disponiveis < pior.disponiveis)) {
        pior = { lotacao: lotacaoCanonica[chaveLotacao] || chaveLotacao, data: Utilities.formatDate(data, Session.getScriptTimeZone(), 'dd/MM/yyyy'), total: total, ausentes: quantidadeAusentes, disponiveis: disponiveis, minimo: minimo };
      }
    }
    if (pior) alertas.push(pior);
  });
  return alertas.sort(function(a, b) { return a.disponiveis - b.disponiveis || a.lotacao.localeCompare(b.lotacao); });
}

function obterAlertasCoberturaEntidade_() {
  const minimos = obterMinimosCoberturaEntidade_();
  if (!Object.keys(minimos).length) return [];
  return calcularPlanejamentoCoberturaEntidade_(obterListaServidores(), obterListaLancamentos(), minimos, new Date(), 28);
}

function obterPlanejamentoCoberturaEntidade() {
  obterDadosUsuarioLogado();
  const minimos = obterMinimosCoberturaEntidade_();
  if (!Object.keys(minimos).length) return { configurado: false, alertas: [], mensagem: 'Defina ENTIDADE_MINIMO_COBERTURA_JSON para ativar o planejamento de cobertura.' };
  const alertas = obterAlertasCoberturaEntidade_();
  return { configurado: true, horizonteDias: 28, alertas: alertas, mensagem: alertas.length ? alertas.length + ' lotação(ões) abaixo do mínimo configurado.' : 'Nenhuma insuficiência de cobertura prevista nos próximos 28 dias.' };
}

function obterResumoSemanalEntidade() {
  obterDadosUsuarioLogado();
  const ss = obterPlanilha_();
  const abaOcorrencias = ss.getSheetByName('Entidade_Ocorrencias');
  const abaEventos = ss.getSheetByName('Entidade_Eventos');
  const agora = Date.now();
  const seteDias = agora - 7 * 86400000;
  const ocorrencias = abaOcorrencias && abaOcorrencias.getLastRow() > 1
    ? abaOcorrencias.getRange(2, 1, abaOcorrencias.getLastRow() - 1, ENTIDADE_OCORRENCIAS_CABECALHO_.length).getValues().map(linhaParaOcorrenciaEntidade_) : [];
  const abertas = ocorrencias.filter(function(item) { return item.situacao !== 'RESOLVIDA'; });
  const envelhecidas = abertas.filter(function(item) { const data = item.detectadaEm instanceof Date ? item.detectadaEm.getTime() : new Date(item.detectadaEm).getTime(); return isFinite(data) && data < seteDias; });
  const contagem = { criadas: 0, reabertas: 0, resolvidas: 0 };
  if (abaEventos && abaEventos.getLastRow() > 1) {
    abaEventos.getRange(2, 1, abaEventos.getLastRow() - 1, ENTIDADE_EVENTOS_CABECALHO_.length).getValues().forEach(function(linha) {
      const data = linha[2] instanceof Date ? linha[2].getTime() : new Date(linha[2]).getTime();
      if (!isFinite(data) || data < seteDias) return;
      const tipo = String(linha[3] || '');
      if (tipo === 'CRIADA') contagem.criadas++;
      else if (tipo === 'REABERTA') contagem.reabertas++;
      else if (tipo.indexOf('RESOLVIDA') === 0) contagem.resolvidas++;
    });
  }
  return {
    periodoDias: 7, abertasAgora: abertas.length, altaSeveridade: abertas.filter(function(item) { return Number(item.severidade || 0) >= 4; }).length,
    envelhecidas: envelhecidas.length, criadas: contagem.criadas, reabertas: contagem.reabertas, resolvidas: contagem.resolvidas,
    prioridades: abertas.slice().sort(ordenarOcorrenciasEntidade_).slice(0, 5).map(function(item) { return { id: item.id, titulo: item.titulo, nome: item.nome, matricula: item.matricula, prazo: item.prazo || '' }; })
  };
}

