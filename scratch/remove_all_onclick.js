const fs = require('fs');

// --- 1. Remove all onclick from index.html and replace with data-action ---

let html = fs.readFileSync('src/index.html', 'utf8');

// Map of onclick patterns to data-action replacements
const replacements = [
  // Sidebar nav links
  [/onclick="navegarPara\('dashboard'\)"/g, 'data-action="nav" data-view="dashboard"'],
  [/onclick="navegarPara\('servidores'\)"/g, 'data-action="nav" data-view="servidores"'],
  [/onclick="navegarPara\('lancamentos'\)"/g, 'data-action="nav" data-view="lancamentos"'],
  [/onclick="navegarPara\('protocolos'\)"/g, 'data-action="nav" data-view="protocolos"'],
  [/onclick="navegarPara\('relatorios'\)"/g, 'data-action="nav" data-view="relatorios"'],
  [/onclick="navegarPara\('admin'\)"/g, 'data-action="nav" data-view="admin"'],
  // Buttons for opening modals
  [/onclick="abrirModalServidor\(\)"/g, 'data-action="abrir-modal-servidor"'],
  [/onclick="abrirModalLancamento\(\)"/g, 'data-action="abrir-modal-lancamento"'],
  [/onclick="abrirModalCriarProtocolo\(\)"/g, 'data-action="abrir-modal-criar-protocolo"'],
  [/onclick="abrirModalUsuario\(\)"/g, 'data-action="abrir-modal-usuario"'],
  // Reports buttons
  [/onclick="gerarDadosRelatorio\(\)"/g, 'data-action="gerar-relatorio"'],
  [/onclick="exportarRelatorioExcel\(\)"/g, 'data-action="exportar-excel"'],
  [/onclick="imprimirRelatorioLocal\(\)"/g, 'data-action="imprimir-relatorio"'],
  [/onclick="imprimirRelatorioLocalNativo\(\)"/g, 'data-action="imprimir-relatorio-nativo"'],
  // Admin tabs
  [/onclick="alternarAbaAdmin\('adm-usuarios'\)"/g, 'data-action="aba-admin" data-aba="adm-usuarios"'],
  [/onclick="alternarAbaAdmin\('adm-configs'\)"/g, 'data-action="aba-admin" data-aba="adm-configs"'],
  [/onclick="alternarAbaAdmin\('adm-logs'\)"/g, 'data-action="aba-admin" data-aba="adm-logs"'],
  // Modal close buttons - fecharModal
  [/onclick="fecharModal\('modal-servidor'\)"/g, 'data-action="fechar-modal" data-modal="modal-servidor"'],
  [/onclick="fecharModal\('modal-ficha-servidor'\)"/g, 'data-action="fechar-modal" data-modal="modal-ficha-servidor"'],
  [/onclick="fecharModal\('modal-lancamento'\)"/g, 'data-action="fechar-modal" data-modal="modal-lancamento"'],
  [/onclick="fecharModal\('modal-anexos'\)"/g, 'data-action="fechar-modal" data-modal="modal-anexos"'],
  [/onclick="fecharModal\('modal-criar-protocolo'\)"/g, 'data-action="fechar-modal" data-modal="modal-criar-protocolo"'],
  [/onclick="fecharModal\('modal-folha-protocolo'\)"/g, 'data-action="fechar-modal" data-modal="modal-folha-protocolo"'],
  [/onclick="fecharModal\('modal-usuario'\)"/g, 'data-action="fechar-modal" data-modal="modal-usuario"'],
  [/onclick="fecharModal\('modal-relatorio-impressao'\)"/g, 'data-action="fechar-modal" data-modal="modal-relatorio-impressao"'],
  // Ficha tabs
  [/onclick="alternarAbaFicha\('tab-dados'\)"/g, 'data-action="aba-ficha" data-aba="tab-dados"'],
  [/onclick="alternarAbaFicha\('tab-ferias'\)"/g, 'data-action="aba-ficha" data-aba="tab-ferias"'],
  [/onclick="alternarAbaFicha\('tab-historico'\)"/g, 'data-action="aba-ficha" data-aba="tab-historico"'],
  // Protocol actions
  [/onclick="confirmarGeracaoProtocolo\(\)"/g, 'data-action="confirmar-protocolo"'],
  [/onclick="imprimirFolhaProtocoloLocal\(\)"/g, 'data-action="imprimir-folha-protocolo"'],
];

for (const [pattern, replacement] of replacements) {
  html = html.replace(pattern, replacement);
}

// Verify no onclick remain
const remainingOnclick = html.match(/onclick=/g);
if (remainingOnclick) {
  console.warn(`WARNING: ${remainingOnclick.length} onclick= still remaining in index.html!`);
  // Find them
  const lines = html.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('onclick=')) {
      console.warn(`  Line ${idx + 1}: ${line.trim()}`);
    }
  });
} else {
  console.log('SUCCESS: All onclick= removed from index.html!');
}

fs.writeFileSync('src/index.html', html, 'utf8');
console.log('Saved index.html');

// --- 2. Add event delegation block at the TOP of Scripts.html (after <script>) ---

let scripts = fs.readFileSync('src/Scripts.html', 'utf8');

const delegationBlock = `
// Delegacao de eventos para substituir todos os atributos onclick inline do index.html
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    e.preventDefault();
    
    if (action === 'nav') {
      navegarPara(el.getAttribute('data-view'));
    } else if (action === 'abrir-modal-servidor') {
      abrirModalServidor();
    } else if (action === 'abrir-modal-lancamento') {
      abrirModalLancamento();
    } else if (action === 'abrir-modal-criar-protocolo') {
      abrirModalCriarProtocolo();
    } else if (action === 'abrir-modal-usuario') {
      abrirModalUsuario();
    } else if (action === 'gerar-relatorio') {
      gerarDadosRelatorio();
    } else if (action === 'exportar-excel') {
      exportarRelatorioExcel();
    } else if (action === 'imprimir-relatorio') {
      imprimirRelatorioLocal();
    } else if (action === 'imprimir-relatorio-nativo') {
      imprimirRelatorioLocalNativo();
    } else if (action === 'aba-admin') {
      alternarAbaAdmin(el.getAttribute('data-aba'));
    } else if (action === 'fechar-modal') {
      fecharModal(el.getAttribute('data-modal'));
    } else if (action === 'aba-ficha') {
      alternarAbaFicha(el.getAttribute('data-aba'));
    } else if (action === 'confirmar-protocolo') {
      confirmarGeracaoProtocolo();
    } else if (action === 'imprimir-folha-protocolo') {
      imprimirFolhaProtocoloLocal();
    }
  });
});
`;

// Insert delegation block right after the opening <script> tag
scripts = scripts.replace('<script>', '<script>' + delegationBlock);

fs.writeFileSync('src/Scripts.html', scripts, 'utf8');
console.log('Saved Scripts.html with event delegation block');
