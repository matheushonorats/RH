'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const ler=p=>fs.readFileSync(path.join(root,p),'utf8');
const fontes={web:ler('output/RH-Modo-Seguro-Beta/Scripts.html')+ler('output/RH-Modo-Seguro-Beta/RepEnhancements.html'),portatil:ler('portable-entidade/app/renderer/index.html')};
function trecho(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return s.slice(i,j);}
function pessoa(){return {pis:'A',nome:'Pessoa Teste',dias:[
 {dataOriginal:'2026-10-01',semRegistro:true,status:'jornada_compensada_parcial',declaracaoHoras:{minutosAplicados:120},compensacao:{minutosAplicados:60}},
 {dataOriginal:'2026-10-02',saldoCompensacaoExatoDia:-0.25,extraDia:-0.25,batidas:['08:15','12:00','13:00','17:00']},
 {dataOriginal:'2026-10-03',pendencia:true,isImpar:true,batidas:['08:00','12:00','13:00']},
 {dataOriginal:'2026-10-04',validacaoManual:{},jornadaIncompleta:true,saldoCompensacaoExatoDia:-2},
 {dataOriginal:'2026-10-05',semRegistro:true,ausencia:{tipo:'Atestado'}},
 {dataOriginal:'2026-10-06',semRegistro:true,compensacao:{minutosAplicados:480}},
 ...[7,8,9].map(n=>({dataOriginal:'2026-10-0'+n,extraDia:3})),
 {dataOriginal:'2026-10-10',pendencia:true,extraDia:3},
 {dataOriginal:'2026-11-01',semRegistro:true,status:'falta_sem_registro'}
 ],resumo:{origensSaldoCompensacao:[{data:'2026-10-07',minutos:180},{data:'2026-10-08',minutos:30},{data:'2026-10-09',minutos:0},{data:'2026-10-10',minutos:180},{data:'2026-11-01',minutos:60}]}};}
for(const [edicao,fonte] of Object.entries(fontes)){
 function preparar(){const avisos=[],copias=[],consultas=[];const ctx={Date,Map,Set,normalizarPisRep:String,validacoesRep:[],
  obterJornadaReferenciaRep_:()=>8,configuracaoCalculoRepAtual:{compensacaoMinutosExatos:true},
  minutosParaHoraRep_:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),
  formatarPeriodoAusenciaRep_:()=> 'período',categoriaSituacaoRep:()=> 'Conferir',textoSituacaoRep:()=> 'Verificar as marcações',
  buscaRepAguardandoSelecao_:false,repOnlineCarregando:false,falhasIntegridadeRep:[],repTemAlteracoesPendentes_:()=>false,
  obterCompetenciaAtualRep_:()=> '2026-10',obterServidoresCompetenciaRelatorioAlertasRep_:(mes,pis)=>{consultas.push({mes,pis});return[pessoa()];},
  autorizacoesCompensacaoRep:[{pis:'A',data:'2026-10-07',minutos:120},{pis:'B',data:'2026-10-08',minutos:999}],
  compensacoesRep:[{pis:'A',data:'2026-10-01',minutos:60,origens:[{data:'2026-10-07',minutos:60}]}],
  navigator:{clipboard:{writeText:async t=>copias.push(t)}},mostrarToast:(m,t)=>avisos.push({m,t}),mensagemErro:e=>e.message||String(e)
 };vm.createContext(ctx);
 vm.runInContext(trecho(fonte,'function obterDeficitDiaRep_(', 'function atualizarHorasDevidasRep_('),ctx);
 vm.runInContext(trecho(fonte,'function obterAlertasAtivosDiaRep_(', 'function montarAlertasAtivosServidorRep_('),ctx);
 vm.runInContext(trecho(fonte,'function adicionarBotaoPendenciasMesRep_(', 'function garantirModalLancamentosLoteRep_('),ctx);
 return{ctx,avisos,copias,consultas};}
 test(edicao+': mensagem reúne falhas ativas, débitos restantes e origens sem duplicar o mês',()=>{
  const {ctx}=preparar();const resultado=ctx.montarMensagemPendenciasMesRep_(pessoa(),'2026-10',ctx.autorizacoesCompensacaoRep,ctx.compensacoesRep);
  assert.equal(resultado.diasPendentes,4);assert.equal(resultado.minutosDevidos,315);assert.equal(resultado.saldoTotal,210);assert.equal(resultado.autorizadoTotal,60);
  assert.match(resultado.texto,/outubro\/2026/);assert.match(resultado.texto,/5h15/);assert.match(resultado.texto,/Falta uma entrada ou saída/);
  assert.match(resultado.texto,/07\/10\/2026 — saldo de 3h/);
  assert.match(resultado.texto,/08\/10\/2026 — saldo de 30 minutos/);
  for(const data of ['04/10/2026','05/10/2026','06/10/2026','09/10/2026','01/11/2026'])assert.ok(!resultado.texto.includes(data),data);
 });
 test(edicao+': nova cópia retira pendências resolvidas e mantém somente a situação atual',()=>{
  const {ctx}=preparar(),emp=pessoa();emp.dias[0].ausencia={tipo:'Atestado'};emp.dias[1].saldoCompensacaoExatoDia=0;emp.dias[1].extraDia=0;emp.dias[2].validacaoManual={};emp.dias[9].validacaoManual={};
  const resultado=ctx.montarMensagemPendenciasMesRep_(emp,'2026-10',[],[]);
  assert.equal(resultado.diasPendentes,0);assert.equal(resultado.minutosDevidos,0);assert.ok(!resultado.texto.includes('Ainda precisamos conferir'));
  assert.match(resultado.texto,/Não há ajustes de ponto a solicitar/);
 });
 test(edicao+': uso calculado legado reduz autorização e não é somado novamente ao persistido',()=>{
  const {ctx}=preparar(),emp=pessoa();emp.dias[0].compensacao.origensAplicadas=[{data:'2026-10-07',minutos:90}];
  const r=ctx.montarMensagemPendenciasMesRep_(emp,'2026-10',ctx.autorizacoesCompensacaoRep,ctx.compensacoesRep);
  assert.equal(r.autorizadoTotal,30);
 });
 test(edicao+': copiar recalcula a pessoa, preserva a competência e apenas escreve na área de transferência',async()=>{
  const {ctx,copias,consultas}=preparar();await ctx.copiarPendenciasMesRep_('A');
  assert.equal(copias.length,1);assert.match(copias[0],/Olá, Pessoa Teste/);assert.deepEqual(consultas,[{mes:'2026-10',pis:'A'}]);
 });
 test(edicao+': não copia situação incompleta, pendente ou sem escolha explícita da pessoa',async()=>{
  for(const alterar of [c=>c.repTemAlteracoesPendentes_=()=>true,c=>c.existemGravacoesPendentes_=()=>true,c=>c.repOnlineCarregando=true,c=>c.falhasIntegridadeRep=[{}],c=>c.buscaRepAguardandoSelecao_=true,c=>c.obterCompetenciaAtualRep_=()=> '']){
   const{ctx,copias,consultas,avisos}=preparar();alterar(ctx);await ctx.copiarPendenciasMesRep_('A');assert.equal(copias.length,0);assert.equal(consultas.length,0);assert.equal(avisos.length,1);
  }
 });
 test(edicao+': apuração individual inclui todos os relógios, exclui outras pessoas e marcações desconsideradas',()=>{
  const {ctx}=preparar();const marcas=[{pis:'A',datetime:new Date(2026,9,1,8),clock:'Local 1'},{pis:'A',datetime:new Date(2026,9,1,17),clock:'Local 2'},{pis:'B',datetime:new Date(2026,9,1,8)},{pis:'A',datetime:new Date(2026,10,1,8)},{pis:'A',datetime:new Date(2026,9,1,9),desconsiderada:true}];
  ctx.dadosRepCache={punches:marcas,employees:new Map(),lotacoes:new Map()};let recebidas;ctx.processDataRep=(e,p)=>{recebidas=p;return[];};
  vm.runInContext(trecho(fonte,'function obterServidoresCompetenciaRelatorioAlertasRep_(', 'function descreverPoliticaCalculoRep_('),ctx);
  ctx.obterServidoresCompetenciaRelatorioAlertasRep_('2026-10','A');assert.equal(recebidas.length,2);assert.equal(recebidas[1].clock,'Local 2');
  ctx.obterServidoresCompetenciaRelatorioAlertasRep_('2026-10');assert.equal(recebidas.length,3);
 });
 test(edicao+': atrasos de até 10 minutos somem da mensagem e do total do comunicado',()=>{
  const {ctx}=preparar(),emp=pessoa();emp.resumo={horasDevidas:35/60,origensSaldoCompensacao:[]};
  emp.dias=[{dataOriginal:'2026-10-01',saldoCompensacaoExatoDia:-10/60,extraDia:-10/60,batidas:['08:10','12:00','13:00','17:00']},
   {dataOriginal:'2026-10-02',saldoCompensacaoExatoDia:-9/60,extraDia:-9/60,batidas:['08:09','12:00','13:00','17:00']},
   {dataOriginal:'2026-10-05',saldoCompensacaoExatoDia:-5/60,extraDia:-5/60,batidas:['08:05','12:00','13:00','17:00']},
   {dataOriginal:'2026-10-06',saldoCompensacaoExatoDia:-11/60,extraDia:-11/60,batidas:['08:11','12:00','13:00','17:00']}];
  const antes=JSON.stringify(emp),r=ctx.montarMensagemPendenciasMesRep_(emp,'2026-10',[],[]);
  assert.equal(r.diasPendentes,1);assert.equal(r.minutosDevidos,11);assert.match(r.texto,/06\/10\/2026 — A jornada ficou 11 minutos abaixo do previsto/);
  for(const data of ['01/10/2026','02/10/2026','05/10/2026'])assert.ok(!r.texto.includes(data));
  assert.equal(JSON.stringify(emp),antes);
 });
 test(edicao+': tolerância não esconde marcação ausente nem falta sem ponto',()=>{
  const {ctx}=preparar(),emp=pessoa();emp.dias=[{dataOriginal:'2026-10-01',pendencia:true,isImpar:true,batidas:['08:00']},
   {dataOriginal:'2026-10-02',semRegistro:true,declaracaoHoras:{minutosAplicados:470}}];
  const r=ctx.montarMensagemPendenciasMesRep_(emp,'2026-10',[],[]);assert.equal(r.diasPendentes,2);assert.equal(r.minutosDevidos,10);
  assert.match(r.texto,/Falta uma entrada ou saída/);assert.match(r.texto,/Não há marcações de ponto/);
 });
 test(edicao+': texto explica os motivos com horários úteis e linguagem direta',()=>{
  const {ctx}=preparar();const r=ctx.montarMensagemPendenciasMesRep_(pessoa(),'2026-10',ctx.autorizacoesCompensacaoRep,ctx.compensacoesRep);
  assert.match(r.texto,/A jornada ficou 15 minutos abaixo do previsto/);assert.match(r.texto,/Horários registrados: 08:00 · 12:00 · 13:00/);
  assert.ok(!/aguarda.*autorização|uso autorizado/.test(r.texto));assert.match(r.texto,/Esse total pode mudar/);
  assert.ok(r.texto.length<1500);assert.ok(!/quantidade ímpar|jornada considerada|limite autorizado ainda utilizável|saldo líquido/.test(r.texto));
 });
}
