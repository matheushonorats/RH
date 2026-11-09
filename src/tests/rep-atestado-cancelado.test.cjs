'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'Scripts.html'), 'utf8');
const inicio = source.indexOf('function ehLancamentoAusenciaRep_(');
const fim = source.indexOf('function aplicarDescartesHoraExtraRep_(', inicio);
assert.ok(inicio >= 0 && fim > inicio);

function contexto(status) {
  const ctx = {
    AppState: { servidores: [{ matricula: '123', pis: '987', nome: 'Ana' }], lancamentos: [
      { linhaPlanilha: 10, matricula: '123', nome: 'Ana', tipo: 'Atestado', status, dataInicio: '05/10/2026', dias: 1 }
    ] },
    justificativasLancamentoRep: [],
    normalizarTextoRep_: valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(),
    normalizarPisRep: valor => String(valor || ''),
    normalizarMatriculaRep_: valor => String(valor || ''),
    dataLancamentoParaIsoRep_: valor => String(valor).split('/').reverse().join('-'),
    obterServidorPorIdentificadorRep_: () => ({ matricula: '123', pis: '987', nome: 'Ana' })
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(inicio, fim), ctx);
  return ctx;
}

test('atestado ativo cobre o dia; cancelado ou excluído não cobre', () => {
  const dia = () => ({ dataOriginal: '2026-10-05', semRegistro: true, status: 'sem_registro' });
  for (const [status, esperado] of [['Ativo', true], ['Anulado', false], ['Cancelado', false], ['Excluído', false]]) {
    const ctx = contexto(status);
    const atual = dia();
    ctx.aplicarAusenciasLancamentosRep_({ pis: '987', nome: 'Ana', resumo: { pendencias: 0 } }, [atual]);
    assert.equal(Boolean(atual.ausencia), esperado, status);
  }
});
