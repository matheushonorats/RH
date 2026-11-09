'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const [edicao, arquivo] of [
  ['web', '../output/RH-Modo-Seguro-Beta/Scripts.html'],
  ['portátil', '../portable-entidade/app/renderer/index.html']
]) {
  test(edicao + ': navega em 61 lançamentos, preserva página na atualização e recalcula ao filtrar', () => {
    const fonte=fs.readFileSync(path.join(__dirname,arquivo),'utf8');
    const trecho=(inicio,fim)=>{
      const a=fonte.indexOf(inicio),b=fonte.indexOf(fim,a);
      assert.ok(a>=0 && b>a);
      return fonte.slice(a,b);
    };
    const tabela={innerHTML:'',querySelectorAll:()=>[]};
    const rodape={innerHTML:'1 / 1'};
    const filtros={busca:{value:''},tipo:{value:''},status:{value:''}};
    const lancamentos=Array.from({length:61},(_,i)=>({linhaPlanilha:i+2,nome:'Registro '+(i+1),idoc:'DOC-'+(i+1),status:'Ativo',tipo:'Atestado',matricula:'123',dataInicio:'01/09/2026'}));
    const ctx={
      AppState:{lancamentos,paginacao:{lancamentos:{paginaAtual:1,itensPorPagina:30,listaAtual:[],filtroAssinatura:''}}},
      document:{getElementById:id=>({'tabela-lancamentos-body':tabela,'paginacao-lancamentos':rodape,'filtro-busca-lancamento':filtros.busca,'filtro-tipo-lancamento':filtros.tipo,'filtro-status-lancamento':filtros.status})[id]},
      normalizarTextoRep_:s=>String(s).toUpperCase(),normalizarTextoBusca:s=>s.toLowerCase(),
      correspondeBusca:(busca,...campos)=>campos.some(s=>String(s||'').toLowerCase().includes(busca)),
      formatarQuantidadeLancamento:()=> '1 dia',escapeHtml:s=>String(s||''),renderizarIcones() {}
    };
    vm.createContext(ctx);
    vm.runInContext(
      trecho('function renderizarTabelaLancamentos(', 'async function excluirLancamentoInterface_(')+
      trecho('function filtrarTabelaLancamentos(', 'function ajustarCamposFormularioLancamento(')+
      trecho('function renderizarControlesPaginacao(', '// CONTROLE DO WIZARD'),ctx);
    ctx.filtrarTabelaLancamentos();
    assert.match(rodape.innerHTML,/1 \/ 3/);
    assert.match(rodape.innerHTML,/de 61 registros/);
    assert.equal((tabela.innerHTML.match(/<tr>/g)||[]).length,30);
    ctx.mudarPagina('lancamentos',2);
    assert.match(rodape.innerHTML,/2 \/ 3/);
    assert.match(tabela.innerHTML,/Registro 31/);
    assert.doesNotMatch(tabela.innerHTML,/DOC-1<\/strong>/);
    ctx.filtrarTabelaLancamentos();
    assert.equal(ctx.AppState.paginacao.lancamentos.paginaAtual,2);
    ctx.mudarPagina('lancamentos',3);
    assert.match(tabela.innerHTML,/Registro 61/);
    assert.equal((tabela.innerHTML.match(/<tr>/g)||[]).length,1);
    assert.match(rodape.innerHTML,/3 \/ 3/);
    filtros.busca.value='Registro 61';ctx.filtrarTabelaLancamentos();
    assert.match(rodape.innerHTML,/1 \/ 1/);
    filtros.busca.value='';ctx.filtrarTabelaLancamentos();
    assert.match(rodape.innerHTML,/1 \/ 3/);
    filtros.busca.value='não existe';ctx.filtrarTabelaLancamentos();
    assert.match(rodape.innerHTML,/de 0 registros/);
    assert.match(tabela.innerHTML,/Nenhum lançamento encontrado/);
  });
}
