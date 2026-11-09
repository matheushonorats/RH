const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const raiz = path.resolve(__dirname, '..');
const diretorioPublicacao = path.join(__dirname, 'output', 'RH-Modo-Seguro-Beta');
const arquivoVersao = path.join(diretorioPublicacao, 'Version.gs');
const arquivoPackage = path.join(raiz, 'package.json');
// O deployment que antes era beta foi promovido a oficial. O endereço
// histórico permanece apenas como redirecionador para este destino.
const deploymentId = process.env.CLASP_DEPLOYMENT_ID || 'AKfycby0FlCTrL0QIJbFrZD883rn6PKhzpMea5JL7eqz_bN9aglWajMIFZ021uxsi8aDEyAhCw';
const clasp = path.join(raiz, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
const simulacao = process.argv.includes('--dry-run');
const republicarAtual = process.argv.includes('--retry-current');

function executar(argumentos) {
  if (!Array.isArray(argumentos) || argumentos.some(argumento => typeof argumento !== 'string')) {
    throw new Error('Argumentos inválidos para o clasp.');
  }
  const resultado = spawnSync(process.execPath, [clasp].concat(argumentos), { cwd: diretorioPublicacao, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false, timeout: 600000 });
  if (resultado.stdout) process.stdout.write(resultado.stdout);
  if (resultado.stderr) process.stderr.write(resultado.stderr);
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) throw new Error(`Falha no clasp ${argumentos[0]}.`);
  // O clasp pode encerrar com código 0 após um prompt fechado sem enviar nada.
  if (argumentos[0] === 'push' && !/Pushed \d+ files\./.test(resultado.stdout || '')) {
    throw new Error('O envio não foi confirmado; a implantação foi cancelada para não publicar código antigo.');
  }
}

const conteudoOriginal = fs.readFileSync(arquivoVersao, 'utf8');
const encontrado = conteudoOriginal.match(/const APP_VERSION = "(\d+)\.(\d+)(?:\.(\d+))?";/);
if (!encontrado) throw new Error('Não foi possível localizar APP_VERSION em Version.gs.');
const versaoPacoteAtual = fs.existsSync(arquivoPackage) ? String(JSON.parse(fs.readFileSync(arquivoPackage, 'utf8')).version || '') : '';

// Migração única da antiga V2.3.x para Entidade.V1 - 1.0.
// Publicações ordinárias seguintes avançam 1.1, 1.2 etc.; uma mudança
// principal exige decisão explícita, nunca um salto automático para 2.0.
const migracaoPendente = /^2\.3\./.test(versaoPacoteAtual);
const proximaVersao = republicarAtual ? `${encontrado[1]}.${encontrado[2]}` : (migracaoPendente ? '1.0' : `${encontrado[1]}.${Number(encontrado[2]) + 1}`);
if (simulacao) {
  console.log(`Próxima publicação: Entidade.V1 - ${proximaVersao}`);
  process.exit(0);
}

const novoConteudo = conteudoOriginal
  .replace(encontrado[0], `const APP_VERSION = "${proximaVersao}";`)
  .replace(/const APP_VERSION_DISPLAY = "[^"]+";/, `const APP_VERSION_DISPLAY = "Entidade.V1 - ${proximaVersao}";`);
fs.writeFileSync(arquivoVersao, novoConteudo, 'utf8');

let pacoteOriginal = null;
if (fs.existsSync(arquivoPackage)) {
  pacoteOriginal = fs.readFileSync(arquivoPackage, 'utf8');
  const pacote = JSON.parse(pacoteOriginal);
  pacote.version = `${proximaVersao}.0`;
  fs.writeFileSync(arquivoPackage, `${JSON.stringify(pacote, null, 2)}\n`, 'utf8');
}

try {
  console.log(`Publicando Entidade.V1 - ${proximaVersao}...`);
  // O projeto publicado é mantido neste diretório. O push interativo pode
  // aguardar confirmação indefinidamente quando executado sem terminal.
  executar(['push', '-f']);
  executar(['deploy', '-i', deploymentId, '-d', `Entidade.V1 - ${proximaVersao}`]);
  console.log(`Entidade.V1 - ${proximaVersao} publicada com sucesso.`);
  // Abre a versão recém-publicada para atualizar o marcador compartilhado
  // que as abas antigas consultam. Falha aqui não desfaz a implantação.
  const urlPublica = `https://script.google.com/macros/s/${deploymentId}/exec?versaoPublicada=${encodeURIComponent(proximaVersao)}`;
  const ativacao = spawnSync(process.execPath, ['-e', `fetch(${JSON.stringify(urlPublica)}, {redirect:'follow', signal:AbortSignal.timeout(30000)}).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); }).catch(e => { console.error(e.message); process.exitCode = 1; })`], { cwd: diretorioPublicacao, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  if (ativacao.status !== 0) console.warn('Não foi possível confirmar automaticamente o aviso aos navegadores abertos; a publicação permanece ativa.');
} catch (erro) {
  fs.writeFileSync(arquivoVersao, conteudoOriginal, 'utf8');
  if (pacoteOriginal !== null) fs.writeFileSync(arquivoPackage, pacoteOriginal, 'utf8');
  throw erro;
}
