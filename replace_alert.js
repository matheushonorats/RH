const fs = require('fs');
let code = fs.readFileSync('src/Scripts.html', 'utf8');
code = code.replace(/alert\((.*?)\);/g, (match, p1) => {
  if (p1.toLowerCase().includes('sucesso')) return `mostrarToast(${p1}, 'success');`;
  if (p1.toLowerCase().match(/erro|falha|inválido|obrigatório/)) return `mostrarToast(${p1}, 'error');`;
  return `mostrarToast(${p1}, 'warning');`;
});
fs.writeFileSync('src/Scripts.html', code);
