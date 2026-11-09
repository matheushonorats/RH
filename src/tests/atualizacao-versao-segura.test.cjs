'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta');
const src = fs.readFileSync(path.join(root, 'Scripts.html'), 'utf8');
function contexto(pendente, formulario) {
  const attrs = {}, classes = [], avisos = [];
  const botao = { href: '#', classList: { add: c => classes.push(c) }, setAttribute: (k,v) => { attrs[k] = v; } };
  const ctx = { versaoAtualizacaoPendente_: '1.17', existemGravacoesPendentes_: () => pendente,
    document: { body: { dataset: { appVersion: '1.16', appUrl: 'https://script.google.com/macros/s/exemplo/exec' } }, getElementById: id => id === 'botao-versao-app' ? botao : null, querySelector: () => formulario ? {} : null },
    mostrarToast: msg => avisos.push(msg) };
  vm.createContext(ctx);
  vm.runInContext(src.slice(src.indexOf('function atualizarAvisoVersaoPendente_('), src.indexOf('function atualizarVersaoAberta_(')), ctx);
  return { ctx, botao, attrs, classes, avisos };
}
test('nova versão destaca apenas o botão, sem navegação ou tela bloqueadora', () => {
  const { ctx, botao, classes } = contexto(false, false);
  ctx.atualizarAvisoVersaoPendente_();
  assert.match(botao.textContent, /Atualizar.*1.17/);
  assert.ok(classes.includes('versao-atualizacao-disponivel'));
  assert.equal(botao.href, '#');
});
test('clique bloqueia recarga com fila ou formulário aberto e não apaga dados', () => {
  for (const [pendente, formulario] of [[true,false], [false,true]]) {
    const { ctx, botao, avisos } = contexto(pendente, formulario);
    let bloqueou = false;
    ctx.solicitarAtualizacaoSegura_({ preventDefault() { bloqueou = true; } }, botao);
    assert.equal(bloqueou, true);
    assert.equal(botao.href, '#');
    assert.equal(avisos.length, 1);
  }
});
test('clique sem pendência usa link público no topo, sem reload de iframe', () => {
  const { ctx, botao } = contexto(false, false);
  ctx.solicitarAtualizacaoSegura_({ preventDefault() { assert.fail('navegação segura permitida'); } }, botao);
  assert.equal(botao.href, 'https://script.google.com/macros/s/exemplo/exec');
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /id="botao-versao-app"[^>]*target="_top"/);
});
