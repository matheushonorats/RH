/**
 * Lançamentos assistidos pela Entidade a partir de PDF.
 * O PDF é lido localmente no navegador; a planilha e o Drive só são alterados
 * depois da confirmação explícita do usuário.
 */

function obterIdentidadeEntidade_(usuario) {
  return String((usuario && (usuario.email || usuario.nome)) || '').toLowerCase().trim();
}

function extrairConteudoRespostaIA_(conteudo) {
  if (typeof conteudo === 'string') return conteudo;
  if (Array.isArray(conteudo)) return conteudo.map(function(parte) { return parte && (parte.text || parte.content) || ''; }).join('\n');
  return String(conteudo || '');
}

function normalizarJsonRespostaIA_(texto) {
  const limpo = String(texto || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio === -1 || fim <= inicio) throw new Error('A leitura do PDF não retornou uma estrutura válida.');
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

function localizarTipoDocumentoAssistido_(tipos, tipoInformado) {
  const chave = normalizarCabecalho_(tipoInformado || '').toUpperCase();
  return (tipos || []).find(function(tipo) {
    return normalizarCabecalho_(tipo.nome || '').toUpperCase() === chave;
  }) || null;
}

function localizarServidorAssistido_(servidores, matricula) {
  const chave = normalizarChaveMatricula_(matricula || '');
  return (servidores || []).find(function(servidor) {
    return normalizarChaveMatricula_(servidor.matricula || '') === chave;
  }) || null;
}

function validarPropostaLancamentoAssistido_(proposta, tipos, servidores) {
  const pendencias = [];
  const servidor = localizarServidorAssistido_(servidores, proposta.matricula);
  const tipo = localizarTipoDocumentoAssistido_(tipos, proposta.tipo);
  proposta.matricula = servidor ? String(servidor.matricula) : String(proposta.matricula || '').trim();
  proposta.tipo = tipo ? tipo.nome : String(proposta.tipo || '').trim();
  proposta.dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(String(proposta.dataInicio || '')) ? proposta.dataInicio : '';
  proposta.dataSolicitacao = /^\d{4}-\d{2}-\d{2}$/.test(String(proposta.dataSolicitacao || '')) ? proposta.dataSolicitacao : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  proposta.dias = Math.max(0, parseInt(proposta.dias, 10) || 0);
  proposta.qtdHoras = String(proposta.qtdHoras || '').trim();
  proposta.idoc = String(proposta.idoc || '').trim();
  proposta.despacho = String(proposta.despacho || '').trim().slice(0, 300);
  proposta.observacao = String(proposta.observacao || '').trim().slice(0, 1200);

  if (!servidor) pendencias.push('Não identifiquei uma matrícula válida do servidor no documento.');
  if (!tipo) pendencias.push('Não identifiquei um tipo de documento cadastrado e ativo.');
  if (!proposta.dataInicio) pendencias.push('Não identifiquei com segurança a data de início/ocorrência.');
  if (proposta.tipo === 'Autorização de Horas Extras') {
    if (!/^\d{1,2}:\d{2}$/.test(proposta.qtdHoras)) pendencias.push('Informe a quantidade de horas no formato HH:MM.');
  } else if (proposta.tipo) {
    if (proposta.dias < 1 || proposta.dias > 90) pendencias.push('Não identifiquei uma quantidade de dias válida entre 1 e 90.');
  }
  return { pendencias: pendencias, servidor: servidor, tipo: tipo };
}

function proporLancamentoAssistidoEntidade(mensagemUsuario, arquivo) {
  const usuario = obterDadosUsuarioLogado();
  if (!verificarSeEhOperador()) return { erro: 'Você não possui permissão para criar lançamentos.' };
  const textoPdf = String(arquivo && arquivo.textoExtraido || '').trim().slice(0, 30000);
  if (textoPdf.length < 30) return { erro: 'Não consegui extrair texto suficiente do PDF. Use um PDF pesquisável ou informe manualmente os dados no lançamento comum.' };

  const servidores = obterListaServidores().filter(function(item) { return item.status !== 'Inativo'; });
  const tipos = obterListaTiposDocumento().filter(function(item) { return String(item.ativo || 'Sim').trim() !== 'Não'; });
  const referenciaServidores = servidores.map(function(item) { return { matricula: item.matricula, nome: item.nome }; });
  const referenciaTipos = tipos.map(function(item) { return item.nome; });
  const prompt = [
    'Você extrai dados de um documento de RH para uma PROPOSTA, sem inventar dados.',
    'Responda exclusivamente JSON válido, sem markdown, com as chaves: matricula, tipo, dataInicio (YYYY-MM-DD), dataSolicitacao (YYYY-MM-DD), dias (número), qtdHoras (HH:MM ou vazio), idoc, despacho, observacao, confianca (alta/media/baixa).',
    'Use matrícula e tipo somente se coincidirem com as listas fornecidas. Quando um dado não estiver claro, use string vazia ou 0.',
    'Não use dados de outro servidor, não calcule férias, não conclua dias a partir de suposições.',
    'TEXTO DO USUÁRIO: ' + String(mensagemUsuario || '').slice(0, 1200),
    'TIPOS PERMITIDOS: ' + JSON.stringify(referenciaTipos),
    'SERVIDORES: ' + JSON.stringify(referenciaServidores),
    'TEXTO EXTRAÍDO DO PDF: ' + textoPdf
  ].join('\n\n');

  const resultado = chamarProvedorEntidade_([{ role: 'system', content: 'Responda somente JSON válido.' }, { role: 'user', content: prompt }], false);
  if (!resultado || resultado.erro) return { erro: resultado && resultado.erro || 'A Entidade não conseguiu analisar o PDF agora.' };
  let proposta = null;
  try {
    proposta = normalizarJsonRespostaIA_(extrairConteudoRespostaIA_(resultado.dados.choices[0].message.content));
  } catch (e) {
    return { erro: 'Não foi possível interpretar a leitura do PDF com segurança. Preencha o lançamento manualmente.' };
  }

  const validacao = validarPropostaLancamentoAssistido_(proposta, tipos, servidores);
  if (validacao.pendencias.length) {
    return { pendencias: validacao.pendencias, propostaParcial: proposta };
  }

  const registro = {
    token: Utilities.getUuid(),
    expiraEm: Date.now() + (10 * 60 * 1000),
    usuario: obterIdentidadeEntidade_(usuario),
    arquivoNome: String(arquivo.nome || 'documento.pdf').slice(0, 180),
    matricula: proposta.matricula,
    nome: validacao.servidor.nome,
    tipo: proposta.tipo,
    dataInicio: proposta.dataInicio,
    dataSolicitacao: proposta.dataSolicitacao,
    dias: proposta.dias,
    qtdHoras: proposta.qtdHoras,
    idoc: proposta.idoc,
    despacho: proposta.despacho,
    observacao: proposta.observacao,
    confianca: String(proposta.confianca || 'media').toLowerCase()
  };
  PropertiesService.getScriptProperties().setProperty('ENTIDADE_LANCAMENTO_' + registro.token, JSON.stringify(registro));
  return { proposta: registro };
}

function confirmarLancamentoAssistidoEntidade(token, arquivoDrive) {
  const usuario = obterDadosUsuarioLogado();
  if (!verificarSeEhOperador()) throw new Error('Você não possui permissão para confirmar lançamentos.');
  const chave = 'ENTIDADE_LANCAMENTO_' + String(token || '');
  let proposta = null;
  try { proposta = JSON.parse(PropertiesService.getScriptProperties().getProperty(chave) || 'null'); } catch (e) {}
  if (!proposta) throw new Error('Esta proposta não existe mais. Analise o PDF novamente.');
  if (Date.now() > Number(proposta.expiraEm || 0)) {
    PropertiesService.getScriptProperties().deleteProperty(chave);
    throw new Error('A proposta expirou. Analise o PDF novamente.');
  }
  if (obterIdentidadeEntidade_(usuario) !== String(proposta.usuario || '')) throw new Error('Esta proposta pertence a outro usuário.');

  const idArquivo = String(arquivoDrive && arquivoDrive.id || '');
  if (!idArquivo) throw new Error('O PDF não foi enviado ao Drive.');
  let arquivo = null;
  try { arquivo = DriveApp.getFileById(idArquivo); } catch (e) { throw new Error('Não foi possível validar o PDF enviado.'); }
  if (arquivo.getMimeType() !== MimeType.PDF) throw new Error('O anexo confirmado precisa ser um PDF.');

  salvarLancamento({
    linhaPlanilha: '',
    tipo: proposta.tipo,
    idoc: proposta.idoc,
    matricula: proposta.matricula,
    dataSolicitacao: proposta.dataSolicitacao,
    dataInicio: proposta.dataInicio,
    dias: proposta.dias,
    qtdHoras: proposta.qtdHoras,
    mesHE: '',
    anoHE: '',
    despacho: proposta.despacho,
    observacao: proposta.observacao,
    anexo1: arquivo.getUrl(),
    anexo2: '',
    anexo3: ''
  });
  PropertiesService.getScriptProperties().deleteProperty(chave);
  lancarLog('LANCAMENTO_ASSISTIDO_IA', 'Lançamentos', 'Lançamento confirmado pelo usuário após leitura assistida de PDF: ' + proposta.tipo + ' para ' + proposta.nome, 'Lançamento', '', JSON.stringify({ matricula: proposta.matricula, tipo: proposta.tipo, arquivo: arquivo.getName() }), proposta.matricula);
  return { sucesso: true, nome: proposta.nome, tipo: proposta.tipo, matricula: proposta.matricula };
}
