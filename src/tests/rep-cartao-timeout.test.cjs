'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta');
const ai = fs.readFileSync(path.join(root, 'AIService.gs'), 'utf8');
const visao = fs.readFileSync(path.join(root, 'RepCartaoIAService.gs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'RepEnhancements.html'), 'utf8');
test('espera da rede respeita prazo restante e não repete tentativa de cartão', () => {
  let chamadas = 0;
  const ctx = { Date: { now: () => 1000 },
    reservarCotaTentativaEntidade_: () => ({ autorizado: true }),
    registrarTelemetriaTentativaEntidade_() {}, Utilities: { sleep() { assert.fail('não repetir'); } },
    UrlFetchApp: { fetch(_, opts) { chamadas++; assert.equal(opts.timeoutSeconds, 35); throw new Error('Request timed out SECRET'); } }
  };
  vm.createContext(ctx);
  vm.runInContext(ai.slice(ai.indexOf('function executarRequisicaoEntidade_('), ai.indexOf('function normalizarComandosRespostaEntidade_(')), ctx);
  const r = ctx.executarRequisicaoEntidade_({ nome: 'Gemini', maxTentativas: 1, timeoutSeconds: 75, prazoExecucao: 51000 }, {}, {}, 100, 8192);
  assert.equal(chamadas, 1);
  assert.match(r.motivo, /não respondeu.*prazo/);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
});
function contextoVisao(avanço) {
  let agora = 0;
  const pedidos = [];
  const ctx = { Date: { now: () => agora }, obterPrimeiraConfigCartaoIA_: () => 'chave-teste',
    obterConfigValorInterno_: () => '', Logger: { log() {} }, descreverFalhaCartaoIA_: nome => nome + ': prazo excedido',
    executarRequisicaoEntidade_: provedor => {
      pedidos.push(provedor.nome);
      assert.equal(provedor.timeoutSeconds, provedor.nome === 'Gemini' ? 35 : 75);
      assert.equal(provedor.maxTentativas, 1);
      agora += avanço;
      return { ok: false, motivo: 'prazo excedido' };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(visao.slice(visao.indexOf('function chamarVisaoCartaoIA_('), visao.indexOf('function analisarCartaoPontoManualIA(')), ctx);
  return { ctx, pedidos };
}
test('timeout segue alternativas com apenas uma tentativa por provedor', () => {
  const { ctx, pedidos } = contextoVisao(35000);
  assert.throws(() => ctx.chamarVisaoCartaoIA_('Transcreva', [{ mimeType: 'image/jpeg', base64: 'AAAA' }]), /leitura não foi concluída/);
  assert.deepEqual(pedidos, ['Gemini', 'Gemini', 'Gemini', 'Gemini', 'Groq', 'OpenRouter']);
});
test('prazo global impede iniciar contingência sem margem para resposta', () => {
  const { ctx, pedidos } = contextoVisao(230000);
  assert.throws(() => ctx.chamarVisaoCartaoIA_('Transcreva', [{ mimeType: 'image/jpeg', base64: 'AAAA' }]), /prazo seguro/);
  assert.deepEqual(pedidos, ['Gemini']);
});
test('feedback de espera termina em sucesso e erro, preservando arquivos na falha', async () => {
  for (const falhar of [false, true]) {
    let limpos = 0;
    const elementos = {
      'modal-lancamentos-lote-rep': { dataset: { competencia: '2026-09' } },
      'rep-cartao-ia-frente': { files: [{ type: 'image/jpeg' }], value: 'frente.jpg' },
      'rep-cartao-ia-verso': { files: [{ type: 'image/jpeg' }], value: 'verso.jpg' },
      'rep-cartao-ia-analisar': { disabled: false }, 'rep-cartao-ia-status': { isConnected: true }
    };
    const ctx = { document: { getElementById: id => elementos[id] },
      prepararArquivoCartaoIA_: async () => ({ mimeType: 'image/jpeg', base64: 'AAAA' }),
      registrarAtividadeSegundoPlano_() {}, mostrarToast() {}, atualizarArquivoCartaoIA_() {}, mensagemErro: e => e.message,
      aplicarLeituraCartaoIA_: () => ({ preenchidas: 6, incertas: 0 }),
      setInterval: fn => { fn(); return 1; }, clearInterval: () => { limpos++; },
      backendApi: () => { const api = { withSuccessHandler(fn) { this.sucesso = fn; return this; },
        withFailureHandler(fn) { this.erro = fn; return this; }, analisarCartaoPontoManualIA() { falhar ? this.erro(new Error('Tempo de espera excedido')) : this.sucesso({ dias: [{ dia: 1, marcacoes: ['08:00'] }] }); } }; return api; }
    };
    vm.createContext(ctx);
    vm.runInContext(html.slice(html.indexOf('async function analisarCartaoManualIA_('), html.indexOf('function adicionarLinhaCompensacaoLoteRep_(')), ctx);
    await ctx.analisarCartaoManualIA_();
    assert.equal(limpos, 1);
    assert.equal(elementos['rep-cartao-ia-analisar'].disabled, false);
    assert.equal(elementos['rep-cartao-ia-frente'].value, falhar ? 'frente.jpg' : '');
  }
});

test('retry reaproveita frente concluída e só reenvia o verso que falhou', async () => {
  const pedidos = [], aplicados = [];
  let falhou = false;
  const elementos = {
    'modal-lancamentos-lote-rep': { dataset: { competencia: '2026-09', pis: '123' } },
    'rep-cartao-ia-frente': { files: [{ type: 'image/jpeg' }], value: 'frente.jpg' },
    'rep-cartao-ia-verso': { files: [{ type: 'image/jpeg' }], value: 'verso.jpg' },
    'rep-cartao-ia-analisar': {}, 'rep-cartao-ia-status': { isConnected: true }
  };
  const ctx = { document: { getElementById: id => elementos[id] }, prepararArquivoCartaoIA_: async () => ({ mimeType: 'image/jpeg', base64: 'AAAA' }),
    registrarAtividadeSegundoPlano_() {}, mostrarToast() {}, atualizarArquivoCartaoIA_() {}, mensagemErro: e => e.message,
    aplicarLeituraCartaoIA_: resultado => { aplicados.push(resultado); return { preenchidas: 2 }; }, setInterval: () => 1, clearInterval() {},
    backendApi: () => { const api = { withSuccessHandler(fn) { this.sucesso = fn; return this; }, withFailureHandler(fn) { this.erro = fn; return this; },
      analisarCartaoPontoManualIA(dados) { pedidos.push(dados.parte); assert.equal(dados.arquivos.length, 1);
        if (dados.parte === 'verso' && !falhou) { falhou = true; this.erro(new Error('Timeout')); }
        else this.sucesso({ dias: [{ dia: dados.parte === 'frente' ? 1 : 16 }], avisos: [] }); }
    }; return api; }
  };
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('async function analisarCartaoManualIA_('), html.indexOf('function adicionarLinhaCompensacaoLoteRep_(')), ctx);
  await ctx.analisarCartaoManualIA_(); assert.equal(aplicados.length, 0);
  await ctx.analisarCartaoManualIA_();
  assert.deepEqual(pedidos, ['frente', 'verso', 'verso']);
  assert.equal(aplicados.length, 1);
  assert.deepEqual(Array.from(aplicados[0].dias, d => d.dia), [1,16]);
  assert.equal(elementos['modal-lancamentos-lote-rep']._leituraParcialCartaoIA, undefined);
});

test('leitura parcial valida face, respeita dias do mês e permite face vazia', () => {
  let retornoDias = [{ dia: 1, marcacoes: ['08:00'] }, { dia: 16, marcacoes: ['08:00'] }, { dia: 31, marcacoes: ['08:00'] }];
  const ctx = { obterDadosUsuarioLogado() {}, verificarSeEhOperador: () => true, normalizarCabecalho_: v => String(v).toUpperCase(),
    extrairConteudoRespostaIA_: v => v, normalizarJsonRespostaIA_: JSON.parse, lancarLog() {} };
  vm.createContext(ctx); vm.runInContext(visao, ctx);
  ctx.chamarVisaoCartaoIA_ = (_, arquivos) => { assert.equal(arquivos.length, 1); return { dados: { choices: [{ message: { content: JSON.stringify({ dias: retornoDias }) } }] }, provedor: 'Gemini' }; };
  const dados = { competencia: '2026-09', parte: 'verso', arquivos: [{ lado: 'verso', mimeType: 'image/jpeg', base64: 'A'.repeat(2000) }] };
  assert.deepEqual(Array.from(ctx.analisarCartaoPontoManualIA(dados).dias, d => d.dia), [16]);
  retornoDias = [];
  assert.equal(ctx.analisarCartaoPontoManualIA(dados).dias.length, 0);
  assert.throws(() => ctx.analisarCartaoPontoManualIA({ ...dados, parte: 'invalida' }), /inválida/);
});

test('configurações são lidas uma vez e chave segura prevalece, mesmo sem planilha', () => {
  for (const indisponivel of [false,true]) {
    let leituras = 0;
    const ctx = { PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({ GEMINI_API_KEY: 'segredo-servidor' }) }) },
      obterPlanilha_: () => { leituras++; if (indisponivel) throw new Error('offline'); return { getSheetByName: () => ({ getDataRange: () => ({ getValues: () => [['chave','valor'], ['GEMINI_API_KEY','antiga'], ['GROQ_MODEL','modelo']] }) }) }; }, Logger: { log() {} } };
    vm.createContext(ctx);
    vm.runInContext(ai.slice(ai.indexOf('var configEntidadeExecucao_'), ai.indexOf('function testarPermissao(')), ctx);
    assert.equal(ctx.obterConfigValorInterno_('GEMINI_API_KEY'), 'segredo-servidor');
    assert.equal(ctx.obterConfigValorInterno_('GROQ_MODEL'), indisponivel ? '' : 'modelo');
    assert.equal(ctx.obterConfigValorInterno_('NAO_EXISTE'), '');
    assert.equal(leituras, 1);
  }
});
