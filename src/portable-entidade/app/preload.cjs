const { contextBridge, ipcRenderer } = require('electron');

const metodos = new Set([
  'verificarStatusEmail',
  'fazerLogin',
  'definirSenhaPrimeiroAcesso',
  'verificarSessao',
  'executarApiBackend'
]);

function abrirPacote(pacote) {
  if (pacote.ok) return pacote.resultado;
  const detalhe = pacote.erro;
  const erro = new Error(detalhe.mensagem + ' [Código ' + detalhe.codigo + ' · referência ' + detalhe.referencia + ']');
  erro.code = detalhe.codigo; erro.reference = detalhe.referencia;
  throw erro;
}

contextBridge.exposeInMainWorld('entidadeDesktop', {
  abrirLinkExterno: url => ipcRenderer.invoke('entidade:abrir-link-externo', url).then(abrirPacote),
  chamar: (metodo, argumentos) => {
    if (!metodos.has(metodo) || !Array.isArray(argumentos) || argumentos.length > 20) {
      return Promise.reject(new Error('Operação de desktop não permitida.'));
    }
    return ipcRenderer.invoke('entidade:api', { metodo, argumentos }).then(abrirPacote);
  },
  obterArmazenamento: () => ipcRenderer.invoke('entidade:armazenamento', { acao: 'estado' }).then(abrirPacote),
  configurarArmazenamento: dados => ipcRenderer.invoke('entidade:armazenamento', { acao: 'configurar', dados }).then(abrirPacote),
  atualizacao: acao => ipcRenderer.invoke('entidade:atualizacao', { acao }).then(abrirPacote),
  aoProgressoAtualizacao: callback => {
    if (typeof callback !== 'function') return;
    const listener = (_, dados) => callback(dados);
    ipcRenderer.on('entidade:atualizacao-progresso', listener);
    return () => ipcRenderer.removeListener('entidade:atualizacao-progresso', listener);
  },
  registrarErro: detalhe => ipcRenderer.invoke('entidade:diagnostico', detalhe),
  salvarDiagnostico: () => ipcRenderer.invoke('entidade:exportar-diagnostico')
});
