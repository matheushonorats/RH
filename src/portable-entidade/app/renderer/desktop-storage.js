(function () {
  'use strict';
  let estado;
  const ponte = window.entidadeDesktop;
  function aplicar(info) {
    estado = info; window.__ENTIDADE_LOCAL__ = info.modo === 'local';
    window.__ENTIDADE_ORGANIZACAO__ = info.organizacao || '';
    document.body.dataset.storageMode = info.modo;
    if (info.modo === 'local') {
      document.querySelectorAll('button[onclick="abrirPastaEntradaRep()" ]').forEach(botao => {
        botao.textContent = 'Adicionar AFDs do computador';
        botao.title = 'Selecionar os arquivos de ponto (.txt / AFD) para esta base local';
      });
      const detalheRep = document.getElementById('rep-pasta-detalhe');
      if (detalheRep) detalheRep.textContent = 'Adicione os AFDs do computador. As marcações serão armazenadas somente nesta base local.';
    }
    const identidade = document.querySelector('.app-footer-identidade');
    if (identidade) identidade.textContent = info.organizacao ? info.organizacao + ' • Entidade.V1' : 'Entidade.V1 • Gestão de Pessoas';
    if (info.email && !localStorage.getItem('rh_token')) document.getElementById('login-email').value = info.email;
    for (const nome of ['mostrarToast', 'atualizarTextoSync', 'registrarAtividadeSegundoPlano_']) {
      const original = window[nome];
      if (!window.__ENTIDADE_LOCAL__ || typeof original !== 'function' || original.__entidadeLocal) continue;
      const local = function (...args) { return original.apply(this, args.map(a => typeof a === 'string' ? a.replace(/nuvem/gi, 'base local') : a)); };
      local.__entidadeLocal = true; window[nome] = local;
    }
  }
  function abrirConfiguracao(obrigatorio) {
    const existente = document.getElementById('desktop-storage-dialog');
    if (existente) { existente.showModal(); return; }
    const dialogo = document.createElement('dialog'); dialogo.id = 'desktop-storage-dialog';
    dialogo.style.cssText = 'width:min(620px,92vw);max-height:90vh;border:1px solid #2b7767;border-radius:16px;padding:28px;background:#122323;color:#eef9f5;font:14px/1.5 system-ui';
    dialogo.innerHTML = '<form><h2 style="margin-top:0">Seu Entidade.V1</h2><p id="desktop-storage-intro"></p><div id="desktop-storage-options"><label class="form-label" for="desktop-storage-mode">Onde guardar suas informações?</label><select id="desktop-storage-mode" class="form-control"><option value="local">Neste computador — criar uma base nova</option><option value="servidor">Conectar a um servidor Entidade já existente</option><option value="google-novo" disabled>Google Drive — criar uma base (em preparação)</option><option value="google-existente" disabled>Google Drive — conectar base existente (em preparação)</option></select><p><small>O modo local funciona sem internet. Ele não será enviado ao Google nem aparecerá em outros PCs. A conexão direta com sua conta Google ainda não foi liberada nesta edição.</small></p><label class="form-label" for="desktop-storage-org">Organização (opcional)</label><input id="desktop-storage-org" class="form-control" maxlength="150" placeholder="Nome da sua organização"><div id="desktop-storage-local"><label class="form-label" for="desktop-storage-name">Seu nome</label><input id="desktop-storage-name" class="form-control" maxlength="150" autocomplete="name"><label class="form-label" for="desktop-storage-email">Seu e-mail de acesso</label><input id="desktop-storage-email" class="form-control" type="email" maxlength="254" autocomplete="email"><p><small>A senha será criada na tela de entrada. Este cadastro é apenas local e não cria uma conta Google.</small></p></div><div id="desktop-storage-server" hidden><label class="form-label" for="desktop-storage-url">Endereço do servidor Entidade</label><input id="desktop-storage-url" class="form-control" type="url" placeholder="https://script.google.com/macros/s/…/exec"><p><small>Use o endereço fornecido pelo responsável pela sua base. Uma planilha Google sozinha não é um servidor Entidade. O login será enviado somente para o endereço que você informar.</small></p></div></div><p id="desktop-storage-error" role="alert" style="color:#fbbf24;white-space:pre-wrap"></p><div style="display:flex;gap:10px;justify-content:flex-end"><button id="desktop-storage-close" class="btn" type="button">Fechar</button><button id="desktop-storage-save" class="btn btn-primary" type="submit">Criar minha base local</button></div></form>';
    document.body.appendChild(dialogo);
    const campo = id => dialogo.querySelector('#desktop-storage-' + id);
    const form = dialogo.querySelector('form');
    if (estado?.permiteMigrar && !estado.configurado) {
      const opcao = document.createElement('option'); opcao.value = 'anterior'; opcao.textContent = 'Continuar usando a mesma base da edição anterior deste PC';
      campo('mode').prepend(opcao); campo('mode').value = 'anterior';
    }
    campo('intro').textContent = estado?.configurado ? 'Armazenamento atual: ' + (estado.modo === 'local' ? 'somente neste computador.' : 'servidor Entidade escolhido por você.') + ' A base configurada não será substituída por outra vazia.' : 'O programa é seu. Escolha uma base própria para começar, sem dados de outra organização.';
    campo('options').hidden = Boolean(estado?.configurado);
    campo('save').hidden = Boolean(estado?.configurado);
    campo('close').hidden = Boolean(obrigatorio);
    dialogo.addEventListener('cancel', e => { if (obrigatorio && !estado?.configurado) e.preventDefault(); });
    campo('close').onclick = () => dialogo.close();
    campo('mode').onchange = () => {
      const local = campo('mode').value === 'local';
      campo('local').hidden = !local; campo('server').hidden = campo('mode').value !== 'servidor';
      campo('save').textContent = local ? 'Criar minha base local' : campo('mode').value === 'anterior' ? 'Manter minha conexão anterior' : 'Usar este servidor';
    };
    campo('mode').onchange();
    form.onsubmit = async evento => {
      evento.preventDefault(); campo('save').disabled = true; campo('error').textContent = 'Preparando sua base…';
      try {
        const resultado = await ponte.configurarArmazenamento({ modo: campo('mode').value, nome: campo('name').value, email: campo('email').value, organizacao: campo('org').value, url: campo('url').value });
        if (resultado.reabrir) { campo('error').textContent = 'Abrindo sua base em um espaço separado e protegido…'; return; }
        aplicar(resultado); obrigatorio = false; dialogo.close(); dialogo.remove();
        if (typeof mostrarToast === 'function') mostrarToast(resultado.modo === 'local' ? 'Base local criada. Entre com seu e-mail e crie sua senha.' : 'Servidor escolhido. Entre com seu login dessa base.', 'success');
        if (typeof inicializarUsuario === 'function') inicializarUsuario();
      } catch (erro) { campo('error').textContent = erro.message; }
      finally { campo('save').disabled = false; }
    };
    dialogo.showModal();
  }
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      aplicar(await ponte.obterArmazenamento());
      const acoes = document.querySelector('.header-actions');
      if (acoes) {
        const botao = document.createElement('button'); botao.type = 'button'; botao.className = 'header-icon-button';
        botao.textContent = '▤'; botao.title = 'Onde meus dados estão salvos'; botao.setAttribute('aria-label', botao.title);
        botao.onclick = () => abrirConfiguracao(false); acoes.prepend(botao);
      }
      if (!estado.configurado) abrirConfiguracao(true);
    } catch (erro) { window.dispatchEvent(new CustomEvent('entidade-storage-error', { detail: erro })); }
  });
})();
