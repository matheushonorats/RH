const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { LocalStore } = require('./local-store.cjs');
const { ESQUEMA } = require('./storage-schema.cjs');
const { marcaPortatil } = require('./portable-brand.cjs');

function formatDate(data, timezone, formato) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(data)).map(parte => [parte.type, parte.value]));
  const tokens = { yyyy: partes.year, yy: partes.year.slice(-2), MM: partes.month, dd: partes.day,
    HH: partes.hour, mm: partes.minute, ss: partes.second };
  return formato.replace(/'([^']*)'|yyyy|yy|MM|dd|HH|mm|ss/g, (token, literal) => literal === undefined ? tokens[token] : literal);
}
function blob(dados, tipo = 'application/octet-stream', nome = 'arquivo') {
  const bytes = Buffer.isBuffer(dados) ? dados : typeof dados === 'string' ? Buffer.from(dados) : Buffer.from(dados || []);
  return { getBytes: () => Array.from(bytes), getDataAsString: () => bytes.toString('utf8'),
    getContentType: () => tipo, getName: () => nome, bytes };
}
function iterador(valores) { let indice = 0; return { hasNext: () => indice < valores.length, next: () => valores[indice++] }; }

class LocalRuntime {
  constructor(pasta, fonte = path.join(__dirname, 'source-app')) {
    this.store = new LocalStore(pasta);
    this.fonte = fonte;
    this.cache = new Map();
    this.scripts = fs.readdirSync(fonte).filter(nome => nome.endsWith('.gs') && !nome.endsWith('Tests.gs'))
      .map(nome => new vm.Script(marcaPortatil(fs.readFileSync(path.join(fonte, nome), 'utf8')), { filename: nome }));
    this.arquivos = path.join(pasta, 'arquivos'); fs.mkdirSync(this.arquivos, { recursive: true });
  }

  objeto(id, tipo) {
    const linha = this.store.db.prepare('SELECT dados FROM objetos WHERE id=?').get(String(id));
    if (!linha) throw new Error('Arquivo ou pasta local não encontrado. [ENT-LOCAL-ARQUIVO]');
    const dados = JSON.parse(linha.dados);
    if (dados.excluido || (tipo && dados.tipo !== tipo)) throw new Error('Arquivo ou pasta local indisponível. [ENT-LOCAL-ARQUIVO]');
    const gravar = () => this.store.db.prepare('UPDATE objetos SET dados=? WHERE id=?').run(JSON.stringify(dados), dados.id);
    const filhos = tipoFilho => this.store.db.prepare('SELECT id,dados FROM objetos').all().filter(item => {
      const filho = JSON.parse(item.dados); return filho.pai === dados.id && filho.tipo === tipoFilho && !filho.excluido;
    }).map(item => this.objeto(item.id, tipoFilho));
    const api = {
      getId: () => dados.id, getName: () => dados.nome, getMimeType: () => dados.mime || 'application/octet-stream',
      getUrl: () => 'entidade://app/arquivo/' + dados.id,
      getDateCreated: () => new Date(dados.criado), getLastUpdated: () => new Date(dados.atualizado || dados.criado),
      getParents: () => iterador(dados.pai ? [this.objeto(dados.pai, 'pasta')] : []),
      setName: nome => { dados.nome = String(nome); gravar(); return api; },
      setDescription: texto => { dados.descricao = String(texto); gravar(); return api; },
      setTrashed: excluido => { dados.excluido = Boolean(excluido); gravar(); return api; },
      getFiles: () => iterador(filhos('arquivo')),
      getFoldersByName: nome => iterador(filhos('pasta').filter(item => item.getName() === nome)),
      getFilesByName: nome => iterador(filhos('arquivo').filter(item => item.getName() === nome)),
      createFolder: nome => this.criarObjeto('pasta', nome, dados.id),
      createFile: (nomeOuBlob, conteudo, mime) => {
        const arquivo = typeof nomeOuBlob === 'string' ? blob(conteudo, mime || 'text/plain', nomeOuBlob) : nomeOuBlob;
        return this.criarObjeto('arquivo', arquivo.getName(), dados.id, arquivo);
      },
      getBlob: () => dados.id === 'local-workbook'
        ? blob(JSON.stringify(this.store.snapshot()), 'application/json', 'base-entidade.json')
        : blob(fs.readFileSync(path.join(this.arquivos, dados.id)), dados.mime, dados.nome),
      getSize: () => dados.id === 'local-workbook' ? Buffer.byteLength(JSON.stringify(this.store.snapshot())) : fs.statSync(path.join(this.arquivos, dados.id)).size,
      makeCopy: (nome, pastaDestino) => this.criarObjeto('arquivo', nome, pastaDestino?.getId() || 'local-root', api.getBlob())
    };
    return api;
  }

  criarObjeto(tipo, nome, pai, conteudo, id = crypto.randomUUID()) {
    const dados = { id, tipo, nome: String(nome), pai, criado: new Date().toISOString(), mime: conteudo?.getContentType() };
    if (conteudo) fs.writeFileSync(path.join(this.arquivos, id), Buffer.from(conteudo.getBytes()));
    this.store.db.prepare('INSERT INTO objetos VALUES(?,?)').run(id, JSON.stringify(dados));
    return this.objeto(id, tipo);
  }

  contexto() {
    const store = this.store;
    const cache = {
      get: chave => { const entrada = this.cache.get(chave); if (entrada && entrada.expira > Date.now()) return entrada.valor; this.cache.delete(chave); return null; },
      put: (chave, valor, segundos) => this.cache.set(chave, { valor: String(valor), expira: Date.now() + segundos * 1000 }),
      remove: chave => this.cache.delete(chave)
    };
    const lock = { waitLock() {}, tryLock: () => true, releaseLock() {} };
    const timezone = 'America/Sao_Paulo';
    const utilidades = {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(), formatDate, newBlob: blob,
      computeDigest: (algoritmo, dados) => Array.from(crypto.createHash(algoritmo).update(typeof dados === 'string' ? dados : Buffer.from(dados)).digest()).map(valor => valor > 127 ? valor - 256 : valor),
      base64Encode: dados => Buffer.from(dados).toString('base64'),
      base64EncodeWebSafe: dados => Buffer.from(dados).toString('base64url'),
      base64Decode: dados => Array.from(Buffer.from(dados, 'base64')),
      ungzip: entrada => blob(zlib.gunzipSync(Buffer.from(entrada.getBytes()))),
      sleep: tempo => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, tempo)
    };
    const gatilho = { timeBased() { return this; }, everyDays() { return this; }, everyHours() { return this; }, atHour() { return this; }, create() { return this; } };
    const contexto = vm.createContext({ Date, console: { log() {}, warn() {} }, Logger: { log() {} },
      SpreadsheetApp: { openById: () => store, getActiveSpreadsheet: () => store, flush() {},
        CopyPasteType: { PASTE_FORMULA: 'PASTE_FORMULA', PASTE_FORMAT: 'PASTE_FORMAT' }, getUi: () => ({ alert() {}, ButtonSet: { OK: 'OK' } }) },
      PropertiesService: { getScriptProperties: () => store }, CacheService: { getScriptCache: () => cache },
      LockService: { getScriptLock: () => lock, getDocumentLock: () => lock, getUserLock: () => lock },
      Session: { getScriptTimeZone: () => timezone, getEffectiveUser: () => ({ getEmail: () => store.getProperty('EMAIL_ADMIN_INICIAL_RH') || '' }),
        getActiveUser: () => ({ getEmail: () => vm.runInContext('_usuarioSessaoAtual?.email || ""', contexto) }) },
      ScriptApp: { getProjectTriggers: () => [], newTrigger: () => gatilho, deleteTrigger() {} },
      DriveApp: { getFileById: id => this.objeto(id), getFolderById: id => this.objeto(id, 'pasta'), createFolder: nome => this.criarObjeto('pasta', nome, 'local-root') },
      Utilities: utilidades, MimeType: { CSV: 'text/csv', PLAIN_TEXT: 'text/plain', PDF: 'application/pdf' },
      MailApp: { sendEmail: () => { throw new Error('Conecte uma conta ou serviço de e-mail antes de enviar mensagens. [ENT-EMAIL-CONEXAO]'); } },
      UrlFetchApp: { fetch: (url, opcoes) => {
        const resposta = spawnSync(process.execPath, [path.join(__dirname, 'local-fetch.cjs')], {
          input: JSON.stringify({ url, opcoes }), encoding: 'utf8', timeout: 310000, maxBuffer: 50 * 1024 * 1024,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true
        });
        if (resposta.status !== 0 || resposta.error) throw new Error('O serviço externo não respondeu. [ENT-LOCAL-REDE]');
        const pacote = JSON.parse(resposta.stdout);
        if (pacote.erro) throw new Error(pacote.erro);
        return { getResponseCode: () => pacote.status, getContentText: () => pacote.texto, getHeaders: () => pacote.cabecalhos };
      } }
    });
    for (const script of this.scripts) script.runInContext(contexto);
    contexto.obterPlanilha_ = () => store;
    contexto.validarAmbienteBeta_ = () => true;
    contexto.betaEstaSomenteLeitura_ = () => false;
    contexto.betaConectadaProducao_ = () => false;
    contexto.sincronizarEspelhoProducaoBeta_ = () => false;
    return contexto;
  }

  iniciar(email, nome) {
    if (this.store.getProperty('LOCAL_CONFIGURADO')) throw new Error('A base local já foi configurada. [ENT-LOCAL-CONFIGURACAO]');
    return this.store.transacao(() => {
      this.criarObjeto('pasta', 'Entidade', null, null, 'local-root');
      this.criarObjeto('arquivo', 'Base Entidade', 'local-root', null, 'local-workbook');
      for (const [guia, colunas] of Object.entries(ESQUEMA)) this.store.insertSheet(guia).appendRow(colunas);
      const contexto = this.contexto();
      contexto.executarConfiguracaoInicial();
      this.store.getSheetByName('Usuarios').appendRow([String(email).trim().toLowerCase(), String(nome).trim(), 'Administrador', 'Sim', '', '']);
      const anexos = this.criarObjeto('pasta', 'Anexos', 'local-root');
      this.store.setProperties({ LOCAL_CONFIGURADO: 'SIM', EMAIL_ADMIN_INICIAL_RH: String(email).trim().toLowerCase(),
        BETA_SETUP_COMPLETE: 'SIM', BETA_SPREADSHEET_ID: 'local-workbook', BETA_ROOT_FOLDER_ID: 'local-root',
        BETA_ATTACHMENTS_FOLDER_ID: anexos.getId(), BETA_READ_ONLY: 'NAO', BETA_CONNECTED_PRODUCTION: 'NAO',
        BETA_MIRROR_ENABLED: 'NAO' });
      const configuracoes = this.store.getSheetByName('Configuracoes');
      for (let i = 1; i < configuracoes.linhas.length; i++) {
        if (['EMAIL_DESTINO', 'SETOR_HORAS_EXTRAS', 'SECRETARIA_HORAS_EXTRAS', 'SECRETARIO_NOME', 'SECRETARIO_CARGO'].includes(configuracoes.linhas[i][0])) configuracoes.getRange(i + 1, 2).setValue('');
      }
      return { configurado: true };
    });
  }

  chamar(metodo, argumentos = []) {
    if (!['verificarStatusEmail', 'fazerLogin', 'definirSenhaPrimeiroAcesso', 'verificarSessao', 'executarApiBackend'].includes(metodo)) throw new Error('Operação local não autorizada. [ENT-LOCAL-OPERACAO]');
    if (!this.store.getProperty('LOCAL_CONFIGURADO')) throw new Error('Escolha onde salvar e configure a base local antes de entrar. [ENT-LOCAL-CONFIGURACAO]');
    return this.store.transacao(() => {
      const contexto = this.contexto();
      const resultado = contexto[metodo].apply(contexto, argumentos);
      return resultado === undefined ? null : JSON.parse(JSON.stringify(resultado));
    });
  }
  fechar() { this.store.close(); }
}

module.exports = { LocalRuntime, formatDate };
