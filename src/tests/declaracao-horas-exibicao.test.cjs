'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta');

test('hora guardada pela planilha como data volta a ser exibida em HH:MM', () => {
  const source = fs.readFileSync(path.join(root, 'LancamentosService.gs'), 'utf8');
  const a = source.indexOf('function formatarQuantidadeHorasLancamento_(');
  const b = source.indexOf('function obterListaLancamentos()', a);
  assert.ok(a >= 0 && b > a);
  const ctx = {
    Date,
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    Utilities: { formatDate: () => '04:00' }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(a, b), ctx);
  assert.equal(ctx.formatarQuantidadeHorasLancamento_(new Date('1899-12-30T07:06:00Z')), '04:00');
  assert.equal(ctx.formatarQuantidadeHorasLancamento_(4 / 24), '04:00');
  assert.equal(ctx.formatarQuantidadeHorasLancamento_('00:40'), '00:40');
  assert.ok(source.includes('formatarQuantidadeHorasLancamento_(linha[idx.qtdHoras])'));
});

test('1Doc automático é restrito a atestado e declaração iniciados no REP', () => {
  const scripts = fs.readFileSync(path.join(root, 'Scripts.html'), 'utf8');
  const rep = fs.readFileSync(path.join(root, 'RepEnhancements.html'), 'utf8');
  assert.match(scripts, /formulario\?\.dataset\.origemRep === 'sim'/);
  assert.match(scripts, /tipo === 'Atestado' \|\| ehDeclaracaoHoras_\(tipo\)/);
  assert.match(scripts, /campoIdoc\.value = '-'/);
  assert.match(scripts, /delete form\.dataset\.origemRep/);
  assert.match(rep, /dataset\.origemRep = 'sim'/);
});
