'use strict';
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('⚠️ Restaurando backup de emergência (tag: backup-emergencia)...');
try {
  execSync('git reset --hard backup-emergencia', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  console.log('✅ Repositório restaurado para o commit do backup.');

  // Sincroniza desktop se existir
  const desktopRuntime = 'C:\\Users\\mathe\\Desktop\\Entidade.V1-Portatil\\resources\\app\\renderer\\index.html';
  const portHtml = path.resolve(__dirname, 'portable-entidade', 'app', 'renderer', 'index.html');
  if (fs.existsSync(desktopRuntime) && fs.existsSync(portHtml)) {
    fs.copyFileSync(portHtml, desktopRuntime);
    console.log('✅ Versão portátil desktop sincronizada.');
  }
  console.log('🎉 Restauração de emergência concluída com sucesso!');
} catch (e) {
  console.error('❌ Falha na restauração:', e.message);
  process.exit(1);
}
