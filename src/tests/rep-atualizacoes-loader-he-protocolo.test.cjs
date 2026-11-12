'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const web = path.join(raiz, 'output/RH-Modo-Seguro-Beta');
const portatil = path.join(raiz, 'portable-entidade/app');
const XLSX = require(path.join(portatil, 'renderer/vendor/xlsx.full.min.js'));

const ler = nome => fs.readFileSync(nome, 'utf8');
const scriptsWeb = ler(path.join(web, 'Scripts.html')).replace(/\r\n/g, '\n');
const stylesWeb = ler(path.join(web, 'Styles.html')).replace(/\r\n/g, '\n');
const enhWeb = ler(path.join(web, 'RepEnhancements.html')).replace(/\r\n/g, '\n');
const htmlPortatil = ler(path.join(portatil, 'renderer/index.html')).replace(/\r\n/g, '\n');
const heWeb = ler(path.join(web, 'RepHorasExtras.html')).replace(/\r\n/g, '\n');
const hePortatil = htmlPortatil.split('<!-- INICIO RELATORIO MENSAL HE -->')[1].split('<!-- FIM RELATORIO MENSAL HE -->')[0];
const heModelo = ler(path.join(web, 'RepHorasExtrasAssets.html')).replace(/<\/?script>/g, '');

function trechoEntre(texto, inicio, fim) {
  const a = texto.indexOf(inicio);
  const b = fim ? texto.indexOf(fim, a) : texto.length;
  assert.ok(a >= 0, 'Início não encontrado: ' + inicio);
  assert.ok(b > a, 'Fim não encontrado: ' + fim);
  return texto.slice(a, b);
}

function escapeHtmlBasico(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function criarElementoSimulado(tag, props) {
  const classes = new Set();
  const attrs = {};
  const styleMap = {};
  let innerHTMLVal = '';
  let textContentVal = '';
  const children = [];
  const el = Object.assign({
    tagName: tag || 'DIV',
    hidden: false,
    inert: false,
    disabled: false,
    checked: true,
    dataset: {},
    style: new Proxy(styleMap, {
      get(t, k) {
        if (k === 'setProperty') return (prop, val) => { styleMap[prop] = val; };
        if (k === 'getPropertyValue') return prop => styleMap[prop] || '';
        return t[k] || '';
      },
      set(t, k, v) { t[k] = v; return true; }
    }),
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      contains: c => classes.has(c)
    },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: k => attrs[k] || null,
    removeAttribute: k => { delete attrs[k]; },
    append: (...n) => children.push(...n),
    querySelector: () => null,
    querySelectorAll: () => []
  }, props || {});
  Object.defineProperty(el, 'innerHTML', {
    get: () => innerHTMLVal,
    set: v => { innerHTMLVal = String(v || ''); }
  });
  Object.defineProperty(el, 'textContent', {
    get: () => textContentVal,
    set: v => { textContentVal = String(v || ''); }
  });
  return el;
}

test('CSS do loader REP usa bolinhas circulares com efeito de água verde ao concluir na Web e Portátil', () => {
  for (const fonte of [stylesWeb, htmlPortatil]) {
    assert.match(fonte, /\.loader-afd-bolha\{[^}]*border-radius:50%/);
    assert.match(fonte, /\.loader-afd-bolha i\{[^}]*height:var\(--afd-fill,0%\)/);
    assert.match(fonte, /@keyframes afd-onda/);
    assert.match(fonte, /\.loader-afd-dot\.concluido \.loader-afd-bolha i\{height:100% !important/);
    assert.match(fonte, /#global-loader\.rep-loader-previa \.loader-card\{/);
  }
});

for (const [versao, fonte] of [['web', scriptsWeb], ['portatil', htmlPortatil]]) {
  test(versao + ': loader AFD identifica local, mantém janela fixa sem pular e libera espelho progressivamente', () => {
    const loaderEl = criarElementoSimulado('DIV');
    const progressEl = criarElementoSimulado('DIV');
    const uploadZoneEl = criarElementoSimulado('DIV');
    const resultsEl = criarElementoSimulado('DIV');
    const listEl = criarElementoSimulado('DIV');

    const dotsSimulados = {};
    progressEl.querySelectorAll = () => [];

    const blocoLoader = trechoEntre(fonte, 'function iniciarProgressoAfdsLoader_(', 'function limparProgressoAfdsLoader_(')
      + 'function limparProgressoAfdsLoader_() {}';
    const blocoLocal = trechoEntre(fonte, 'function chaveArquivoLocalRep_(', 'let dadosRepProcessados');
    const blocoPrevia = enhWeb.slice(enhWeb.indexOf('function atualizarPreviaLeituraRep_(')).replace(/<\/script>[\s\S]*$/i, '');

    let chamadasAtualizacao = 0;
    const elementsById = {
      'global-loader': loaderEl,
      'loader-afd-progress': progressEl,
      'rep-upload-zone': uploadZoneEl,
      'rep-results-container': resultsEl,
      'rep-servidores-list': listEl
    };

    const ctx = {
      currentView: 'pre-leitura-rep',
      dadosRepCache: { punches: [{ pis: '1' }], employees: new Map([['1', 'Servidor A']]) },
      escapeHtml: escapeHtmlBasico,
      atualizarProcessamentoRep: opts => {
        chamadasAtualizacao++;
        assert.equal(opts.notificarEntidade, false);
      },
      document: {
        getElementById: id => elementsById[id] || null,
        createElement: tag => criarElementoSimulado(tag),
        addEventListener: () => {},
        querySelector: sel => {
          const m = String(sel).match(/data-indice="(\d+)"/);
          return m ? (dotsSimulados[m[1]] || null) : null;
        }
      }
    };
    vm.createContext(ctx);
    vm.runInContext(blocoLocal + '\n' + blocoLoader + '\n' + blocoPrevia, ctx);

    const linhaTipo1 = '0000000001' + ' '.repeat(179) + '00001000020003456' + ' '.repeat(110);
    const linhaTipo2 = '0000000012' + '2026-10-01T08:00:00-0300'.padEnd(217, ' ') + 'Teatro Municipal Mario Covas'.padEnd(100, ' ');
    const info = ctx.extrairLocalInicialTextoAfdRep_(linhaTipo1 + '\n' + linhaTipo2);
    assert.equal(info.numeroRep, '00001000020003456');
    assert.equal(info.localOriginal, 'Teatro Municipal Mario Covas');

    ctx.locaisEditadosRep = [
      { arquivoChave: 'ARQUIVO_ID:drv-1', localOriginal: 'Teatro Original', localExibido: 'Teatro Editado' },
      { arquivoChave: 'REP:999|ARQUIVO:AFD_GALPAO.TXT', localOriginal: 'Galpão Bruto', localExibido: 'Galpão SETUR' }
    ];
    assert.equal(ctx.resolverLocalAfdLoader_({ id: 'drv-1', nome: 'AFD_MUITO_GRANDE_001.txt' }, 'Teatro Original', ''), 'Teatro Editado');
    assert.equal(ctx.resolverLocalAfdLoader_({ nome: 'afd_galpao.txt' }, '', ''), 'Galpão SETUR');
    assert.equal(ctx.resolverLocalAfdLoader_({ nome: 'afd_balneario_sul.txt' }, 'Balneário Sul', '12345'), 'Balneário Sul');

    ctx.iniciarProgressoAfdsLoader_([{ id: 'drv-1', nome: 'AFD_MUITO_GRANDE_001.txt' }, { nome: 'afd_galpao.txt' }]);
    assert.ok(loaderEl.classList.contains('rep-loader-previa'), 'loader deve iniciar fixo no canto sem teleporte');
    assert.ok(progressEl.innerHTML.includes('loader-afd-bolha'));
    assert.ok(progressEl.innerHTML.includes('Teatro Editado'));
    assert.ok(progressEl.innerHTML.includes('Galpão SETUR'));

    const localSpan = criarElementoSimulado('SMALL');
    const estadoSpan = criarElementoSimulado('EM');
    const bolhaSpan = criarElementoSimulado('SPAN');
    const dotMock = criarElementoSimulado('SPAN');
    dotMock.querySelector = sel => {
      if (sel === '.loader-afd-bolha') return bolhaSpan;
      if (sel === '.loader-afd-local') return localSpan;
      if (sel === '.loader-afd-estado' || sel === 'em') return estadoSpan;
      return null;
    };
    dotsSimulados['0'] = dotMock;

    ctx.atualizarProgressoAfdLoader_(0, 'carregando', 'AFD_0.txt', { progresso: 42, local: 'Casa da Cultura' });
    assert.equal(dotMock.style.getPropertyValue('--afd-fill'), '42%');
    assert.equal(localSpan.textContent, 'Casa da Cultura');
    assert.equal(estadoSpan.textContent, '42%');

    ctx.atualizarProgressoAfdLoader_(0, 'concluido', 'AFD_0.txt');
    assert.ok(dotMock.classList.contains('concluido'));
    assert.equal(dotMock.style.getPropertyValue('--afd-fill'), '100%');
    assert.equal(estadoSpan.textContent, 'Concluído');

    ctx.atualizarPreviaLeituraRep_(1, 2, 'Casa da Cultura');
    assert.equal(uploadZoneEl.style.display, 'none');
    assert.equal(resultsEl.style.display, 'block');
    assert.equal(listEl.inert, true);
    assert.equal(chamadasAtualizacao, 1);
  });
}

for (const [versao, fonteHe] of [['web', heWeb], ['portatil', hePortatil]]) {
  test(versao + ': relatório HE pré-marca elegíveis, permite desmarcar e filtra Excel e PDF', async () => {
    const checkboxes = [];
    const checkAll = { checked: true };
    const resumoEl = { textContent: '' };
    const modalEl = { hidden: false };
    const tituloEl = { textContent: '' };
    const corpoEl = { innerHTML: '' };
    let impressaoHtml = '';
    let workbookExportado = null;

    const pessoasLista = [
      { pis: '1', dias: [{ dataOriginal: '2026-09-01', extraDia: 3 }] },
      { pis: '2', dias: [{ dataOriginal: '2026-09-01', extraDia: 5 }] },
      { pis: '3', dias: [{ dataOriginal: '2026-09-01', extraDia: 8 }] } // comissionado (não entra)
    ];

    const ctx = {
      Date, Set, Map, Math, XLSX,
      window: {},
      repOnlineCarregando: false,
      falhasIntegridadeRep: [],
      repTemAlteracoesPendentes_: () => false,
      conferenciasRep: ['1', '2', '3'].map(pis => ({ pis, competencia: '2026-09', conferido: true })),
      obterServidorPorIdentificadorRep_: pis => ({
        matricula: 'M-' + pis,
        pis,
        cargo: pis === '3' ? 'Assessor Comissionado' : 'Auxiliar',
        nome: 'Servidor ' + pis,
        situacao: pis === '3' ? 'Comissionado' : 'Estatutário'
      }),
      normalizarPisRep: String,
      escapeHtml: escapeHtmlBasico,
      minutosParaHoraRep_: n => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'),
      obterCompetenciaAtualRep_: () => '2026-09',
      obterServidoresCompetenciaRelatorioAlertasRep_: () => pessoasLista,
      chamarBackendPromessa_: async metodo => metodo === 'obterListaServidores'
        ? ['1', '2', '3'].map(ctx.obterServidorPorIdentificadorRep_)
        : ctx.conferenciasRep,
      mostrarToast: () => {},
      mensagemErro: err => String(err && err.message || err || ''),
      abrirModal: () => {},
      document: {
        getElementById: id => ({
          'rep-he-modal': modalEl,
          'rep-he-titulo': tituloEl,
          'rep-he-previa': corpoEl,
          'rep-he-check-all': checkAll,
          'rep-he-resumo-selecao': resumoEl,
          'rep-he-ignorar-conferencia': { checked: false }
        }[id] || null),
        querySelectorAll: sel => sel.includes('data-rep-he-check') ? checkboxes : []
      }
    };
    const origOpen = ctx.window.open = () => ({
      document: {
        open: () => {},
        write: html => { impressaoHtml = String(html); },
        close: () => {}
      },
      focus: () => {},
      close: () => {}
    });
    assert.ok(origOpen);
    ctx.XLSX = Object.assign({}, XLSX, {
      writeFile: livro => { workbookExportado = livro; }
    });

    vm.createContext(ctx);
    vm.runInContext(heModelo, ctx);
    vm.runInContext(fonteHe.replace(/<\/?script>/g, ''), ctx);

    await ctx.atualizarPreviaRelatorioMensalHeRep_();
    assert.ok(corpoEl.innerHTML.includes('id="rep-he-check-all"'));
    assert.ok(corpoEl.innerHTML.includes('data-rep-he-check'));
    assert.ok(corpoEl.innerHTML.includes('Não entram no relatório (1)'));

    checkboxes.push(
      { checked: true, value: '1' },
      { checked: true, value: '2' }
    );
    ctx.atualizarSelecaoRelatorioHe_();
    assert.equal(resumoEl.textContent, 'Setembro de 2026 · 2 de 2 servidor(es) selecionado(s) · 8:00 horas');

    // Desmarca Servidor 2
    checkboxes[1].checked = false;
    ctx.atualizarSelecaoRelatorioHe_();
    assert.equal(checkAll.checked, false);
    assert.equal(resumoEl.textContent, 'Setembro de 2026 · 1 de 2 servidor(es) selecionado(s) · 3:00 horas');

    await ctx.exportarRelatorioMensalHeRep_('pdf');
    assert.ok(impressaoHtml.includes('Servidor 1'));
    assert.ok(!impressaoHtml.includes('Servidor 2'));
    assert.ok(!impressaoHtml.includes('Servidor 3'));
    assert.ok(impressaoHtml.includes('3:00'));

    await ctx.exportarRelatorioMensalHeRep_('excel');
    const folha = workbookExportado.Sheets[workbookExportado.SheetNames[0]];
    const celulasTexto = Object.values(folha).map(c => String(c && c.v || '')).join(' ');
    assert.ok(celulasTexto.includes('Servidor 1'));
    assert.ok(!celulasTexto.includes('Servidor 2'));

    checkboxes[0].checked = false;
    let erroToast = '';
    ctx.mostrarToast = msg => { erroToast = msg; };
    await ctx.exportarRelatorioMensalHeRep_('pdf');
    assert.match(erroToast, /Selecione ao menos um servidor elegível/);
  });
}

test('Folha de Protocolo usa layout compacto e exibe alertas de ausência simultânea no mesmo setor', () => {
  const protCode = ler(path.join(web, 'ProtocolosService.gs'));
  const lancCode = ler(path.join(web, 'LancamentosService.gs'));

  const linhasServidores = [
    ['Matrícula', 'Nome', 'Cargo', 'Lotação', 'Status', 'PIS'],
    ['101', 'Ana Paula', 'Escriturário', 'Secretaria de Turismo', 'Ativo', ''],
    ['102', 'Bruno Silva', 'Assistente', 'Secretaria de Turismo', 'Ativo', ''],
    ['103', 'Carla Souza', 'Auxiliar', 'Casa da Cultura', 'Ativo', ''],
    ['104', 'Diego Reis', 'Técnico', 'Secretaria de Turismo', 'Ativo', '']
  ];
  const linhasProtocolos = [
    ['ID', 'Data', 'Status', 'Obs', 'CriadoPor'],
    ['PROT-2026-009', new Date('2026-10-05T12:00:00'), 'Gerado', '', 'Matheus']
  ];
  // Colunas Lançamentos compatíveis com obterIndicesColunasLancamentos_ + obterLancamentosVinculados
  const linhasLancamentos = [
    ['Data Cadastro', 'Matrícula', 'Nome', 'Tipo', 'Data Início', 'Dias', 'Retorno', 'Observação', 'ID_Protocolo', 'Status', 'Despacho', 'Dias Pecúnia', 'Qtd Horas'],
    [new Date('2026-10-01'), '101', 'Ana Paula', 'Férias', new Date('2026-10-10T12:00:00'), 10, new Date('2026-10-20T12:00:00'), '', 'PROT-2026-009', 'Ativo', '', 0, ''],
    [new Date('2026-10-02'), '102', 'Bruno Silva', 'Falta Abonada', new Date('2026-10-12T12:00:00'), 1, new Date('2026-10-13T12:00:00'), '', 'PROT-2026-009', 'Ativo', '', 0, ''],
    // Mesmo setor em outro protocolo: deve gerar alerta
    [new Date('2026-10-02'), '104', 'Diego Reis', 'Falta Abonada', new Date('2026-10-15T12:00:00'), 1, new Date('2026-10-16T12:00:00'), '', 'PROT-2026-008', 'Ativo', '', 0, ''],
    // Outro setor: não deve gerar alerta
    [new Date('2026-10-02'), '103', 'Carla Souza', 'Férias', new Date('2026-10-10T12:00:00'), 15, new Date('2026-10-25T12:00:00'), '', '', 'Ativo', '', 0, '']
  ];

  const sheets = {
    Protocolos: {
      getDataRange: () => ({ getValues: () => linhasProtocolos })
    },
    'Lançamentos': {
      getLastRow: () => linhasLancamentos.length,
      getDataRange: () => ({ getValues: () => linhasLancamentos })
    }
  };
  const ss = { getSheetByName: nome => sheets[nome] || null };

  const ctx = {
    Date, Math, Set, Map, JSON, RegExp, Error,
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    Utilities: {
      formatDate: (d) => {
        const dt = new Date(d);
        return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0') + '/' + dt.getFullYear();
      }
    },
    obterPlanilha_: () => ss,
    obterValoresAba_: aba => aba.getDataRange().getValues(),
    indiceCabecalho_: (cab, nomes) => {
      const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
      const mapa = cab.map(norm);
      for (const n of nomes || []) {
        const idx = mapa.indexOf(norm(n));
        if (idx !== -1) return idx;
      }
      return -1;
    },
    obterDadosUsuarioLogado: () => ({ nome: 'Operador', perfil: 'ADMIN' }),
    verificarSeEhOperador: () => true,
    normalizarCabecalho_: s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(),
    normalizarChaveMatricula_: s => String(s || '').trim().toUpperCase(),
    lerDataFormatoBR_: str => {
      const m = String(str || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0) : null;
    },
    obterListaServidoresInterno_: () => linhasServidores.slice(1).map(r => ({
      matricula: r[0], nome: r[1], cargo: r[2], lotacao: r[3], status: r[4], pis: r[5]
    }))
  };

  vm.createContext(ctx);
  vm.runInContext(lancCode, ctx);
  vm.runInContext(protCode, ctx);

  const html = ctx.obterHtmlFolhaProtocolo('PROT-2026-009');
  assert.match(html, /font-size:\s*11px/);
  assert.match(html, /padding:\s*4px 6px/);
  assert.match(html, /Alertas de ausência simultânea na mesma lotação \(2\)/);
  assert.match(html, /font-size:\s*9\.5px/);
  assert.ok(html.includes('Secretaria de Turismo'));
  assert.ok(html.includes('Ana Paula'));
  assert.ok(html.includes('Bruno Silva'));
  assert.ok(html.includes('Diego Reis'));
  assert.ok(!html.includes('Carla Souza'));
  // Par recíproco Ana x Bruno deve aparecer apenas 1 vez (deduplicado)
  const ocorrenciasAnaBruno = html.split(/Ana Paula.*Bruno Silva|Bruno Silva.*Ana Paula/).length - 1;
  assert.equal(ocorrenciasAnaBruno, 1);

  // Confirma margem de impressão @page 10mm na Web e Portátil
  assert.match(scriptsWeb, /Folha de protocolo<\/title><style>@page\{size:A4;margin:10mm\}/);
  assert.match(htmlPortatil, /Folha de protocolo<\/title><style>@page\{size:A4;margin:10mm\}/);
});
