'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'RepEnhancements.html'), 'utf8');
const inicio = source.indexOf('async function prepararPaginasPdfCartaoIA_(');
const fim = source.indexOf('function prepararImagemCartaoIA_(', inicio);
assert.ok(inicio >= 0 && fim > inicio);

function contexto(numeroPaginas) {
  let destruiu = false;
  const documento = {
    numPages: numeroPaginas,
    getPage: async () => ({
      getViewport: ({ scale }) => ({ width: 500 * scale, height: 1000 * scale }),
      render: () => ({ promise: Promise.resolve() }),
      cleanup: () => {}
    }),
    destroy: async () => { destruiu = true; }
  };
  const ctx = {
    window: { pdfjsLib: { getDocument: () => ({ promise: Promise.resolve(documento) }) } },
    document: { createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ fillRect: () => {}, drawImage: () => {}, set fillStyle(_) {} }),
      toDataURL: () => 'data:image/jpeg;base64,' + 'A'.repeat(2000)
    }) },
    Uint8Array, Math, Error
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(inicio, fim), ctx);
  return { ctx, foiDestruido: () => destruiu };
}

test('PDF completo vira duas imagens temporárias para a IA', async () => {
  const { ctx, foiDestruido } = contexto(2);
  const paginas = await ctx.prepararPaginasPdfCartaoIA_({ size: 1000, name: 'cartao.pdf', arrayBuffer: async () => new ArrayBuffer(10) }, 2);
  assert.equal(paginas.length, 2);
  assert.ok(paginas.every(pagina => pagina.mimeType === 'image/jpeg'));
  assert.equal(foiDestruido(), true);
});

test('PDF incompleto é recusado sem guardar o documento', async () => {
  const { ctx, foiDestruido } = contexto(1);
  await assert.rejects(ctx.prepararPaginasPdfCartaoIA_({ size: 1000, arrayBuffer: async () => new ArrayBuffer(10) }, 2), /duas páginas/);
  assert.equal(foiDestruido(), true);
});

test('as imagens convertidas usam a Groq quando o Gemini não foi configurado', () => {
  const service = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'RepCartaoIAService.gs'), 'utf8');
  const a = service.indexOf('function chamarVisaoCartaoIA_(');
  const b = service.indexOf('function analisarCartaoPontoManualIA(', a);
  assert.ok(a >= 0 && b > a);
  const chamados = [];
  const ctx = {
    obterPrimeiraConfigCartaoIA_: chaves => chaves[0].startsWith('GROQ') ? 'chave-teste-groq' : '',
    obterConfigValorInterno_: () => '',
    executarRequisicaoEntidade_: provedor => {
      chamados.push(provedor.nome);
      return { ok: true, dados: { choices: [] } };
    },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(service.slice(a, b), ctx);
  const resposta = ctx.chamarVisaoCartaoIA_('Transcreva', [{ mimeType: 'image/jpeg', base64: 'AAAA' }, { mimeType: 'image/jpeg', base64: 'AAAA' }]);
  assert.equal(resposta.provedor, 'Groq');
  assert.deepEqual(chamados, ['Groq']);
});
