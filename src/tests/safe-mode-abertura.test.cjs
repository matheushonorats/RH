'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '../output/RH-Modo-Seguro-Beta');
const source = fs.readFileSync(path.join(root, 'SafeMode.html'), 'utf8').replace(/<\/?script>/g, '');
function contexto() {
  const dados = new Map([['rh_user', JSON.stringify({ email: 'teste@example.com' })], ['rh_token', 'sessao-preservada'], ['rh_safe_mode_v1_teste%40example.com', 'accelerated'], ['fila', 'pendente']]);
  const timers = new Map(); let sequencia = 0;
  const request = {};
  const ctx = { window: { indexedDB: true, location: { reload() { throw new Error('Não recarregar o iframe'); } } },
    indexedDB: { open: () => request },
    localStorage: { getItem: k => dados.get(k), setItem: (k,v) => dados.set(k,v) },
    setTimeout: fn => { timers.set(++sequencia, fn); return sequencia; }, clearTimeout: id => timers.delete(id),
    document: { querySelectorAll: () => [], getElementById: () => null },
    abrirConfirm: async () => true, mostrarToast() {}, console, Date };
  vm.createContext(ctx); vm.runInContext(source + '\nthis.safe = SafeMode;', ctx);
  return { ctx, request, dados, disparar: () => { const eventos = [...timers.values()]; timers.clear(); eventos.forEach(fn => fn()); } };
}
test('abertura local que nunca responde termina e fecha conexão atrasada', async () => {
  const { ctx, request, dados, disparar } = contexto();
  const leitura = ctx.safe.loadSnapshot();
  const rejeicao = assert.rejects(leitura, /demorou/);
  disparar(); await rejeicao;
  let fechou = false;
  request.result = { close: () => { fechou = true; } };
  request.onsuccess();
  assert.equal(fechou, true);
  assert.equal(dados.get('rh_token'), 'sessao-preservada');
  assert.equal(dados.get('fila'), 'pendente');
});
test('leitura local travada encerra transação e conexão', async () => {
  const { ctx, request, disparar } = contexto();
  let abortou = false, fechou = false;
  const transaction = { objectStore: () => ({ get: () => ({}) }), abort: () => { abortou = true; } };
  request.result = { transaction: () => transaction, close: () => { fechou = true; } };
  const leitura = ctx.safe.loadSnapshot();
  const rejeicao = assert.rejects(leitura, /demorou/);
  request.onsuccess(); await Promise.resolve();
  disparar(); await rejeicao;
  assert.equal(abortou, true); assert.equal(fechou, true);
});
test('troca de modo preserva sessão e fila sem recarregar o iframe', async () => {
  const { ctx, dados } = contexto();
  await ctx.safe.selectMode('classic');
  assert.equal(ctx.safe.getMode(), 'classic');
  assert.equal(dados.get('rh_token'), 'sessao-preservada');
  assert.equal(dados.get('fila'), 'pendente');
});
test('API autenticada permite configurar chave e ainda exige administrador', () => {
  const auth = fs.readFileSync(path.join(root, 'Auth.gs'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'ConfigService.gs'), 'utf8');
  const mapa = auth.slice(auth.indexOf('function obterFuncoesApiPermitidas_('), auth.indexOf('/** Wrapper autenticado'));
  const wrapper = auth.slice(auth.indexOf('function executarApiBackend('), auth.indexOf('function registrarAlteracaoDados_('));
  const configurar = config.slice(config.indexOf('function salvarChaveLeituraCartaoIA('), config.indexOf('function obterListaConfiguracoes('));
  let admin = true, autenticou = false;
  const ctx = { verificarSessao: token => { assert.equal(token, 'teste'); autenticou = true; },
    verificarSeEhAdmin: () => admin, bloquearMutacaoBetaSeNecessario_() {}, registrarAlteracaoDados_() {},
    PropertiesService: { getScriptProperties: () => ({ setProperty() {} }) } };
  for (const match of mapa.matchAll(/:\s*(\w+)\s*[,\n]/g)) if (!(match[1] in ctx)) ctx[match[1]] = () => {};
  vm.createContext(ctx); vm.runInContext(mapa + configurar + wrapper, ctx);
  const resposta = ctx.executarApiBackend('teste', 'salvarChaveLeituraCartaoIA', ['Gemini', 'chave-ficticia-de-teste']);
  assert.equal(resposta.salvo, true); assert.equal(autenticou, true);
  admin = false;
  assert.throws(() => ctx.executarApiBackend('teste', 'salvarChaveLeituraCartaoIA', ['Gemini', 'chave-ficticia-de-teste']), /permissão/);
});
