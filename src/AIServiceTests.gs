/** Testes da estabilização do monitor e da ausência legítima de novidades. */
function executarTestesEstabilizacaoEntidade_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de estabilização da Entidade falhou: ' + mensagem);
  }
  afirmar_(ehRespostaSemNovidadesEntidade_('Tudo em ordem'), 'deve reconhecer a resposta textual esperada');
  afirmar_(ehRespostaSemNovidadesEntidade_('{"status":"sem_novidades"}'), 'deve reconhecer o estado estruturado');
  afirmar_(removerRaciocinioExpostoEntidade_('Tudo em ordem') === 'Tudo em ordem', 'não deve descartar a resposta legítima');
  afirmar_(respostaEntidadePareceCompleta_('Tudo em ordem', { finish_reason: 'stop' }), 'deve aceitar a resposta como completa');
  afirmar_(!alertaAutomaticoEntidadeAcionavel_('Tudo em ordem'), 'não deve transformar ausência de novidade em alerta');
  return { sucesso: true, testes: 5 };
}

/** Testes locais/determinísticos da consulta cadastral de admissão. */
function executarTestesConsultaAdmissaoEntidade_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de admissão falhou: ' + mensagem);
  }

  const servidores = [
    { nome: 'Ana Sem Data', matricula: '100', status: 'Ativo', admissao: '' },
    { nome: 'Bruno Data Válida', matricula: '200', status: 'Ativo', admissao: '30/03/2024' },
    { nome: 'Carlos Inativo', matricula: '300', status: 'Inativo', admissao: null },
    { nome: 'Daniela Hífen', matricula: '400', status: 'Ativo', admissao: '-' },
    { nome: 'Eva Não Informada', matricula: '500', status: 'Ativo', admissao: 'Não informado' },
    { nome: 'Fabiana Data Inválida', matricula: '600', status: 'Ativo', admissao: '31/02/2024' }
  ];

  const perguntasReconhecidas = [
    'Quais servidores não possuem data de admissão?',
    'Quem está sem admissão cadastrada?',
    'Liste os funcionários sem data de admissão.',
    'Quantos servidores estão sem data de admissão?'
  ];
  perguntasReconhecidas.forEach(function(pergunta) {
    afirmar_(ehConsultaServidoresSemAdmissaoEntidade_(pergunta), 'pergunta não reconhecida: ' + pergunta);
  });

  const respostaAtivos = responderConsultaOperacionalDiretaEntidade_(perguntasReconhecidas[0], {
    servidoresIdentificacao: servidores
  });
  afirmar_(respostaAtivos.indexOf('**4 servidores ativos') !== -1, 'quantidade de ativos sem admissão');
  afirmar_(respostaAtivos.indexOf('Ana Sem Data') < respostaAtivos.indexOf('Daniela Hífen'), 'ordenação alfabética');
  afirmar_(respostaAtivos.indexOf('matrícula **100**') !== -1, 'nome e matrícula do ativo sem admissão');
  afirmar_(respostaAtivos.indexOf('Bruno Data Válida') === -1, 'data válida não pode ser pendência');
  afirmar_(respostaAtivos.indexOf('Carlos Inativo') === -1, 'inativo deve ser excluído por padrão');
  afirmar_(respostaAtivos.indexOf('Daniela Hífen') !== -1, 'valor hífen deve ser pendência');
  afirmar_(respostaAtivos.indexOf('Eva Não Informada') !== -1, 'Não informado deve ser pendência');
  afirmar_(respostaAtivos.indexOf('Fabiana Data Inválida') !== -1, 'data inválida deve ser pendência');

  const respostaSemPendencia = responderConsultaOperacionalDiretaEntidade_('Quem está sem admissão cadastrada?', {
    servidoresIdentificacao: [
      { nome: 'Ativo Regular', matricula: '700', status: 'Ativo', admissao: '01/01/2020' },
      { nome: 'Inativo Sem Data', matricula: '800', status: 'Inativo', admissao: '' }
    ]
  });
  afirmar_(respostaSemPendencia === 'Todos os servidores ativos possuem data de admissão cadastrada.', 'mensagem sem pendência');

  const respostaComInativos = responderConsultaOperacionalDiretaEntidade_(
    'Liste quem está sem data de admissão, incluindo também os inativos.',
    { servidoresIdentificacao: servidores }
  );
  afirmar_(respostaComInativos.indexOf('**5 servidores ativos e inativos') !== -1, 'quantidade incluindo inativos');
  afirmar_(respostaComInativos.indexOf('Carlos Inativo') !== -1, 'inativo solicitado deve ser listado');

  const muitos = [];
  for (let i = 1; i <= 32; i++) muitos.push({ nome: 'Servidor ' + String(i).padStart(2, '0'), matricula: String(900 + i), status: 'Ativo', admissao: '' });
  const respostaLimitada = responderServidoresSemAdmissaoEntidade_('Liste os servidores sem admissão.', muitos);
  afirmar_((respostaLimitada.match(/\n\d+\./g) || []).length === 30, 'listagem deve conter no máximo 30 registros');
  afirmar_(respostaLimitada.indexOf('2 registro(s) adicional(is)') !== -1, 'excedente deve ser informado');

  return { sucesso: true, testes: 18 };
}

/** Testes da orientação normativa direta sobre programação de férias. */
function executarTestesOrientacaoFeriasEntidade_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de orientação de férias falhou: ' + mensagem);
  }

  const perguntas = [
    'Podemos forçar o servidor a sair de férias antes de vencer as terceiras férias?',
    'Posso antecipar as férias antes de ficarem compulsórias?',
    'A chefia pode obrigar o servidor a tirar férias antes do terceiro período?'
  ];
  perguntas.forEach(function(pergunta) {
    afirmar_(ehConsultaProgramacaoFeriasAntesCompulsoriaEntidade_(pergunta), 'pergunta não reconhecida: ' + pergunta);
  });

  const resposta = responderConsultaOperacionalDiretaEntidade_(perguntas[0], {
    feriasCompulsoriasLista: [{ nome: 'Pessoa que não deve aparecer', matricula: '999' }]
  });
  afirmar_(resposta.indexOf('art. 154') !== -1, 'deve citar o art. 154');
  afirmar_(resposta.indexOf('§1º') !== -1 && resposta.indexOf('§6º') !== -1, 'deve distinguir aquisição e compulsoriedade');
  afirmar_(resposta.indexOf('já adquiridas') !== -1, 'deve limitar a orientação ao saldo adquirido');
  afirmar_(resposta.indexOf('Pessoa que não deve aparecer') === -1, 'não deve misturar casos pessoais do painel');
  afirmar_(resposta.indexOf('[ABRIR_') === -1 && resposta.indexOf('[NAVEGAR_') === -1, 'não deve abrir tela em dúvida informativa');

  return { sucesso: true, testes: 8 };
}

/** Testes dos alertas automáticos exatos de sobreposição. */
function executarTestesAlertasConflitosEntidade_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de alerta de conflito falhou: ' + mensagem);
  }

  const resposta = gerarAlertasConflitosDeterministicosEntidade_({
    conflitosDeAfastamentos: [{
      nome: 'DANIELLI OLIVEIRA GOMES', matricula: '86924',
      primeiroId: 'a8b1d490', primeiroTipo: 'Férias', primeiroPeriodo: '29/09/2025 a 08/10/2025', primeiroStatus: 'Ativo',
      segundoId: '25a81171', segundoTipo: 'Abonada', segundoPeriodo: '03/10/2025', segundoStatus: 'Ativo',
      inicioSobreposicao: '03/10/2025', fimSobreposicao: '03/10/2025'
    }]
  }, 3);

  afirmar_(resposta.indexOf('a8b1d490') !== -1 && resposta.indexOf('25a81171') !== -1,
    'deve mostrar os dois IDs');
  afirmar_(resposta.indexOf('29/09/2025 a 08/10/2025') !== -1 && resposta.indexOf('03/10/2025') !== -1,
    'deve preservar os períodos exatos');
  afirmar_(resposta.indexOf('status Ativo') !== -1, 'deve mostrar o status usado no cálculo');
  afirmar_(gerarAlertasConflitosDeterministicosEntidade_({}, 3) === '', 'sem conflito deve permanecer silencioso');

  const conflitosFiltrados = filtrarConflitosServidoresAtivosEntidade_([
    { matricula: '100', nome: 'Servidor Ativo' },
    { matricula: '200', nome: 'Servidor Inativo' },
    { matricula: '300', nome: 'Cadastro Ausente' }
  ], {
    '100': { matricula: '100', status: 'Ativo' },
    '200': { matricula: '200', status: 'Inativo' }
  });
  afirmar_(conflitosFiltrados.length === 2, 'deve remover somente conflito de inativo confirmado');
  afirmar_(conflitosFiltrados.some(function(item) { return item.matricula === '100'; }), 'ativo deve permanecer');
  afirmar_(!conflitosFiltrados.some(function(item) { return item.matricula === '200'; }), 'inativo nao deve gerar alerta');
  afirmar_(conflitosFiltrados.some(function(item) { return item.matricula === '300'; }), 'cadastro ausente deve permanecer para investigacao');

  return { sucesso: true, testes: 8 };
}

/** Testes da agenda mensal determinística de férias. */
function executarTestesConsultaFeriasPorMesEntidade_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de consulta mensal de férias falhou: ' + mensagem);
  }

  const pergunta = 'Quais servidores estarão de férias no mês de agosto de 2026?';
  afirmar_(ehConsultaFeriasPorMesEntidade_(pergunta), 'consulta mensal não reconhecida');
  afirmar_(!ehConsultaFeriasPorMesEntidade_('Quais férias compulsórias vencem em agosto de 2026?'), 'não deve capturar consulta de compulsórias');

  const resposta = responderConsultaOperacionalDiretaEntidade_(pergunta, {
    lancamentosFeriasConsulta: [
      { nome: 'Ana Continua', matricula: '100', tipo: 'Férias', dataInicio: '25/07/2026', dias: 15, status: 'Ativo', statusServidor: 'Ativo' },
      { nome: 'Bruno Inicia', matricula: '200', tipo: 'Férias', dataInicio: '10/08/2026', dias: 20, status: 'Ativo', statusServidor: 'Ativo' },
      { nome: 'Carlos Já Voltou', matricula: '300', tipo: 'Férias', dataInicio: '01/07/2026', dias: 15, status: 'Ativo', statusServidor: 'Ativo' },
      { nome: 'Daniela Setembro', matricula: '400', tipo: 'Férias', dataInicio: '01/09/2026', dias: 10, status: 'Ativo', statusServidor: 'Ativo' },
      { nome: 'Eva Anulada', matricula: '500', tipo: 'Férias', dataInicio: '05/08/2026', dias: 10, status: 'Anulado', statusServidor: 'Ativo' },
      { nome: 'Fabio Inativo', matricula: '600', tipo: 'Férias', dataInicio: '05/08/2026', dias: 10, status: 'Ativo', statusServidor: 'Inativo' },
      { nome: 'Gisele Abono', matricula: '700', tipo: 'Abonada', dataInicio: '05/08/2026', dias: 1, status: 'Ativo', statusServidor: 'Ativo' }
    ]
  });

  afirmar_(resposta.indexOf('**2 servidor(es) encontrados') !== -1, 'deve contar todos e somente os dois afastamentos que intersectam agosto');
  afirmar_(resposta.indexOf('Ana Continua') !== -1 && resposta.indexOf('já entra no mês em férias') !== -1, 'deve incluir férias iniciadas no mês anterior');
  afirmar_(resposta.indexOf('Bruno Inicia') !== -1, 'deve incluir férias que começam em agosto');
  afirmar_(resposta.indexOf('Carlos Já Voltou') === -1, 'deve excluir quem terminou antes de agosto');
  afirmar_(resposta.indexOf('Daniela Setembro') === -1, 'deve excluir quem começa depois de agosto');
  afirmar_(resposta.indexOf('Eva Anulada') === -1 && resposta.indexOf('Fabio Inativo') === -1 && resposta.indexOf('Gisele Abono') === -1, 'deve excluir anulados, inativos e outros tipos');

  afirmar_(obterIntencaoConsultaFeriasEntidade_('Quem vai sair de férias em agosto de 2026?') === 'INICIOS_NO_PERIODO', 'deve distinguir inícios');
  afirmar_(obterIntencaoConsultaFeriasEntidade_('Quem retorna de férias em agosto de 2026?') === 'RETORNOS_NO_PERIODO', 'deve distinguir retornos');

  const inicios = responderFeriasPorMesEntidade_('Quem vai sair de férias em agosto de 2026?', [
    { nome: 'Começou Antes', matricula: '1', tipo: 'Férias', dataInicio: '25/07/2026', dias: 20, status: 'Ativo', statusServidor: 'Ativo' },
    { nome: 'Começa no Mês', matricula: '2', tipo: 'Férias', dataInicio: '31/08/2026', dias: 10, status: 'Ativo', statusServidor: 'Ativo' }
  ]);
  afirmar_(inicios.indexOf('Começou Antes') === -1 && inicios.indexOf('Começa no Mês') !== -1, 'consulta de saída deve considerar somente inícios no período');

  const retornos = responderFeriasPorMesEntidade_('Quem retorna de férias em agosto de 2026?', [
    { nome: 'Retorna Primeiro Dia', matricula: '3', tipo: 'Férias', dataInicio: '22/07/2026', dias: 10, status: 'Ativo', statusServidor: 'Ativo' }
  ]);
  afirmar_(retornos.indexOf('Retorna Primeiro Dia') !== -1 && retornos.indexOf('retorna em 01/08/2026') !== -1, 'retorno no primeiro dia deve ser incluído');
  const semMutacao = { nome: 'Sem Mutação', matricula: '4', tipo: 'Férias', dataInicio: '01/08/2026', dias: 1, status: 'Ativo', statusServidor: 'Ativo' };
  responderFeriasPorMesEntidade_('Quem estará de férias em agosto de 2026?', [semMutacao]);
  afirmar_(!Object.prototype.hasOwnProperty.call(semMutacao, '__inicioConsulta'), 'consulta não deve inserir campos temporários no registro');

  const muitos = [];
  for (let i = 1; i <= 55; i++) muitos.push({ nome: 'Pessoa ' + i, matricula: String(i), tipo: 'Férias', dataInicio: '10/08/2026', dias: 5, status: 'Ativo', statusServidor: 'Ativo' });
  const pagina2 = responderFeriasPorMesEntidade_('Quem estará de férias em agosto de 2026? página 2', muitos);
  afirmar_(pagina2.indexOf('**55 servidor(es) encontrados') !== -1 && pagina2.indexOf('31. **Pessoa') !== -1, 'paginação deve preservar o total completo e continuar a numeração');

  const proximo = obterMesConsultaFeriasEntidade_('Quem estará de férias no mês que vem?');
  const referencia = new Date(); referencia.setMonth(referencia.getMonth() + 1);
  afirmar_(proximo.mes === referencia.getMonth() + 1 && proximo.ano === referencia.getFullYear(), 'mês seguinte deve atravessar corretamente a troca de ano');

  return { sucesso: true, testes: 15 };
}

function executarTestesRecuperacaoNormativaEntidade_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de recuperação normativa falhou: ' + mensagem);
  }
  const originalEstatuto = buscarTrechosEstatuto_;
  const originalDecreto = buscarTrechosDecreto6808_;
  try {
    buscarTrechosEstatuto_ = function() { return [{ artigo: 'Art. 1º', trecho: 'Lei A', score: 9 }, { artigo: 'Art. 2º', trecho: 'Lei B', score: 8 }]; };
    buscarTrechosDecreto6808_ = function() { return [{ norma: 'Decreto Municipal nº 6.808/2017', artigo: 'Art. 3º', trecho: 'Decreto A', score: 7 }]; };
    const itens = buscarTrechosNormativos_('frequência', 3);
    afirmar_(itens.length === 3, 'deve respeitar o limite total');
    afirmar_(itens.some(function(item) { return item.norma.indexOf('Decreto') !== -1; }), 'decreto pertinente deve participar da seleção');
    afirmar_(itens.some(function(item) { return item.norma.indexOf('Lei Complementar') !== -1; }), 'estatuto pertinente deve participar da seleção');
  } finally {
    buscarTrechosEstatuto_ = originalEstatuto;
    buscarTrechosDecreto6808_ = originalDecreto;
  }
  return { sucesso: true, testes: 3 };
}

/** Testes puros da identidade, classificacao e prioridade das ocorrencias. */
function executarTestesOcorrenciasEntidade_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de ocorrencias da Entidade falhou: ' + mensagem);
  }

  const contexto = {
    conflitosDeAfastamentos: [{
      nome: 'Pessoa Conflito', matricula: '100', primeiroId: 'B', segundoId: 'A',
      primeiroTipo: 'Ferias', primeiroPeriodo: '01/09/2026 a 15/09/2026',
      segundoTipo: 'Abonada', segundoPeriodo: '10/09/2026',
      inicioSobreposicao: '10/09/2026', fimSobreposicao: '10/09/2026', linhasPlanilha: [20, 10]
    }],
    servidoresEmFeriasCompulsorias: [{
      nome: 'Pessoa Ferias', matricula: '200', diasParaTerceiroPeriodo: 80,
      dataTerceiroPeriodo: '30/11/2026', saldoDisponivelDias: 60
    }],
    pendenciasDe1Doc: [{
      id: 'L-1', nome: 'Pessoa Documento', matricula: '300', tipo: 'Abonada',
      dataSolicitacao: '01/09/2026', dataInicio: '05/09/2026', diasPendente: 10
    }]
  };
  const ocorrencias = detectarOcorrenciasEntidade_(contexto);
  afirmar_(ocorrencias.length === 3, 'deve criar uma ocorrencia por fato verificado');
  afirmar_(ocorrencias[0].regra === 'SOBREPOSICAO_AFASTAMENTOS', 'conflito critico deve vir primeiro');
  afirmar_(ocorrencias[1].regra === 'PRAZO_FERIAS_TERCEIRO_PERIODO', 'prazo de severidade 3 deve preceder 1DOC de severidade 2');
  afirmar_(ocorrencias[1].titulo === 'Programação preventiva de férias', 'prazo futuro nao deve ser chamado de compulsorio atingido');

  const invertido = detectarOcorrenciasEntidade_({ conflitosDeAfastamentos: [{
    nome: 'Pessoa Conflito', matricula: '100', primeiroId: 'A', segundoId: 'B',
    primeiroTipo: 'Abonada', primeiroPeriodo: '10/09/2026',
    segundoTipo: 'Ferias', segundoPeriodo: '01/09/2026 a 15/09/2026',
    inicioSobreposicao: '10/09/2026', fimSobreposicao: '10/09/2026', linhasPlanilha: [10, 20]
  }] });
  afirmar_(invertido[0].id === ocorrencias[0].id, 'ordem dos dois registros nao pode criar outro caso');
  afirmar_(ocorrencias[0].id.indexOf('ENT-') === 0, 'ID deve ser reconhecivel e estavel');
  afirmar_(gerarResumoOcorrenciasEntidade_(ocorrencias).indexOf('Mais') === -1, 'tres casos cabem no resumo');
  afirmar_(gerarResumoOcorrenciasEntidade_([]) === '', 'sem ocorrencias deve permanecer silencioso');

  return { sucesso: true, testes: 8 };
}

function executarTestesAuditoriaCadastroEntidade_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de auditoria cadastral falhou: ' + mensagem);
  }
  afirmar_(dataAuditoriaCadastro_('31/02/2026') === null, 'data impossível deve ser inválida');
  afirmar_(dataAuditoriaCadastro_('2026-02-29') === null, 'dia inexistente no formato ISO deve ser inválido');
  afirmar_(dataAuditoriaCadastro_('29/02/2024') instanceof Date, 'data bissexta válida deve ser aceita');
  afirmar_(dataAuditoriaCadastro_('texto livre') === null, 'texto ambíguo não deve ser convertido pelo navegador');

  const alertas = validarCadastroServidorEntidade_({
    nome: 'Pessoa Teste', matricula: '123', cargo: '', lotacao: '-', admissao: '31/02/2026',
    email: 'email-invalido', pis: '123', ativo: 'Sim'
  }, null);
  afirmar_(alertas.some(function(item) { return item.campo === 'DATA DE ADMISSAO'; }), 'admissão inválida deve gerar conferência');
  afirmar_(alertas.some(function(item) { return item.campo === 'LOTACAO'; }), 'lotação vazia deve gerar conferência');
  afirmar_(alertas.some(function(item) { return item.campo === 'EMAIL'; }), 'e-mail inválido deve gerar conferência');
  afirmar_(alertas.some(function(item) { return item.campo === 'PIS'; }), 'PIS inválido deve gerar conferência');
  return { sucesso: true, testes: 8 };
}

/** Testes puros da governanca, privacidade e roteamento de custo da Entidade. */
function executarTestesGovernancaEntidade_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de governanca da Entidade falhou: ' + mensagem);
  }

  afirmar_(consultaComplexaEntidade_([
    { role: 'user', content: 'Explique o artigo do Estatuto.' },
    { role: 'assistant', content: 'Resposta anterior.' },
    { role: 'user', content: 'Qual a matricula da Ana?' }
  ], false) === false, 'uma pergunta juridica antiga nao deve encarecer a pergunta atual');
  afirmar_(consultaComplexaEntidade_([{ role: 'user', content: 'Interprete o artigo 154 da lei.' }], false) === true,
    'a pergunta juridica atual deve usar o modelo complexo');
  afirmar_(consultaComplexaEntidade_([
    { role: 'user', content: 'Interprete o artigo 154 da lei.' },
    { role: 'user', content: 'A resposta anterior veio vazia, incompleta ou truncada.' }
  ], false) === true, 'a instrucao tecnica de repeticao nao deve substituir a intencao atual');
  afirmar_(consultaComplexaEntidade_([{ role: 'user', content: 'Interprete o artigo 154.' }], true) === false,
    'execucao de background nunca deve selecionar modelo complexo');

  const linhas = [
    ['1', '', 'ana@setur', 'Pergunta A', 'Resposta A', 'UTIL', '', 'Sim'],
    ['2', '', 'bruno@setur', 'Pergunta B', 'Resposta B', 'UTIL', '', 'Sim'],
    ['3', '', 'ana@setur', 'Pergunta C', 'Resposta C', '', '', 'Não'],
    ['4', '', 'ana@setur', 'Pergunta D', 'Resposta D', '', '', 'Sim']
  ];
  const privado = filtrarHistoricoPrivadoEntidade_(linhas, 'ANA@SETUR', 6);
  afirmar_(privado.length === 2, 'historico deve conter somente registros ativos do usuario atual');
  afirmar_(privado[0][0] === '4' && privado[1][0] === '1', 'historico privado deve preservar ordem recente');
  afirmar_(!privado.some(function(item) { return item[0] === '2'; }), 'historico de outro usuario nao pode vazar');
  afirmar_(typeof consolidarAprendizadoMemoria_ === 'undefined', 'feedback nao pode ter promotor automatico de conhecimento');
  return { sucesso: true, testes: 8 };
}

function executarTestesPlanejamentoEntidade_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste de planejamento da Entidade falhou: ' + mensagem);
  }
  const servidores = [
    { nome: 'Ana', matricula: '1', lotacao: 'Setor A', status: 'Ativo' },
    { nome: 'Bia', matricula: '2', lotacao: 'Setor A', status: 'Ativo' },
    { nome: 'Caio', matricula: '3', lotacao: 'Setor A', status: 'Inativo' }
  ];
  const lancamentos = [
    { matricula: '1', tipo: 'Férias', dataInicio: '2026-09-15', dias: 10, status: 'Ativo' },
    { matricula: '2', tipo: 'Autorização de Horas Extras', dataInicio: '2026-09-15', dias: 1, status: 'Ativo' },
    { matricula: '2', tipo: 'Abonada', dataInicio: '2026-09-16', dias: 1, status: 'Anulado' }
  ];
  const alertas = calcularPlanejamentoCoberturaEntidade_(servidores, lancamentos, { 'Setor A': 2 }, new Date(2026, 8, 11), 28);
  afirmar_(alertas.length === 1, 'deve alertar somente quando existe mínimo configurado');
  afirmar_(alertas[0].total === 2 && alertas[0].ausentes === 1 && alertas[0].disponiveis === 1, 'deve excluir inativo e contar ausência válida uma única vez');
  afirmar_(alertas[0].data === '15/09/2026', 'deve apontar a data comprovada de menor cobertura');
  afirmar_(calcularPlanejamentoCoberturaEntidade_(servidores, lancamentos, {}, new Date(2026, 8, 11), 28).length === 0, 'sem mínimo não pode inventar alerta');
  afirmar_(ehAfastamentoCoberturaEntidade_({ tipo: 'Autorização de Horas Extras', status: 'Ativo' }) === false, 'hora extra não é ausência');
  afirmar_(ehAfastamentoCoberturaEntidade_({ tipo: 'Férias', status: 'Anulado' }) === false, 'lançamento anulado não reduz cobertura');
  afirmar_(dataIsoAssistidaValida_('2026-02-29') === false && dataIsoAssistidaValida_('2024-02-29') === true, 'PDF deve rejeitar data impossível');
  const proposta = { matricula: '1', tipo: 'Férias', dataInicio: '2026-09-15', dataSolicitacao: '', dias: 10 };
  const validacao = validarPropostaLancamentoAssistido_(proposta, [{ nome: 'Férias' }], servidores);
  afirmar_(validacao.pendencias.some(function(item) { return item.indexOf('data de solicitação') !== -1; }), 'PDF não pode presumir a data de solicitação');
  return { sucesso: true, testes: 8 };
}
