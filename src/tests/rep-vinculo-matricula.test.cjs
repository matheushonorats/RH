'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const webDir = path.join(raiz, 'output', 'RH-Modo-Seguro-Beta');
const portableHtml = fs.readFileSync(path.join(raiz, 'portable-entidade', 'app', 'renderer', 'index.html'), 'utf8');
const scriptsWeb = fs.readFileSync(path.join(webDir, 'Scripts.html'), 'utf8');
const stylesWeb = fs.readFileSync(path.join(webDir, 'Styles.html'), 'utf8');
const indexWeb = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
const repVinculosGs = fs.readFileSync(path.join(webDir, 'RepVinculosService.gs'), 'utf8');

function trecho(texto, inicio, fim) {
  const de = texto.indexOf(inicio);
  const ate = texto.indexOf(fim, de);
  assert.ok(de >= 0 && ate > de, `Trecho não encontrado: ${inicio} .. ${fim}`);
  return texto.slice(de, ate);
}

function extrairBlocoFuncao(texto, assinatura) {
  const inicio = texto.indexOf(assinatura);
  assert.ok(inicio >= 0, `Função não encontrada: ${assinatura}`);
  const abre = texto.indexOf('{', inicio);
  let profundidade = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === '{') profundidade++;
    else if (texto[i] === '}') {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }
  throw new Error(`Bloco não fechado: ${assinatura}`);
}

function criarSeletorFake() {
  return {
    _innerHTML: '',
    value: '',
    options: [],
    set innerHTML(val) {
      this._innerHTML = val;
      this.options = [];
      if (val && val.includes('<option')) {
        const match = val.match(/value="([^"]*)"[^>]*>([^<]*)</);
        if (match) this.options.push({ value: match[1], textContent: match[2] });
      }
      this.value = '';
    },
    get innerHTML() {
      return this._innerHTML;
    },
    appendChild(opt) {
      this.options.push(opt);
    }
  };
}

function criarContextoFusao(fonteHtml, backendCalls) {
  const elementos = {
    'rep-fusao-destino-nome': { textContent: '' },
    'rep-fusao-destino-pis': { textContent: '' },
    'rep-fusao-servidor': criarSeletorFake(),
    'rep-fusao-origem': criarSeletorFake()
  };
  const toasts = [];
  const modaisAbertos = [];
  const modaisFechados = [];
  const ctx = {
    Map, Set, Array, String, Number, Boolean, Date, RegExp, Error, Promise,
    dadosRepCache: {
      employees: new Map([['00112233445', 'CLAUDIO AFD']]),
      lotacoes: new Map([['00112233445', 'Relógio Centro']]),
      vinculos: new Map(),
      punchesBrutos: [{ pis: '00112233445', datetime: new Date(2026, 9, 5, 8, 0) }],
      punches: [{ pis: '00112233445', datetime: new Date(2026, 9, 5, 8, 0) }],
      fusoes: []
    },
    dadosRepProcessados: [{ pis: '00112233445', nome: 'CLAUDIO AFD' }],
    AppState: {
      servidores: [
        { nome: 'CLAUDIO HENRIQUE SANTANA SANTOS', pis: '', matricula: '780807', lotacao: 'Casa Severino Ferraz - FUNDASS', situacao: 'COMISSIONADO', status: 'ATIVO' },
        { nome: 'ANA COM PIS', pis: '12345678901', matricula: '1001', lotacao: 'Secretaria', situacao: 'ESTATUTÁRIO', status: 'Ativo' },
        { nome: 'BRUNO FERIAS', pis: '', matricula: '777', lotacao: 'Teatro', situacao: 'ESTATUTÁRIO', status: 'Férias' },
        { nome: 'INATIVO COM PIS', pis: '99999999999', matricula: '2002', lotacao: 'Arquivo', situacao: 'ESTATUTÁRIO', status: 'Inativo' },
        { nome: 'INATIVO SEM PIS', pis: '', matricula: '2003', lotacao: 'Arquivo', situacao: 'COMISSIONADO', status: 'inativo' },
        { nome: 'SEM IDENTIFICADOR', pis: '', matricula: '', lotacao: 'Arquivo', situacao: 'ESTATUTÁRIO', status: 'ATIVO' }
      ]
    },
    fusaoRepAtual: null,
    pisSelecionadoRep: '00112233445',
    document: {
      getElementById(id) { return elementos[id] || null; },
      createElement() { return { value: '', textContent: '' }; }
    },
    mostrarToast(msg, tipo) { toasts.push({ msg, tipo }); },
    abrirModal(id) { modaisAbertos.push(id); },
    fecharModal(id) { modaisFechados.push(id); },
    exibirLoader() {},
    atualizarProcessamentoRep() {},
    deduplicarBatidasRep(lista) { return lista; },
    mensagemErro(e) { return e && e.message ? e.message : String(e); },
    async chamarBackendPromessa_(fn, args) {
      backendCalls.push({ fn, args });
      return { sucesso: true };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(
    extrairBlocoFuncao(fonteHtml, 'function normalizarPisRep(') + '\n' +
    trecho(fonteHtml, 'function obterIdentificadorCartaoManualRep_(', 'function assinaturaLancamentosQueAfetamRep_(') + '\n' +
    trecho(fonteHtml, 'function abrirFusaoRep(', 'function updateDashboardRep('),
    ctx
  );
  return { ctx, elementos, toasts, modaisAbertos, modaisFechados };
}

for (const [rotulo, fonte] of [['Web', scriptsWeb], ['Portátil', portableHtml]]) {
  test(`${rotulo}: abrirFusaoRep inclui servidor ativo sem PIS via matrícula e exclui inativos`, async () => {
    const backendCalls = [];
    const { ctx, elementos, toasts, modaisAbertos } = criarContextoFusao(fonte, backendCalls);

    ctx.abrirFusaoRep('00112233445');

    assert.deepEqual(modaisAbertos, ['modal-fusao-rep']);
    assert.equal(toasts.length, 0);
    const opcoes = elementos['rep-fusao-servidor'].options.slice(1);
    const valores = opcoes.map(o => o.value);
    const textos = opcoes.map(o => o.textContent);

    assert.ok(valores.includes('MAT:780807'), 'Cláudio deve aparecer com MAT:780807');
    assert.ok(valores.includes('MAT:777'), 'Servidor em férias sem PIS deve aparecer com MAT:777');
    assert.ok(valores.includes('12345678901'), 'Servidor com PIS deve continuar aparecendo pelo PIS');
    assert.ok(!valores.includes('99999999999'), 'Servidor Inativo com PIS não deve aparecer');
    assert.ok(!valores.includes('MAT:2003'), 'Servidor inativo sem PIS não deve aparecer');
    assert.ok(!textos.some(t => t.includes('SEM IDENTIFICADOR')), 'Servidor sem PIS nem matrícula não deve aparecer');

    const textoClaudio = opcoes.find(o => o.value === 'MAT:780807').textContent;
    assert.ok(textoClaudio.includes('CLAUDIO HENRIQUE SANTANA SANTOS'));
    assert.ok(textoClaudio.includes('780807'));
    assert.ok(textoClaudio.includes('(vincular por matrícula)'));

    elementos['rep-fusao-servidor'].value = 'MAT:780807';
    await ctx.confirmarFusaoRep();

    assert.equal(backendCalls.length, 1);
    assert.equal(backendCalls[0].fn, 'salvarVinculosRep');
    assert.equal(backendCalls[0].args[0].pisOficial, 'MAT:780807');
    assert.ok(backendCalls[0].args[0].identificadores.includes('00112233445'));
    assert.ok(backendCalls[0].args[0].identificadores.includes('MAT:780807'));
    assert.equal(ctx.dadosRepCache.punches[0].pis, 'MAT:780807');
    assert.equal(ctx.dadosRepCache.punches[0].pisOriginal, '00112233445');
    assert.equal(ctx.dadosRepCache.employees.get('MAT:780807'), 'CLAUDIO HENRIQUE SANTANA SANTOS');
    assert.equal(ctx.pisSelecionadoRep, 'MAT:780807');
  });

  test(`${rotulo}: abrirFusaoRep pré-seleciona MAT ao gerenciar vínculo existente`, () => {
    const { ctx, elementos } = criarContextoFusao(fonte, []);
    ctx.dadosRepCache.employees.set('MAT:780807', 'CLAUDIO HENRIQUE SANTANA SANTOS');
    ctx.abrirFusaoRep('MAT:780807');
    assert.equal(elementos['rep-fusao-servidor'].value, 'MAT:780807');
  });

  test(`${rotulo}: preparação de cache e auditoria registram matrícula além do PIS`, () => {
    const ctx = {
      Map, Set, Array, String, Number, Boolean, Date, RegExp,
      dadosRepCache: { employees: new Map(), lotacoes: new Map(), punches: [] },
      AppState: {
        servidores: [
          { nome: 'CLAUDIO HENRIQUE SANTANA SANTOS', pis: '', matricula: '780807', lotacao: 'Casa Severino Ferraz - FUNDASS', status: 'ATIVO' },
          { nome: 'ANA COM PIS', pis: '12345678901', matricula: '1001', lotacao: 'Secretaria', status: 'ATIVO' },
          { nome: 'INATIVO TESTE', pis: '', matricula: '999', lotacao: 'Sec', status: 'Inativo' }
        ]
      },
      document: { getElementById() { return null; } },
      limparEstadoLeituraRep_() {
        ctx.dadosRepCache = { employees: new Map(), lotacoes: new Map(), punches: [] };
      },
      aplicarAjustesCompartilhadosRep_() {},
      atualizarProcessamentoRep() {}
    };
    vm.createContext(ctx);
    vm.runInContext(
      extrairBlocoFuncao(fonte, 'function normalizarPisRep(') + '\n' +
      trecho(fonte, 'function obterIdentificadorCartaoManualRep_(', 'function assinaturaLancamentosQueAfetamRep_(') + '\n' +
      extrairBlocoFuncao(fonte, 'function prepararCartoesManuaisSemAfdRep_('),
      ctx
    );
    ctx.prepararCartoesManuaisSemAfdRep_();
    assert.equal(ctx.dadosRepCache.employees.get('MAT:780807'), 'CLAUDIO HENRIQUE SANTANA SANTOS');
    assert.equal(ctx.dadosRepCache.employees.get('12345678901'), 'ANA COM PIS');

    ctx.dadosRepCache.punches = [{ pis: 'MAT:780807', datetime: new Date(2026, 9, 5, 8, 0) }];
    ctx.dadosRepCache.employees.set('MAT:780807', 'NOME ANTIGO');
    const alterou = ctx.aplicarCadastroAtualAoRep_();
    assert.equal(alterou, true);
    assert.equal(ctx.dadosRepCache.employees.get('MAT:780807'), 'CLAUDIO HENRIQUE SANTANA SANTOS');
    assert.equal(ctx.dadosRepCache.lotacoes.get('MAT:780807'), 'Casa Severino Ferraz - FUNDASS');
    assert.match(trecho(fonte, 'function renderizarAuditoriaArquivosRep(', 'let repContextoProcessamento_'), /obterIdentificadorCartaoManualRep_\(item\)/);
  });

  test(`${rotulo}: cabeçalho individual mantém vínculo apenas dentro de "Mais ações"`, () => {
    const container = {
      innerHTML: '',
      querySelector() { return null; }
    };
    const ctx = {
      Map, Set, Array, String, Number, Boolean, Date, RegExp,
      document: {
        getElementById(id) { return id === 'rep-search-input' ? { value: '' } : null; }
      },
      requestAnimationFrame() {},
      renderizarIcones() {},
      animarCartoesEspelhoRep_() {},
      adicionarBotaoPendenciasMesRep_() {},
      escapeHtml(v) { return String(v ?? ''); },
      formatHoursRep(v) { return String(Number(v || 0).toFixed(2)); },
      normalizarTextoBusca(v) { return String(v || '').toLowerCase(); },
      obterCompetenciaAtualRep_() { return '2026-10'; },
      obterConferenciaServidorRep_() { return null; },
      botaoWhatsappServidorRep_() { return ''; },
      diaAtendeFiltroRep_() { return false; },
      toDateStringRep() { return '2026-10-05'; },
      categoriaSituacaoRep(s) { return s || ''; },
      textoSituacaoRep(s) { return s || ''; },
      apontamentosRep: [],
      conferenciasServidoresRep: new Map(),
      dadosRepCache: { punches: [] },
      AppState: {
        servidores: [
          { nome: 'CLAUDIO HENRIQUE SANTANA SANTOS', pis: '', matricula: '780807', cargo: 'Assessor', situacao: 'COMISSIONADO', lotacao: 'FUNDASS' }
        ]
      },
      modoAgrupamentoRep: 'lista',
      buscaRepAguardandoSelecao_: false,
      pisSelecionadoRep: '00112233445',
      filtroDiasRepAtual: 'todos',
      gruposExpandidosSidebarRep: new Set(),
      rolagemPessoasRep: 0
    };
    vm.createContext(ctx);
    vm.runInContext(
      extrairBlocoFuncao(fonte, 'function normalizarPisRep(') + '\n' +
      trecho(fonte, 'function obterIdentificadorCartaoManualRep_(', 'function assinaturaLancamentosQueAfetamRep_(') + '\n' +
      extrairBlocoFuncao(fonte, 'function obterServidorCadastroRep_(') + '\n' +
      trecho(fonte, 'function definirFiltroDiasRep(', 'function renderizarPainelRep(') + '\n' +
      trecho(fonte, 'function renderizarPainelRep(', 'function mudarPaginaRep('),
      ctx
    );

    const resumoBase = { horasExtras: 0, valeRefeicao: 0, horasDevidas: 0, pendencias: 0, saldoDisponivelCompensacao: 0, horasRetiradasCompensacao: 0 };
    ctx.renderizarPainelRep([{ pis: '00112233445', nome: 'CLAUDIO AFD', lotacao: 'Relógio', dias: [], resumo: resumoBase }], container);

    const controleMatch = container.innerHTML.match(/<div class="rep-controle-vinculo">([\s\S]*?)<details class="rep-menu-dia rep-menu-servidor">/);
    assert.ok(controleMatch, 'Bloco .rep-controle-vinculo encontrado');
    assert.ok(!controleMatch[1].includes('Vincular cadastro'), 'Não deve renderizar botão externo duplicado "Vincular cadastro"');
    assert.ok(container.innerHTML.includes('>Vincular ao cadastro / unir</button>'), 'Deve manter opção dentro de "Mais ações"');

    ctx.pisSelecionadoRep = 'MAT:780807';
    ctx.renderizarPainelRep([{ pis: 'MAT:780807', nome: 'CLAUDIO HENRIQUE SANTANA SANTOS', lotacao: 'FUNDASS', dias: [], resumo: resumoBase }], container);
    assert.ok(container.innerHTML.includes('<span class="rep-vinculo-confirmado">Cadastro associado</span>'));
    assert.ok(container.innerHTML.includes('>Gerenciar vínculo / unir outro</button>'));
    assert.ok(!fonte.includes('const controleVinculo ='), 'Variável morta controleVinculo removida');
  });
}

test('RepVinculosService.gs aceita matrícula (MAT:) no backend sem alterar Servidores e protege colunas texto', () => {
  const formatosChamados = [];
  const linhas = [];
  const servidoresMock = [
    { nome: 'CLAUDIO HENRIQUE SANTANA SANTOS', pis: '', matricula: '780807', lotacao: 'Casa Severino Ferraz - FUNDASS', status: 'ATIVO' },
    { nome: 'ANA COM PIS', pis: '12345678901', matricula: '0042', lotacao: 'Secretaria', status: 'ATIVO' }
  ];
  const abaMock = {
    getLastRow() { return 1 + linhas.length; },
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          return linhas.slice(row - 2, row - 2 + numRows).map(l => l.slice(col - 1, col - 1 + numCols));
        },
        setNumberFormat(fmt) {
          formatosChamados.push({ row, col, numRows, numCols, fmt });
        },
        setValues(vals) {
          vals.forEach((v, idx) => {
            linhas[row - 2 + idx] = v;
          });
        }
      };
    }
  };
  let released = 0;
  const ctx = {
    Map, Set, Array, String, Date, RegExp, Error,
    obterPlanilha_() {
      return {
        getSheetByName() { return abaMock; },
        insertSheet() { return abaMock; }
      };
    },
    obterListaServidores() { return servidoresMock; },
    obterDadosUsuarioLogado() { return { email: 'rh@teste.gov.br' }; },
    obterLockMutacaoBeta_() { return { tryLock() { return true; }, releaseLock() { released++; } }; }
  };
  vm.createContext(ctx);
  vm.runInContext(repVinculosGs, ctx);

  const resMat = ctx.salvarVinculosRep({ identificadores: ['00112233445', 'mat:780807'], pisOficial: 'MAT:780807' });
  assert.equal(resMat.sucesso, true);
  assert.equal(resMat.pisOficial, 'MAT:780807');
  assert.equal(resMat.matricula, '780807');
  assert.equal(resMat.nome, 'CLAUDIO HENRIQUE SANTANA SANTOS');
  assert.equal(released, 1);
  assert.deepEqual(formatosChamados[0], { row: 2, col: 1, numRows: 2, numCols: 3, fmt: '@' });
  assert.equal(linhas[0][1], 'MAT:780807');

  const listados = ctx.listarVinculosRep();
  assert.equal(listados.length, 2);
  assert.deepEqual(listados[0].pisOficial, 'MAT:780807');
  assert.deepEqual(listados[0].identificador, '00112233445');

  const resAtualizado = ctx.salvarVinculosRep({ identificadores: ['00112233445'], pisOficial: 'MAT:780807' });
  assert.equal(resAtualizado.sucesso, true);
  assert.deepEqual(formatosChamados[1], { row: 2, col: 1, numRows: 1, numCols: 3, fmt: '@' });

  const resPis = ctx.salvarVinculosRep({ identificadores: ['99988877766'], pisOficial: '12345678901' });
  assert.equal(resPis.pisOficial, '12345678901');
  assert.equal(resPis.matricula, '0042');

  assert.throws(
    () => ctx.salvarVinculosRep({ identificadores: ['111'], pisOficial: 'MAT:000000' }),
    /identificador oficial \(PIS ou matrícula\) não foi encontrado/
  );
});

test('Estilos do menu "Mais ações" e texto do modal atualizados na Web e Portátil', () => {
  for (const css of [stylesWeb, portableHtml]) {
    assert.ok(css.includes('.rep-controle-vinculo>.rep-unir-registros'), 'Regra de 26px deve atingir apenas botões filhos diretos');
    assert.ok(!css.includes('.rep-controle-vinculo .rep-unir-registros{'), 'Não deve aplicar height:26px para descendentes dentro de "Mais ações"');
    assert.ok(css.includes('.rep-controle-vinculo .rep-menu-servidor>div .rep-unir-registros{display:flex;align-items:center;justify-content:flex-start;width:100%;height:auto;min-height:30px'), 'Menu dropdown deve permitir altura automática sem transbordar');
  }
  assert.ok(indexWeb.includes('PIS/CPF ou matrícula'));
  assert.ok(portableHtml.includes('PIS/CPF ou matrícula'));
});
