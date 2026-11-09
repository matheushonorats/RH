'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const base = path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta');
const governanca = fs.readFileSync(path.join(base, 'EntidadeGovernancaService.gs'), 'utf8');
const api = fs.readFileSync(path.join(base, 'AIService.gs'), 'utf8');
const cartao = fs.readFileSync(path.join(base, 'RepCartaoIAService.gs'), 'utf8');

test('timeout de um Gemini não esgota a cota interna dos demais modelos', () => {
  let salvo = JSON.stringify({data:'2026-10-08',minuto:'2026-10-08 15:00',provedores:{Gemini:{tentativas:4,tokens:60000,tokensMinuto:60000,sucessos:0}}});
  const chamadas = [];
  const ctx = {
    Date, Logger:{log() {}},
    obterConfigValorInterno_:() => '',
    Session:{getScriptTimeZone:()=>'America/Sao_Paulo'},
    Utilities:{formatDate:(_,__,formato)=>formato==='yyyy-MM-dd'?'2026-10-08':'2026-10-08 15:00',sleep() {}},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock() {}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>salvo,setProperty:(_,valor)=>{salvo=valor;}})},
    registrarTelemetriaTentativaEntidade_() {},
    UrlFetchApp:{fetch(url) {
      chamadas.push(url);
      if (url.includes('3.5')) throw new Error('Request timed out');
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({usageMetadata:{totalTokenCount:500}})};
    }}
  };
  vm.createContext(ctx);
  vm.runInContext(governanca,ctx);
  vm.runInContext(api.slice(api.indexOf('function executarRequisicaoEntidade_('),api.indexOf('function normalizarComandosRespostaEntidade_(')),ctx);
  const primeiro=ctx.executarRequisicaoEntidade_({nome:'Gemini',modelo:'gemini-3.5-flash-lite',url:'https://test/3.5',maxTentativas:1},{},{},5000,8192);
  const segundo=ctx.executarRequisicaoEntidade_({nome:'Gemini',modelo:'gemini-3.1-flash-lite',url:'https://test/3.1',maxTentativas:1},{},{},5000,8192);
  assert.equal(primeiro.ok,false);
  assert.equal(segundo.ok,true);
  assert.equal(chamadas.length,2);
  const uso=JSON.parse(salvo).provedores;
  assert.equal(uso.Gemini.tokens,60000);
  assert.ok(uso['Gemini|gemini-3.5-flash-lite'].tokens>0);
  assert.equal(uso['Gemini|gemini-3.1-flash-lite'].tokens,500);
  assert.equal(ctx.limitesProvedorEntidade_('Gemini|gemini-3.1-flash-lite').requisicoesDia,500);
  assert.equal(ctx.limitesProvedorEntidade_('Gemini|gemini-2.5-flash-lite').requisicoesDia,20);
});

test('bloqueio preventivo informa que não é a cota do AI Studio', () => {
  const a=cartao.indexOf('function descreverFalhaCartaoIA_(');
  const b=cartao.indexOf('function chamarVisaoCartaoIA_(',a);
  const ctx={};
  vm.createContext(ctx);
  vm.runInContext(cartao.slice(a,b),ctx);
  const mensagem=ctx.descreverFalhaCartaoIA_('Gemini (gemini-3.1-flash-lite)',{motivo:'limite diario de tokens'});
  assert.match(mensagem,/deste aplicativo/);
  assert.match(mensagem,/não indica que a cota do Google AI Studio acabou/);
});
