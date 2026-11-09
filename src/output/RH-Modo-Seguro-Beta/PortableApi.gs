/**
 * Ponte HTTP para o cliente de desktop. A interface web continua usando
 * google.script.run; ambos passam pelas mesmas rotinas e pela mesma base.
 */
function doPost(e) {
  let resposta;
  try {
    validarAmbienteBeta_();
    const bruto = String(e && e.postData && e.postData.contents || '');
    if (!bruto || bruto.length > 45 * 1024 * 1024) throw new Error('Solicitação vazia ou muito grande.');
    const pedido = JSON.parse(bruto);
    const metodo = String(pedido && pedido.metodo || '');
    const argumentos = pedido && pedido.argumentos;
    if (!Array.isArray(argumentos) || argumentos.length > 20) throw new Error('Argumentos inválidos.');

    let resultado;
    if (metodo === 'verificarStatusEmail') {
      resultado = verificarStatusEmail.apply(null, argumentos);
    } else if (metodo === 'fazerLogin') {
      resultado = fazerLogin.apply(null, argumentos);
    } else if (metodo === 'definirSenhaPrimeiroAcesso') {
      resultado = definirSenhaPrimeiroAcesso.apply(null, argumentos);
    } else if (metodo === 'verificarSessao') {
      resultado = verificarSessao.apply(null, argumentos);
    } else if (metodo === 'executarApiBackend') {
      resultado = executarApiBackend.apply(null, argumentos);
    } else {
      throw new Error('Operação não permitida.');
    }
    resposta = { ok: true, resultado: resultado === undefined ? null : resultado };
  } catch (erro) {
    // Nunca devolver stack, propriedades do script ou detalhes de credenciais.
    resposta = { ok: false, erro: String(erro && erro.message || erro || 'Falha desconhecida.') };
  }
  return ContentService.createTextOutput(JSON.stringify(resposta))
    .setMimeType(ContentService.MimeType.JSON);
}
