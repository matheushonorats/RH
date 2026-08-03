/** Armazenamento compartilhado dos AFDs e apontamentos da Pré-Leitura REP. */
const REP_ONLINE_ABA_ARQUIVOS_ = 'REP_Arquivos';
const REP_ONLINE_ABA_APONTAMENTOS_ = 'REP_Apontamentos';
const REP_ONLINE_ABA_JUSTIFICATIVAS_ = 'REP_Justificativas';
const REP_ONLINE_ABA_COMPENSACOES_ = 'REP_Compensacoes';
const REP_ONLINE_PASTA_PROP_ = 'REP_ONLINE_PASTA_ID';
const REP_ONLINE_CABECALHO_ARQUIVOS_ = [
  'Chave_REP', 'Numero_REP', 'Nome_Original', 'Pasta_Partes_ID', 'Total_Partes',
  'Tamanho_Original', 'Tamanho_Comprimido', 'Inicio', 'Fim', 'Locais',
  'Atualizado_Em', 'Atualizado_Por', 'Ativo', 'Formato'
];
const REP_ONLINE_CABECALHO_APONTAMENTOS_ = [
  'ID', 'PIS', 'Data', 'Escopo', 'Evento_Chave', 'Texto', 'Status',
  'Criado_Em', 'Criado_Por', 'Atualizado_Em', 'Atualizado_Por',
  'Concluido_Em', 'Concluido_Por', 'Ativo'
];
const REP_ONLINE_CABECALHO_JUSTIFICATIVAS_ = [
  'PIS', 'Data', 'Linha_Lancamento', 'Atualizado_Em', 'Atualizado_Por', 'Ativo'
];
const REP_ONLINE_CABECALHO_COMPENSACOES_ = [
  'PIS', 'Data', 'Minutos', 'Observacao', 'Atualizado_Em', 'Atualizado_Por', 'Ativo'
];

function normalizarNomeArquivoRepOnline_(nomeOriginal) {
  return String(nomeOriginal || 'AFD').trim().toUpperCase().replace(/[^0-9A-Z_.-]+/g, '_').slice(0, 120) || 'AFD';
}

function normalizarChaveArquivoRepOnline_(numeroRep, nomeOriginal) {
  const rep = String(numeroRep || '').replace(/[^0-9A-Za-z_-]/g, '').toUpperCase();
  const nome = normalizarNomeArquivoRepOnline_(nomeOriginal);
  // Alguns equipamentos foram configurados com o mesmo numero de REP em locais
  // diferentes. O arquivo de origem separa essas coletas sem impedir que uma
  // nova versao do mesmo arquivo substitua apenas sua versao anterior.
  if (rep && rep !== 'REPDESCONHECIDO') return 'REP:' + rep + '|ARQUIVO:' + nome;
  return 'ARQUIVO:' + nome;
}

function obterPastaRepOnline_() {
  const props = PropertiesService.getScriptProperties();
  const idSalvo = props.getProperty(REP_ONLINE_PASTA_PROP_);
  if (idSalvo) {
    try { return DriveApp.getFolderById(idSalvo); } catch (e) {}
  }
  const ss = obterPlanilha_();
  let pai = null;
  try {
    const pais = DriveApp.getFileById(ss.getId()).getParents();
    if (pais.hasNext()) pai = pais.next();
  } catch (e) {}
  const nome = 'RHV2 - Arquivos REP';
  let pasta = null;
  if (pai) {
    const existentes = pai.getFoldersByName(nome);
    pasta = existentes.hasNext() ? existentes.next() : pai.createFolder(nome);
  } else {
    const existentes = DriveApp.getFoldersByName(nome);
    pasta = existentes.hasNext() ? existentes.next() : DriveApp.createFolder(nome);
  }
  props.setProperty(REP_ONLINE_PASTA_PROP_, pasta.getId());
  return pasta;
}

function obterAbaRepOnline_(nome, cabecalho) {
  const ss = obterPlanilha_();
  let aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    aba.getRange(1, 1, 1, cabecalho.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    aba.setFrozenRows(1);
  }
  return aba;
}

function validarPastaUploadRepOnline_(idPasta) {
  const pasta = DriveApp.getFolderById(String(idPasta || ''));
  const raiz = obterPastaRepOnline_();
  let pertence = false;
  const pais = pasta.getParents();
  while (pais.hasNext()) {
    if (pais.next().getId() === raiz.getId()) { pertence = true; break; }
  }
  if (!pertence || String(pasta.getName()).indexOf('UPLOAD_') !== 0) throw new Error('Sessão de envio REP inválida.');
  return pasta;
}

function iniciarUploadRepOnline(metadados) {
  obterDadosUsuarioLogado();
  metadados = metadados || {};
  const chave = normalizarChaveArquivoRepOnline_(metadados.numeroRep, metadados.nomeOriginal);
  const pasta = obterPastaRepOnline_().createFolder('UPLOAD_' + Utilities.getUuid());
  pasta.setDescription(JSON.stringify({ chave: chave, criadoEm: new Date().toISOString() }));
  return { uploadId: pasta.getId(), chave: chave };
}

function salvarParteRepOnline(dados) {
  obterDadosUsuarioLogado();
  dados = dados || {};
  const indice = Number(dados.indice);
  if (!Number.isInteger(indice) || indice < 0 || indice > 9999) throw new Error('Parte do arquivo REP inválida.');
  const base64 = String(dados.base64 || '');
  if (!base64 || base64.length > 4000000) throw new Error('Parte do arquivo REP vazia ou acima do limite.');
  const pasta = validarPastaUploadRepOnline_(dados.uploadId);
  const nome = String(indice).padStart(5, '0') + '.part';
  const anteriores = pasta.getFilesByName(nome);
  while (anteriores.hasNext()) anteriores.next().setTrashed(true);
  const bytes = Utilities.base64Decode(base64);
  pasta.createFile(Utilities.newBlob(bytes, 'application/octet-stream', nome));
  return { indice: indice, bytes: bytes.length };
}

function finalizarUploadRepOnline(dados) {
  obterDadosUsuarioLogado();
  dados = dados || {};
  const metadados = dados.metadados || {};
  const totalPartes = Number(dados.totalPartes);
  if (!Number.isInteger(totalPartes) || totalPartes < 1 || totalPartes > 9999) throw new Error('Quantidade de partes REP inválida.');
  const pastaNova = validarPastaUploadRepOnline_(dados.uploadId);
  const arquivos = pastaNova.getFiles();
  const nomes = [];
  let tamanhoComprimido = 0;
  while (arquivos.hasNext()) {
    const arquivo = arquivos.next();
    if (/^\d{5}\.part$/.test(arquivo.getName())) {
      nomes.push(arquivo.getName());
      tamanhoComprimido += arquivo.getSize();
    }
  }
  nomes.sort();
  if (nomes.length !== totalPartes) throw new Error('O envio REP está incompleto: ' + nomes.length + ' de ' + totalPartes + ' partes recebidas.');
  for (let i = 0; i < totalPartes; i++) {
    if (nomes[i] !== String(i).padStart(5, '0') + '.part') throw new Error('Falta a parte ' + (i + 1) + ' do arquivo REP.');
  }

  const chave = normalizarChaveArquivoRepOnline_(metadados.numeroRep, metadados.nomeOriginal);
  const usuario = obterDadosUsuarioLogado();
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) throw new Error('Sistema ocupado ao concluir o envio REP. Tente novamente.');
  let pastaAntigaId = '';
  let ignoradoMaisAntigo = false;
  try {
    const aba = obterAbaRepOnline_(REP_ONLINE_ABA_ARQUIVOS_, REP_ONLINE_CABECALHO_ARQUIVOS_);
    const existentes = aba.getLastRow() > 1 ? aba.getRange(2, 1, aba.getLastRow() - 1, REP_ONLINE_CABECALHO_ARQUIVOS_.length).getValues() : [];
    let linhaAlvo = -1;
    let linhaExistente = null;
    existentes.some(function(linha, indice) {
      if (String(linha[0]) !== chave || String(linha[12] || 'Sim').toLowerCase() === 'não') return false;
      linhaAlvo = indice + 2;
      linhaExistente = linha;
      return true;
    });
    // Migra transparentemente a chave antiga (somente numero do REP), mas apenas
    // quando o nome do arquivo tambem coincide. Assim outro local com o mesmo REP
    // passa a ocupar uma linha independente.
    if (linhaAlvo < 0 && metadados.numeroRep) {
      const chaveLegada = 'REP:' + String(metadados.numeroRep || '').replace(/[^0-9A-Za-z_-]/g, '').toUpperCase();
      const nomeNovo = normalizarNomeArquivoRepOnline_(metadados.nomeOriginal);
      existentes.some(function(linha, indice) {
        if (String(linha[0]) !== chaveLegada || String(linha[12] || 'Sim').toLowerCase() === 'não') return false;
        if (normalizarNomeArquivoRepOnline_(linha[2]) !== nomeNovo) return false;
        linhaAlvo = indice + 2;
        linhaExistente = linha;
        return true;
      });
    }
    if (linhaExistente) {
      pastaAntigaId = String(linhaExistente[3] || '');
      const fimExistente = linhaExistente[8] instanceof Date ? Utilities.formatDate(linhaExistente[8], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(linhaExistente[8] || '');
      if (fimExistente && metadados.fim && fimExistente > String(metadados.fim)) ignoradoMaisAntigo = true;
    }
    if (!ignoradoMaisAntigo) {
      const agora = new Date();
      const valores = [[
        chave, String(metadados.numeroRep || ''), String(metadados.nomeOriginal || 'AFD.txt'), pastaNova.getId(), totalPartes,
        Number(metadados.tamanhoOriginal || 0), tamanhoComprimido, String(metadados.inicio || ''), String(metadados.fim || ''),
        String((metadados.locais || []).join(' | ')), agora, usuario.email || usuario.nome || '', 'Sim', 'gzip-partes-v1'
      ]];
      if (linhaAlvo > 0) aba.getRange(linhaAlvo, 1, 1, REP_ONLINE_CABECALHO_ARQUIVOS_.length).setValues(valores);
      else aba.getRange(aba.getLastRow() + 1, 1, 1, REP_ONLINE_CABECALHO_ARQUIVOS_.length).setValues(valores);
      pastaNova.setName('REP_' + chave.replace(/[^0-9A-Z_-]/gi, '_') + '_' + Utilities.formatDate(agora, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss'));
    }
  } finally {
    lock.releaseLock();
  }
  if (ignoradoMaisAntigo) {
    try { pastaNova.setTrashed(true); } catch (e) {}
    return { sucesso: true, chave: chave, ignoradoMaisAntigo: true, substituiu: false };
  }
  if (pastaAntigaId && pastaAntigaId !== pastaNova.getId()) {
    try { DriveApp.getFolderById(pastaAntigaId).setTrashed(true); } catch (e) {}
  }
  try { lancarLog('REP_ARQUIVO_ONLINE', 'REP_Arquivos', 'Atualizou o AFD online ' + chave + '.', '', '', '', chave); } catch (e) {}
  return { sucesso: true, chave: chave, pastaId: pastaNova.getId(), totalPartes: totalPartes, substituiu: Boolean(pastaAntigaId) };
}

function cancelarUploadRepOnline(uploadId) {
  obterDadosUsuarioLogado();
  try { validarPastaUploadRepOnline_(uploadId).setTrashed(true); } catch (e) {}
  return true;
}

function listarArquivosRepOnline() {
  obterDadosUsuarioLogado();
  const aba = obterAbaRepOnline_(REP_ONLINE_ABA_ARQUIVOS_, REP_ONLINE_CABECALHO_ARQUIVOS_);
  if (aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, REP_ONLINE_CABECALHO_ARQUIVOS_.length).getDisplayValues()
    .filter(function(linha) { return linha[0] && String(linha[12] || 'Sim').toLowerCase() !== 'não'; })
    .map(function(linha) {
      return {
        chave: linha[0], numeroRep: linha[1], nomeOriginal: linha[2], pastaId: linha[3], totalPartes: Number(linha[4] || 0),
        tamanhoOriginal: Number(String(linha[5] || '0').replace(/\D/g, '') || 0), tamanhoComprimido: Number(String(linha[6] || '0').replace(/\D/g, '') || 0),
        inicio: linha[7], fim: linha[8], locais: String(linha[9] || '').split(' | ').filter(Boolean), atualizadoEm: linha[10], atualizadoPor: linha[11]
      };
    });
}

function obterParteArquivoRepOnline(pastaId, indice) {
  obterDadosUsuarioLogado();
  const aba = obterAbaRepOnline_(REP_ONLINE_ABA_ARQUIVOS_, REP_ONLINE_CABECALHO_ARQUIVOS_);
  const idsAtivos = aba.getLastRow() > 1 ? aba.getRange(2, 4, aba.getLastRow() - 1, 10).getValues()
    .filter(function(linha) { return String(linha[9] || 'Sim').toLowerCase() !== 'não'; })
    .map(function(linha) { return String(linha[0]); }) : [];
  if (idsAtivos.indexOf(String(pastaId || '')) === -1) throw new Error('Arquivo REP online não encontrado ou substituído.');
  const nome = String(Number(indice)).padStart(5, '0') + '.part';
  const arquivos = DriveApp.getFolderById(String(pastaId)).getFilesByName(nome);
  if (!arquivos.hasNext()) throw new Error('Parte REP não encontrada: ' + nome);
  return Utilities.base64Encode(arquivos.next().getBlob().getBytes());
}

function obterAbaApontamentosRep_() {
  return obterAbaRepOnline_(REP_ONLINE_ABA_APONTAMENTOS_, REP_ONLINE_CABECALHO_APONTAMENTOS_);
}

function obterAbaJustificativasRep_() {
  return obterAbaRepOnline_(REP_ONLINE_ABA_JUSTIFICATIVAS_, REP_ONLINE_CABECALHO_JUSTIFICATIVAS_);
}

function obterAbaCompensacoesRep_() {
  return obterAbaRepOnline_(REP_ONLINE_ABA_COMPENSACOES_, REP_ONLINE_CABECALHO_COMPENSACOES_);
}

function listarCompensacoesRep() {
  obterDadosUsuarioLogado();
  const aba = obterAbaCompensacoesRep_();
  if (aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, REP_ONLINE_CABECALHO_COMPENSACOES_.length).getValues()
    .filter(function(linha) { return linha[0] && String(linha[6] || 'Sim').toLowerCase() !== 'não'; })
    .map(function(linha) {
      return {
        pis: normalizarIdentificadorRep_(linha[0]),
        data: linha[1] instanceof Date ? Utilities.formatDate(linha[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(linha[1] || ''),
        minutos: Number(linha[2] || 0), observacao: String(linha[3] || ''),
        atualizadoEm: linha[4] instanceof Date ? linha[4].toISOString() : String(linha[4] || ''), atualizadoPor: String(linha[5] || '')
      };
    });
}

function salvarCompensacaoRep(dados) {
  const usuario = obterDadosUsuarioLogado();
  dados = dados || {};
  const pis = normalizarIdentificadorRep_(dados.pis);
  const data = String(dados.data || '');
  const minutos = Number(dados.minutos || 0);
  const observacao = String(dados.observacao || '').trim().slice(0, 500);
  if (!pis || !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Servidor ou data inválida para a compensação.');
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 1440) throw new Error('Informe uma compensação válida de até 24 horas.');

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) throw new Error('Sistema ocupado ao salvar a compensação. Tente novamente.');
  try {
    const aba = obterAbaCompensacoesRep_();
    const existentes = aba.getLastRow() > 1 ? aba.getRange(2, 1, aba.getLastRow() - 1, REP_ONLINE_CABECALHO_COMPENSACOES_.length).getValues() : [];
    let linhaAlvo = -1;
    existentes.some(function(linha, indice) {
      const dataLinha = linha[1] instanceof Date ? Utilities.formatDate(linha[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(linha[1] || '');
      if (normalizarIdentificadorRep_(linha[0]) === pis && dataLinha === data) {
        linhaAlvo = indice + 2;
        return true;
      }
      return false;
    });
    const valores = [[pis, data, minutos || '', observacao, new Date(), usuario.email || usuario.nome || '', minutos ? 'Sim' : 'Não']];
    const destino = linhaAlvo > 0 ? linhaAlvo : aba.getLastRow() + 1;
    aba.getRange(destino, 2).setNumberFormat('@');
    aba.getRange(destino, 1, 1, REP_ONLINE_CABECALHO_COMPENSACOES_.length).setValues(valores);
    try { lancarLog('REP_COMPENSACAO', 'REP_Compensacoes', (minutos ? 'Salvou' : 'Removeu') + ' compensação de jornada em ' + data + '.', '', '', String(minutos), pis); } catch (e) {}
    return { sucesso: true, removido: !minutos };
  } finally {
    lock.releaseLock();
  }
}

/** Associa manualmente um dia do REP a um lancamento ja existente no RH. */
function listarJustificativasLancamentoRep() {
  obterDadosUsuarioLogado();
  const aba = obterAbaJustificativasRep_();
  if (aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, REP_ONLINE_CABECALHO_JUSTIFICATIVAS_.length).getValues()
    .filter(function(linha) { return linha[0] && String(linha[5] || 'Sim').toLowerCase() !== 'não'; })
    .map(function(linha) {
      return {
        pis: normalizarIdentificadorRep_(linha[0]),
        data: linha[1] instanceof Date ? Utilities.formatDate(linha[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(linha[1] || ''),
        linhaLancamento: Number(linha[2] || 0),
        atualizadoEm: linha[3] instanceof Date ? linha[3].toISOString() : String(linha[3] || ''),
        atualizadoPor: String(linha[4] || '')
      };
    });
}

function salvarJustificativaLancamentoRep(dados) {
  const usuario = obterDadosUsuarioLogado();
  dados = dados || {};
  const pis = normalizarIdentificadorRep_(dados.pis);
  const data = String(dados.data || '');
  const linhaLancamento = Number(dados.linhaLancamento || 0);
  if (!pis || !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Servidor ou data inválida para associar o lançamento.');
  if (linhaLancamento && (!Number.isInteger(linhaLancamento) || linhaLancamento < 2)) throw new Error('Lançamento inválido.');
  if (linhaLancamento) {
    const servidor = obterListaServidores().find(function(item) { return normalizarIdentificadorRep_(item.pis) === pis; });
    const lancamento = obterListaLancamentos().find(function(item) { return Number(item.linhaPlanilha) === linhaLancamento; });
    if (!servidor || !lancamento || lancamento.identidadeConsistente === false || !ehTipoAusenciaConflitante_(lancamento.tipo)) {
      throw new Error('O lançamento selecionado não é uma ausência válida deste servidor.');
    }
    if (normalizarChaveMatricula_(servidor.matricula) !== normalizarChaveMatricula_(lancamento.matricula)) {
      throw new Error('O lançamento selecionado pertence a outro servidor.');
    }
  }

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) throw new Error('Sistema ocupado ao associar a ausência. Tente novamente.');
  try {
    const aba = obterAbaJustificativasRep_();
    const existentes = aba.getLastRow() > 1
      ? aba.getRange(2, 1, aba.getLastRow() - 1, REP_ONLINE_CABECALHO_JUSTIFICATIVAS_.length).getValues()
      : [];
    let linhaAlvo = -1;
    existentes.some(function(linha, indice) {
      const dataLinha = linha[1] instanceof Date ? Utilities.formatDate(linha[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(linha[1] || '');
      if (normalizarIdentificadorRep_(linha[0]) === pis && dataLinha === data) {
        linhaAlvo = indice + 2;
        return true;
      }
      return false;
    });
    const valores = [[pis, data, linhaLancamento || '', new Date(), usuario.email || usuario.nome || '', linhaLancamento ? 'Sim' : 'Não']];
    const destino = linhaAlvo > 0 ? linhaAlvo : aba.getLastRow() + 1;
    aba.getRange(destino, 2).setNumberFormat('@');
    aba.getRange(destino, 1, 1, REP_ONLINE_CABECALHO_JUSTIFICATIVAS_.length).setValues(valores);
    return { sucesso: true, removido: !linhaLancamento };
  } finally {
    lock.releaseLock();
  }
}

function listarApontamentosRep() {
  obterDadosUsuarioLogado();
  const aba = obterAbaApontamentosRep_();
  if (aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, REP_ONLINE_CABECALHO_APONTAMENTOS_.length).getValues()
    .filter(function(linha) { return linha[0] && String(linha[13] || 'Sim').toLowerCase() !== 'não'; })
    .map(function(linha) {
      return {
        id: String(linha[0]), pis: normalizarIdentificadorRep_(linha[1]), data: linha[2] instanceof Date ? Utilities.formatDate(linha[2], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(linha[2]), escopo: String(linha[3]), eventoChave: String(linha[4] || ''),
        texto: String(linha[5] || ''), status: String(linha[6] || 'ABERTO'), criadoEm: linha[7] instanceof Date ? linha[7].toISOString() : String(linha[7] || ''),
        criadoPor: String(linha[8] || ''), atualizadoEm: linha[9] instanceof Date ? linha[9].toISOString() : String(linha[9] || ''), atualizadoPor: String(linha[10] || ''),
        concluidoEm: linha[11] instanceof Date ? linha[11].toISOString() : String(linha[11] || ''), concluidoPor: String(linha[12] || '')
      };
    });
}

function salvarApontamentoRep(dados) {
  const usuario = obterDadosUsuarioLogado();
  dados = dados || {};
  const pis = normalizarIdentificadorRep_(dados.pis);
  const data = String(dados.data || '');
  const escopoInformado = String(dados.escopo || 'DIA').toUpperCase();
  const escopo = ['SERVIDOR', 'DIA', 'REGISTRO'].indexOf(escopoInformado) !== -1 ? escopoInformado : 'DIA';
  const texto = String(dados.texto || '').trim();
  if (!pis || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !texto) throw new Error('Informe o servidor, a competência/data e o texto do apontamento.');
  if (texto.length > 2000) throw new Error('O apontamento deve possuir no máximo 2.000 caracteres.');
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) throw new Error('Sistema ocupado ao salvar o apontamento. Tente novamente.');
  try {
    const aba = obterAbaApontamentosRep_();
    const agora = new Date();
    const id = String(dados.id || '').trim() || Utilities.getUuid();
    let linhaAlvo = -1;
    let criadoEm = agora;
    let criadoPor = usuario.email || usuario.nome || '';
    if (aba.getLastRow() > 1) {
      const existentes = aba.getRange(2, 1, aba.getLastRow() - 1, REP_ONLINE_CABECALHO_APONTAMENTOS_.length).getValues();
      existentes.some(function(linha, indice) {
        if (String(linha[0]) !== id || String(linha[13] || 'Sim').toLowerCase() === 'não') return false;
        linhaAlvo = indice + 2;
        criadoEm = linha[7] || agora;
        criadoPor = String(linha[8] || criadoPor);
        return true;
      });
    }
    const status = String(dados.status || 'ABERTO').toUpperCase() === 'CONCLUIDO' ? 'CONCLUIDO' : 'ABERTO';
    const valores = [[
      id, pis, data, escopo, escopo === 'REGISTRO' ? String(dados.eventoChave || '') : '', texto, status,
      criadoEm, criadoPor, agora, usuario.email || usuario.nome || '', status === 'CONCLUIDO' ? agora : '', status === 'CONCLUIDO' ? (usuario.email || usuario.nome || '') : '', 'Sim'
    ]];
    const linhaDestino = linhaAlvo > 0 ? linhaAlvo : aba.getLastRow() + 1;
    aba.getRange(linhaDestino, 3).setNumberFormat('@');
    aba.getRange(linhaDestino, 1, 1, REP_ONLINE_CABECALHO_APONTAMENTOS_.length).setValues(valores);
    return { sucesso: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function definirStatusApontamentoRep(id, status) {
  const apontamento = listarApontamentosRep().find(function(item) { return item.id === String(id || ''); });
  if (!apontamento) throw new Error('Apontamento não encontrado.');
  apontamento.status = String(status || '').toUpperCase() === 'CONCLUIDO' ? 'CONCLUIDO' : 'ABERTO';
  return salvarApontamentoRep(apontamento);
}

function excluirApontamentoRep(id) {
  obterDadosUsuarioLogado();
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) throw new Error('Sistema ocupado ao excluir o apontamento. Tente novamente.');
  try {
    const aba = obterAbaApontamentosRep_();
    if (aba.getLastRow() < 2) throw new Error('Apontamento não encontrado.');
    const ids = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id || '')) {
        aba.getRange(i + 2, 14).setValue('Não');
        return { sucesso: true };
      }
    }
    throw new Error('Apontamento não encontrado.');
  } finally {
    lock.releaseLock();
  }
}
