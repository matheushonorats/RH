'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const base = path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta');
const scripts = fs.readFileSync(path.join(base, 'Scripts.html'), 'utf8');
const melhorias = fs.readFileSync(path.join(base, 'RepEnhancements.html'), 'utf8');

function trecho(texto, inicio, fim) {
  const de = texto.indexOf(inicio);
  const ate = texto.indexOf(fim, de);
  assert.ok(de >= 0 && ate > de, 'função de teste encontrada');
  return texto.slice(de, ate);
}

test('cartão confirmado continua visível durante leitura compartilhada atrasada', () => {
  let estados = 0;
  const ctx = {
    Map, Set, Date,
    normalizarPisRep: String,
    atualizarEstadoSalvamentoRep_() { estados++; }
  };
  vm.createContext(ctx);
  vm.runInContext('const repAjustesAguardandoLeitura_ = new Map();\n' +
    trecho(scripts, 'function mesclarAjustesConfirmadosRep_', 'function obterChaveFilaRep_') +
    '\nrepAjustesAguardandoLeitura_.set("MAT:7528-0|2026-09", {pis:"MAT:7528-0",competencia:"2026-09",atualizadoEm:"2026-10-08T12:00:00.000Z",ajustes:[{tipo:"ADICIONAR",id:"C1"}]});', ctx);
  let lista = ctx.mesclarAjustesConfirmadosRep_([]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].ajustes[0].id, 'C1');
  lista = ctx.mesclarAjustesConfirmadosRep_([{pis:'MAT:7528-0',competencia:'2026-09',ajustes:[],atualizadoEm:'2026-10-08T11:59:00.000Z'}]);
  assert.equal(lista[0].ajustes[0].id, 'C1');
  lista = ctx.mesclarAjustesConfirmadosRep_([{pis:'MAT:7528-0',competencia:'2026-09',ajustes:[{tipo:'ADICIONAR',id:'C1'}],atualizadoEm:'2026-10-08T12:00:00.000Z'}]);
  assert.equal(lista.length, 1);
  assert.equal(estados, 1);
});

test('fechar cartão recolhe tabela inline antes de devolvê-la ao body', async () => {
  const area = {hidden:false,replaceChildren() { this.children=[]; }};
  const classes = new Set(['rep-inline-workspace']);
  const lote = {parentElement:area,dataset:{dirty:'',inline:'sim'},className:'rep-inline-workspace',classList:{remove(nome) { classes.delete(nome); }}};
  const lista = {style:{display:'none'}};
  const body = {appendChild(item) { item.parentElement=this; }};
  const ctx = {document:{body,getElementById(id) { return ({'rep-cartao-manual-inline':area,'modal-lancamentos-lote-rep':lote,'rep-servidores-list':lista})[id]; }}};
  vm.createContext(ctx);
  vm.runInContext(trecho(melhorias, 'async function fecharEspacoManualInlineRep_', 'async function abrirInclusaoCartaoManualRep_'), ctx);
  assert.equal(await ctx.fecharEspacoManualInlineRep_(), true);
  assert.equal(lote.parentElement, body);
  assert.equal(lote.className, 'modal-overlay');
  assert.equal(lote.dataset.inline, '');
  assert.equal(area.hidden, true);
  assert.equal(lista.style.display, 'flex');
});
