(function () {
  function mostrarFalha(erro) {
    let painel = document.getElementById('desktop-error-panel');
    if (!painel) {
      painel = document.createElement('aside');
      painel.id = 'desktop-error-panel';
      painel.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:480px;padding:20px;background:#16222e;color:#fff;border:1px solid #f59e0b;border-radius:12px;box-shadow:0 12px 40px #0008;font:14px/1.5 system-ui';
      const titulo = document.createElement('strong');
      titulo.textContent = 'O programa encontrou um problema.';
      const texto = document.createElement('p'); texto.id = 'desktop-error-text';
      const salvar = document.createElement('button'); salvar.textContent = 'Salvar relatório do erro';
      salvar.onclick = () => window.entidadeDesktop.salvarDiagnostico();
      const fechar = document.createElement('button'); fechar.textContent = 'Fechar aviso';
      fechar.onclick = () => painel.remove();
      for (const botao of [salvar, fechar]) botao.style.cssText = 'padding:8px 12px;margin:4px;border-radius:6px;border:1px solid #607080;cursor:pointer';
      painel.append(titulo, texto, salvar, fechar); document.body.appendChild(painel);
    }
    document.getElementById('desktop-error-text').textContent = erro.mensagem + ' Código: ' + erro.codigo + ' · referência: ' + erro.referencia + '. Salve o relatório e envie ao suporte.';
  }

  function registrar(codigo, mensagem, local) {
    window.entidadeDesktop.registrarErro({ codigo, mensagem, local })
      .then(mostrarFalha).catch(() => { /* o processo principal também registra falhas */ });
  }
  window.addEventListener('error', evento => {
    registrar('ENT-UI-SCRIPT', evento.message || 'Um arquivo da interface não carregou.',
      evento.error?.stack || [evento.filename, evento.lineno, evento.colno].join(':'));
  });
  window.addEventListener('unhandledrejection', evento => {
    registrar('ENT-UI-PROMESSA', evento.reason?.message || String(evento.reason || 'Uma tarefa foi interrompida.'), evento.reason?.stack || '');
  });
  window.addEventListener('entidade-storage-error', evento => {
    registrar('ENT-UI-PROMESSA', evento.detail?.message || 'Não foi possível abrir a configuração de armazenamento.', evento.detail?.stack || '');
  });
  document.addEventListener('DOMContentLoaded', () => {
    const acoes = document.querySelector('.header-actions');
    if (!acoes) return;
    const botao = document.createElement('button');
    botao.className = 'header-icon-button'; botao.title = 'Salvar relatório de diagnóstico';
    botao.setAttribute('aria-label', botao.title); botao.textContent = 'ⓘ';
    botao.onclick = () => window.entidadeDesktop.salvarDiagnostico();
    acoes.prepend(botao);
  });
})();
