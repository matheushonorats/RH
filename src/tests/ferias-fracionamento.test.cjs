'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const{LocalRuntime}=require('../portable-entidade/app/local-runtime.cjs');
const root=path.join(__dirname,'..'),web=path.join(root,'output/RH-Modo-Seguro-Beta');
const fonte=fs.readFileSync(path.join(web,'LancamentosService.gs'),'utf8');
function trecho(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return s.slice(i,j);}
function preparar(t,edicao,maisCreditos=false){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'entidade-parcelas-ferias-'));const runtime=new LocalRuntime(pasta);runtime.iniciar('teste@example.invalid','Teste');
 t.after(()=>{runtime.fechar();const alvo=fs.realpathSync(pasta);if(path.dirname(alvo)!==fs.realpathSync(os.tmpdir())||!path.basename(alvo).startsWith('entidade-parcelas-ferias-'))throw Error('Pasta de teste inesperada.');fs.rmSync(alvo,{recursive:true,force:true});});
 const ctx=runtime.contexto();ctx.verificarSeEhOperador=()=>true;ctx.obterDadosUsuarioLogado=()=>({email:'teste@example.invalid',nome:'Teste',papel:'Administrador'});ctx.solicitarReconferenciaEntidade_=()=>{};
 if(edicao==='web'){
  vm.runInContext(trecho(fonte,'function obterMovimentosParcelasFerias_(', '/** Tipos que representam ausência'),ctx);
  vm.runInContext(trecho(fonte,'function salvarLancamento(', 'function validarRemocoesAnexosLancamento_('),ctx);
  const servidores=fs.readFileSync(path.join(web,'ServidoresService.gs'),'utf8');
  vm.runInContext(trecho(servidores,'function construirResumoFerias_(', 'function construirMapaSaldosFerias_('),ctx);
 }
 const executar=fn=>runtime.store.transacao(()=>{ctx.finalizarLeiturasEmLote_();return fn(ctx);});
 executar(()=>{
  runtime.store.getSheetByName('Servidores').appendRow(['123','Pessoa Teste','Cargo','Setor',new Date(2023,0,1),'Estatutário','','Sim','12345678901']);
  const aba=runtime.store.getSheetByName('Creditos_Ferias');
  aba.appendRow(['cred-1',new Date(2024,0,1),'123','Aquisitivo 2023-2024',30,new Date(2024,0,1)]);
  if(maisCreditos)aba.appendRow(['cred-2',new Date(2025,0,1),'123','Aquisitivo 2024-2025',30,new Date(2025,0,1)]);
 });
 const base=(data,dias=5,extras={})=>({matricula:'123',tipo:'Férias',dataSolicitacao:'2026-01-01',dataInicio:data,dias,...extras});
 const salvar=(data,dias=5,extras={})=>executar(c=>c.salvarLancamento(base(data,dias,extras)));
 const lista=()=>executar(c=>c.obterListaLancamentos());
 const periodos=()=>executar(c=>c.construirResumoFerias_(runtime.store,new Date(2026,10,6))['123'].periodos);
 return{ctx,runtime,executar,base,salvar,lista,periodos};
}
for(const edicao of ['web','portatil']){
 test(edicao+': permite duas partes e bloqueia a terceira com saldo suficiente, sem gravar',t=>{
  const p=preparar(t,edicao);p.salvar('2026-01-01');p.salvar('2026-02-01');
  assert.equal(p.periodos()[0].parcelasUsadas,2);assert.equal(p.periodos()[0].saldo,20);
  assert.throws(()=>p.salvar('2026-03-01'),/limite é de 2 partes/);
  assert.equal(p.lista().length,2);assert.equal(p.periodos()[0].saldo,20);
 });
 test(edicao+': editar a própria parte não duplica; cancelamento deixa de contar',t=>{
  const p=preparar(t,edicao);p.salvar('2026-01-01');p.salvar('2026-02-01');const segunda=p.lista().find(l=>l.dataInicio==='01/02/2026');
  p.salvar('2026-02-01',5,{linhaPlanilha:segunda.linhaPlanilha,idLancamento:segunda.id,observacao:'Retificação de documento'});
  assert.equal(p.periodos()[0].parcelasUsadas,2);
  p.executar(c=>c.excluirLancamento(segunda.linhaPlanilha,segunda.id));
  assert.equal(p.periodos()[0].parcelasUsadas,1);p.salvar('2026-03-01');assert.equal(p.periodos()[0].parcelasUsadas,2);
 });
 test(edicao+': período seguinte tem limite próprio; dias em pecúnia não viram outra parte',t=>{
  const p=preparar(t,edicao,true);p.salvar('2026-01-01',10,{tipo:'Férias (1/3 Pecúnia)',diasPecunia:10});p.salvar('2026-02-01',10);
  assert.equal(p.periodos()[0].parcelasUsadas,2);assert.equal(p.periodos()[0].saldo,0);
  p.salvar('2026-03-01',5);assert.equal(p.periodos()[1].parcelasUsadas,1);
 });
 test(edicao+': prorrogação contígua é o mesmo gozo; terceira parte separada é bloqueada',t=>{
  const p=preparar(t,edicao);p.salvar('2026-01-01',5);p.salvar('2026-01-06',5);
  assert.equal(p.periodos()[0].parcelasUsadas,1);p.salvar('2026-02-01',5);assert.equal(p.periodos()[0].parcelasUsadas,2);
  assert.throws(()=>p.salvar('2026-03-01',5),/limite é de 2 partes/);
 });
 test(edicao+': licença-prêmio continua fora desta alteração',t=>{
  const p=preparar(t,edicao);for(const mes of ['01','02','03','04'])p.salvar('2026-'+mes+'-01',1,{tipo:'Licença Prêmio'});
  assert.equal(p.lista().length,4);assert.equal(p.periodos()[0].parcelasUsadas,0);
 });
 test(edicao+': programação futura reserva as partes do respectivo período',t=>{
  const p=preparar(t,edicao);p.salvar('2026-01-01',15);p.salvar('2026-02-01',15);
  p.executar(()=>p.runtime.store.getSheetByName('Creditos_Ferias').appendRow(['cred-futuro',new Date(2026,0,1),'123','Aquisitivo 2026-2027',30,new Date(2027,0,1)]));
  p.salvar('2027-01-01',10,{confirmarReservaCreditoFuturo:true});p.salvar('2027-02-01',10,{confirmarReservaCreditoFuturo:true});
  assert.throws(()=>p.salvar('2027-03-01',10,{confirmarReservaCreditoFuturo:true}),/limite é de 2 partes/);
  assert.equal(p.periodos().find(x=>x.referencia==='Aquisitivo 2026-2027').parcelasUsadas,2);
 });
 test(edicao+': pré-validação informa as três datas e bloqueia antes de qualquer gravação',t=>{
  const p=preparar(t,edicao);p.salvar('2026-01-01');p.salvar('2026-02-01');
  const resultado=p.executar(c=>c.validarConflitosLancamento(p.base('2026-03-01')));
  assert.equal(resultado.valido,false);assert.equal(resultado.codigo,'LIMITE_PARCELAS_FERIAS');
  for(const texto of ['Pessoa Teste','01/01/2026 a 05/01/2026','01/02/2026 a 05/02/2026','01/03/2026 a 05/03/2026'])assert.ok(resultado.mensagem.includes(texto),texto);
  assert.equal(p.lista().length,2);
 });
 test(edicao+': conflito identifica os documentos e os três dias exatos de sobreposição',t=>{
  const p=preparar(t,edicao);p.salvar('2026-02-01',5,{tipo:'Atestado',idoc:'14.129/2026',idProtocolo:'SETUR-2026-00082'});
  const resultado=p.executar(c=>c.validarConflitosLancamento(p.base('2026-02-03',5)));
  assert.equal(resultado.valido,false);assert.equal(resultado.codigo,'SOBREPOSICAO_AFASTAMENTOS');
  const conflito=resultado.conflitos[0];assert.equal(conflito.diasSobrepostos,3);assert.equal(conflito.sobreposicao,'03/02/2026 a 05/02/2026');assert.equal(conflito.idoc,'14.129/2026');
  for(const texto of ['Pessoa Teste','matrícula 123','Atestado','Férias','14.129/2026','SETUR-2026-00082','03/02/2026 a 05/02/2026'])assert.ok(resultado.mensagem.includes(texto),texto);
  assert.throws(()=>p.salvar('2026-02-03',5),/14\.129\/2026/);assert.equal(p.lista().length,1);
  assert.equal(JSON.parse(JSON.stringify(resultado)).conflitos[0].diasSobrepostos,3);
 });
 test(edicao+': apresenta os vários conflitos, não somente o primeiro',t=>{
  const p=preparar(t,edicao);p.salvar('2026-02-01',2,{tipo:'Atestado',idoc:'A-1'});p.salvar('2026-02-05',1,{tipo:'Licença Prêmio',idoc:'B-2'});
  const resultado=p.executar(c=>c.validarConflitosLancamento(p.base('2026-02-02',5)));
  assert.equal(resultado.quantidade,2);assert.equal(resultado.conflitos.length,2);
  for(const texto of ['A-1','B-2','02/02/2026 (1 dia)','05/02/2026 (1 dia)'])assert.ok(resultado.mensagem.includes(texto),texto);
 });
 test(edicao+': edição e cancelamento não produzem conflito falso com a própria linha',t=>{
  const p=preparar(t,edicao);p.salvar('2026-02-01',2,{tipo:'Atestado'});const registro=p.lista()[0];
  assert.equal(p.executar(c=>c.validarConflitosLancamento(p.base('2026-02-01',2,{tipo:'Atestado',linhaPlanilha:registro.linhaPlanilha}))).valido,true);
  p.executar(c=>c.excluirLancamento(registro.linhaPlanilha,registro.id));
  assert.equal(p.executar(c=>c.validarConflitosLancamento(p.base('2026-02-01',2))).valido,true);
 });
 test(edicao+': histórico antigo acima do limite pode ser corrigido, mas não receber outra parte',t=>{
  const p=preparar(t,edicao);
  p.executar(c=>{
   const aba=p.runtime.store.getSheetByName('Lançamentos');c.garantirColunasPersistenciaLancamentos_(aba);const idx=c.obterIndicesColunasLancamentos_(aba.getRange(1,1,1,aba.getLastColumn()).getValues()[0]);
   for(const mes of [0,1,2]){const linha=new Array(aba.getLastColumn()).fill('');for(const[k,v]of Object.entries({id:'antigo-'+mes,tipo:'Férias',matricula:'123',nome:'123: Pessoa Teste',dataInicio:new Date(2026,mes,1),dias:5,diasFerias:5,status:'Ativo'}))if(idx[k]>=0)linha[idx[k]]=v;aba.appendRow(linha);}
  });
  const antigo=p.lista()[0];const partes=antigo.dataInicio.split('/');p.salvar(partes[2]+'-'+partes[1]+'-'+partes[0],5,{linhaPlanilha:antigo.linhaPlanilha,idLancamento:antigo.id,observacao:'Correção sem nova parte'});
  assert.equal(p.periodos()[0].parcelasUsadas,3);assert.throws(()=>p.salvar('2026-04-01'),/limite é de 2 partes/);
 });
}

test('contagem por crédito não transforma penalidade ou pecúnia em gozo e acompanha saldo residual',()=>{
 const ctx={Date,normalizarCabecalho_:s=>String(s).toUpperCase()};vm.createContext(ctx);
 vm.runInContext(trecho(fonte,'function calcularParcelasFeriasPorPeriodo_(', 'function validarLimiteParcelasFerias_('),ctx);
 const periodos=[{referencia:'2024',diasOriginais:30,penalidade:0},{referencia:'2025',diasOriginais:30,penalidade:0}];
 const r=ctx.calcularParcelasFeriasPorPeriodo_(periodos,[{ordem:1,ferias:false,dias:5},{ordem:2,ferias:true,dataInicio:new Date(2026,0,1),dias:30,pecunia:10}]);
 assert.equal(r['2024'].parcelas,1);assert.equal(r['2025'].parcelas,1);assert.equal(r['2025'].saldo,15);
});

test('backend compartilhado usa a mesma validação e interfaces exibem a contagem de partes',()=>{
 assert.equal(fs.readFileSync(path.join(root,'portable-entidade/app/source-app/LancamentosService.gs'),'utf8'),fonte);
 const html=fs.readFileSync(path.join(root,'portable-entidade/app/renderer/index.html'),'utf8');
 for(const s of [html,fs.readFileSync(path.join(web,'Scripts.html'),'utf8')])assert.ok(s.includes('Partes de gozo:'));
});
