/** Vínculos permanentes entre identificadores encontrados nos AFDs e o cadastro oficial. */
const REP_VINCULOS_ABA_ = 'Vinculos_REP';
const REP_VINCULOS_CABECALHO_ = ['Identificador_REP', 'PIS_Oficial', 'Matricula', 'Nome', 'Lotacao', 'Atualizado_Em', 'Atualizado_Por', 'Ativo'];

function normalizarIdentificadorRep_(valor) {
  let digitos = String(valor || '').replace(/\D/g, '');
  while (digitos.length > 11 && digitos.charAt(0) === '0') digitos = digitos.slice(1);
  // Alguns AFDs gravam o PIS sem seu zero inicial. O PIS/CPF utilizado no
  // cadastro possui 11 dígitos, portanto esta forma é apenas uma variação de
  // leitura do mesmo identificador e deve alcançar o vínculo persistido.
  if (digitos.length === 10) digitos = '0' + digitos;
  return digitos;
}

function obterAbaVinculosRep_() {
  const ss = obterPlanilha_();
  let aba = ss.getSheetByName(REP_VINCULOS_ABA_);
  if (!aba) {
    aba = ss.insertSheet(REP_VINCULOS_ABA_);
    aba.getRange(1, 1, 1, REP_VINCULOS_CABECALHO_.length).setValues([REP_VINCULOS_CABECALHO_]);
    aba.getRange(1, 1, 1, REP_VINCULOS_CABECALHO_.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    aba.setFrozenRows(1);
  }
  return aba;
}

function listarVinculosRep() {
  const aba = obterAbaVinculosRep_();
  if (aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, REP_VINCULOS_CABECALHO_.length).getValues()
    .filter(linha => String(linha[0] || '').trim() && String(linha[7] || 'Sim').toLowerCase() !== 'não')
    .map(linha => ({
      identificador: normalizarIdentificadorRep_(linha[0]),
      pisOficial: normalizarIdentificadorRep_(linha[1]),
      matricula: String(linha[2] || '').trim(),
      nome: String(linha[3] || '').trim(),
      lotacao: String(linha[4] || '').trim() || 'Não informada'
    }));
}

function salvarVinculosRep(dados) {
  dados = dados || {};
  const pisOficial = normalizarIdentificadorRep_(dados.pisOficial);
  const identificadores = Array.from(new Set((dados.identificadores || []).map(normalizarIdentificadorRep_).filter(Boolean)));
  if (!pisOficial || !identificadores.length) throw new Error('Informe o servidor e ao menos um identificador do REP.');

  const servidor = obterListaServidores().find(item => normalizarIdentificadorRep_(item.pis) === pisOficial);
  if (!servidor) throw new Error('O PIS oficial não foi encontrado no cadastro de servidores.');

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) throw new Error('Sistema ocupado. Tente salvar o vínculo novamente.');
  try {
    const aba = obterAbaVinculosRep_();
    const existentes = aba.getLastRow() > 1
      ? aba.getRange(2, 1, aba.getLastRow() - 1, REP_VINCULOS_CABECALHO_.length).getValues()
      : [];
    const linhasPorIdentificador = new Map();
    existentes.forEach((linha, indice) => linhasPorIdentificador.set(normalizarIdentificadorRep_(linha[0]), indice + 2));
    const usuario = obterDadosUsuarioLogado();
    const agora = new Date();
    const novas = [];
    identificadores.forEach(identificador => {
      const valores = [[identificador, pisOficial, servidor.matricula || '', servidor.nome || '', servidor.lotacao || 'Não informada', agora, usuario.email || '', 'Sim']];
      const linhaExistente = linhasPorIdentificador.get(identificador);
      if (linhaExistente) aba.getRange(linhaExistente, 1, 1, REP_VINCULOS_CABECALHO_.length).setValues(valores);
      else novas.push(valores[0]);
    });
    if (novas.length) aba.getRange(aba.getLastRow() + 1, 1, novas.length, REP_VINCULOS_CABECALHO_.length).setValues(novas);
    return { sucesso: true, identificadores, pisOficial, nome: servidor.nome, matricula: servidor.matricula, lotacao: servidor.lotacao || 'Não informada' };
  } finally {
    lock.releaseLock();
  }
}
