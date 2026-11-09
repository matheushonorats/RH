'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta');
const ai = fs.readFileSync(path.join(root, 'AIService.gs'), 'utf8');
const visao = fs.readFileSync(path.join(root, 'RepCartaoIAService.gs'), 'utf8');
function transporte(codigo = 200, dados = { choices: [] }) {
  const pedidos = [];
  const ctx = {
    reservarCotaTentativaEntidade_: () => ({ autorizado: true }),
    reconciliarCotaTentativaEntidade_() {}, registrarTelemetriaTentativaEntidade_() {},
    Logger: { log() {} }, Utilities: { sleep() {} },
    UrlFetchApp: { fetch(url, opts) { pedidos.push({ url, payload: JSON.parse(opts.payload) });
      return { getResponseCode: () => codigo, getContentText: () => JSON.stringify(dados), getHeaders: () => ({}) }; } }
  };
  vm.createContext(ctx);
  vm.runInContext(ai.slice(ai.indexOf('function executarRequisicaoEntidade_('), ai.indexOf('function normalizarComandosRespostaEntidade_(')), ctx);
  return { ctx, pedidos };
}
test('barreira compartilhada bloqueia modelos pagos e plugins antes da rede', () => {
  const { ctx, pedidos } = transporte();
  for (const payload of [{ model: 'google/gemini-3-flash-preview' }, { model: 'openrouter/free', models: ['pago'] }, { model: 'openrouter/free', plugins: [{ id: 'file-parser' }] }]) {
    assert.equal(ctx.executarRequisicaoEntidade_({ nome: 'OpenRouter' }, payload, {}, 100, 600).ok, false);
  }
  assert.equal(pedidos.length, 0);
});
test('rota gratuita obriga preços zero mesmo quando opções tentam liberar preço', () => {
  const { ctx, pedidos } = transporte();
  const r = ctx.executarRequisicaoEntidade_({ nome: 'OpenRouter', url: 'teste' }, { model: 'openrouter/free', max_completion_tokens: 8192, provider: { max_price: { prompt: 20 } } }, {}, 100, 8192);
  assert.equal(r.ok, true);
  assert.deepEqual(pedidos[0].payload.provider.max_price, { prompt: 0, completion: 0, request: 0, image: 0 });
  assert.equal(pedidos[0].payload.max_tokens, 8192);
  assert.equal(pedidos[0].payload.max_completion_tokens, undefined);
});
test('saldo negativo é explicado sem declarar que o modelo gratuito tem custo', () => {
  const { ctx, pedidos } = transporte(402, { error: { metadata: { limit_source: 'openrouter_credits' } } });
  const r = ctx.executarRequisicaoEntidade_({ nome: 'OpenRouter' }, { model: 'openrouter/free' }, {}, 100, 600);
  assert.match(r.detalheSeguro, /negativo.*gratuitos/);
  assert.equal(pedidos.length, 1);
});
test('Gemini 400 distingue configuração rejeitada sem expor resposta da API', () => {
  const { ctx, pedidos } = transporte(400, { error: { message: 'Invalid JSON payload received. Unknown name responseSchema SECRET' } });
  const r = ctx.executarRequisicaoEntidade_({ nome: 'Gemini', maxTentativas: 1 }, {}, {}, 100, 600);
  assert.match(r.detalheSeguro, /configuração/);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
  assert.equal(pedidos.length, 1);
});
test('cartão tenta OpenRouter gratuito após falha Gemini mesmo sem chave Groq', () => {
  const pedidos = [];
  const ctx = {
    obterPrimeiraConfigCartaoIA_: keys => keys[0].startsWith('GROQ') ? '' : 'chave-teste',
    obterConfigValorInterno_: key => key.includes('OPENROUTER') ? 'google/gemini-3-flash-preview' : '',
    descreverFalhaCartaoIA_: nome => nome + ': falhou', Logger: { log() {} },
    executarRequisicaoEntidade_: (provedor, payload) => {
      pedidos.push({ provedor, payload });
      return provedor.nome === 'Gemini' ? { ok: false, codigo: 400 } : { ok: true, dados: { model: 'modelo-visual:free', choices: [{ finish_reason: 'stop', message: { content: '{"dias":[]}' } }] } };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(visao.slice(visao.indexOf('function chamarVisaoCartaoIA_('), visao.indexOf('function analisarCartaoPontoManualIA(')), ctx);
  const r = ctx.chamarVisaoCartaoIA_('Transcreva', [{ mimeType: 'image/jpeg', base64: 'AAAA' }]);
  assert.deepEqual(pedidos.map(p => p.provedor.nome), ['Gemini', 'Gemini', 'Gemini', 'Gemini', 'OpenRouter']);
  assert.equal(pedidos[4].payload.model, 'openrouter/free');
  assert.equal(r.modelo, 'modelo-visual:free');
});
