'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'RepEnhancements.html'), 'utf8');
const codigo = html.slice(html.indexOf('let repReprocessamentoLeveTimer_'), html.indexOf('function obterServidorSelecionadoRep_'));
function preparar() {
  const timers = new Map(), quadros = [], ociosos = [], calculos = [];
  let id = 0;
  const ctx = { normalizarPisRep: String, setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(i) { timers.delete(i); },
    requestAnimationFrame(fn) { quadros.push(fn); }, requestIdleCallback(fn) { ociosos.push(fn); },
    atualizarProcessamentoRep(opcoes) { calculos.push(opcoes); } };
  vm.createContext(ctx); vm.runInContext(codigo, ctx);
  return { ctx, timers, quadros, ociosos, calculos };
}
test('salvar cartão agenda recálculo da pessoa sem ReferenceError', () => {
  const p = preparar(); p.ctx.agendarReprocessamentoRepLeve_(260, '123');
  for (const fn of p.timers.values()) fn();
  assert.equal(p.quadros.length, 1); assert.equal(p.ociosos.length, 0);
  p.quadros[0](); assert.deepEqual(Array.from(p.calculos[0].pessoas), ['123']);
});
test('recálculo geral usa ociosidade e reúne alterações próximas', () => {
  const p = preparar(); p.ctx.agendarReprocessamentoRepLeve_(180); p.ctx.agendarReprocessamentoRepLeve_(40, '123');
  for (const fn of p.timers.values()) fn();
  assert.equal(p.ociosos.length, 1); p.ociosos[0]();
  assert.equal(p.calculos[0].pessoas, null); assert.equal(p.calculos.length, 1);
});
