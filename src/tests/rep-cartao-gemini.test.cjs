'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta');
const source = fs.readFileSync(path.join(root, 'RepCartaoIAService.gs'), 'utf8');
const trecho = source.slice(source.indexOf('function chamarVisaoCartaoIA_('), source.indexOf('function analisarCartaoPontoManualIA('));
function executar(resposta, arquivos) {
  const pedidos = [];
  const ctx = {
    obterPrimeiraConfigCartaoIA_: keys => keys[0].startsWith('GEMINI') ? 'teste-gemini' : keys[0].startsWith('GROQ') ? 'teste-groq' : '',
    obterConfigValorInterno_: () => '',
    executarRequisicaoEntidade_: (provedor, payload, headers) => {
      pedidos.push({ provedor, payload, headers });
      return provedor.nome === 'Gemini' ? resposta : { ok: true, dados: { choices: [{ message: { content: '{}' } }] } };
    },
    descreverFalhaCartaoIA_: nome => nome + ': limite temporário',
    Logger: { log() {} }
  };
  vm.createContext(ctx);
  vm.runInContext(trecho, ctx);
  return { retorno: ctx.chamarVisaoCartaoIA_('Transcreva', arquivos || [{ mimeType: 'image/jpeg', base64: 'AAAA' }]), pedidos };
}
test('Gemini usa Flash-Lite direto, sem thinking ou chave na URL', () => {
  const { retorno, pedidos } = executar({ ok: true, dados: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"dias":[]}' }] } }] } });
  assert.equal(retorno.provedor, 'Gemini');
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].provedor.modelo, 'gemini-3.5-flash-lite');
  assert.equal(pedidos[0].provedor.maxTentativas, 1);
  assert.equal(pedidos[0].payload.generationConfig.thinkingConfig, undefined);
  assert.equal(pedidos[0].payload.generationConfig.maxOutputTokens, 4096);
  assert.equal(pedidos[0].payload.generationConfig.responseMimeType, 'application/json');
  assert.equal(pedidos[0].payload.generationConfig.responseSchema, undefined);
  assert.equal(pedidos[0].headers['x-goog-api-key'], 'teste-gemini');
  assert.ok(!pedidos[0].provedor.url.includes('teste-gemini'));
  assert.equal(retorno.dados.choices[0].message.content, '{"dias":[]}');
});
test('quota ou JSON truncado acionam Groq, nunca OpenRouter', () => {
  for (const resposta of [{ ok: false, codigo: 429 }, { ok: true, dados: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }] } }]) {
    const { retorno, pedidos } = executar(resposta);
    assert.equal(retorno.provedor, 'Groq');
    assert.deepEqual(pedidos.map(p => p.provedor.nome), ['Gemini', 'Gemini', 'Gemini', 'Gemini', 'Groq']);
    assert.deepEqual(pedidos.slice(0,4).map(p => p.provedor.modelo), ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.8-flash']);
  }
});

test('exceção técnica no Gemini também segue imediatamente para Groq', () => {
  const pedidos = [];
  const ctx = { obterPrimeiraConfigCartaoIA_: keys => keys[0].startsWith('GEMINI') || keys[0].startsWith('GROQ') ? 'chave-teste' : '',
    obterConfigValorInterno_: () => '',
    executarRequisicaoEntidade_: provedor => {
      pedidos.push(provedor.nome);
      if (provedor.nome === 'Gemini') throw new Error('falha temporária');
      return { ok: true, dados: { choices: [{ message: { content: '{"dias":[]}' } }] } };
    }, Logger: { log() {} } };
  vm.createContext(ctx); vm.runInContext(trecho, ctx);
  const retorno = ctx.chamarVisaoCartaoIA_('Transcreva', [{ mimeType: 'image/jpeg', base64: 'AAAA' }]);
  assert.equal(retorno.provedor, 'Groq'); assert.deepEqual(pedidos, ['Gemini', 'Gemini', 'Gemini', 'Gemini', 'Groq']);
});
test('PDF direto vai como inlineData sem parser pago', () => {
  const { pedidos } = executar({ ok: true, dados: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"dias":[]}' }] } }] } }, [{ mimeType: 'application/pdf', base64: 'AAAA' }]);
  assert.equal(pedidos[0].payload.contents[0].parts[1].inlineData.mimeType, 'application/pdf');
  assert.equal(pedidos[0].payload.plugins, undefined);
});

test('cartão completo mantém as seis posições e não inventa um dia 31 em setembro', () => {
  const dias = Array.from({ length: 30 }, (_, i) => ({ dia: i + 1,
    marcacoes: ['07:58', '12:00', '13:01', '17:00', '17:00', '21:00'],
    confiancas: Array(6).fill('alta') }));
  const dados = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ dias, avisos: [] }) }] } }] };
  const { retorno } = executar({ ok: true, dados });
  const transcricao = JSON.parse(retorno.dados.choices[0].message.content);
  assert.equal(transcricao.dias.length, 30);
  assert.deepEqual(transcricao.dias[0].marcacoes, dias[0].marcacoes);
});

test('erro distingue truncamento, filtro de conteúdo e formato, sem atribuir à nitidez', () => {
  const semGroq = source.slice(source.indexOf('function chamarVisaoCartaoIA_('), source.indexOf('function analisarCartaoPontoManualIA('));
  for (const caso of [
    { motivo: 'MAX_TOKENS', texto: '{', esperado: /limite de tamanho.*MAX_TOKENS/ },
    { motivo: 'SAFETY', texto: '', esperado: /filtro de conteúdo.*SAFETY/ },
    { motivo: 'STOP', texto: '{"outro":[]}', esperado: /FORMATO_INVALIDO/ }
  ]) {
    const logs = [];
    const ctx = { obterPrimeiraConfigCartaoIA_: keys => keys[0] === 'GEMINI_API_KEY' ? 'teste' : '',
      obterConfigValorInterno_: () => '',
      executarRequisicaoEntidade_: () => ({ ok: true, dados: { candidates: [{ finishReason: caso.motivo, content: { parts: [{ text: caso.texto }] } }] } }),
      Logger: { log: texto => logs.push(texto) } };
    vm.createContext(ctx); vm.runInContext(semGroq, ctx);
    assert.throws(() => ctx.chamarVisaoCartaoIA_('Transcreva', [{ mimeType: 'image/jpeg', base64: 'AAAA' }]), caso.esperado);
    assert.ok(!logs.join('').includes('nítida'));
    assert.ok(!logs.join('').includes('AAAA'));
  }
});
test('telemetria contabiliza tokens Gemini e não repete 429 com maxTentativas=1', () => {
  const service = fs.readFileSync(path.join(root, 'AIService.gs'), 'utf8');
  const trechoApi = service.slice(service.indexOf('function executarRequisicaoEntidade_('), service.indexOf('function normalizarComandosRespostaEntidade_('));
  let codigo = 200, chamadas = 0, tokens;
  const ctx = {
    reservarCotaTentativaEntidade_: () => ({ autorizado: true }),
    UrlFetchApp: { fetch: () => { chamadas++; return { getResponseCode: () => codigo, getContentText: () => JSON.stringify({ usageMetadata: { totalTokenCount: 456 } }) }; } },
    reconciliarCotaTentativaEntidade_: (_, __, valor) => { tokens = valor; },
    registrarTelemetriaTentativaEntidade_: () => {},
    Utilities: { sleep: () => { throw new Error('Não deve repetir'); } }, Date
  };
  vm.createContext(ctx);
  vm.runInContext(trechoApi, ctx);
  ctx.executarRequisicaoEntidade_({ nome: 'Gemini', maxTentativas: 1 }, {}, {}, 100, 200);
  assert.equal(tokens, 456);
  codigo = 429;
  ctx.executarRequisicaoEntidade_({ nome: 'Gemini', maxTentativas: 1 }, {}, {}, 100, 200);
  assert.equal(chamadas, 2);
});
