'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('salvar cartão manual limpa filtro de relógio antes de recalcular a pessoa', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'RepEnhancements.html'), 'utf8');
  const inicio = html.indexOf('if (cartaoManual && competencias.length)');
  const fim = html.indexOf('agendarReprocessamentoRepLeve_(260, pis)', inicio);
  const trecho = html.slice(inicio, fim);
  assert.match(trecho, /getElementById\('rep-filter-local'\)/);
  assert.match(trecho, /if \(localRep\) localRep.value = 'all'/);
  assert.match(trecho, /pisSelecionadoRep = pis/);
});
