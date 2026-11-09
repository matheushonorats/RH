'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../output/RH-Modo-Seguro-Beta/RepEnhancements.html'), 'utf8');
const trecho = source.slice(source.indexOf('function inicializarArrastarArquivosCartaoIA_('), source.indexOf('function prepararArquivoCartaoIA_('));
function contexto() {
  const nomes = {}, areas = [], inputs = [], avisos = [];
  for (const lado of ['frente', 'verso']) {
    const nome = { textContent: '' }; nomes['rep-cartao-ia-' + lado + '-nome'] = nome;
    const area = { dataset: {}, eventos: {}, classList: { add() {}, remove() {}, toggle() {} }, contains: () => false,
      addEventListener: (evento, fn) => { area.eventos[evento] = fn; }, querySelector: () => input };
    const input = { id: 'rep-cartao-ia-' + lado, files: [], closest: () => area };
    areas.push(area); inputs.push(input);
  }
  class Transferencia { constructor() { this.files = []; this.items = { add: f => this.files.push(f) }; } }
  const ctx = { document: { getElementById: id => nomes[id] }, DataTransfer: Transferencia, mostrarToast: texto => avisos.push(texto) };
  vm.createContext(ctx); vm.runInContext(trecho, ctx);
  ctx.inicializarArrastarArquivosCartaoIA_({ querySelectorAll: () => areas });
  const soltar = (indice, files) => {
    let preveniu = false;
    areas[indice].eventos.drop({ dataTransfer: { files }, preventDefault() { preveniu = true; }, stopPropagation() {} });
    assert.equal(preveniu, true);
  };
  return { inputs, nomes, avisos, soltar };
}
test('arrastar frente e verso seleciona os mesmos arquivos usados na leitura', () => {
  const { inputs, nomes, soltar } = contexto();
  const frente = { type: 'image/jpeg', size: 2000, name: 'frente.jpg' };
  const verso = { type: 'image/jpeg', size: 2000, name: 'verso.jpg' };
  soltar(0, [frente]); soltar(1, [verso]);
  assert.equal(inputs[0].files[0], frente); assert.equal(inputs[1].files[0], verso);
  assert.equal(nomes['rep-cartao-ia-frente-nome'].textContent, 'frente.jpg');
});
test('PDF pode ser arrastado e arquivo inválido não substitui a seleção', () => {
  const { inputs, avisos, soltar } = contexto();
  const pdf = { type: 'application/pdf', size: 2000, name: 'cartao.pdf' };
  soltar(0, [pdf]);
  soltar(0, [{ type: 'text/plain', size: 2000, name: 'invalido.txt' }]);
  soltar(0, [pdf, pdf]);
  assert.equal(inputs[0].files[0], pdf); assert.equal(avisos.length, 2);
});
