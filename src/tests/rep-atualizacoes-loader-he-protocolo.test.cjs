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

test('CSS do loader REP mantém modal centralizado com bolinhas lado a lado sem quadrados nem rolagem na Web e Portátil', () => {
  for (const fonte of [stylesWeb, htmlPortatil]) {
    assert.match(fonte, /#loader-afd-progress\{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px/);
    assert.match(fonte, /#loader-afd-progress \.loader-afd-dot\{display:inline-flex;[^}]*background:transparent/);
    assert.match(fonte, /\.loader-afd-bolha\{[^}]*border-radius:50%/);
    assert.match(fonte, /\.loader-afd-bolha i\{[^}]*height:var\(--afd-fill,0%\)/);
    assert.match(fonte, /@keyframes afd-onda/);
    assert.match(fonte, /\.loader-afd-dot\.concluido \.loader-afd-bolha i\{height:100% !important/);
    assert.match(fonte, /#global-loader\.rep-loader-previa\{[^}]*align-items:center;justify-content:center/);
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
    const linhaTipo2Antiga = '0000000011' + '2024-01-01T08:00:00-0300'.padEnd(217, ' ') + 'R MINAS GERAIS 221'.padEnd(100, ' ');
    const linhaTipo2Final = '0000000012' + '2026-10-01T08:00:00-0300'.padEnd(217, ' ') + 'Teatro Municipal Mario Covas'.padEnd(100, ' ');
    const info = ctx.extrairLocalInicialTextoAfdRep_(linhaTipo1 + '\n' + linhaTipo2Antiga + '\n' + linhaTipo2Final);
    assert.equal(info.numeroRep, '00001000020003456');
    assert.equal(info.localOriginal, 'Teatro Municipal Mario Covas');

    ctx.locaisEditadosRep = [
      { arquivoChave: 'ARQUIVO_ID:drv-1', localOriginal: 'Teatro Original', localExibido: 'Teatro Editado' },
      { arquivoChave: 'REP:999|ARQUIVO:AFD_GALPAO.TXT', localOriginal: 'Galpão Bruto', localExibido: 'Galpão SETUR' }
    ];
    assert.equal(ctx.resolverLocalAfdLoader_({ id: 'drv-1', nome: 'AFD_MUITO_GRANDE_001.txt' }, 'R MINAS GERAIS 221', ''), 'Teatro Editado');
    assert.equal(ctx.resolverLocalAfdLoader_({ nome: 'afd_galpao.txt' }, '', ''), 'Galpão SETUR');
    assert.equal(ctx.resolverLocalAfdLoader_({ nome: 'afd_balneario_sul.txt' }, 'Balneário Sul', '12345'), 'Balneário Sul');

    ctx.iniciarProgressoAfdsLoader_([{ id: 'drv-1', nome: 'AFD_MUITO_GRANDE_001.txt' }, { nome: 'afd_galpao.txt' }]);
    assert.ok(loaderEl.classList.contains('rep-loader-previa'));
    assert.ok(progressEl.innerHTML.includes('loader-afd-bolha'));
    assert.ok(!progressEl.innerHTML.includes('loader-afd-local'), 'nomes não devem ficar embaixo das bolinhas');
    assert.ok(!progressEl.innerHTML.includes('loader-afd-estado'), 'status não deve criar caixas embaixo das bolinhas');
    assert.ok(progressEl.innerHTML.includes('title="Aguardando: Teatro Editado"'));

    const bolhaSpan = criarElementoSimulado('SPAN');
    const dotMock = criarElementoSimulado('SPAN');
    dotMock.querySelector = sel => sel === '.loader-afd-bolha' ? bolhaSpan : null;
    dotsSimulados['0'] = dotMock;

    ctx.atualizarProgressoAfdLoader_(0, 'carregando', 'AFD_0.txt', { progresso: 42, local: 'Casa da Cultura' });
    assert.equal(dotMock.style.getPropertyValue('--afd-fill'), '42%');
    assert.equal(dotMock.dataset.local, 'Casa da Cultura');
    assert.equal(dotMock.title, '42%: Casa da Cultura');

    ctx.atualizarProgressoAfdLoader_(0, 'concluido', 'AFD_0.txt');
    assert.ok(dotMock.classList.contains('concluido'));
    assert.equal(dotMock.style.getPropertyValue('--afd-fill'), '100%');
    assert.equal(dotMock.title, 'Concluído: Casa da Cultura');

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
      getUuid: () => 'uuid-mock-1234',
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

test('ProtocolosService: criadoPor resolve para o nome real do emitente e ajusta despachos duplicados de abonadas', () => {
  const protCode = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'ProtocolosService.gs'), 'utf8');
  const lancCode = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'LancamentosService.gs'), 'utf8');

  const linhasProtocolos = [
    ['ID', 'DATA GERACAO', 'STATUS', 'LINK', 'CRIADO POR'],
    ['SETUR-2026-000113', '06/11/2026 15:10:06', 'Aguardando Assinatura', '', 'matheus@setur.gov.br'],
    ['SETUR-2026-000114', '07/11/2026 10:00:00', 'Aguardando Assinatura', '', 'Sistema']
  ];
  const linhasUsuarios = [
    ['EMAIL', 'NOME', 'PAPEL', 'ATIVO'],
    ['matheus@setur.gov.br', 'Matheus RH', 'Administrador', 'Sim']
  ];
  const linhasLancamentos = [
    ['ID_PROTOCOLO', 'DATA_SOLICITACAO', 'TIPO', 'NOME', 'MATRICULA', 'DATA_INICIO', 'DATA_RETORNO', 'DIAS', 'PECUNIA', 'DESPACHO', 'OBS', 'STATUS'],
    ['SETUR-2026-000113', '06/11/2026', 'Falta Abonada', 'JÚLIA FRANCISCA DA SILVA', '52779', '09/11/2026', '', '1', '0', 'Possuía direito a 5 abonadas. Solicitou a 3ª abonada. Restam 2.', '', 'Ativo'],
    ['SETUR-2026-000113', '06/11/2026', 'Falta Abonada', 'JÚLIA FRANCISCA DA SILVA', '52779', '07/12/2026', '', '1', '0', 'Possuía direito a 5 abonadas. Solicitou a 3ª abonada. Restam 2.', '', 'Ativo'],
    ['SETUR-2026-000113', '06/11/2026', 'Falta Abonada', 'VAGDA DE JESUS', '50598', '07/12/2026', '', '1', '0', 'Possuía direito a 5 abonadas. Solicitou a 3ª abonada. Restam 2.', '', 'Ativo'],
    ['SETUR-2026-000113', '06/11/2026', 'Falta Abonada', 'VAGDA DE JESUS', '50598', '19/11/2026', '', '1', '0', 'Possuía direito a 5 abonadas. Solicitou a 4ª abonada. Restam 1.', '', 'Ativo']
  ];

  const sheets = {
    Protocolos: {
      getDataRange: () => ({ getValues: () => linhasProtocolos.map(r => r.slice()) }),
      getLastRow: () => linhasProtocolos.length
    },
    Usuarios: {
      getDataRange: () => ({ getValues: () => linhasUsuarios.map(r => r.slice()) }),
      getLastRow: () => linhasUsuarios.length
    },
    'Lançamentos': {
      getDataRange: () => ({ getValues: () => linhasLancamentos.map(r => r.slice()) }),
      getLastRow: () => linhasLancamentos.length
    },
    Servidores: {
      getDataRange: () => ({ getValues: () => [['MATRICULA', 'NOME', 'CARGO', 'LOTACAO', 'STATUS', 'PIS'], ['52779', 'JÚLIA FRANCISCA DA SILVA', 'ASSESSOR', 'SEC', 'ATIVO', '123']] }),
      getLastRow: () => 2
    }
  };
  const ss = { getSheetByName: nome => sheets[nome] || null };

  const ctx = {
    Date, Math, Set, Map, JSON, RegExp, Error, parseInt, Array, Object,
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo', getActiveUser: () => ({ getEmail: () => '' }) },
    Utilities: {
      getUuid: () => 'uuid-mock-1234',
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
    obterDadosUsuarioLogado: () => ({ nome: 'Matheus RH', email: 'matheus@setur.gov.br', papel: 'Administrador' }),
    verificarSeEhOperador: () => true,
    normalizarCabecalho_: s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(),
    normalizarChaveMatricula_: s => String(s || '').trim().toUpperCase(),
    ehLancamentoAnulado_: () => false,
    obterListaServidoresInterno_: () => [],
    formatarDataProtocolo_: d => String(d),
    escapeHtmlProtocolo_: s => String(s || ''),
    obterAlertasAusenciaLotacaoProtocolo_: () => []
  };

  vm.createContext(ctx);
  vm.runInContext(lancCode, ctx);
  vm.runInContext(protCode, ctx);

  const lista = ctx.obterListaProtocolos();
  assert.equal(lista.length, 2);
  // O protocolo 113 tinha email matheus@setur.gov.br que deve ser mapeado para 'Matheus RH'
  const p113 = lista.find(p => p.id === 'SETUR-2026-000113');
  assert.equal(p113.criadoPor, 'Matheus RH');
  // O protocolo 114 tinha 'Sistema' e deve cair no fallback do usuário logado 'Matheus RH'
  const p114 = lista.find(p => p.id === 'SETUR-2026-000114');
  assert.equal(p114.criadoPor, 'Matheus RH');

  // Verifica renderização da folha com ajuste automático de abonadas duplicadas
  const html = ctx.obterHtmlFolhaProtocolo('SETUR-2026-000113');
  // A Júlia deve ter 3ª abonada no primeiro registro e 4ª abonada no segundo!
  assert.ok(html.includes('Solicitou a 3ª abonada. Restam 2.'));
  assert.ok(html.includes('Solicitou a 4ª abonada. Restam 1.'));
});

test('Scripts.html: calcularAbonadasUsadasServidor_ conta base e lancamentos locais na sessao', () => {
  const scriptsContent = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'Scripts.html'), 'utf8');

  // Extrai as funções extrairAnoDataLancamento_, formatarDataIsoParaBr_ e calcularAbonadasUsadasServidor_
  assert.match(scriptsContent, /function extrairAnoDataLancamento_/);
  assert.match(scriptsContent, /function formatarDataIsoParaBr_/);
  assert.match(scriptsContent, /function calcularAbonadasUsadasServidor_/);
  assert.match(scriptsContent, /function atualizarEstadoLocalAposLancamento_/);

  const ctx = {
    Date, Math, Set, Map, JSON, RegExp, Error, parseInt, Number, String, Array,
    AppState: {
      servidores: [
        { matricula: '52779', nome: 'JÚLIA', abonosUsados: 2, limiteAbonadas: 5 }
      ],
      lancamentos: [
        { matricula: '52779', tipo: 'Falta Abonada', dataInicio: '10/05/2026', status: 'Ativo', linhaPlanilha: 10 }
      ]
    }
  };

  const codeExtrair = scriptsContent.match(/function extrairAnoDataLancamento_[\s\S]*?\n\}/)[0];
  const codeFormatar = scriptsContent.match(/function formatarDataIsoParaBr_[\s\S]*?\n\}/)[0];
  const codeCalcular = scriptsContent.match(/function calcularAbonadasUsadasServidor_[\s\S]*?\n\}/)[0];
  const codeAtualizar = scriptsContent.match(/function atualizarEstadoLocalAposLancamento_[\s\S]*?\n\}/)[0];

  vm.createContext(ctx);
  vm.runInContext(codeExtrair, ctx);
  vm.runInContext(codeFormatar, ctx);
  vm.runInContext(codeCalcular, ctx);
  vm.runInContext(codeAtualizar, ctx);

  // Inicialmente o servidor tem abonosUsados: 2, e lista local tem 1 lançamento no ano 2026 -> max(2, 1) = 2
  assert.equal(ctx.calcularAbonadasUsadasServidor_('52779', 2026), 2);

  // Simula salvar a 3ª abonada no frontend
  ctx.atualizarEstadoLocalAposLancamento_({
    matricula: '52779',
    tipo: 'Falta Abonada',
    dataInicio: '09/11/2026',
    linhaPlanilha: 0,
    despacho: 'Solicitou a 3ª abonada.'
  });

  // Agora abonosUsados no servidor virou 3, e lista tem 2 itens -> max(3, 2) = 3
  assert.equal(ctx.AppState.servidores[0].abonosUsados, 3);
  assert.equal(ctx.calcularAbonadasUsadasServidor_('52779', 2026), 3);

  // E a próxima abonada sugerirá 3 + 1 = 4ª abonada!
});

test('salvarDadosLancamento: trata servidorLancamento com segurança e fecha modal e loader', () => {
  const scriptsContent = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'Scripts.html'), 'utf8');

  // Garante que não há chamada solta com 'servidor' indefinido
  assert.ok(!scriptsContent.includes('atualizarEstadoLocalAposLancamento_(dados, servidor);'));
  assert.ok(scriptsContent.includes('atualizarEstadoLocalAposLancamento_(dados, servidorLancamento);'));

  // Garante que exibirLoader(false) está no finally de salvarDadosLancamento
  const trechoSalvar = scriptsContent.match(/async function salvarDadosLancamento[\s\S]*?\n\}/)[0];
  assert.match(trechoSalvar, /fecharModal\('modal-lancamento'\)/);
  assert.match(trechoSalvar, /finally\s*\{[\s\S]*?exibirLoader\(false\)[\s\S]*?finalizarOperacaoInterface/);
});

test('LancamentosService: retry de lançamento idêntico é idempotente e evita falso conflito na fila', () => {
  const lancCode = fs.readFileSync(path.join(__dirname, '..', 'output', 'RH-Modo-Seguro-Beta', 'LancamentosService.gs'), 'utf8');

  const linhasLancamentos = [
    ['ID', 'ID_PROTOCOLO', 'DATA_SOLICITACAO', 'TIPO', 'NOME', 'MATRICULA', 'DATA_INICIO', 'DATA_RETORNO', 'DIAS', 'PECUNIA', 'DESPACHO', 'OBS', 'STATUS', 'ID_OPERACAO', 'DIAS_PECUNIA', 'RESERVA_CREDITO_FUTURO', 'COBERTURA DOCUMENTO', 'PLEITO_ELEITORAL', 'MOVIMENTO_ELEITORAL'],
    ['1', '', '13/11/2026', 'Falta Abonada', '52779: JÚLIA', '52779', '20/11/2026', '', '1', '0', 'Solicitou a 3ª abonada.', '', 'Ativo', 'op-anterior', '0', '', '', '', '']
  ];

  const sheets = {
    'Lançamentos': {
      getDataRange: () => ({ getValues: () => linhasLancamentos.map(r => r.slice()) }),
      getLastRow: () => linhasLancamentos.length,
      getLastColumn: () => linhasLancamentos[0].length,
      getRange: () => ({
        getValues: () => [linhasLancamentos[0]],
        setValue: () => ({ setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => ({ setHorizontalAlignment: () => {} }) }) }) })
      }),
      appendRow: () => { throw new Error('Não deveria criar linha duplicada!'); }
    },
    'Servidores': {
      getDataRange: () => ({ getValues: () => [['MATRICULA', 'NOME', 'CARGO', 'LOTACAO', 'STATUS', 'SITUACAO'], ['52779', 'JÚLIA', 'ASSESSOR', 'SEC', 'ATIVO', 'ESTATUTÁRIO']] }),
      getLastRow: () => 2
    },
    'Configuracoes': {
      getDataRange: () => ({ getValues: () => [['CHAVE', 'VALOR'], ['LIMITE_ABONADAS_ANO', '5']] })
    }
  };
  const ss = { getSheetByName: nome => sheets[nome] || null };

  let operacaoConcluida = null;
  const ctx = {
    Date, Math, Set, Map, JSON, RegExp, Error, parseInt, Number, String, Array, Object, isFinite,
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo', getActiveUser: () => ({ getEmail: () => 'teste@rh' }) },
    Utilities: {
      getUuid: () => 'uuid-mock-1234',
      formatDate: (d) => {
        const dt = new Date(d);
        return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0') + '/' + dt.getFullYear();
      }
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ remove: () => {} }) },
    obterPlanilha_: () => ss,
    obterValoresAba_: aba => (aba && aba.getDataRange ? aba.getDataRange().getValues() : []),
    verificarSeEhOperador: () => true,
    garantirColunasPersistenciaLancamentos_: () => {},
    validarIdOperacao_: id => id,
    marcarOperacaoConcluidaSemLock_: id => { operacaoConcluida = id; },
    normalizarChaveMatricula_: s => String(s || '').trim().toUpperCase(),
    normalizarCabecalho_: s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
    indiceCabecalho_: (cabecalho, alternativas) => {
      const norm = cabecalho.map(s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim());
      const alts = alternativas.map(s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim());
      for (let i = 0; i < alts.length; i++) {
        const idx = norm.indexOf(alts[i]);
        if (idx !== -1) return idx;
      }
      return -1;
    },
    parseInputDate_: str => {
      if (!str) return null;
      if (str.includes('-')) {
        const [y, m, d] = str.split('-').map(Number);
        return new Date(y, m - 1, d);
      }
      if (str.includes('/')) {
        const [d, m, y] = str.split('/').map(Number);
        return new Date(y, m - 1, d);
      }
      return null;
    },
    obterInfoServidorBasico_: () => ({ matricula: '52779', nome: 'JÚLIA', situacao: 'ESTATUTÁRIO' }),
    ehLancamentoAnulado_: () => false,
    construirResumoFerias_: () => ({ '52779': { abonosUsados: 1, saldo: 30 } }),
    obterLimiteAbonadasAno_: () => 5,
    lancarLogSemLock_: () => {}
  };

  vm.createContext(ctx);
  vm.runInContext(lancCode, ctx);

  // Tentativa de salvar exatamente a mesma ausência com um idOperacao novo (ex.: reenvio ou retry)
  const res = ctx.salvarLancamento({
    operacaoId: 'op-nova-retry',
    matricula: '52779',
    tipo: 'Falta Abonada',
    dataInicio: '2026-11-20',
    dias: 1,
    despacho: 'Solicitou a 3ª abonada.'
  });

  // Não deve lançar erro de conflito, deve retornar sucesso idempotente e marcar a operação como concluída
  assert.equal(res.sucesso, true);
  assert.equal(res.duplicadoIgnorado, true);
  assert.equal(operacaoConcluida, 'op-nova-retry');
});
