'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta');

test('leitura visual reserva menos de 8 mil tokens na Groq para duas imagens', () => {
  const source = fs.readFileSync(path.join(root, 'RepCartaoIAService.gs'), 'utf8');
  const a = source.indexOf('function chamarVisaoCartaoIA_(');
  const b = source.indexOf('function analisarCartaoPontoManualIA(', a);
  let pedido;
  const ctx = {
    obterPrimeiraConfigCartaoIA_: keys => keys[0].startsWith('GROQ') ? 'chave-teste' : '',
    obterConfigValorInterno_: () => '',
    executarRequisicaoEntidade_: (_, payload, __, entrada, saida) => {
      pedido = { payload, entrada, saida };
      return { ok: true, dados: { choices: [] } };
    },
    Logger: { log() {} }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(a, b), ctx);
  ctx.chamarVisaoCartaoIA_('Transcreva o cartão.', [
    { mimeType: 'image/jpeg', base64: 'AAAA' },
    { mimeType: 'image/jpeg', base64: 'BBBB' }
  ]);
  assert.equal(pedido.saida, 2200);
  assert.equal(pedido.payload.reasoning_effort, 'none');
  assert.ok(pedido.entrada + pedido.saida < 8000);
});

test('falha 402 sem uso confirmado devolve a reserva de tokens', () => {
  const source = fs.readFileSync(path.join(root, 'EntidadeGovernancaService.gs'), 'utf8');
  const a = source.indexOf('function reconciliarCotaTentativaEntidade_(');
  const b = source.indexOf('function obterAbaTelemetriaEntidade_(', a);
  const uso = { data: '2026-10-06', minuto: '2026-10-06 10:00', provedores: { OpenRouter: { tokens: 7000, tokensMinuto: 7000, sucessos: 0 } } };
  const props = { setProperty(_, valor) { Object.assign(uso, JSON.parse(valor)); } };
  const ctx = {
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => props },
    lerUsoEntidadeSemLock_: () => uso,
    Date
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(a, b), ctx);
  ctx.reconciliarCotaTentativaEntidade_('OpenRouter', { reserva: 7000, minuto: uso.minuto }, 0, false, 402);
  assert.equal(uso.provedores.OpenRouter.tokens, 0);
  assert.equal(uso.provedores.OpenRouter.tokensMinuto, 0);
});

function contextoCotaLegada(pedidos, tentativas, tokens) {
  const source = fs.readFileSync(path.join(root, 'EntidadeGovernancaService.gs'), 'utf8');
  let armazenado = JSON.stringify({ data: '2026-10-06', minuto: '2026-10-06 10:00', provedores: {
    OpenRouter: { tentativas, sucessos: 1, tokens, tokensMinuto: 0 }
  } });
  const ctx = {
    Date,
    Logger: { log() {} },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    Utilities: { formatDate: (_, __, formato) => formato === 'yyyy-MM-dd' ? '2026-10-06' : '2026-10-06 10:00' },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: () => armazenado,
      setProperty: (_, valor) => { armazenado = valor; }
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    obterConfigValorInterno_: () => '',
    obterPlanilha_: () => ({ getSheetByName: () => ({
      getLastRow: () => pedidos.length + 1,
      getRange: () => ({ getValues: () => pedidos })
    }) })
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { ctx, uso: () => JSON.parse(armazenado).provedores.OpenRouter };
}

const chamadaRegistrada = (codigo, confirmado) => [
  new Date('2026-10-06T13:00:00Z'), 'OpenRouter', 'modelo-teste', 1,
  codigo === 200 ? 'SUCESSO' : 'FALHA_HTTP', codigo, 100, 5200, 3200, confirmado
];

test('reservas antigas de chamadas recusadas são recuperadas sem zerar consumo real', () => {
  const pedidos = [chamadaRegistrada(200, 6000), ...Array.from({ length: 7 }, () => chamadaRegistrada(402, 0))];
  const { ctx, uso } = contextoCotaLegada(pedidos, 8, 64800);
  const reserva = ctx.reservarCotaTentativaEntidade_('OpenRouter', 5200, 3200);
  assert.equal(reserva.autorizado, true);
  assert.equal(uso().tokens, 6000 + 8400);
  assert.equal(uso().tentativas, 9);
});

test('log incompleto não permite recuperar reservas, preservando chamadas em andamento', () => {
  const { ctx, uso } = contextoCotaLegada([chamadaRegistrada(402, 0)], 8, 64800);
  assert.equal(ctx.reservarCotaTentativaEntidade_('OpenRouter', 5200, 3200).autorizado, false);
  assert.equal(uso().tokens, 64800);
});

test('cota realmente consumida continua bloqueada', () => {
  const { ctx, uso } = contextoCotaLegada([chamadaRegistrada(200, 59000)], 1, 59000);
  assert.equal(ctx.reservarCotaTentativaEntidade_('OpenRouter', 5200, 3200).autorizado, false);
  assert.equal(uso().tokens, 59000);
});
