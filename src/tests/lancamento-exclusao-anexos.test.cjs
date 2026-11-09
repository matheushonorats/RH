'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { LocalRuntime } = require('../portable-entidade/app/local-runtime.cjs');

function preparar(t) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'entidade-exclusao-'));
  const runtime = new LocalRuntime(pasta);
  runtime.iniciar('teste@example.invalid', 'Teste');
  t.after(() => { runtime.fechar(); fs.rmSync(pasta, {recursive:true,force:true}); });
  const contexto = runtime.contexto();
  contexto.verificarSeEhOperador = () => true;
  contexto.obterDadosUsuarioLogado = () => ({email:'teste@example.invalid',nome:'Teste',papel:'Administrador'});
  contexto.solicitarReconferenciaEntidade_ = () => {};
  const transacao = fn => runtime.store.transacao(() => fn(contexto));
  transacao(() => {
    runtime.store.getSheetByName('Servidores').appendRow(['123','Pessoa Teste','Cargo','Setor',new Date(2020,0,1),'Estatutário','','Sim','12345678901']);
    const aba=runtime.store.getSheetByName('Lançamentos');
    const linha=new Array(aba.getLastColumn()).fill('');
    const idx=contexto.obterIndicesColunasLancamentos_(aba.getRange(1,1,1,aba.getLastColumn()).getValues()[0]);
    for(const [chave,valor] of Object.entries({id:'lanc-1',tipo:'Atestado',nome:'123: Pessoa Teste',matricula:'123',dataInicio:new Date(2026,8,23),dias:1,status:'Ativo',idProtocolo:'PROTO-1',anexo2:'https://drive.google.com/file/d/arquivo-original-1234567890/view'})) linha[idx[chave]]=valor;
    aba.appendRow(linha);
  });
  return {runtime,contexto,transacao};
}

test('cancelar mantém auditoria e retira de telas, histórico e protocolo sem deslocar linhas', t => {
  const {runtime,transacao}=preparar(t);
  transacao(c => assert.equal(c.obterListaLancamentos().length,1));
  transacao(c => c.excluirLancamento(2,'lanc-1'));
  transacao(c => {
    assert.equal(c.obterListaLancamentos().length,0);
    assert.equal(c.obterHistoricoServidor('123').length,0);
    assert.equal(c.obterLancamentosVinculados('PROTO-1').length,0);
    assert.equal(c.contarLancamentosPorProtocolo_(runtime.store)['PROTO-1'],undefined);
    assert.equal(runtime.store.getSheetByName('Lançamentos').getLastRow(),2);
    const aba=runtime.store.getSheetByName('Lançamentos');
    const idx=c.obterIndicesColunasLancamentos_(aba.getRange(1,1,1,aba.getLastColumn()).getValues()[0]);
    const marcador=aba.getRange(2,1,1,aba.getLastColumn()).getValues()[0];
    assert.equal(marcador[idx.id],'lanc-1');
    for(const campo of ['tipo','nome','matricula','dataInicio','dias','anexo2','idProtocolo']) assert.equal(marcador[idx[campo]],'');
    assert.ok(runtime.store.getSheetByName('Logs').getDataRange().getValues().some(l=>l[2]==='EXCLUIR_LANCAMENTO'));
    assert.throws(()=>c.salvarLancamento({linhaPlanilha:2,idLancamento:'lanc-1',tipo:'Atestado',matricula:'123',dias:1,dataInicio:'2026-09-23',reativar:true}),/cancelado ou excluído/);
  });
});

test('sem log de auditoria o cancelamento preserva o lançamento inteiro', t => {
  const {runtime,contexto,transacao}=preparar(t);
  contexto.obterPlanilha_=()=>({getSheetByName:nome=>nome==='Logs'?null:runtime.store.getSheetByName(nome)});
  transacao(c=>assert.throws(()=>c.excluirLancamento(2,'lanc-1'),/auditoria não está disponível/));
  transacao(c=>assert.equal(c.obterListaLancamentos()[0].anexo2,'https://drive.google.com/file/d/arquivo-original-1234567890/view'));
});

test('remover anexo 2 deixa vazio, preserva os outros campos e rejeita edição concorrente', t => {
  const {runtime,transacao}=preparar(t);
  const caminho='https://drive.google.com/file/d/arquivo-original-1234567890/view';
  const dados={linhaPlanilha:2,idLancamento:'lanc-1',tipo:'Atestado',matricula:'123',dias:1,dataInicio:'2026-09-23',anexosRemovidos:[{posicao:2,caminho}]};
  transacao(c=>assert.throws(()=>c.salvarLancamento({...dados,anexosRemovidos:[{posicao:2,caminho:'outro-arquivo'}]}),/alterado em outra tela/));
  transacao(c=>c.salvarLancamento(dados));
  transacao(c=>{
    const registro=c.obterListaLancamentos()[0];
    assert.equal(registro.anexo2,'');
    assert.equal(registro.tipo,'Atestado');
    assert.ok(runtime.store.getSheetByName('Logs').getDataRange().getValues().some(l=>l[2]==='REMOVER_ANEXO'));
  });
});

test('backend web e portátil usam as mesmas regras de exclusão e anexos', () => {
  for(const nome of ['LancamentosService.gs','ProtocolosService.gs']) {
    const web=fs.readFileSync(path.join(__dirname,'../output/RH-Modo-Seguro-Beta',nome),'utf8');
    const local=fs.readFileSync(path.join(__dirname,'../portable-entidade/app/source-app',nome),'utf8');
    assert.equal(local,web);
  }
});

test('interface mantém posição do anexo, permite desfazer e não envia remoção antes de salvar', () => {
  const web=fs.readFileSync(path.join(__dirname,'../output/RH-Modo-Seguro-Beta/Scripts.html'),'utf8');
  const a=web.indexOf('let anexosRemovidosLancamento_ = []'),b=web.indexOf('function baixarAnexoSeguro(',a);
  function elemento() { return {style:{},children:[],appendChild(filho){this.children.push(filho);}}; }
  const ctx={document:{createElement:elemento},baixarAnexoSeguro(){}};
  vm.createContext(ctx); vm.runInContext(web.slice(a,b),ctx);
  const lista=elemento();
  ctx.exibirAnexosNaLista(lista,['','arquivo-2',''],true);
  assert.equal(lista.children.length,1);
  const botao=lista.children[0].children[1];
  botao.onclick();
  assert.equal(vm.runInContext('anexosRemovidosLancamento_[0].posicao',ctx),2);
  assert.equal(botao.textContent,'Desfazer remoção');
  botao.onclick();
  assert.equal(vm.runInContext('anexosRemovidosLancamento_.length',ctx),0);
});
