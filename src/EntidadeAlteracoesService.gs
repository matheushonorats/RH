/**
 * Alteracoes assistidas pela Entidade.
 * A IA/chat nunca grava diretamente: esta camada so prepara uma proposta
 * limitada e exige confirmacao explicita do usuario autenticado.
 */

function normalizarSituacaoAssistida_(valor) {
  const mapa = {
    ESTATUTARIO: 'ESTATUTÁRIO',
    COMISSIONADO: 'COMISSIONADO',
    ESTAGIARIO: 'ESTAGIÁRIO'
  };
  return mapa[normalizarCabecalho_(valor || '').toUpperCase()] || '';
}

function extrairValorAlteracaoAssistida_(texto, campo) {
  const padroes = {
    cargo: /\bcargo\b.*?\b(?:para|por)\s+(.+?)\s*$/i,
    lotacao: /\b(?:lotação|lotacao)\b.*?\b(?:para|por)\s+(.+?)\s*$/i,
    situacao: /\b(?:situação|situacao)\b.*?\b(?:para|por)\s+(.+?)\s*$/i,
    email: /\b(?:e-?mail)\b.*?\b(?:para|por)\s+([^\s,;]+@[^\s,;]+)\s*$/i
  };
  const encontrado = String(texto || '').match(padroes[campo]);
  return encontrado ? String(encontrado[1] || '').trim().replace(/[.;]+$/, '') : '';
}

function identificarCampoAlteracaoAssistida_(texto) {
  const normalizado = normalizarCabecalho_(texto || '').toUpperCase();
  if (/\bE MAIL\b|\bEMAIL\b/.test(normalizado)) return 'email';
  if (/\bLOTACAO\b/.test(normalizado)) return 'lotacao';
  if (/\bSITUACAO\b/.test(normalizado)) return 'situacao';
  if (/\bCARGO\b/.test(normalizado)) return 'cargo';
  return '';
}

function obterConfiguracaoCampoAssistido_(campo, cabecalho) {
  const opcoes = {
    cargo: { rotulo: 'Cargo', indices: ['CARGO'] },
    lotacao: { rotulo: 'Lotação', indices: ['LOTACAO'] },
    situacao: { rotulo: 'Situação funcional', indices: ['SITUACAO'] },
    email: { rotulo: 'E-mail', indices: ['E MAIL', 'EMAIL'] }
  };
  const configuracao = opcoes[campo];
  if (!configuracao) return null;
  configuracao.indice = indiceCabecalho_(cabecalho, configuracao.indices);
  return configuracao;
}

function proporAlteracaoAssistidaEntidade(texto) {
  const usuario = obterDadosUsuarioLogado();
  if (!verificarSeEhOperador()) {
    return { reconhecida: true, erro: 'Você não possui permissão para propor alterações de cadastro.' };
  }

  const campo = identificarCampoAlteracaoAssistida_(texto);
  const matriculaEncontrada = String(texto || '').match(/\bmatr[ií]cula\s*(?:n[ºo.]?\s*)?[:#-]?\s*(\d{3,})\b/i);
  if (!campo || !matriculaEncontrada) return { reconhecida: false };

  let novoValor = extrairValorAlteracaoAssistida_(texto, campo);
  if (!novoValor) {
    return { reconhecida: true, erro: 'Informe o novo valor após “para”. Exemplo: “Altere a lotação da matrícula 32670 para Secretaria de Turismo”.' };
  }
  if (novoValor.length > 120) return { reconhecida: true, erro: 'O novo valor informado é muito longo para uma alteração assistida.' };

  if (campo === 'situacao') {
    novoValor = normalizarSituacaoAssistida_(novoValor);
    if (!novoValor) return { reconhecida: true, erro: 'Situação inválida. Use Estatutário, Comissionado ou Estagiário.' };
  }
  if (campo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novoValor)) {
    return { reconhecida: true, erro: 'O e-mail informado não é válido.' };
  }

  const ss = obterPlanilha_();
  const aba = ss.getSheetByName('Servidores');
  if (!aba || aba.getLastRow() <= 1) return { reconhecida: true, erro: 'A aba Servidores não está disponível.' };
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  const idxMatricula = indiceCabecalho_(cabecalho, ['MATRICULA']);
  const idxNome = indiceCabecalho_(cabecalho, ['NOME', 'NOME COMPLETO']);
  const configuracao = obterConfiguracaoCampoAssistido_(campo, cabecalho);
  if (idxMatricula === -1 || !configuracao || configuracao.indice === -1) {
    return { reconhecida: true, erro: 'A coluna necessária não foi encontrada na aba Servidores.' };
  }

  const chaveMatricula = normalizarChaveMatricula_(matriculaEncontrada[1]);
  let linha = -1;
  for (let i = 1; i < dados.length; i++) {
    if (normalizarChaveMatricula_(dados[i][idxMatricula]) === chaveMatricula) {
      linha = i + 1;
      break;
    }
  }
  if (linha === -1) return { reconhecida: true, erro: 'Não localizei servidor com a matrícula ' + matriculaEncontrada[1] + '.' };

  const valorAntes = String(dados[linha - 1][configuracao.indice] || '').trim();
  if (valorAntes === novoValor) return { reconhecida: true, erro: 'O cadastro já possui esse mesmo valor.' };

  const proposta = {
    token: Utilities.getUuid(),
    expiraEm: Date.now() + (10 * 60 * 1000),
    usuarioEmail: String(usuario.email || '').toLowerCase(),
    matricula: String(dados[linha - 1][idxMatricula]).trim(),
    nome: idxNome === -1 ? '' : String(dados[linha - 1][idxNome]).trim(),
    campo: campo,
    campoRotulo: configuracao.rotulo,
    valorAntes: valorAntes,
    valorDepois: novoValor
  };
  PropertiesService.getScriptProperties().setProperty('ENTIDADE_PROPOSTA_' + proposta.token, JSON.stringify(proposta));
  return { reconhecida: true, proposta: proposta };
}

function confirmarAlteracaoAssistidaEntidade(token) {
  const usuario = obterDadosUsuarioLogado();
  if (!verificarSeEhOperador()) throw new Error('Você não possui permissão para confirmar alterações de cadastro.');
  const chave = 'ENTIDADE_PROPOSTA_' + String(token || '');
  const consumo = iniciarConsumoPropostaEntidade_(chave, String(usuario.email || '').toLowerCase());
  if (consumo.concluida) return consumo.resultado;
  const proposta = consumo.proposta;
  try {
    const atual = obterListaServidores().find(function(item) {
      return normalizarChaveMatricula_(item.matricula) === normalizarChaveMatricula_(proposta.matricula);
    });
    if (!atual) throw new Error('O servidor não foi localizado. Gere uma nova proposta.');
    const valorAtual = String(atual[proposta.campo] || '').trim();
    if (valorAtual !== String(proposta.valorAntes || '').trim()) {
      throw new Error('O cadastro mudou desde a proposta. Revise e gere uma nova alteração.');
    }
    const partesAdmissao = String(atual.admissao || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const dadosServidor = {
      nome: atual.nome, matricula: atual.matricula, cargo: atual.cargo, lotacao: atual.lotacao,
      admissao: partesAdmissao ? partesAdmissao[3] + '-' + partesAdmissao[2] + '-' + partesAdmissao[1] : '',
      situacao: atual.situacao, email: atual.email, pis: atual.pis, aniversario: atual.aniversario,
      aniversarioInformado: Boolean(atual.aniversario), ativo: atual.status === 'Inativo' ? 'Não' : 'Sim',
      penalidadeFerias: atual.penalidadeFerias || 0, penalidadeAbono: atual.penalidadeAbono || 0
    };
    dadosServidor[proposta.campo] = proposta.valorDepois;
    salvarServidor(dadosServidor);
    const resultado = { sucesso: true, matricula: proposta.matricula, nome: proposta.nome, campoRotulo: proposta.campoRotulo, valorDepois: proposta.valorDepois };
    finalizarConsumoPropostaEntidade_(chave, consumo.dono, resultado);
    return resultado;
  } catch (e) {
    liberarConsumoPropostaEntidade_(chave, consumo.dono);
    throw e;
  }
}
