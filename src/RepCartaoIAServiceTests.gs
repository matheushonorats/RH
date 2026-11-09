/** Testes determinísticos da normalização usada após a leitura visual. */
function executarTestesCartaoManualIA_() {
  function afirmar_(condicao, mensagem) {
    if (!condicao) throw new Error('Teste do cartão manual por IA falhou: ' + mensagem);
  }
  afirmar_(normalizarHorarioCartaoIA_('8') === '08:00', 'hora inteira');
  afirmar_(normalizarHorarioCartaoIA_('800') === '08:00', 'hora compacta');
  afirmar_(normalizarHorarioCartaoIA_('8h15') === '08:15', 'hora manuscrita com h');
  afirmar_(normalizarHorarioCartaoIA_('24:10') === '', 'hora impossível');
  const resultado = prepararDiasCartaoIA_({ dias: [
    { dia: 1, lado: 'frente', marcacoes: ['8', '12', '13', '17', '', ''], confianca: 'alta' },
    { dia: 2, lado: 'frente', marcacoes: ['22:00', '02:00', '', '', '', ''], confianca: 'alta' },
    { dia: 31, lado: 'verso', marcacoes: ['09:00', '18:00', '', '', '', ''], confianca: 'alta' }
  ] }, '2026-04');
  afirmar_(resultado.dias.length === 2, 'dia inexistente no mês deve ser ignorado');
  afirmar_(resultado.dias[0].marcacoes[0] === '08:00', 'normalização da primeira marcação');
  afirmar_(resultado.dias[1].offsets[1] === 1, 'saída de madrugada deve receber +1');
  const pdf = validarArquivoTemporarioCartaoIA_({ lado: 'frente', mimeType: 'application/pdf', nome: 'cartao.pdf', base64: 'A'.repeat(2000) }, 'frente');
  afirmar_(pdf.mimeType === 'application/pdf' && pdf.nome === 'cartao.pdf', 'PDF deve ser aceito como arquivo temporário');
  return { sucesso: true, testes: 8 };
}
