const path = require('node:path');
const { Worker } = require('node:worker_threads');

function falhaLocal(codigo, mensagem) { return Object.assign(new Error(mensagem), { code: codigo }); }

class LocalEngine {
  constructor(pasta, fonte = path.join(__dirname, 'source-app')) {
    this.pedidos = new Map(); this.sequencia = 0; this.encerrando = false;
    this.pronto = new Promise((resolve, reject) => { this.resolverInicio = resolve; this.rejeitarInicio = reject; });
    this.pronto.catch(() => {});
    this.worker = new Worker(path.join(__dirname, 'local-worker.cjs'), { workerData: { pasta, fonte } });
    this.worker.on('message', pacote => {
      if (pacote.pronto) { this.resolverInicio(); return; }
      if (pacote.fatal) { this.falhar(falhaLocal(pacote.fatal.codigo, pacote.fatal.mensagem)); return; }
      const pedido = this.pedidos.get(pacote.id);
      if (!pedido) return;
      this.pedidos.delete(pacote.id);
      if (pacote.ok) pedido.resolve(pacote.resultado);
      else pedido.reject(falhaLocal(pacote.erro.codigo, pacote.erro.mensagem));
    });
    this.worker.on('error', () => this.falhar(falhaLocal('ENT-LOCAL-MOTOR', 'O processamento local foi interrompido. Reabra o programa e confira os dados antes de repetir uma gravação.')));
    this.worker.on('exit', () => {
      if (!this.encerrando || this.pedidos.size) this.falhar(falhaLocal('ENT-LOCAL-MOTOR', 'O processamento local foi encerrado. Confira os dados antes de repetir uma gravação.'));
      this.encerrado = true;
    });
  }
  falhar(erro) {
    this.falha = erro;
    this.rejeitarInicio(erro);
    for (const pedido of this.pedidos.values()) pedido.reject(erro);
    this.pedidos.clear();
  }
  async enviar(operacao, argumentos = [], encerramento = false) {
    if ((this.encerrando && !encerramento) || this.encerrado) throw falhaLocal('ENT-LOCAL-FECHADO', 'A base local está sendo fechada.');
    if (this.falha) throw this.falha;
    await this.pronto;
    if (this.falha) throw this.falha;
    const id = ++this.sequencia;
    return new Promise((resolve, reject) => {
      this.pedidos.set(id, { resolve, reject });
      try { this.worker.postMessage({ id, operacao, argumentos }); }
      catch (_) { this.falhar(falhaLocal('ENT-LOCAL-MOTOR', 'Não foi possível enviar a operação ao processamento local.')); }
    });
  }
  estado() { return this.enviar('estado'); }
  iniciar(email, nome) { return this.enviar('iniciar', [email, nome]); }
  chamar(metodo, argumentos = []) { return this.enviar('chamar', [metodo, argumentos]); }
  arquivo(id) { return this.enviar('arquivo', [id]); }
  async fechar() {
    if (this.fechando) return this.fechando;
    this.encerrando = true;
    this.fechando = (async () => {
      try { if (!this.encerrado && !this.falha) await this.enviar('fechar', [], true); }
      finally { await this.worker.terminate(); this.encerrado = true; }
    })();
    return this.fechando;
  }
}

module.exports = { LocalEngine };
