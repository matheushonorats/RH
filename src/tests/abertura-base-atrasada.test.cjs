'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const fontes = {
  web: fs.readFileSync(path.join(root,'output/RH-Modo-Seguro-Beta/Scripts.html'),'utf8'),
  portatil: fs.readFileSync(path.join(root,'portable-entidade/app/renderer/index.html'),'utf8')
};
function preparar(fonte) {
  const timers = new Map(), chamadas = [], avisos = [], telas = [];
  let id = 0, intervalo;
  function executor() {
    const chamada = {};
    const proxy = new Proxy({}, {get:(_,p)=> {
      if(p==='withSuccessHandler')return fn=>{chamada.sucesso=fn;return proxy;};
      if(p==='withFailureHandler')return fn=>{chamada.falha=fn;return proxy;};
      return (...args)=>{chamada.metodo=p;chamada.args=args;chamadas.push(chamada);};
    }});
    return proxy;
  }
  const ctx = {
    AppState:{usuarioLogado:{},servidores:[],lancamentos:[],protocolos:[],dashboard:{},dadosCompletosCarregados:false,cacheRestaurado:false,versaoDados:'rev-1'},
    localStorage:{getItem:k=>k==='rh_token'?'sessao-ficticia':k==='rh_user'?JSON.stringify({nome:'Teste',email:'teste@example.invalid',papel:'Operador'}):null,setItem(){},removeItem(){}},
    document:{visibilityState:'visible',getElementById:()=>({classList:{add(){},remove(){}}}),querySelectorAll:()=>[],activeElement:null},
    navigator:{onLine:true}, window:{__ENTIDADE_LOCAL__:false}, SafeMode:{isAccelerated:()=>true,updateIndicators(){}},
    SyncQueue:{fila:[],processando:false,restaurar(){},atualizarUI(){}},
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:i=>timers.delete(i),setInterval:fn=>{intervalo=fn;return 1;},clearInterval(){},
    backendApi:executor,google:{script:{get run(){return executor();}}},
    revisaoMutacoesCliente_:0,carregamentoInicialBancoPendente_:true,currentView:'dashboard',
    consultaAtualizacaoEmAndamento_:false,consultaAtualizacaoId_:0,consultaAtualizacaoExpiracao_:null,pollingInterval:null,
    existemGravacoesEmAndamento_:()=>false,agendarSincronizacaoSegura_(){},
    exibirLoader(){},atualizarTextoSync(){},mostrarToast(){},popularFiltroLotacoes(){},
    carregarDadosDaView:view=>telas.push(view),carregarOperacoesPendentesServidor(){},salvarCacheLocal(){},
    mostrarLogin(){},atualizarBarraUsuario(){},carregarNomesUsuariosTicker_(){},
    mensagemErro:e=>e.message,atualizarVersaoAberta_(){},console
  };
  vm.createContext(ctx);
  const inicio = fonte.indexOf('let sincronizacaoServidorEmAndamento =');
  const fim = fonte.indexOf('function avisarMudancasCompartilhadasGerais_(',inicio);
  vm.runInContext(fonte.slice(inicio,fim),ctx);
  const i = fonte.indexOf('function inicializarUsuario('), f = fonte.indexOf('function conferirNuvemModoSeguroInicial_(',i);
  vm.runInContext(fonte.slice(i,f),ctx);
  const a = fonte.indexOf('function iniciarPolling('), b = fonte.indexOf('function escapeHtml(',a);
  vm.runInContext(fonte.slice(a,b),ctx);
  ctx.mostrarAvisoCarregamentoBase_=m=>avisos.push(m);
  return {ctx,chamadas,timers,avisos,telas,intervalo:()=>intervalo,expirar:ms=>{const entrada=[...timers].find(([,t])=>t.ms===ms);assert.ok(entrada,'Timer '+ms);timers.delete(entrada[0]);entrada[1].fn();}};
}
function base() { return {dashboard:{totalServidores:1},servidores:[{matricula:'123',nome:'Pessoa fictícia'}],lancamentos:[],protocolos:[],versaoDados:'rev-1',errosCarga:[]}; }
for(const [edicao,fonte] of Object.entries(fontes)) {
  test(edicao+': resposta depois de 45s ainda preenche a tela, sem consulta duplicada',()=>{
    const p=preparar(fonte);p.ctx.sincronizarDados(true,'dashboard');
    p.expirar(45000);assert.equal(p.ctx.AppState.dadosCompletosCarregados,false);
    assert.ok(vm.runInContext('sincronizacaoServidorEmAndamento',p.ctx));
    p.ctx.sincronizarDados(true,'dashboard');assert.equal(p.chamadas.length,1);
    p.chamadas[0].sucesso(base());
    assert.equal(p.ctx.AppState.servidores.length,1);assert.equal(p.ctx.AppState.dadosCompletosCarregados,true);
    assert.equal(p.avisos.at(-1),'');assert.ok(p.telas.includes('dashboard'));
  });
  test(edicao+': leitura parcial preserva dados conhecidos e agenda uma nova tentativa',()=>{
    const p=preparar(fonte);p.ctx.AppState.servidores=[{matricula:'registro-preservado'}];
    p.ctx.sincronizarDados(true,'dashboard');
    p.chamadas[0].sucesso({...base(),servidores:[],errosCarga:['Servidores: indisponível']});
    assert.equal(p.ctx.AppState.servidores[0].matricula,'registro-preservado');assert.equal(p.ctx.AppState.dadosCompletosCarregados,false);
    p.expirar(10000);assert.equal(p.chamadas.length,2);
    p.chamadas[1].sucesso(base());assert.equal(p.ctx.AppState.servidores[0].matricula,'123');
  });
  test(edicao+': falha depois do aviso de demora também permite repetir e recuperar',()=>{
    const p=preparar(fonte);p.ctx.sincronizarDados(true,'dashboard');p.expirar(45000);
    p.chamadas[0].falha(new Error('Rede indisponível'));p.expirar(10000);
    p.chamadas[1].sucesso(base());assert.equal(p.ctx.AppState.dadosCompletosCarregados,true);
  });
  test(edicao+': consulta periódica recupera primeira carga mesmo com a mesma revisão',()=>{
    const p=preparar(fonte);p.ctx.iniciarPolling();p.intervalo()();
    assert.equal(p.chamadas[0].metodo,'obterEstadoAtualizacaoCliente');
    p.chamadas[0].sucesso({versaoDados:'rev-1',versaoAplicacao:'1.30'});
    assert.equal(p.chamadas[1].metodo,'obterDadosCompletos');
  });
  test(edicao+': cópia acelerada autenticada é conferida com a base completa na abertura',()=>{
    const p=preparar(fonte);p.ctx.inicializarUsuario(true);
    assert.equal(p.chamadas[0].metodo,'verificarSessao');
    p.chamadas[0].sucesso({nome:'Teste',email:'teste@example.invalid',papel:'Operador'});
    assert.equal(p.chamadas[1].metodo,'obterDadosCompletos');assert.equal(p.ctx.AppState.dadosCompletosCarregados,false);
    p.chamadas[1].sucesso(base());assert.equal(p.ctx.AppState.dadosCompletosCarregados,true);
  });
  test(edicao+': resposta iniciada antes de uma gravação não sobrescreve a alteração nova',()=>{
    const p=preparar(fonte);p.ctx.sincronizarDados(true,'dashboard');p.ctx.revisaoMutacoesCliente_++;
    p.ctx.AppState.servidores=[{matricula:'alteracao-local'}];p.chamadas[0].sucesso(base());
    assert.equal(p.ctx.AppState.servidores[0].matricula,'alteracao-local');assert.equal(p.ctx.AppState.dadosCompletosCarregados,false);
  });
}
