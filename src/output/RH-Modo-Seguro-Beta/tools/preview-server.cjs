const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');

function render() {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace(/<\?!= incluir\("([^"]+)"\); \?>/g, (_, name) =>
    fs.readFileSync(path.join(root, name + '.html'), 'utf8')
  );
  html = html.replace(/<\?!= modoLaboratorioEntidade \? 'true' : 'false' \?>/g, 'false');
  html = html.replace(/<\?= APP_VERSION_DISPLAY \?>/g, '2.3.120 BETA SEGURA');
  const previewScript = `<script>
    if (new URLSearchParams(location.search).get('preview') === 'admin') {
      window.addEventListener('DOMContentLoaded', () => setTimeout(() => {
        localStorage.setItem('rh_user', JSON.stringify({ email: 'preview.local@teste.invalid', nome: 'Administrador de teste', papel: 'Administrador' }));
        document.getElementById('login-container').style.display = 'none';
        document.querySelector('.app-container').style.display = '';
        document.getElementById('global-loader').style.display = 'none';
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.getElementById('view-admin').classList.add('active');
        document.querySelectorAll('#view-admin .tab-panel').forEach(el => el.classList.remove('active'));
        document.getElementById('adm-configs').classList.add('active');
        document.querySelectorAll('#view-admin .tab-button').forEach(el => el.classList.remove('active'));
        document.getElementById('btn-adm-configs').classList.add('active');
        document.getElementById('view-title').textContent = 'Painel Administrativo';
        document.getElementById('current-user-name').textContent = 'Administrador de teste';
        document.getElementById('current-user-role').textContent = 'Previa local';
        document.querySelectorAll('.admin-only').forEach(el => el.style.removeProperty('display'));
        SafeMode.updateIndicators();
        if (window.lucide) lucide.createIcons();
      }, 150));
    }
    if (new URLSearchParams(location.search).get('preview') === 'repmanual') {
      window.addEventListener('DOMContentLoaded', () => setTimeout(() => {
        localStorage.setItem('rh_user', JSON.stringify({ email: 'preview.local@teste.invalid', nome: 'Operador de teste', papel: 'Operador' }));
        document.getElementById('login-container').style.display = 'none';
        document.querySelector('.app-container').style.display = '';
        document.getElementById('global-loader').style.display = 'none';
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.getElementById('view-pre-leitura-rep').classList.add('active');
        const modal = garantirModalLancamentosLoteRep_();
        modal.dataset.modo = 'cartao-manual';
        modal.dataset.competencia = '2026-09';
        modal.querySelector('.modal-title').textContent = 'Preencher cartão de ponto manual';
        document.getElementById('rep-lote-servidor').textContent = 'Servidor de demonstração · 00000000000';
        document.getElementById('rep-cartao-ia').hidden = false;
        modal.classList.add('active');
        if (window.lucide) lucide.createIcons();
      }, 250));
    }
  </script>`;
  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyEnd !== -1) html = html.slice(0, bodyEnd) + previewScript + html.slice(bodyEnd);
  return html;
}

http.createServer((request, response) => {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(render());
}).listen(43114, '127.0.0.1', () => {
  console.log('Previa local pronta em http://127.0.0.1:43114');
});
