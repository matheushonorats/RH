'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'Scripts.html'), 'utf8');
function trecho(inicio, fim) {
  const a = source.indexOf(inicio);
  const b = source.indexOf(fim, a + inicio.length);
  assert.ok(a >= 0 && b > a, `Trecho não encontrado: ${inicio}`);
  return source.slice(a, b);
}

function contexto(lancamentos) {
  const ctx = {
    AppState: { lancamentos },
    configuracaoCalculoRepAtual: { compensacaoMinutosExatos: true },
    obterServidorCadastroRep_: () => ({ matricula: '123' }),
    normalizarMatriculaRep_: valor => String(valor || ''),
    normalizarTextoRep_: valor => String(valor || '').toUpperCase(),
    dataLancamentoParaIsoRep_: valor => String(valor).split('/').reverse().join('-'),
    horaParaMinutosRep_: valor => {
      const [h, m] = String(valor).split(':').map(Number);
      return h * 60 + m;
    },
    obterJornadaReferenciaRep_: () => 8
  };
  vm.createContext(ctx);
  vm.runInContext(trecho('function ehDeclaracaoHoras_(tipo)', 'function ehLancamentoAusenciaRep_'), ctx);
  vm.runInContext(trecho('function obterDeficitDiaRep_(dia)', 'function atualizarHorasDevidasRep_'), ctx);
  return ctx;
}

test('declaração abate só o débito do próprio dia', () => {
  const ctx = contexto([{ tipo: 'Declaração de Horas', matricula: '123', dataInicio: '05/10/2026', qtdHoras: '02:00', status: 'Ativo' }]);
  const dia = { dataOriginal: '2026-10-05', extraDia: -3, saldoCompensacaoExatoDia: -3, jornadaIncompleta: true };
  const outroDia = { dataOriginal: '2026-10-06', extraDia: -2, saldoCompensacaoExatoDia: -2, jornadaIncompleta: true };
  ctx.aplicarDeclaracoesHorasRep_({ resumo: { pendencias: 2 } }, [dia, outroDia]);
  assert.equal(dia.declaracaoHoras.minutosAplicados, 120);
  assert.equal(ctx.obterDeficitDiaRep_(dia), 1);
  assert.equal(outroDia.extraDia, -2);
});

test('declaração maior que o débito não cria hora extra; lançamento antigo continua reconhecido', () => {
  const ctx = contexto([{ tipo: 'Compensação de horas', matricula: '123', dataInicio: '05/10/2026', qtdHoras: '04:00', status: 'Ativo' }]);
  const dia = { dataOriginal: '2026-10-05', extraDia: -3, saldoCompensacaoExatoDia: -3, jornadaIncompleta: true };
  const emp = { resumo: { pendencias: 1 } };
  ctx.aplicarDeclaracoesHorasRep_(emp, [dia]);
  assert.equal(dia.declaracaoHoras.minutosAplicados, 180);
  assert.equal(dia.extraDia, 0);
  assert.equal(ctx.obterDeficitDiaRep_(dia), 0);
  assert.equal(emp.resumo.pendencias, 0);
});

test('declaração anulado não abate o ponto', () => {
  const ctx = contexto([{ tipo: 'Declaração de Horas', matricula: '123', dataInicio: '05/10/2026', qtdHoras: '02:00', status: 'Anulado' }]);
  const dia = { dataOriginal: '2026-10-05', extraDia: -3, saldoCompensacaoExatoDia: -3 };
  ctx.aplicarDeclaracoesHorasRep_({ resumo: { pendencias: 0 } }, [dia]);
  assert.equal(dia.declaracaoHoras, undefined);
  assert.equal(ctx.obterDeficitDiaRep_(dia), 3);
});

test('dia sem registro mantém somente o saldo não coberto', () => {
  const ctx = contexto([{ tipo: 'Declaração de Horas', matricula: '123', dataInicio: '05/10/2026', qtdHoras: '02:00', status: 'Ativo' }]);
  const dia = { dataOriginal: '2026-10-05', extraDia: 0, semRegistro: true };
  ctx.aplicarDeclaracoesHorasRep_({ resumo: { pendencias: 0 } }, [dia]);
  assert.equal(ctx.obterDeficitDiaRep_(dia), 6);
  assert.equal(dia.extraDia, -6);
});
