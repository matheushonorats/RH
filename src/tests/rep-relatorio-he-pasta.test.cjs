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
const htmlPortatil = ler(path.join(portatil, 'renderer/index.html'));
const fontes = { web: ler(path.join(web, 'RepHorasExtras.html')), portatil: htmlPortatil.split('<!-- INICIO RELATORIO MENSAL HE -->')[1].split('<!-- FIM RELATORIO MENSAL HE -->')[0] };
const modelo = ler(path.join(web,'RepHorasExtrasAssets.html')).replace(/<\/?script>/g,'');
test('interface portátil mantém os scripts íntegros e o relatório fora das strings de impressão', () => {
  for (const trecho of htmlPortatil.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) new vm.Script(trecho[1]);
  assert.ok(htmlPortatil.indexOf('<!-- INICIO RELATORIO MENSAL HE -->') > htmlPortatil.lastIndexOf('<script src='));
});
test('todos os componentes da página web são aceitos pelo carregador de interface', () => {
  const fonte = ler(path.join(web, 'Code.gs'));
  const incluir = fonte.slice(fonte.indexOf('function incluir('), fonte.indexOf('/** Normaliza cabecalhos'));
  const ctx = { HtmlService: { createHtmlOutputFromFile: nome => ({ getContent: () => ler(path.join(web, nome + '.html')) }) } };
  vm.createContext(ctx); vm.runInContext(incluir, ctx);
  for (const nome of ler(path.join(web, 'index.html')).matchAll(/incluir\("([^"]+)"\)/g)) assert.ok(ctx.incluir(nome[1]).length);
  assert.throws(() => ctx.incluir('../arquivo-nao-permitido'), /não permitido/);
});
function preparar(fonte) {
  const checkbox = { checked: false };
  const ctx = {
    document: { getElementById: () => checkbox }, window: {}, XLSX, Date,
    repOnlineCarregando: false, falhasIntegridadeRep: [], repTemAlteracoesPendentes_: () => false,
    conferenciasRep: ['1','2','4','5'].map(pis=>({pis,competencia:'2026-09',conferido:true})),
    obterServidorPorIdentificadorRep_: pis => ({ matricula: pis, pis, cargo: 'Servente', nome: pis === '1' ? 'Ágata' : 'Pessoa '+pis, situacao:pis==='4'?'Comissionado':pis==='5'?'':'Estatutário' }),
    normalizarPisRep: String, escapeHtml: valor => String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    minutosParaHoraRep_: n => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'),
    obterCompetenciaAtualRep_: () => '2026-09',
    obterServidoresCompetenciaRelatorioAlertasRep_: () => pessoas()
  };
  vm.createContext(ctx); vm.runInContext(modelo,ctx); vm.runInContext(fonte.replace(/<\/?script>/g, ''), ctx);
  return { ctx, checkbox };
}
function pessoas() {
  return [{ pis: '2', nome: 'Cleusa', dias: [
    { dataOriginal: '2026-09-01', extraDia: 23.5 }, { dataOriginal: '2026-09-02', extraDia: 2.25 },
    { dataOriginal: '2026-09-03', extraDia: 8, pendencia: true }, { dataOriginal: '2026-09-04', extraDia: 8, ausencia: { tipo: 'Atestado' } },
    { dataOriginal: '2026-09-05', extraDia: -4 }, { dataOriginal: '2026-10-01', extraDia: 100 },
    // HE desconsiderada ou totalmente usada em compensação já chega zerada.
    { dataOriginal: '2026-09-06', extraDia: 0 }, { dataOriginal: '2026-09-07', extraDia: 1.5, saldoOriginalAntesCompensacao: 4 }
  ] }, { pis: '1', dias: [{ dataOriginal: '2026-09-01', extraDia: 3 }] }, { pis: '3', dias: [{ dataOriginal: '2026-09-01', extraDia: -2 }] },
  ...['4','5','6'].map(pis=>({pis,dias:[{dataOriginal:'2026-09-02',extraDia:100}]}))];
}
for (const [versao, fonte] of Object.entries(fontes)) {
  test(versao + ': mensal usa HE restante, separa pendências, mês, débitos e conferência', () => {
    const {ctx, checkbox} = preparar(fonte);
    const dados = ctx.prepararDadosRelatorioMensalHeRep_();
    assert.equal(dados.linhas.length, 2); assert.equal(dados.linhas[0].nome, 'Ágata');
    assert.equal(dados.totalMinutos, 1815); assert.equal(dados.excluidos.length, 3); assert.equal(dados.diasPendentes, 1);
    assert.ok(dados.excluidos.find(item=>item.pis==='4').motivos.includes('Cargo comissionado'));
    assert.ok(dados.excluidos.find(item=>item.pis==='5').motivos.some(m=>m.includes('não informado')));
    assert.ok(dados.excluidos.find(item=>item.pis==='6').motivos.some(m=>m.includes('não marcado')));
    assert.equal(dados.inicio, '01/09/2026'); assert.equal(dados.fim, '30/09/2026');
    ctx.conferenciasRep = ctx.conferenciasRep.filter(item=>item.pis!=='2');
    assert.equal(ctx.prepararDadosRelatorioMensalHeRep_().totalMinutos, 180);
    assert.equal(ctx.montarRelatorioMensalHeRep_(pessoas(),'2026-09',false).totalMinutos,180,'não há opção de ignorar a conferência');
    assert.throws(() => ctx.montarRelatorioMensalHeRep_([], 'all-all'), /Selecione/);
    ctx.repTemAlteracoesPendentes_ = () => true;
    assert.throws(() => ctx.prepararDadosRelatorioMensalHeRep_(), /fila/);
    ctx.repTemAlteracoesPendentes_ = () => false; ctx.falhasIntegridadeRep.push({nome:'AFD inválido'});
    assert.throws(() => ctx.prepararDadosRelatorioMensalHeRep_(), /não foram lidos/);
  });
  test(versao + ': Excel preserva duração acima de 24h, fórmula e PDF contém todos os nomes', () => {
    const {ctx} = preparar(fonte);
    const dados = ctx.prepararDadosRelatorioMensalHeRep_();
    dados.linhas[0].matricula = '00123'; dados.linhas[0].nome = '<Pessoa & teste>';
    const livro = ctx.criarPlanilhaRelatorioMensalHeRep_(dados, {secretaria:'Turismo'});
    const reaberto = XLSX.read(XLSX.write(livro, {type:'buffer', bookType:'xlsx'}), {type:'buffer', cellNF:true});
    const folha = reaberto.Sheets[reaberto.SheetNames[0]];
    assert.equal(folha.A11.v, '00123'); assert.equal(folha.A11.t, 's');
    assert.equal(folha.K12.z, '[h]:mm'); assert.equal(XLSX.utils.format_cell(folha.K12), '27:15');
    assert.equal(folha.K13.f, 'SUM(K11:K12)'); assert.equal(XLSX.utils.format_cell(folha.K13), '30:15');
    const pdf = ctx.criarHtmlRelatorioMensalHeRep_(dados, {});
    assert.ok(pdf.includes('&lt;Pessoa &amp; teste>')); assert.ok(pdf.includes('Pessoa 2')); assert.ok(pdf.includes('30:15'));
    assert.match(pdf, /display:table-header-group/);
    for(const texto of ['Prefeitura Municipal de São Sebastião','ESTÂNCIA BALNEÁRIA','RELATÓRIO GERAL DE HORAS EXTRAS DA','SECRETARIA DE TURISMO','SECRETÁRIO','Rua Prefeito João Cupertino']) assert.ok(pdf.includes(texto),texto);
    for(const texto of ['Gestão de Pessoas','Emitido em','Horas em h:mm','ainda não marcados','Entidade.V1','var(--']) assert.ok(!pdf.includes(texto),texto);
    assert.ok(pdf.includes('data:image/jpeg;base64,')); assert.ok(pdf.includes('1/9/2026'));
  });
  test(versao + ': emissão reconsulta conferências e vínculos, e falha sem presumir aprovação', async()=>{
    const {ctx}=preparar(fonte);
    ctx.chamarBackendPromessa_=async metodo=>metodo==='obterListaServidores'?['1','2','4','5','6'].map(ctx.obterServidorPorIdentificadorRep_):[{pis:'1',competencia:'2026-09',conferido:true}];
    const dados=await ctx.conferirReferenciasRelatorioMensalHeRep_();
    assert.equal(dados.linhas.length,1); assert.equal(dados.totalMinutos,180);
    ctx.chamarBackendPromessa_=async()=>{throw new Error('Base indisponível');};
    await assert.rejects(ctx.conferirReferenciasRelatorioMensalHeRep_(),/indisponível/);
  });
  test(versao + ': distingue cargo em comissão de participação em uma comissão',()=>{
    const {ctx}=preparar(fonte), cadastro=ctx.obterServidorPorIdentificadorRep_;
    ctx.obterServidorPorIdentificadorRep_=pis=>({...cadastro(pis),cargo:pis==='2'?'Membro da Comissão de Revisão':cadastro(pis).cargo});
    assert.ok(ctx.prepararDadosRelatorioMensalHeRep_().linhas.some(item=>item.pis==='2'));
    ctx.obterServidorPorIdentificadorRep_=pis=>({...cadastro(pis),cargo:pis==='2'?'Chefe em comissão':cadastro(pis).cargo});
    assert.ok(!ctx.prepararDadosRelatorioMensalHeRep_().linhas.some(item=>item.pis==='2'));
  });
}
for (const [versao, fonte] of Object.entries({web:ler(path.join(web,'Scripts.html')),portatil:htmlPortatil})) {
  test(versao + ': pasta usa navegador Windows na portátil e seletor de arquivo na base local', async () => {
    const codigo = fonte.slice(fonte.indexOf('async function abrirPastaEntradaRep()'), fonte.indexOf('function prepararCartoesManuaisSemAfdRep_()'));
    const abertos = [], janela = {location:{},close(){}};
    let selecionou = 0, consultas = 0;
    const ctx = {window:{entidadeDesktop:{abrirLinkExterno:async url=>abertos.push(url)},open(){throw new Error('Não abrir login no Electron');}},
      infoPastaEntradaRep:null, chamarBackendPromessa_: async ()=>{consultas++; return {url:'https://drive.google.com/drive/folders/teste'};},
      document:{getElementById:()=>({click(){selecionou++;}})}, mensagemErro: e=>e.message, mostrarToast: msg=>{throw new Error(msg);} };
    vm.createContext(ctx); vm.runInContext(codigo, ctx);
    await ctx.abrirPastaEntradaRep(); assert.deepEqual(abertos,['https://drive.google.com/drive/folders/teste']);
    ctx.window.__ENTIDADE_LOCAL__ = true;
    await ctx.abrirPastaEntradaRep(); assert.equal(selecionou, 1); assert.equal(consultas, 1);
    ctx.window.__ENTIDADE_LOCAL__ = false; delete ctx.window.entidadeDesktop; ctx.window.open = ()=>janela;
    await ctx.abrirPastaEntradaRep(); assert.equal(janela.location.href, abertos[0]);
  });
}
test('ponte externa valida origem e bloqueia esquemas de arquivo, script e credenciais', async () => {
  const codigo = ler(path.join(portatil,'main.cjs'));
  const trecho = codigo.slice(codigo.indexOf("ipcMain.handle('entidade:abrir-link-externo'"), codigo.indexOf("ipcMain.handle('entidade:atualizacao'"));
  let handler, autorizado = true; const links = [];
  const ctx = {URL, ipcMain:{handle:(nome,fn)=>{handler=fn;}}, validarJanela(){if(!autorizado)throw new Error('Origem inválida');},
    falha:(codigo,msg)=>new Error(msg), registrarFalha:e=>({mensagem:e.message}), shell:{openExternal:async url=>links.push(url)} };
  vm.createContext(ctx); vm.runInContext(trecho,ctx);
  assert.equal((await handler({},'https://drive.google.com/drive/folders/teste')).ok,true);
  for (const url of ['file:///C:/Windows/teste','javascript:alert(1)','https://usuario:senha@drive.google.com/']) assert.equal((await handler({},url)).ok,false);
  autorizado=false; assert.equal((await handler({},'https://drive.google.com')).ok,false); assert.equal(links.length,1);
});
