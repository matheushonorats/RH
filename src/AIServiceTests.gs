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
