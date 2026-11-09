// O banco e as regras síncronas ficam fora da janela e do processo principal.
const { parentPort, workerData } = require('node:worker_threads');
const { LocalRuntime } = require('./local-runtime.cjs');

let runtime;
function erroPublico(erro) {
  const codigo = String(erro.code || String(erro.message || '').match(/\[(ENT-[A-Z0-9-]+)\]/)?.[1] || 'ENT-LOCAL-REGRA');
  return { codigo, mensagem: String(erro.message || 'Não foi possível concluir a operação local.') };
}
try {
  runtime = new LocalRuntime(workerData.pasta, workerData.fonte);
  parentPort.postMessage({ pronto: true });
} catch (erro) {
  parentPort.postMessage({ fatal: erroPublico(erro) });
  parentPort.close();
}

if (runtime) parentPort.on('message', pedido => {
  try {
    let resultado;
    switch (pedido.operacao) {
      case 'estado':
        resultado = { configurado: runtime.store.getProperty('LOCAL_CONFIGURADO') === 'SIM' };
        break;
      case 'iniciar': {
        const email = String(pedido.argumentos?.[0] || '').trim();
        const nome = String(pedido.argumentos?.[1] || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !nome || nome.length > 150) {
          throw Object.assign(new Error('Informe seu nome e um e-mail válido para criar a base local.'), { code: 'ENT-LOCAL-CADASTRO' });
        }
        resultado = runtime.iniciar(email, nome);
        break;
      }
      case 'chamar':
        if (!Array.isArray(pedido.argumentos) || !Array.isArray(pedido.argumentos[1]) || pedido.argumentos[1].length > 20) {
          throw Object.assign(new Error('Solicitação local inválida.'), { code: 'ENT-LOCAL-OPERACAO' });
        }
        resultado = runtime.chamar(pedido.argumentos[0], pedido.argumentos[1]);
        break;
      case 'arquivo': {
        const id = String(pedido.argumentos?.[0] || '');
        if (!/^[a-f\d-]{36}$/.test(id)) throw Object.assign(new Error('Arquivo local inválido.'), { code: 'ENT-LOCAL-ARQUIVO' });
        const arquivo = runtime.objeto(id, 'arquivo');
        resultado = { nome: arquivo.getName(), tipo: arquivo.getMimeType(), bytes: new Uint8Array(arquivo.getBlob().getBytes()) };
        break;
      }
      case 'fechar':
        runtime.fechar();
        parentPort.postMessage({ id: pedido.id, ok: true, resultado: null });
        parentPort.close();
        return;
      default:
        throw Object.assign(new Error('Operação local não permitida.'), { code: 'ENT-LOCAL-OPERACAO' });
    }
    parentPort.postMessage({ id: pedido.id, ok: true, resultado });
  } catch (erro) {
    parentPort.postMessage({ id: pedido.id, ok: false, erro: erroPublico(erro) });
  }
});
