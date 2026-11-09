const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, session } = require('electron');
const { Diagnostics } = require('./diagnostics.cjs');
const { StorageMode } = require('./storage-mode.cjs');
const { PortableUpdates, comparar } = require('./portable-updates.cjs');
const canal = require('./update-channel.json');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ORIGEM = 'entidade://app';
const RENDERER = path.join(__dirname, 'renderer');
const TESTE_CONFIGURACAO = process.argv.includes('--smoke-setup');
const TESTE_ABERTURA = process.argv.includes('--smoke-test') || TESTE_CONFIGURACAO;
let diagnosticos;
let armazenamento;
let atualizacoes;
let chamadasEmCurso = 0;
let reiniciando = false;
const protocolosConfigurados = new WeakSet();
function falha(codigo, mensagem, causa) {
  const erro = new Error(mensagem);
  erro.code = codigo; erro.causa = causa;
  return erro;
}
function validarJanela(evento) {
  const url = evento.senderFrame && evento.senderFrame.url;
  if (!url) throw falha('ENT-IPC-ORIGEM', 'A solicitação veio de uma janela não autorizada.');
  const origem = new URL(url);
  if (origem.protocol !== 'entidade:' || origem.host !== 'app') throw falha('ENT-IPC-ORIGEM', 'A solicitação veio de uma janela não autorizada.');
  if (armazenamento && evento.sender.session !== session.fromPartition(armazenamento.particao())) throw falha('ENT-IPC-BASE', 'Esta janela não pertence à base de dados selecionada.');
}
function registrarFalha(erro, operacao) {
  return diagnosticos.registrar(erro.code || 'ENT-API-INTERNA', erro.message || 'Não foi possível concluir esta ação.', erro.causa || erro, { operacao });
}
const METODOS = new Set([
  'verificarStatusEmail', 'fazerLogin', 'definirSenhaPrimeiroAcesso',
  'verificarSessao', 'executarApiBackend'
]);

protocol.registerSchemesAsPrivileged([
  { scheme: 'entidade', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

if (TESTE_ABERTURA) {
  app.setPath('userData', path.join(__dirname, '..', '..', TESTE_CONFIGURACAO ? '.smoke-setup-profile' : '.smoke-profile'));
}

function arquivoLocal(url) {
  const pedido = new URL(url);
  if (pedido.protocol !== 'entidade:' || pedido.host !== 'app') throw new Error('Origem não autorizada.');
  const relativo = decodeURIComponent(pedido.pathname).replace(/^\/+/, '') || 'index.html';
  const destino = path.resolve(RENDERER, relativo);
  const raiz = path.resolve(RENDERER) + path.sep;
  if (!destino.startsWith(raiz)) throw new Error('Arquivo fora do aplicativo.');
  if (!fs.statSync(destino).isFile()) throw new Error('Arquivo inexistente.');
  return destino;
}

async function chamarBackend(pedido) {
  const metodo = String(pedido && pedido.metodo || '');
  const argumentos = pedido && pedido.argumentos;
  if (!METODOS.has(metodo) || !Array.isArray(argumentos) || argumentos.length > 20) {
    throw falha('ENT-API-OPERACAO', 'Operação não permitida.');
  }
  if (!armazenamento.config) throw falha('ENT-CONFIGURACAO', 'Escolha sua base de dados na janela de configuração antes de entrar.');
  if (armazenamento.config.modo === 'local') return armazenamento.engine().chamar(metodo, argumentos);
  let resposta;
  try {
    resposta = await fetch(armazenamento.config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metodo, argumentos }),
      redirect: 'follow',
      signal: AbortSignal.timeout(TESTE_ABERTURA ? 30000 : 345000)
    });
  } catch (erro) {
    throw falha(erro && erro.name === 'TimeoutError' ? 'ENT-REDE-PRAZO' : 'ENT-REDE-CONEXAO', erro && erro.name === 'TimeoutError'
      ? 'O servidor demorou demais a responder. Confira a fila antes de repetir a operação.'
      : 'Não foi possível alcançar a base online. Sua alteração local não foi descartada.', erro);
  }
  if (!resposta.ok) throw falha('ENT-REDE-HTTP-' + resposta.status, 'Servidor indisponível (HTTP ' + resposta.status + ').');
  const texto = await resposta.text();
  let pacote;
  try { pacote = JSON.parse(texto); }
  catch (erro) { throw falha('ENT-API-FORMATO', 'A base online não retornou uma resposta válida.', erro); }
  if (!pacote || pacote.ok !== true) {
    const mensagem = String(pacote && pacote.erro || 'Falha na operação.');
    const codigo = /sessão|token de sessão/i.test(mensagem) ? 'ENT-API-SESSAO'
      : /permissão|não autorizad|apenas administrador/i.test(mensagem) ? 'ENT-API-PERMISSAO' : 'ENT-API-REGRA';
    throw falha(codigo, mensagem);
  }
  return pacote.resultado;
}

function abrirLinkExterno(url) {
  try {
    const destino = new URL(url);
    if (destino.protocol === 'https:') shell.openExternal(destino.href);
  } catch (_) { /* links inválidos permanecem bloqueados */ }
}

function configurarProtocolo(sessao) {
  if (protocolosConfigurados.has(sessao)) return;
  sessao.protocol.handle('entidade', async pedido => {
    try {
      const url = new URL(pedido.url);
      const arquivo = url.pathname.match(/^\/arquivo\/([a-f\d-]{36})$/);
      if (arquivo) {
        if (armazenamento.config?.modo !== 'local' || sessao !== session.fromPartition(armazenamento.particao())) return new Response('Arquivo indisponível.', { status: 403 });
        const dados = await armazenamento.engine().arquivo(arquivo[1]);
        return new Response(dados.bytes, { headers: { 'Content-Type': dados.tipo, 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-Type-Options': 'nosniff' } });
      }
      return net.fetch(pathToFileURL(arquivoLocal(pedido.url)).href);
    } catch (_) { return new Response('Arquivo não encontrado.', { status: 404 }); }
  });
  protocolosConfigurados.add(sessao);
}

function criarJanela() {
  configurarProtocolo(session.fromPartition(armazenamento.particao()));
  const janela = new BrowserWindow({
    title: 'Entidade.V1',
    icon: path.join(RENDERER, 'vendor', 'entidade.ico'),
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    show: !TESTE_ABERTURA,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: armazenamento.particao()
    }
  });
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || /^entidade:\/\/app\/arquivo\/[a-f\d-]{36}$/.test(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: {
        icon: path.join(RENDERER, 'vendor', 'entidade.ico'),
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: armazenamento.particao() }
      } };
    }
    abrirLinkExterno(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (evento, url) => {
    try {
      const destino = new URL(url);
      if (destino.protocol === 'entidade:' && destino.host === 'app') return;
    } catch (_) { /* URL inválida */ }
    evento.preventDefault();
    abrirLinkExterno(url);
  });
  let prazoTeste;
  if (TESTE_ABERTURA) {
    prazoTeste = setTimeout(() => {
      fs.writeFileSync(path.join(__dirname, '..', '..', 'smoke-result.json'), JSON.stringify({ erro: 'Inicialização não terminou em 60 segundos.' }));
      app.exit(1);
    }, 60000);
    janela.once('closed', () => clearTimeout(prazoTeste));
  }
  janela.webContents.once('dom-ready', async () => {
    if (!TESTE_ABERTURA) return;
    try {
    if (TESTE_CONFIGURACAO && !armazenamento.estado().configurado) {
      await janela.webContents.executeJavaScript(`(async () => {
        const limite = Date.now() + 15000;
        while (!document.getElementById('desktop-storage-dialog') && Date.now() < limite) await new Promise(resolve => setTimeout(resolve, 50));
        if (!document.getElementById('desktop-storage-dialog')?.open) throw new Error('Primeiro acesso não mostrou a configuração.');
        document.getElementById('desktop-storage-mode').value = 'local';
        document.getElementById('desktop-storage-mode').dispatchEvent(new Event('change'));
        document.getElementById('desktop-storage-name').value = 'Teste do primeiro acesso';
        document.getElementById('desktop-storage-email').value = 'setup-admin@teste.invalid';
        document.getElementById('desktop-storage-org').value = 'Organização de teste';
        document.querySelector('#desktop-storage-dialog form').requestSubmit();
      })()`);
      return;
    }
    const resultado = await janela.webContents.executeJavaScript(`(async () => {
      const limite = Date.now() + 15000;
      while (Date.now() < limite && getComputedStyle(document.getElementById('login-container')).display === 'none') {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return {
      documento: Boolean(document.getElementById('login-container')),
      isolamento: document.body.dataset.storageMode === 'local',
      rep: Boolean(document.getElementById('view-pre-leitura-rep')),
      inicializacao: typeof inicializarUsuario === 'function' && typeof AppState === 'object',
      loginVisivel: getComputedStyle(document.getElementById('login-container')).display !== 'none',
      titulo: document.title === 'Entidade.V1',
      acentos: document.querySelector('.desktop-navigation').textContent.includes('Visão Geral'),
      iconesRenderizados: document.querySelectorAll('svg.lucide').length > 0,
      ponte: typeof google?.script?.run?.withSuccessHandler === 'function',
      pdf: Boolean(window.pdfjsLib),
      excel: Boolean(window.XLSX),
      icones: Boolean(window.lucide),
      armazenamento: (() => { try { localStorage.setItem('__teste_portatil', 'ok'); return localStorage.getItem('__teste_portatil') === 'ok'; } catch (_) { return false; } })(),
      servidor: await new Promise(resolve => {
        google.script.run
          .withSuccessHandler(() => resolve(false))
          .withFailureHandler(erro => resolve(/não encontrado|não autorizado/i.test(String(erro.message || erro))))
          .verificarStatusEmail('portable-smoke@invalid.local');
      })
      };
    })()`);
    // Exercita o relatório com marcações sintéticas, apenas no perfil de teste.
    const relatorioTeste = await janela.webContents.executeJavaScript(`(() => {
      try {
      const seletorAno = document.getElementById('rep-filter-ano');
      seletorAno.innerHTML = '<option value="2026">2026</option>'; seletorAno.value = '2026';
      document.getElementById('rep-filter-mes').value = '09';
      AppState.servidores = Array.from({length:90}, (_, i) => ({matricula:String(123+i).padStart(5,'0'), pis:String(12345678901+i), nome:'Pessoa de Teste '+String(i+1).padStart(3,'0'), cargo:i%7===0?'ASSISTENTE DE SERVIÇOS ADMINISTRATIVOS':'SERVENTE', situacao:'Estatutário'}));
      conferenciasRep = AppState.servidores.map(pessoa => ({pis:pessoa.pis,competencia:'2026-09',conferido:true}));
      AppState.lancamentos = [];
      const batidas = AppState.servidores.flatMap(pessoa => [8,12,13,19].map((hora, i) => ({pis:pessoa.pis, datetime:new Date(2026,8,1,hora), clock:'Local de teste', deviceSerial:'TESTE', eventId:'smoke-'+pessoa.pis+'-'+i, eventKey:'smoke-'+pessoa.pis+'-'+i, sourceFile:'AFD sintético'})));
      const calculado = processDataRep(new Map(AppState.servidores.map(pessoa => [pessoa.pis,pessoa.nome])), batidas, new Map(AppState.servidores.map(pessoa => [pessoa.pis,'Local de teste'])));
      const dados = montarRelatorioMensalHeRep_(calculado, '2026-09', false);
      const livro = criarPlanilhaRelatorioMensalHeRep_(dados, {secretaria:'Organização de teste'});
      return { ok: dados.totalMinutos === 10800 && dados.linhas.length === 90 && dados.linhas[0]?.matricula === '00123' && Boolean(livro.Sheets['RELATÓRIO'].K11), html: criarHtmlRelatorioMensalHeRep_(dados) };
      } catch (erro) { return {ok:false, erro:String(erro.stack || erro)}; }
    })()`);
    if (relatorioTeste.erro) throw new Error(relatorioTeste.erro);
    resultado.relatorioHe = relatorioTeste.ok;
    const janelaRelatorioTeste = new BrowserWindow({ show: false, width: 920, height: 1200, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: armazenamento.particao() } });
    await janelaRelatorioTeste.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(relatorioTeste.html));
    fs.writeFileSync(path.join(__dirname, '..', '..', 'smoke-relatorio-he.png'), (await janelaRelatorioTeste.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(__dirname, '..', '..', 'smoke-relatorio-he.pdf'), await janelaRelatorioTeste.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true }));
    janelaRelatorioTeste.close();
    const captura = await janela.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '..', '..', 'smoke-screenshot.png'), captura.toPNG());
    fs.writeFileSync(path.join(__dirname, '..', '..', 'smoke-result.json'), JSON.stringify(resultado));
    clearTimeout(prazoTeste);
    app.exit(Object.values(resultado).every(valor => valor === true) ? 0 : 1);
    } catch (erro) {
    fs.writeFileSync(path.join(__dirname, '..', '..', 'smoke-result.json'), JSON.stringify({ erro: String(erro.message || erro) }));
    clearTimeout(prazoTeste);
    app.exit(1);
    }
  });
  janela.loadURL(ORIGEM + '/index.html').catch(erro => {
    if (TESTE_ABERTURA) {
      fs.writeFileSync(path.join(__dirname, '..', '..', 'smoke-result.json'), JSON.stringify({ erro: String(erro.message || erro) }));
      clearTimeout(prazoTeste);
      app.exit(1);
    } else {
      const registro = diagnosticos.registrar('ENT-ABERTURA', 'Não foi possível abrir a interface do programa.', erro);
      dialog.showErrorBox('Entidade.V1 — problema na abertura', registro.mensagem + '\nCódigo: ' + registro.codigo + '\nReferência: ' + registro.referencia + '\nRelatório: ' + diagnosticos.arquivo);
    }
  });
}

app.whenReady().then(async () => {
  diagnosticos = new Diagnostics(app.getPath('userData'), app.getVersion());
  const espera = process.argv.find(arg => arg.startsWith('--entidade-aguardar='));
  if (espera) {
    const pid = Number(espera.split('=')[1]); const limite = Date.now() + 45000;
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) { app.exit(1); return; }
    while (Date.now() < limite) {
      let vivo = true; try { process.kill(pid, 0); } catch (_) { vivo = false; }
      if (!vivo) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    try { process.kill(pid, 0); app.exit(1); return; } catch (_) { /* a versão anterior já encerrou */ }
  }
  if (!TESTE_ABERTURA && !app.requestSingleInstanceLock()) { app.quit(); return; }
  atualizacoes = new PortableUpdates({ pasta: app.getPath('userData'), versao: app.getVersion(), canal });
  if (!TESTE_ABERTURA) {
    try {
      const ativa = await atualizacoes.ativa();
      if (ativa && comparar(ativa.versao, app.getVersion()) > 0) {
        const filho = spawn(ativa.executavel, ['--entidade-aguardar=' + process.pid], { detached: true, stdio: 'ignore', windowsHide: true });
        await new Promise((resolve, reject) => { filho.once('spawn', resolve); filho.once('error', reject); });
        filho.unref(); app.exit(0); return;
      }
    } catch (erro) {
      atualizacoes.reverter();
      const registro = registrarFalha(erro, 'abrir-atualizacao');
      dialog.showErrorBox('Entidade.V1 — atualização não aplicada', 'O programa anterior foi mantido. Seus dados não foram apagados.\nCódigo: ' + registro.codigo + '\nReferência: ' + registro.referencia);
    }
  }
  process.on('uncaughtException', erro => {
    const registro = diagnosticos.registrar('ENT-PROGRAMA-EXCECAO', 'O programa encontrou uma falha interna.', erro);
    dialog.showErrorBox('Entidade.V1', registro.mensagem + '\nCódigo: ' + registro.codigo + '\nReferência: ' + registro.referencia + '\nRelatório: ' + diagnosticos.arquivo);
  });
  process.on('unhandledRejection', erro => {
    diagnosticos.registrar('ENT-PROGRAMA-PROMESSA', 'Uma tarefa do programa foi interrompida.', erro);
  });
  try {
    armazenamento = new StorageMode(app.getPath('userData'));
    if (TESTE_ABERTURA && !TESTE_CONFIGURACAO && !armazenamento.estado().configurado) await armazenamento.configurar({ modo: 'local', nome: 'Teste isolado', email: 'smoke-admin@teste.invalid' });
  } catch (erro) {
    const registro = registrarFalha(erro, 'abrir-armazenamento');
    dialog.showErrorBox('Entidade.V1', registro.mensagem + '\nCódigo: ' + registro.codigo + '\nReferência: ' + registro.referencia);
    app.exit(1); return;
  }
  ipcMain.handle('entidade:api', async (evento, pedido) => {
    chamadasEmCurso++;
    try {
      validarJanela(evento);
      if (reiniciando) throw falha('ENT-UPDATE-REINICIO', 'O programa está reiniciando após sua confirmação.');
      return { ok: true, resultado: await chamarBackend(pedido) };
    } catch (erro) {
      return { ok: false, erro: registrarFalha(erro, pedido && pedido.metodo) };
    } finally { chamadasEmCurso--; }
  });
  ipcMain.handle('entidade:abrir-link-externo', async (evento, url) => {
    try {
      validarJanela(evento);
      const destino = new URL(String(url || ''));
      if (destino.protocol !== 'https:' || destino.username || destino.password) throw falha('ENT-LINK-INVALIDO', 'O endereço da pasta não é válido.');
      await shell.openExternal(destino.href);
      return { ok: true, resultado: true };
    } catch (erro) {
      return { ok: false, erro: registrarFalha(erro, 'abrir-pasta-no-navegador') };
    }
  });
  ipcMain.handle('entidade:atualizacao', async (evento, pedido) => {
    let ativou = false;
    try {
      validarJanela(evento);
      let resultado;
      if (pedido?.acao === 'estado') resultado = atualizacoes.estadoAtual;
      else if (pedido?.acao === 'verificar') resultado = await atualizacoes.verificar();
      else if (pedido?.acao === 'baixar') resultado = await atualizacoes.preparar(progresso => evento.sender.send('entidade:atualizacao-progresso', progresso));
      else if (pedido?.acao === 'aplicar') {
        const bloqueio = () => evento.sender.executeJavaScript("Boolean((typeof existemGravacoesPendentes_ === 'function' && existemGravacoesPendentes_()) || document.querySelector('.modal-overlay.active, dialog[open], [data-inline=\"sim\"][data-dirty=\"sim\"], [data-leitura-ia-em-andamento=\"sim\"]'))");
        if (reiniciando || chamadasEmCurso || await bloqueio()) throw falha('ENT-UPDATE-PENDENCIAS', 'Termine os formulários e aguarde as gravações antes de atualizar. Nada foi descartado.');
        const escolha = await dialog.showMessageBox(BrowserWindow.fromWebContents(evento.sender), { type: 'question', buttons: ['Reiniciar e atualizar', 'Agora não'], defaultId: 1, cancelId: 1, message: 'Aplicar a atualização do Entidade.V1?', detail: 'O programa será reiniciado. Sua base, sessão, arquivos e configurações serão mantidos no perfil do Windows.' });
        if (escolha.response !== 0) return { ok: true, resultado: { estado: 'pronta', cancelado: true } };
        const editandoAposConfirmar = await bloqueio();
        if (chamadasEmCurso || editandoAposConfirmar) throw falha('ENT-UPDATE-PENDENCIAS', 'Surgiu uma gravação ou formulário aberto. A atualização foi adiada para proteger suas informações.');
        reiniciando = true;
        const congelou = await evento.sender.executeJavaScript("(() => { if ((typeof existemGravacoesPendentes_ === 'function' && existemGravacoesPendentes_()) || document.querySelector('.modal-overlay.active, dialog[open], [data-inline=\"sim\"][data-dirty=\"sim\"], [data-leitura-ia-em-andamento=\"sim\"]')) return false; document.querySelector('.app-container').inert = true; var avisoAtualizacao = document.createElement('aside'); avisoAtualizacao.id = 'desktop-update-restart'; avisoAtualizacao.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#102c2ef0;display:grid;place-items:center;color:white;font:20px system-ui'; avisoAtualizacao.textContent = 'Conferindo a atualização e reiniciando com segurança…'; document.body.appendChild(avisoAtualizacao); return true; })()");
        if (!congelou || chamadasEmCurso) throw falha('ENT-UPDATE-PENDENCIAS', 'A tela recebeu outra alteração durante a confirmação. A atualização foi adiada.');
        const programa = await atualizacoes.ativar();
        ativou = true;
        const pendenteAntesDeReiniciar = await bloqueio();
        if (chamadasEmCurso || pendenteAntesDeReiniciar) throw falha('ENT-UPDATE-PENDENCIAS', 'Uma alteração ainda aguarda confirmação. O reinício foi cancelado para preservá-la.');
        await armazenamento.fechar();
        const filho = spawn(programa.executavel, ['--entidade-aguardar=' + process.pid], { detached: true, stdio: 'ignore', windowsHide: true });
        await new Promise((resolve, reject) => { filho.once('spawn', resolve); filho.once('error', reject); });
        filho.unref(); app.exit(0); return;
      } else throw falha('ENT-UPDATE-OPERACAO', 'Operação de atualização não permitida.');
      return { ok: true, resultado };
    } catch (erro) {
      if (reiniciando) {
        reiniciando = false; if (ativou) atualizacoes.reverter();
        evento.sender.executeJavaScript("document.querySelector('.app-container').inert = false; document.getElementById('desktop-update-restart')?.remove();").catch(() => {});
      }
      return { ok: false, erro: registrarFalha(erro, 'atualizacao-portatil') };
    }
  });
  ipcMain.handle('entidade:armazenamento', async (evento, pedido) => {
    try {
      validarJanela(evento);
      if (pedido?.acao === 'estado') return { ok: true, resultado: armazenamento.estado() };
      if (pedido?.acao === 'configurar') {
        const particaoAnterior = armazenamento.particao();
        const resultado = await armazenamento.configurar(pedido.dados);
        const reabrir = particaoAnterior !== armazenamento.particao();
        if (reabrir) setTimeout(() => {
          const antiga = BrowserWindow.fromWebContents(evento.sender);
          criarJanela();
          if (antiga && !antiga.isDestroyed()) antiga.destroy();
        }, 250);
        return { ok: true, resultado: { ...resultado, reabrir } };
      }
      throw falha('ENT-CONFIGURACAO-OPERACAO', 'Operação de configuração não permitida.');
    } catch (erro) { return { ok: false, erro: registrarFalha(erro, 'configurar-armazenamento') }; }
  });
  ipcMain.handle('entidade:diagnostico', (evento, detalhe) => {
    validarJanela(evento);
    const codigo = detalhe && detalhe.codigo === 'ENT-UI-PROMESSA' ? 'ENT-UI-PROMESSA' : 'ENT-UI-SCRIPT';
    return diagnosticos.registrar(codigo, String(detalhe && detalhe.mensagem || 'Falha na interface.'), { stack: String(detalhe && detalhe.local || '') });
  });
  ipcMain.handle('entidade:exportar-diagnostico', async evento => {
    validarJanela(evento);
    const escolha = await dialog.showSaveDialog(BrowserWindow.fromWebContents(evento.sender), {
      title: 'Salvar relatório para o suporte',
      defaultPath: path.join(app.getPath('documents'), 'Entidade-diagnostico-' + new Date().toISOString().slice(0, 10) + '.json'),
      filters: [{ name: 'Relatório de diagnóstico', extensions: ['json'] }]
    });
    if (escolha.canceled || !escolha.filePath) return { cancelado: true };
    try {
      fs.writeFileSync(escolha.filePath, JSON.stringify(diagnosticos.relatorio(), null, 2), 'utf8');
      return { salvo: true };
    } catch (erro) {
      const registro = diagnosticos.registrar('ENT-LOG-EXPORTACAO', 'Não foi possível salvar o relatório na pasta escolhida.', erro);
      dialog.showErrorBox('Entidade.V1', registro.mensagem + '\nCódigo: ' + registro.codigo + '\nReferência: ' + registro.referencia);
      return { salvo: false };
    }
  });
  criarJanela();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
let fechandoApp = false;
app.on('before-quit', evento => {
  if (!armazenamento || fechandoApp) return;
  evento.preventDefault(); fechandoApp = true;
  armazenamento.fechar().finally(() => app.quit());
});
