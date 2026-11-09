const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { LocalEngine } = require('./local-engine.cjs');

function erroConfig(codigo, mensagem) { return Object.assign(new Error(mensagem), { code: codigo }); }
// Compatibilidade explícita: somente para um perfil já usado pelo piloto anterior.
const ENDERECO_PILOTO_ANTERIOR = 'https://script.google.com/macros/s/AKfycby0FlCTrL0QIJbFrZD883rn6PKhzpMea5JL7eqz_bN9aglWajMIFZ021uxsi8aDEyAhCw/exec';
function validarEndpoint(valor) {
  const url = new URL(String(valor || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || url.port || url.username || url.password ||
      !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname) || url.search || url.hash) throw erroConfig('ENT-CONEXAO-ENDERECO', 'Cole o endereço publicado do seu servidor Entidade, terminado em /exec.');
  return url.href;
}

class StorageMode {
  constructor(pasta) {
    this.pasta = pasta; this.arquivo = path.join(pasta, 'armazenamento.json');
    this.config = null;
    fs.mkdirSync(pasta, { recursive: true });
    const marcador = path.join(pasta, 'primeira-abertura.json');
    if (!fs.existsSync(marcador)) fs.writeFileSync(marcador, JSON.stringify({ permiteMigrar: fs.existsSync(path.join(pasta, 'Local Storage', 'leveldb')) }), { flag: 'wx' });
    try { this.permiteMigrar = JSON.parse(fs.readFileSync(marcador, 'utf8')).permiteMigrar === true; }
    catch (_) { this.permiteMigrar = false; }
    if (fs.existsSync(this.arquivo)) {
      try {
        const config = JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
        if (config.modo === 'local' && /^[\da-f-]{36}$/.test(config.id)) this.config = config;
        else if (config.modo === 'servidor') this.config = { ...config, url: validarEndpoint(config.url) };
        else throw new Error('Configuração desconhecida');
      } catch (_) { throw erroConfig('ENT-CONFIGURACAO-LEITURA', 'Não foi possível ler a escolha de armazenamento. Seus dados foram preservados; envie o relatório ao suporte.'); }
    }
  }
  estado() { return { configurado: Boolean(this.config), modo: this.config?.modo || '', nome: this.config?.nome || '', email: this.config?.email || '', organizacao: this.config?.organizacao || '', permiteMigrar: this.permiteMigrar }; }
  particao() {
    if (!this.config || (this.config.modo === 'servidor' && this.config.migrada === true && this.config.url === ENDERECO_PILOTO_ANTERIOR)) return '';
    return this.config.modo === 'local' ? 'persist:entidade-base-' + this.config.id : 'persist:entidade-servidor-' + crypto.createHash('sha256').update(this.config.url).digest('hex').slice(0, 24);
  }
  engine() {
    if (this.config?.modo !== 'local') throw erroConfig('ENT-CONFIGURACAO', 'Escolha onde salvar os dados antes de entrar.');
    if (!this.motor) this.motor = new LocalEngine(path.join(this.pasta, 'bases', this.config.id));
    return this.motor;
  }
  async configurar(pedido) {
    if (this.config || this.configurando) throw erroConfig('ENT-CONFIGURACAO-EXISTENTE', 'Já existe uma base configurada. Ela não será substituída por uma base vazia.');
    this.configurando = true;
    let motor;
    try {
      const organizacao = String(pedido?.organizacao || '').trim().slice(0, 150);
      let config;
      if (pedido?.modo === 'local') {
        config = { modo: 'local', id: crypto.randomUUID(), nome: String(pedido.nome || '').trim(), email: String(pedido.email || '').trim().toLowerCase(), organizacao };
        motor = new LocalEngine(path.join(this.pasta, 'bases', config.id));
        await motor.iniciar(config.email, config.nome);
      } else if (pedido?.modo === 'servidor') {
        config = { modo: 'servidor', url: validarEndpoint(pedido.url), organizacao };
      } else if (pedido?.modo === 'anterior' && this.permiteMigrar) {
        config = { modo: 'servidor', url: ENDERECO_PILOTO_ANTERIOR, migrada: true, organizacao };
      } else {
        throw erroConfig('ENT-CONFIGURACAO-MODO', 'Essa modalidade ainda não está disponível. Nenhum dado ou conta foi conectado.');
      }
      fs.mkdirSync(this.pasta, { recursive: true });
      fs.writeFileSync(this.arquivo + '.novo', JSON.stringify(config), { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(this.arquivo + '.novo', this.arquivo);
      this.config = config; this.motor = motor;
      return this.estado();
    } catch (erro) {
      if (motor) await motor.fechar();
      throw erro;
    } finally { this.configurando = false; }
  }
  async fechar() { const motor = this.motor; this.motor = undefined; if (motor) await motor.fechar(); }
}
module.exports = { StorageMode, validarEndpoint };
