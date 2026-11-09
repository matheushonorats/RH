'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const web = path.join(__dirname, '../output/RH-Modo-Seguro-Beta');
const ler = p => fs.readFileSync(p, 'utf8');
const fontes = {
  web: ler(path.join(web, 'Scripts.html')) + '\n' + ler(path.join(web, 'RepEnhancements.html')),
  portatil: ler(path.join(__dirname, '../portable-entidade/app/renderer/index.html'))
};
function trecho(fonte, inicio, fim) {
  const a = fonte.indexOf(inicio), b = fonte.indexOf(fim, a + inicio.length);
  assert.ok(a >= 0 && b > a, inicio);
  return fonte.slice(a, b);
}
for (const [edicao, fonte] of Object.entries(fontes)) {
  function preparar(ajustes, validacoes = []) {
    const ctx = {
      Date, Map, Set, normalizarPisRep: String,
      document: { getElementById: () => ({value: '1'}) },
      obterJornadaReferenciaRep_: () => 8, obterFeriadosRep: () => new Set(),
      horarioConsideradoRep_: d => d, toDateStringRep: d => '2026-10-' + String(d.getDate()).padStart(2, '0'),
      getHoursDiffRep: (a,b) => a && b ? (b-a)/3600000 : 0,
      aplicarPoliticaSaldoDiarioRep_: x => x, calcularSaldoExatoCompensacaoRep_: () => null,
      arredondamentoRepAtivo: false, configuracaoCalculoRepAtual: {modo:'EXATO',compensacaoMinutosExatos:true},
      completarDiasSemRegistroRep_() {}, aplicarAusenciasLancamentosRep_() {}, aplicarDeclaracoesHorasRep_() {}, aplicarCompensacoesRep_() {},
      descartesHoraExtraRep: ajustes, validacoesRep: validacoes
    };
    vm.createContext(ctx);
    for (const [a,b] of [
      ['function aplicarDescartesHoraExtraRep_(', 'function minutosParaHoraRep_('],
      ['function aplicarValidacoesAlertasRep_(', 'function processDataRep('],
      ['function processDataRep(', 'function completarDiasSemRegistroRep_('],
      ['function diaTemAlertaRep_(', 'function obterCompetenciaAtualRep_(']
    ]) vm.runInContext(trecho(fonte,a,b),ctx);
    return ctx;
  }
  const dias = [5,6,7,8];
  const batidas = () => dias.flatMap(dia => [8,12,13,16].map(hora => ({pis:'123',datetime:new Date(2026,9,dia,hora)})));
  const calcular = ctx => ctx.processDataRep(new Map([['123','Pessoa de teste']]),batidas(),new Map())[0];
  test(edicao + ': quatro débitos zerados manualmente deixam contador e filtro em zero', () => {
    const ctx = preparar(dias.map(d => ({pis:'123',data:'2026-10-0'+d,saldoAjustado:true,saldoMinutos:0})));
    const emp = calcular(ctx);
    assert.equal(emp.resumo.pendencias,0);
    assert.equal(emp.dias.filter(d => ctx.diaAtendeFiltroRep_(d,'alertas',[])).length,0);
    assert.equal(emp.resumo.horasDevidas,0);
  });
  test(edicao + ': alerta criado por ajuste negativo é contado; validação o retira', () => {
    const ajustes = dias.map(d => ({pis:'123',data:'2026-10-0'+d,saldoAjustado:true,saldoMinutos:d===5 ? -60 : 0}));
    const ctx = preparar(ajustes);
    assert.equal(calcular(ctx).resumo.pendencias,1);
    ctx.validacoesRep = [{pis:'123',data:'2026-10-05',validado:true}];
    const emp = calcular(ctx);
    assert.equal(emp.resumo.pendencias,0);
    assert.equal(emp.dias.filter(d=>ctx.diaAtendeFiltroRep_(d,'alertas',[])).length,0);
  });
  test(edicao + ': mantém falta real e batida inconsistente; ignora dias resolvidos', () => {
    const ctx = preparar([]);
    assert.equal(calcular(ctx).resumo.pendencias,4);
    for (const [dia, esperado] of [
      [{pendencia:true},true], [{jornadaIncompleta:true},true],
      [{status:'falta_sem_registro',semRegistro:true,dataOriginal:'2020-01-01'},true],
      [{status:'falta_sem_registro',semRegistro:true,dataOriginal:'2099-01-01'},false],
      [{validacaoManual:{},pendencia:true},false],
      [{status:'jornada_compensada',extraDia:0},false], [{ausencia:{},semRegistro:true,status:'ausencia_justificada'},false]
    ]) assert.equal(ctx.diaTemAlertaRep_(dia),esperado);
  });
  test(edicao + ': autorização usa o cabeçalho institucional e as mesmas imagens incorporadas', async () => {
    let documento='';
    const ctx = {
      window:{HE_MODELO_ASSETS:{brasao:'data:image/png;base64,BRASAO',selo:'data:image/png;base64,SELO'},open:()=>({document:{open(){},write(h){documento=h;},close(){}},focus(){},close(){}})},
      obterServidorSelecionadoRep_:()=>({pis:'123',nome:'Pessoa teste',dias:[]}),
      obterCompetenciaSelecionadaRep_:()=> '2026-10', obterServidorPorIdentificadorRep_:()=>({matricula:'123'}),
      janelasAutorizacaoHeRep_:new Set(), chamarBackendPromessa_:async()=>({descricoes:[]}),
      escapeHtml:String, minutosParaHoraRep_:()=> '00:00', mostrarToast:m=>{throw Error(m);}
    };
    vm.createContext(ctx);
    vm.runInContext(trecho(fonte,'async function exportarAutorizacaoHorasExtrasRep_(', 'async function ajustarPenalidadePeriodoFeriasFicha_('),ctx);
    await ctx.exportarAutorizacaoHorasExtrasRep_();
    assert.ok(documento.includes('Prefeitura Municipal de São Sebastião'));
    assert.ok(documento.includes('ESTÂNCIA BALNEÁRIA – ESTADO DE SÃO PAULO'));
    assert.ok(documento.includes('src="data:image/png;base64,BRASAO"'));
    assert.ok(documento.includes('src="data:image/png;base64,SELO"'));
    assert.ok(!documento.includes('Gestão de Pessoas'));
  });
}
