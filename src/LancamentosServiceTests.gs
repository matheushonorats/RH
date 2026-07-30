/** Testes determinísticos da detecção de sobreposição entre afastamentos. */
function executarTestesSobreposicaoLancamentos_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de sobreposição falhou: ' + mensagem);
  }

  const base = [
    { id: 'ferias-1', nome: 'Ana', matricula: '100', tipo: 'Férias', dataInicio: '2026-08-01', dias: 15, status: 'Ativo', linhaPlanilha: 2 }
  ];
  const conflito = encontrarConflitosCandidatoLancamento_({
    matricula: '100', tipo: 'Abonada', dataInicio: '2026-08-14', dias: 1
  }, base);
  afirmar_(conflito.length === 1, 'abono no dia 14 deve conflitar com férias de 1 a 15');

  afirmar_(encontrarConflitosCandidatoLancamento_({
    matricula: '100', tipo: 'Abonada', dataInicio: '2026-08-16', dias: 1
  }, base).length === 0, 'dia seguinte ao fim não deve conflitar');

  afirmar_(encontrarConflitosCandidatoLancamento_({
    matricula: '200', tipo: 'Abonada', dataInicio: '2026-08-14', dias: 1
  }, base).length === 0, 'matrícula diferente não deve conflitar');

  afirmar_(encontrarConflitosCandidatoLancamento_({
    matricula: '100', tipo: 'Autorizaçao de Horas Extras', dataInicio: '2026-08-14', dias: 1
  }, base).length === 0, 'hora extra não representa afastamento');

  afirmar_(encontrarConflitosCandidatoLancamento_({
    matricula: '100', tipo: 'Abonada', dataInicio: '2026-08-14', dias: 1, linhaPlanilha: 2
  }, base).length === 0, 'edição deve ignorar a própria linha');

  const anulada = [{ nome: 'Ana', matricula: '100', tipo: 'Férias (Anulado)', dataInicio: '2026-08-01', dias: 15, status: 'Anulado', linhaPlanilha: 3 }];
  afirmar_(encontrarConflitosCandidatoLancamento_({
    matricula: '100', tipo: 'Abonada', dataInicio: '2026-08-14', dias: 1
  }, anulada).length === 0, 'registro anulado não deve conflitar');

  const retroativos = detectarSobreposicoesLancamentos_(base.concat([
    { id: 'abono-1', nome: 'Ana', matricula: '100', tipo: 'Abonada', dataInicio: '14/08/2026', dias: 1, status: 'Ativo', linhaPlanilha: 4 }
  ]), 20);
  afirmar_(retroativos.length === 1, 'varredura deve detectar conflito já existente');
  afirmar_(retroativos[0].inicioSobreposicao === '14/08/2026', 'deve informar o dia sobreposto');
  afirmar_(retroativos[0].primeiroId === 'ferias-1' && retroativos[0].segundoId === 'abono-1',
    'conflito deve preservar os IDs exatos dos registros');
  afirmar_(retroativos[0].primeiroStatus === 'Ativo' && retroativos[0].segundoStatus === 'Ativo',
    'somente registros ativos devem compor o alerta');

  afirmar_(identidadeLancamentoConsistente_('26450', '26450: MARIA CRISTINA DE OLIVEIRA DA SILVA') === true,
    'matrícula igual no campo NOME deve ser considerada consistente');
  afirmar_(identidadeLancamentoConsistente_('26450', '40975: INALDO PAIXÃO TAVARES BRAGA') === false,
    'matrículas divergentes devem ser identificadas');

  const linhaCorrompida = {
    nome: 'INALDO PAIXÃO TAVARES BRAGA', nomeBruto: '40975: INALDO PAIXÃO TAVARES BRAGA',
    matricula: '26450', matriculaNoNome: '40975', identidadeConsistente: false,
    tipo: 'Abonada', dataInicio: '31/03/2026', dias: 1, status: 'Ativo', linhaPlanilha: 667
  };
  const maria = {
    nome: 'MARIA CRISTINA DE OLIVEIRA DA SILVA', nomeBruto: '26450: MARIA CRISTINA DE OLIVEIRA DA SILVA',
    matricula: '26450', matriculaNoNome: '26450', identidadeConsistente: true,
    tipo: 'Abonada', dataInicio: '31/03/2026', dias: 1, status: 'Ativo', linhaPlanilha: 668
  };
  afirmar_(detectarSobreposicoesLancamentos_([linhaCorrompida, maria], 20).length === 0,
    'linha com identidade divergente não deve gerar conflito falso');

  const divergencias = detectarDivergenciasIdentificacaoLancamentos_([linhaCorrompida, maria], 20);
  afirmar_(divergencias.length === 1 && divergencias[0].matriculaColuna === '26450' && divergencias[0].matriculaNoNome === '40975',
    'divergência deve ser reportada com os dois valores de matrícula');

  return { sucesso: true, testes: 14 };
}
