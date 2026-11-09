/** Testes manuais e deterministas das validacoes que antecedem a planilha. */
function executarTestesValidacaoLogin_() {
  function afirmarErroObrigatorio_(email, senha) {
    let mensagem = '';
    try {
      fazerLogin(email, senha);
    } catch (erro) {
      mensagem = String(erro && erro.message || erro);
    }
    if (mensagem !== 'E-mail e senha são obrigatórios.') {
      throw new Error('A validacao de campos vazios nao ocorreu antes do acesso aos dados.');
    }
  }

  afirmarErroObrigatorio_('', '');
  afirmarErroObrigatorio_('usuario@exemplo.com', '');
  afirmarErroObrigatorio_('', 'senha-valida');
  return { sucesso: true, testes: 3 };
}

