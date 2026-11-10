'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),ler=p=>fs.readFileSync(path.join(root,p),'utf8');
const fontes={web:ler('output/RH-Modo-Seguro-Beta/Scripts.html')+ler('output/RH-Modo-Seguro-Beta/RepEnhancements.html'),portatil:ler('portable-entidade/app/renderer/index.html')};
function trecho(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return s.slice(i,j);}
const campo=(value='',dataset={})=>({value,dataset,classList:{toggle(){}},textContent:''});
for(const[edicao,fonte]of Object.entries(fontes)){
 function preparar(){
  const emp={pis:'A',dias:[{dataOriginal:'2026-10-02',deficit:120},{dataOriginal:'2026-10-03',deficit:120}],resumo:{origensSaldoCompensacao:[{data:'2026-10-01',minutos:27,minutosBrutos:27}]}};
  const auth=campo('00:30',{data:'2026-10-01',usadoOutros:'0'});
  const origem=campo('00:30',{data:'2026-10-01',maximo:'27',autorizado:'30'});origem.closest=()=>({querySelector:()=>auth});
  const autorizacao={classList:{toggle(){}},querySelector:s=>s==='.rep-lote-autorizacao-data'?campo('2026-10-01'):campo('00:30')};
  const rows=[];
  function linha(data='2026-10-02',pedido='00:30'){
   const entrada=campo(pedido,{data:'2026-10-01',maximo:'27'});
   const inputs={'.rep-lote-data':campo(data),'.rep-lote-meta-dia-valor':campo('00:30'),'.rep-lote-horas':campo(),'.rep-lote-total-lancado':campo(),'.rep-lote-observacao':campo()};
   const row={inputs,entrada,querySelector:s=>inputs[s],querySelectorAll:()=>[entrada]};rows.push(row);return row;
  }
  const ctx={Map,Set,normalizarPisRep:String,compensacoesRep:[],obterServidorSelecionadoRep_:()=>emp,obterServidorProjetadoLoteRep_:()=>emp,
   obterDeficitProjetadoLoteRep_:(e,d)=>d.deficit,lerDuracaoCompensacaoLoteRep_:t=>/^\d\d:[0-5]\d$/.test(t)?Number(t.slice(0,2))*60+Number(t.slice(3)):null,
   horaParaMinutosRep_:t=>/^\d\d:[0-5]\d$/.test(t)?Number(t.slice(0,2))*60+Number(t.slice(3)):null,
   minutosParaHoraRep_:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),
   document:{querySelectorAll:s=>s.includes('rep-lote-autorizacoes')?[autorizacao]:[origem],getElementById:()=>({dataset:{maximo:'120'}})}
  };ctx.formatarDuracaoCompensacaoLoteRep_=ctx.minutosParaHoraRep_;
  vm.createContext(ctx);
  for(const[a,b]of [
   ['function obterOrigensCompensacaoFormularioRep_(', 'function atualizarTotalOrigensCompensacaoRep_('],
   ['function obterUsoCompensacaoExistenteLoteRep_(', 'function atualizarAutorizacoesCompensacaoLoteRep_('],
   ['function atualizarTotalCompensacaoLoteRep_(', 'function obterFormatoCompensacaoLoteRep_(']
  ])vm.runInContext(trecho(fonte,a,b),ctx);
  return{ctx,emp,auth,origem,linha,rows};
 }
 test(edicao+': autorização de 30 é aceita com saldo 27, sem aumentar o saldo real',()=>{
  const{ctx,emp}=preparar();assert.equal(ctx.obterAutorizacoesCompensacaoLoteRep_(true).get('2026-10-01'),30);
  assert.equal(emp.resumo.origensSaldoCompensacao[0].minutos,27);
 });
 test(edicao+': ajuste individual conserva o pedido 30 e retorna aplicação de 27 com aviso',()=>{
  const{ctx,origem}=preparar();const r=ctx.obterOrigensCompensacaoFormularioRep_();
  assert.equal(r.invalida,false);assert.equal(r.totalBruto,27);assert.equal(r.minutosLiquidos,27);assert.equal(r.origens[0].minutos,27);assert.equal(origem.value,'00:30');assert.match(r.avisos[0],/00:27h/);
 });
 test(edicao+': lote mostra total 27 sem marcar pedido de 30 como inválido',()=>{
  const{ctx,linha}=preparar(),row=linha();const r=ctx.atualizarTotalCompensacaoLoteRep_(row);
  assert.equal(r.invalida,false);assert.equal(r.total,27);assert.equal(row.inputs['.rep-lote-horas'].value,'00:27');assert.equal(row.entrada.value,'00:30');assert.match(row.inputs['.rep-lote-total-lancado'].textContent,/00:27/);
 });
 test(edicao+': meta maior não compensa mais que o débito e meta vazia continua sem autorizar uso',()=>{
  const{ctx,emp,linha}=preparar(),row=linha();emp.dias[0].deficit=12;
  assert.equal(ctx.atualizarTotalCompensacaoLoteRep_(row).total,12);
  row.inputs['.rep-lote-meta-dia-valor'].value='';const r=ctx.atualizarTotalCompensacaoLoteRep_(row);assert.equal(r.total,0);assert.equal(r.invalida,true);
 });
 test(edicao+': autorização menor limita a aplicação; formato inválido continua rejeitado',()=>{
  const{ctx,auth,origem}=preparar();auth.value='00:20';assert.equal(ctx.obterOrigensCompensacaoFormularioRep_().totalBruto,20);
  origem.value='errado';assert.equal(ctx.obterOrigensCompensacaoFormularioRep_().invalida,true);
 });
 test(edicao+': salvar duas linhas não usa os mesmos 27 minutos duas vezes',()=>{
  const{ctx,emp,linha,rows}=preparar();linha();linha('2026-10-03');
  ctx.emp=emp;ctx.linhasCompensacao=rows;ctx.pis='A';
  const normalizacao=trecho(fonte,'  const capacidades = new Map((emp.resumo.origensSaldoCompensacao', '  } catch (erroValidacao)');
  vm.runInContext('let limitesAutorizados,compensacoes;const avisosLimiteCompensacao=[];\n'+normalizacao+'\nglobalThis.salvas=compensacoes;',ctx);
  assert.equal(ctx.salvas.length,1);assert.equal(ctx.salvas[0].minutos,27);assert.equal(ctx.salvas[0].origens[0].minutos,27);assert.equal(ctx.salvas[0].origens[0].autorizado,30);
 });
 test(edicao+': re-compensar dia com compensação prévia restaura saldo e não limita a zero',()=>{
  const{ctx,emp,linha,rows}=preparar();
  emp.resumo.origensSaldoCompensacao[0].minutos = 0;
  emp.dias[0].compensacao = { origensAplicadas: [{ data: '2026-10-01', minutos: 27 }] };
  ctx.compensacoesRep = [{ pis: 'A', data: '2026-10-02', minutos: 27, origens: [{ data: '2026-10-01', minutos: 27 }] }];
  linha('2026-10-02', '00:30');
  ctx.emp=emp;ctx.linhasCompensacao=rows;ctx.pis='A';
  const normalizacao=trecho(fonte,'  const capacidades = new Map((emp.resumo.origensSaldoCompensacao', '  } catch (erroValidacao)');
  vm.runInContext('let limitesAutorizados,compensacoes;const avisosLimiteCompensacao=[];\n'+normalizacao+'\nglobalThis.salvas=compensacoes;',ctx);
  assert.equal(ctx.salvas.length,1);assert.equal(ctx.salvas[0].minutos,27);assert.equal(ctx.salvas[0].origens[0].minutos,27);
 });
}
test('base local preserva documento de 30 e grava somente 27 minutos efetivos',t=>{
 const os=require('node:os');const{LocalRuntime}=require('../portable-entidade/app/local-runtime.cjs');
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'entidade-compensacao27-'));const runtime=new LocalRuntime(pasta);
 runtime.iniciar('teste@example.invalid','Teste');t.after(()=>{runtime.fechar();const alvo=fs.realpathSync(pasta);if(path.dirname(alvo)!==fs.realpathSync(os.tmpdir())||!path.basename(alvo).startsWith('entidade-compensacao27-'))throw Error('Pasta temporária fora do local esperado.');fs.rmSync(alvo,{recursive:true,force:true});});
 const ctx=runtime.contexto();ctx.verificarSeEhOperador=()=>true;ctx.obterDadosUsuarioLogado=()=>({email:'teste@example.invalid',nome:'Teste',papel:'Administrador'});ctx.solicitarReconferenciaEntidade_=()=>{};
 runtime.store.transacao(()=>{
  ctx.salvarAutorizacaoCompensacaoRep({pis:'12345678901',data:'2026-10-01',minutos:30,ordem:1});
  ctx.salvarCompensacaoRep({pis:'12345678901',data:'2026-10-02',minutos:27,origens:[{data:'2026-10-01',minutos:27,autorizado:30}]});
  const salvo=ctx.listarCompensacoesRep()[0];assert.equal(salvo.minutos,27);assert.equal(salvo.origens[0].minutos,27);
  assert.equal(ctx.listarAutorizacoesCompensacaoRep()[0].minutos,30);
 });
});
