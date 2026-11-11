'use strict';
// Mantém as regras alteradas em ambas as edições sem substituir a configuração
// de armazenamento nem as personalizações próprias do programa portátil.
const fs = require('node:fs');
const path = require('node:path');
const { marcaPortatil } = require('./app/portable-brand.cjs');
const web = path.resolve(__dirname, '../output/RH-Modo-Seguro-Beta');
const desktop = path.join(__dirname, 'app');
for (const nome of fs.readdirSync(web).filter(nome => nome.endsWith('.gs') && !nome.endsWith('Tests.gs'))) {
  fs.copyFileSync(path.join(web, nome), path.join(desktop, 'source-app', nome));
}
const fonte = fs.readFileSync(path.join(web, 'Scripts.html'), 'utf8').replace(/\r\n/g, '\n');
let html = fs.readFileSync(path.join(desktop, 'renderer/index.html'), 'utf8').replace(/\r\n/g, '\n');
const trechos = [
  ['const LOADER_FRASES_REP_', 'function animarEntidadeDuranteCarga_('],
  ['function obterIdentificadorCartaoManualRep_(', 'function assinaturaLancamentosQueAfetamRep_('],
  ['function assinaturaLancamentosQueAfetamRep_(', 'function nomeValidoRep('],
  ['function obterDeficitDiaRep_(', 'function processDataRep('],
  ['function aplicarDeclaracoesHorasRep_(', 'function aplicarDescartesHoraExtraRep_('],
  ['function enfileirarAlteracaoRep_(', 'function adicionarArquivosRep('],
  ['function abrirModalServidor(', 'function abrirFichaServidor('],
  ['function iniciarProgressoAfdsLoader_(', 'function carregarDadosDaView('],
  ['function iniciarPolling(', 'function escapeHtml('],
  ['function inicializarUsuario(', 'function inicializarInterface('],
  ['async function abrirPastaEntradaRep(', 'function prepararCartoesManuaisSemAfdRep_('],
  ['function processDataRep(', 'function completarDiasSemRegistroRep_('],
  ['function preencherCompensacaoMaximaRep_(', 'async function restaurarAjustesDiaRep('],
  ['function definirFiltroDiasRep(', 'function obterCompetenciaAtualRep_('],
  ['function renderizarAuditoriaArquivosRep(', 'let repContextoProcessamento_'],
  ['function abrirFusaoRep(', 'function updateDashboardRep('],
  ['function renderizarPainelRep(', 'function mudarPaginaRep('],
  ['function obterAlertasAtivosDiaRep_(', 'function exportarRelatorioAlertasRep_('],
  ['function ajustarCamposFormularioLancamento(', 'function ajustarCamposAbonoEleitoral_('],
  ['function selecionarServidorAutocomplete(', 'function abrirModalLancamento('],
  ['function abrirFichaServidor(', 'function carregarListaLancamentos('],
  ['function renderizarTabelaLancamentos(', 'async function excluirLancamentoInterface_('],
  ['async function excluirLancamentoInterface_(', 'function filtrarTabelaLancamentos('],
  ['function abrirModalLancamento(', 'function exibirAnexosNaLista('],
  ['function exibirAnexosNaLista(', 'function baixarAnexoSeguro('],
  ['async function salvarDadosLancamento(', 'function validarPdfDropzoneAnexo(']
];
for (const [inicio, fim] of trechos) {
  const a = fonte.indexOf(inicio), b = fonte.indexOf(fim, a);
  const c = html.indexOf(inicio), d = html.indexOf(fim, c);
  if ([a, b, c, d].some(i => i < 0) || b <= a || d <= c) throw new Error('Trecho não encontrado: ' + inicio);
  html = html.slice(0, c) + marcaPortatil(fonte.slice(a, b)) + html.slice(d);
}
fs.writeFileSync(path.join(desktop, 'renderer/index.html'), html);
// O formulário e o modelo de autorização compartilham a fonte da web.
// Preserva o cabeçalho institucional da autorização, como no relatório mensal.
const melhorias = fs.readFileSync(path.join(web, 'RepEnhancements.html'), 'utf8').replace(/\r\n/g, '\n');
const aAutorizacao = melhorias.indexOf('async function exportarAutorizacaoHorasExtrasRep_(');
const bAutorizacao = melhorias.indexOf('async function ajustarPenalidadePeriodoFeriasFicha_(', aAutorizacao);
if (aAutorizacao < 0 || bAutorizacao < 0) throw new Error('Modelo de autorização não encontrado.');
const melhoriasPortatil = marcaPortatil(melhorias.slice(0, aAutorizacao)) + melhorias.slice(aAutorizacao, bAutorizacao) + marcaPortatil(melhorias.slice(bAutorizacao));
const marcaMelhorias = '/** Melhorias isoladas da conferência REP';
const inicioMelhorias = html.lastIndexOf('<script>', html.indexOf(marcaMelhorias));
const fimMelhorias = html.indexOf('</script>', html.indexOf(marcaMelhorias)) + '</script>'.length;
if (html.indexOf(marcaMelhorias) < 0 || inicioMelhorias < 0 || fimMelhorias <= inicioMelhorias) throw new Error('Módulo REP portátil não encontrado.');
html = html.slice(0, inicioMelhorias) + melhoriasPortatil + html.slice(fimMelhorias);
const inicioAssets = html.lastIndexOf('<script>', html.indexOf('window.HE_MODELO_ASSETS ='));
const fimAssets = html.indexOf('</script>', html.indexOf('window.HE_MODELO_ASSETS =')) + '</script>'.length;
if (inicioAssets < 0 || fimAssets <= inicioAssets) throw new Error('Imagens da autorização não encontradas.');
html = html.slice(0, inicioAssets) + fs.readFileSync(path.join(web, 'HeModelAssets.html'), 'utf8') + html.slice(fimAssets);
const estilos = fs.readFileSync(path.join(web, 'Styles.html'), 'utf8');
const marcaInicioFluxo = '/* INICIO FLUXO AJUSTES REP */', marcaFimFluxo = '/* FIM FLUXO AJUSTES REP */';
const fluxo = estilos.slice(estilos.indexOf(marcaInicioFluxo), estilos.indexOf(marcaFimFluxo) + marcaFimFluxo.length);
if (!fluxo.startsWith(marcaInicioFluxo) || !fluxo.endsWith(marcaFimFluxo)) throw new Error('Estilos do fluxo REP ausentes.');
if (html.includes(marcaInicioFluxo)) html = html.slice(0, html.indexOf(marcaInicioFluxo)) + fluxo + html.slice(html.indexOf(marcaFimFluxo) + marcaFimFluxo.length);
else html = html.replace('</style>', fluxo + '\n</style>');
// Módulo novo compartilhado, sem reconstruir as personalizações da portátil.
const inicioModuloHe = '<!-- INICIO RELATORIO MENSAL HE -->';
const fimModuloHe = '<!-- FIM RELATORIO MENSAL HE -->';
// O relatório institucional conserva o modelo original também na portátil.
const moduloHe = inicioModuloHe + '\n' + fs.readFileSync(path.join(web, 'RepHorasExtrasAssets.html'), 'utf8') + '\n' + fs.readFileSync(path.join(web, 'RepHorasExtras.html'), 'utf8') + '\n' + fimModuloHe;
const inicioHe = html.indexOf(inicioModuloHe), fimHe = html.indexOf(fimModuloHe);
if ((inicioHe < 0) !== (fimHe < 0)) throw new Error('Módulo mensal de HE incompleto na portátil.');
if (inicioHe >= 0) html = html.slice(0, inicioHe) + html.slice(fimHe + fimModuloHe.length);
// Há documentos de impressão com </body> dentro de strings dos scripts.
// O módulo deve entrar somente antes do fechamento real da página externa.
const fechamentoPagina = html.lastIndexOf('</body>');
if (fechamentoPagina < 0) throw new Error('Fechamento da página portátil não encontrado.');
html = html.slice(0, fechamentoPagina) + moduloHe + '\n' + html.slice(fechamentoPagina);
if (!html.includes('id="rep-btn-relatorio-he"')) {
  const botaoHe = fs.readFileSync(path.join(web, 'index.html'), 'utf8').match(/<button id="rep-btn-relatorio-he"[\s\S]*?<\/button>/)[0];
  html = html.replace('<button id="rep-btn-export"', botaoHe + '\n                    <button id="rep-btn-export"');
}
// Oculta os controles antigos, preservando os elementos usados por clientes antigos.
html = html.replace('<div class="rep-ajuste-ausencia">', '<div class="rep-ajuste-ausencia" hidden>')
 .replace(/<div class="form-group" style="margin-top:16px;">(\s*<label class="form-label" for="rep-ajuste-justificativa">)/, '<div class="form-group" hidden>$1')
 .replace(/<button type="button" class="btn btn-primary" onclick="abrirPastaEntradaRep\(\)"><span data-lucide="folder-open"><\/span> Abrir pasta<\/button>/, '');

html = html.replace(/^    atualizarPreviaLeituraRep_\(indiceArquivo, novosArquivos.length, file.name\);\n/gm, '');
html = html.replace('    // Libera a interface entre arquivos grandes.', '    atualizarPreviaLeituraRep_(indiceArquivo, novosArquivos.length, file.name);\n    // Libera a interface entre arquivos grandes.');
const versao = fs.readFileSync(path.join(web, 'Version.gs'), 'utf8').match(/const APP_VERSION = "([^"]+)"/)[1];
html = html.replace(/(id="rep-file-input" multiple accept=")\.txt("?)/, '$1.txt,.afd$2');
html = html.replace(/data-app-version="[^"]+"/, 'data-app-version="' + versao + '"')
  .replace(/Versão \d+\.\d+/g, 'Versão ' + versao);
fs.writeFileSync(path.join(desktop, 'renderer/index.html'), html);
const pacote = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
pacote.version = versao + '.0';
fs.writeFileSync(path.join(desktop, 'package.json'), JSON.stringify(pacote, null, 2) + '\n');
console.log('Regras compartilhadas, pasta REP e relatório mensal de HE sincronizados com a portátil.');
