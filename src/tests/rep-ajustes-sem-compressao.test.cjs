'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'RepOnlineService.gs'), 'utf8');
const start = source.indexOf('function serializarAjustesRep_(');
const end = source.indexOf('function desserializarAjustesRep_(', start);
assert.ok(start >= 0 && end > start);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(source.slice(start, end), ctx);

test('cartão do tamanho de setembro permanece JSON legível na planilha', () => {
  const entrada = [{ tipo: 'ADICIONAR', justificativa: 'x'.repeat(32401) }];
  const salvo = ctx.serializarAjustesRep_(entrada);
  assert.equal(salvo[0], '[');
  assert.deepEqual(JSON.parse(salvo), entrada);
});

test('não substitui um cartão grande por compactação que o aplicativo não consegue reler', () => {
  assert.throws(() => ctx.serializarAjustesRep_([{ texto: 'x'.repeat(49000) }]), /capacidade segura/);
});
