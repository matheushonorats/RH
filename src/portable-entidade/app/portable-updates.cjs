const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

function falha(codigo, mensagem) { return Object.assign(new Error(mensagem), { code: 'ENT-UPDATE-' + codigo }); }
function comparar(a, b) {
  const partes = v => String(v).split('.').map(Number);
  const x = partes(a), y = partes(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  return 0;
}
function relativoSeguro(nome) {
  return typeof nome === 'string' && nome.length < 240 && !nome.includes('\\') && nome.split('/').every(p => p && p !== '.' && p !== '..' && !/[<>:"|?*\x00-\x1f]/.test(p) && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p));
}
async function sha256(arquivo) {
  const hash = crypto.createHash('sha256');
  for await (const bloco of fs.createReadStream(arquivo)) hash.update(bloco);
  return hash.digest('hex');
}
async function extrair(arquivo, destino) {
  await new Promise((resolve, reject) => {
    const processo = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'update-extract.ps1'), arquivo, destino], { windowsHide: true, stdio: 'ignore' });
    processo.once('error', () => reject(falha('EXTRACAO', 'O Windows não conseguiu preparar a atualização. O programa atual foi mantido.')));
    processo.once('exit', codigo => codigo === 0 ? resolve() : reject(falha('EXTRACAO', 'O pacote não pôde ser extraído com segurança. O programa atual foi mantido.')));
  });
}
class PortableUpdates {
  constructor({ pasta, versao, canal, fetchImpl = fetch, extrairImpl = extrair }) {
    Object.assign(this, { pasta, versao, canal, fetchImpl, extrairImpl });
    this.raiz = path.join(pasta, 'atualizacoes');
    this.indice = path.join(this.raiz, 'ativa.json');
    this.estadoAtual = { estado: 'ocioso', versaoInstalada: versao };
  }
  validar(assinado) {
    let envelope, dados;
    try {
      envelope = typeof assinado === 'string' ? JSON.parse(assinado) : assinado;
      const bruto = Buffer.from(envelope.payload, 'base64');
      if (bruto.length > 1024 * 1024 || !crypto.verify(null, bruto, this.canal.chavePublica, Buffer.from(envelope.assinatura, 'base64'))) throw new Error('Assinatura');
      dados = JSON.parse(bruto.toString('utf8'));
    } catch (_) { throw falha('ASSINATURA', 'A autenticidade desta atualização não foi confirmada. Nada será instalado.'); }
    if (dados.app !== 'entidade-v1-portatil' || dados.formato !== 1 || !/^\d+\.\d+\.\d+$/.test(dados.versao) ||
        !/^[a-f0-9]{64}$/.test(dados.sha256) || !Number.isSafeInteger(dados.bytes) || dados.bytes <= 0 || dados.bytes > 1024 * 1024 * 1024 ||
        typeof dados.url !== 'string' || !dados.url.startsWith(this.canal.baseUrl) || !/^[\w.-]+\.zip$/.test(dados.url.slice(this.canal.baseUrl.length)) ||
        !Array.isArray(dados.arquivos) || !dados.arquivos.length || dados.arquivos.length > 5000) throw falha('MANIFESTO', 'A descrição do pacote de atualização é inválida.');
    const nomes = new Set(); let tamanho = 0;
    for (const item of dados.arquivos) {
      if (!relativoSeguro(item.nome) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || nomes.has(item.nome.toLowerCase())) throw falha('MANIFESTO', 'O pacote contém caminhos inválidos ou repetidos.');
      nomes.add(item.nome.toLowerCase()); tamanho += item.bytes;
    }
    if (tamanho > 2 * 1024 * 1024 * 1024 || !nomes.has('entidade.v1.exe') || !nomes.has('resources/app/main.cjs') || !nomes.has('resources/app/package.json')) throw falha('MANIFESTO', 'O pacote de atualização está incompleto.');
    return { envelope, dados };
  }
  async buscar(url) {
    for (let i = 0; i < 5; i++) {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(u.hostname) || u.username || u.password || u.port) throw falha('ENDERECO', 'O endereço da atualização não é autorizado.');
      const resposta = await this.fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(300000), headers: { 'User-Agent': 'Entidade.V1-Updater', 'Cache-Control': 'no-cache' } });
      if (resposta.status >= 300 && resposta.status < 400) {
        const location = resposta.headers.get('location');
        if (!location) throw falha('ENDERECO', 'O servidor não informou onde baixar o pacote.');
        url = new URL(location, url).href; continue;
      }
      return resposta;
    }
    throw falha('ENDERECO', 'O servidor redirecionou a atualização vezes demais.');
  }
  async verificar() {
    if (!this.canal?.chavePublica || !this.canal?.baseUrl) return this.estadoAtual = { estado: 'canal-pendente', versaoInstalada: this.versao };
    const resposta = await this.buscar(this.canal.baseUrl + 'entidade-update.json');
    if (resposta.status === 404) return this.estadoAtual = { estado: 'sem-publicacao', versaoInstalada: this.versao };
    if (!resposta.ok) throw falha('REDE', 'Não foi possível consultar a atualização agora. Continue usando o programa normalmente.');
    let texto = ''; const decoder = new TextDecoder();
    for await (const bloco of resposta.body) { texto += decoder.decode(bloco, { stream: true }); if (texto.length > 1500000) throw falha('MANIFESTO', 'A descrição da atualização excedeu o limite.'); }
    texto += decoder.decode();
    const pacote = this.validar(texto);
    if (comparar(pacote.dados.versao, this.versao) <= 0) { this.disponivel = null; return this.estadoAtual = { estado: 'atualizado', versaoInstalada: this.versao }; }
    this.disponivel = pacote;
    return this.estadoAtual = { estado: 'disponivel', versao: pacote.dados.versao, versaoInstalada: this.versao };
  }
  async conferir(pasta, dados) {
    const esperados = new Set(dados.arquivos.map(a => a.nome.toLowerCase()));
    async function percorrer(dir, prefixo = '') {
      for (const item of await fs.promises.readdir(dir, { withFileTypes: true })) {
        const nome = prefixo + item.name;
        const absoluto = path.join(dir, item.name);
        if (item.isSymbolicLink()) throw falha('INTEGRIDADE', 'A atualização contém um link de arquivo não permitido.');
        if (item.isDirectory()) await percorrer(absoluto, nome + '/');
        else if (!item.isFile() || !esperados.has(nome.toLowerCase())) throw falha('INTEGRIDADE', 'Há arquivos inesperados no pacote.');
      }
    }
    await percorrer(pasta);
    for (const item of dados.arquivos) {
      const arquivo = path.join(pasta, ...item.nome.split('/'));
      const stat = await fs.promises.lstat(arquivo);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== item.bytes || await sha256(arquivo) !== item.sha256) throw falha('INTEGRIDADE', 'Um arquivo da atualização foi alterado ou está incompleto. O programa anterior foi mantido.');
    }
    const meta = JSON.parse(await fs.promises.readFile(path.join(pasta, 'resources', 'app', 'package.json'), 'utf8'));
    if (meta.name !== dados.app || meta.version !== dados.versao) throw falha('INTEGRIDADE', 'A versão dentro do pacote é diferente da versão publicada.');
  }
  async preparar(notificar = () => {}) {
    if (this.preparando) return this.preparando;
    this.preparando = this.baixar(notificar).finally(() => { this.preparando = null; });
    return this.preparando;
  }
  async baixar(notificar) {
    if (!this.disponivel) await this.verificar();
    if (!this.disponivel) throw falha('INDISPONIVEL', 'Ainda não há um pacote mais recente publicado.');
    const { dados, envelope } = this.disponivel;
    fs.mkdirSync(this.raiz, { recursive: true });
    const pasta = fs.mkdtempSync(path.join(this.raiz, 'preparo-'));
    const arquivo = path.join(pasta, 'pacote.zip');
    const resposta = await this.buscar(dados.url);
    if (!resposta.ok) throw falha('DOWNLOAD', 'Não foi possível baixar a atualização. Nenhum arquivo do programa atual foi substituído.');
    const handle = await fs.promises.open(arquivo, 'wx'); let recebidos = 0;
    try {
      for await (const bloco of resposta.body) {
        recebidos += bloco.byteLength;
        if (recebidos > dados.bytes) throw falha('INTEGRIDADE', 'O tamanho do pacote é diferente do publicado.');
        await handle.writeFile(bloco);
        notificar({ estado: 'baixando', versao: dados.versao, percentual: Math.min(99, Math.max(0, Math.floor(recebidos / dados.bytes * 100))) });
      }
    } finally { await handle.close(); }
    if (recebidos !== dados.bytes || await sha256(arquivo) !== dados.sha256) throw falha('INTEGRIDADE', 'O download está incompleto ou diferente do pacote assinado.');
    notificar({ estado: 'conferindo', versao: dados.versao, percentual: 99 });
    const destino = path.join(pasta, 'extraido');
    await this.extrairImpl(arquivo, destino);
    const programa = path.join(destino, 'Entidade.V1-win32-x64');
    await this.conferir(programa, dados);
    fs.writeFileSync(path.join(pasta, 'manifesto.json'), JSON.stringify(envelope));
    await fs.promises.unlink(arquivo);
    this.pronta = { pasta: path.basename(pasta), versao: dados.versao };
    this.estadoAtual = { estado: 'pronta', versao: dados.versao, percentual: 100 };
    notificar(this.estadoAtual); return this.estadoAtual;
  }
  async localizar(registro) {
    if (!registro || !/^preparo-[\w-]+$/.test(registro.pasta)) throw falha('REGISTRO', 'O registro da atualização está inválido.');
    const pasta = path.join(this.raiz, registro.pasta);
    const pacote = this.validar(fs.readFileSync(path.join(pasta, 'manifesto.json'), 'utf8'));
    const programa = path.join(pasta, 'extraido', 'Entidade.V1-win32-x64');
    await this.conferir(programa, pacote.dados);
    return { executavel: path.join(programa, 'Entidade.V1.exe'), versao: pacote.dados.versao };
  }
  async ativar() {
    if (!this.pronta) throw falha('INDISPONIVEL', 'Baixe e confira o pacote antes de atualizar.');
    const programa = await this.localizar(this.pronta);
    const registro = JSON.stringify(this.pronta);
    if (fs.existsSync(this.indice)) fs.copyFileSync(this.indice, this.indice + '.anterior');
    fs.writeFileSync(this.indice + '.novo', registro);
    fs.renameSync(this.indice + '.novo', this.indice);
    return programa;
  }
  async ativa() {
    if (!fs.existsSync(this.indice)) return null;
    return this.localizar(JSON.parse(fs.readFileSync(this.indice, 'utf8')));
  }
  reverter() {
    if (fs.existsSync(this.indice)) fs.renameSync(this.indice, this.indice + '.falha-' + Date.now());
    if (fs.existsSync(this.indice + '.anterior')) fs.copyFileSync(this.indice + '.anterior', this.indice);
  }
}
module.exports = { PortableUpdates, relativoSeguro, comparar, sha256 };
