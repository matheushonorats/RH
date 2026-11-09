const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function codificar(valor) {
  if (valor instanceof Date) return { __dataEntidade: valor.toISOString() };
  if (Array.isArray(valor)) return valor.map(codificar);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, codificar(item)]));
  return valor === undefined ? '' : valor;
}
function decodificar(valor) {
  if (valor && valor.__dataEntidade) return new Date(valor.__dataEntidade);
  if (Array.isArray(valor)) return valor.map(decodificar);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, decodificar(item)]));
  return valor;
}

class LocalStore {
  constructor(pasta) {
    fs.mkdirSync(pasta, { recursive: true });
    this.pasta = pasta;
    this.db = new DatabaseSync(path.join(pasta, 'entidade.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS propriedades(chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS guias(nome TEXT PRIMARY KEY, id INTEGER UNIQUE, dados TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS objetos(id TEXT PRIMARY KEY, dados TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS fila(id INTEGER PRIMARY KEY AUTOINCREMENT, criado TEXT NOT NULL, dados TEXT NOT NULL, confirmado INTEGER NOT NULL DEFAULT 0);`);
    this.guias = new Map(); this.alteradas = new Set();
  }
  transacao(acao) {
    this.guias.clear(); this.alteradas.clear();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const resultado = acao();
      const mudancas = [];
      for (const nome of this.alteradas) {
        const guia = this.guias.get(nome);
        const dados = JSON.stringify(codificar(guia.linhas));
        this.db.prepare('INSERT INTO guias(nome,id,dados) VALUES(?,?,?) ON CONFLICT(nome) DO UPDATE SET dados=excluded.dados').run(nome, guia.id, dados);
        mudancas.push({ guia: nome, antes: guia.original, depois: dados });
      }
      if (mudancas.length) {
        this.db.prepare('INSERT INTO fila(criado,dados) VALUES(?,?)').run(new Date().toISOString(), JSON.stringify(mudancas));
        this.setProperty('RH_VERSAO_DADOS', Date.now() + '-' + crypto.randomUUID().slice(0, 8));
      }
      this.db.exec('COMMIT'); return resultado;
    } catch (erro) { this.db.exec('ROLLBACK'); throw erro; }
    finally { this.guias.clear(); this.alteradas.clear(); }
  }
  getProperty(chave) { return this.db.prepare('SELECT valor FROM propriedades WHERE chave=?').get(chave)?.valor ?? null; }
  setProperty(chave, valor) { this.db.prepare('INSERT INTO propriedades VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor').run(chave, String(valor)); return this; }
  deleteProperty(chave) { this.db.prepare('DELETE FROM propriedades WHERE chave=?').run(chave); return this; }
  getProperties() { return Object.fromEntries(this.db.prepare('SELECT * FROM propriedades').all().map(item => [item.chave, item.valor])); }
  setProperties(valores, apagar = false) { if (apagar) this.db.exec('DELETE FROM propriedades'); for (const [chave, valor] of Object.entries(valores)) this.setProperty(chave, valor); return this; }
  getSheetByName(nome) {
    if (this.guias.has(nome)) return this.guias.get(nome);
    const linha = this.db.prepare('SELECT * FROM guias WHERE nome=?').get(nome);
    if (!linha) return null;
    const guia = new LocalSheet(this, nome, linha.id, decodificar(JSON.parse(linha.dados)), linha.dados);
    this.guias.set(nome, guia); return guia;
  }
  insertSheet(nome) {
    if (this.getSheetByName(nome)) throw new Error('A guia já existe: ' + nome);
    const id = Number(this.db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM guias').get().id) + this.alteradas.size;
    const guia = new LocalSheet(this, nome, id, [], null);
    this.guias.set(nome, guia); this.alteradas.add(nome); return guia;
  }
  getSheets() { return [...new Set([...this.db.prepare('SELECT nome FROM guias ORDER BY id').all().map(item => item.nome), ...this.guias.keys()])].map(nome => this.getSheetByName(nome)); }
  getId() { return 'local-workbook'; }
  getName() { return 'Entidade — banco local'; }
  snapshot() {
    const dados = Object.fromEntries(this.db.prepare('SELECT nome,dados FROM guias ORDER BY id').all().map(item => [item.nome, JSON.parse(item.dados)]));
    for (const [nome, guia] of this.guias) dados[nome] = codificar(guia.linhas);
    return dados;
  }
  close() { this.db.close(); }
}

class LocalSheet {
  constructor(store, nome, id, linhas, original) { Object.assign(this, { store, nome, id, linhas, original }); }
  mudar() { this.store.alteradas.add(this.nome); }
  getName() { return this.nome; }
  getSheetId() { return this.id; }
  getLastRow() { for (let i = this.linhas.length - 1; i >= 0; i--) if (this.linhas[i]?.some(v => v !== '' && v != null)) return i + 1; return 0; }
  getLastColumn() { return this.linhas.reduce((maior, linha) => Math.max(maior, linha?.length || 0), 0); }
  getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  getMaxRows() { return Math.max(1000, this.getLastRow()); }
  getRange(linha, coluna, linhas = 1, colunas = 1) {
    if (![linha, coluna, linhas, colunas].every(valor => Number.isInteger(valor) && valor > 0)) throw new Error('Intervalo local inválido.');
    return new LocalRange(this, linha, coluna, linhas, colunas);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(linha) { this.linhas[this.getLastRow()] = [...linha]; this.mudar(); return this; }
  deleteRows(inicio, quantidade = 1) { this.linhas.splice(inicio - 1, quantidade); this.mudar(); return this; }
  insertRowsAfter(linha, quantidade) { this.linhas.splice(linha, 0, ...Array.from({ length: quantidade }, () => [])); this.mudar(); return this; }
  insertColumnAfter(coluna) { return this.insertColumnsAfter(coluna, 1); }
  insertColumnsAfter(coluna, quantidade) { for (const linha of this.linhas) { while (linha.length < coluna) linha.push(''); linha.splice(coluna, 0, ...Array(quantidade).fill('')); } this.mudar(); return this; }
  clearContents() { this.linhas = []; this.mudar(); return this; }
  hideSheet() { return this; }
  setFrozenRows() { return this; }
}

class LocalRange {
  constructor(guia, linha, coluna, linhas, colunas) { Object.assign(this, { guia, linha, coluna, linhas, colunas }); }
  getValues() { return Array.from({ length: this.linhas }, (_, l) => Array.from({ length: this.colunas }, (_, c) => this.guia.linhas[this.linha - 1 + l]?.[this.coluna - 1 + c] ?? '')); }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValues() { return this.getValues().map(linha => linha.map(valor => valor instanceof Date ? valor.toLocaleDateString('pt-BR') : String(valor))); }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  setValues(valores) {
    if (valores.length !== this.linhas || valores.some(linha => linha.length !== this.colunas)) throw new Error('Quantidade de células diferente do intervalo.');
    for (let l = 0; l < this.linhas; l++) {
      const indice = this.linha - 1 + l;
      const linha = this.guia.linhas[indice] || (this.guia.linhas[indice] = []);
      while (linha.length < this.coluna - 1) linha.push('');
      for (let c = 0; c < this.colunas; c++) linha[this.coluna - 1 + c] = valores[l][c];
    }
    this.guia.mudar(); return this;
  }
  setValue(valor) { return this.setValues(Array.from({ length: this.linhas }, () => Array(this.colunas).fill(valor))); }
  clearContent() { return this.setValue(''); }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  setHorizontalAlignment() { return this; } setNumberFormat() { return this; }
  copyTo(destino, tipo) {
    if (tipo === 'PASTE_FORMAT') return destino;
    const valores = this.getValues().map(linha => linha.map(valor => typeof valor === 'string' && valor.startsWith('=') ? valor : ''));
    if (valores.some(linha => linha.some(Boolean))) destino.setValues(valores);
    return destino;
  }
}

module.exports = { LocalStore, codificar, decodificar };
