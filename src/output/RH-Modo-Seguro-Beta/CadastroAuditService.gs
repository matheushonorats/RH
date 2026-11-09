/** Auditoria derivada de cadastros. Nunca bloqueia uma gravação já validada. */

function obterAbaAuditoriaCadastros_() {
  const ss = obterPlanilha_();
  let aba = ss.getSheetByName('IA_Auditoria_Cadastros');
  if (!aba) {
    aba = ss.insertSheet('IA_Auditoria_Cadastros');
    aba.getRange(1, 1, 1, 11).setValues([[
      'ID', 'DATA', 'MATRICULA', 'NOME', 'OPERACAO', 'SEVERIDADE',
      'CAMPO', 'MENSAGEM', 'STATUS', 'RESOLVIDO_EM', 'ORIGEM'
    ]]);
    aba.setFrozenRows(1);
  }
  return aba;
}

function textoAuditoriaCadastro_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function dataAuditoriaCadastro_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return new Date(valor.getTime());
  const texto = textoAuditoriaCadastro_(valor);
  if (!texto) return null;
  let partes = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  let ano, mes, dia;
  if (partes) {
    ano = Number(partes[1]); mes = Number(partes[2]); dia = Number(partes[3]);
  } else {
    partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/);
    if (!partes) return null;
    dia = Number(partes[1]); mes = Number(partes[2]); ano = Number(partes[3]);
  }
  const convertida = new Date(ano, mes - 1, dia);
  return convertida.getFullYear() === ano && convertida.getMonth() === mes - 1 && convertida.getDate() === dia
    ? convertida : null;
}

function validarCadastroServidorEntidade_(atual, anterior) {
  atual = atual || {};
  anterior = anterior || null;
  const matricula = normalizarChaveMatricula_(atual.matricula);
  const nome = textoAuditoriaCadastro_(atual.nome).toUpperCase();
  const alertas = [];

  function adicionar(severidade, campo, mensagem) {
    alertas.push({ severidade: severidade, campo: campo, mensagem: mensagem });
  }

  if (!nome) adicionar('ERRO', 'NOME', 'Cadastro sem nome informado.');
  if (!matricula) adicionar('ERRO', 'MATRICULA', 'Cadastro sem matrícula válida.');
  if (!textoAuditoriaCadastro_(atual.cargo)) adicionar('ATENCAO', 'CARGO', 'Cargo não informado.');
  if (!textoAuditoriaCadastro_(atual.lotacao) || textoAuditoriaCadastro_(atual.lotacao) === '-') adicionar('ATENCAO', 'LOTACAO', 'Lotação não informada.');

  const admissao = dataAuditoriaCadastro_(atual.admissao);
  if (!admissao) {
    adicionar('ATENCAO', 'DATA DE ADMISSAO', 'Data de admissão ausente ou inválida.');
  } else {
    admissao.setHours(0, 0, 0, 0);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (admissao > hoje) adicionar('ERRO', 'DATA DE ADMISSAO', 'Data de admissão está no futuro.');
    const limiteAntiguidade = new Date(hoje.getFullYear() - 60, hoje.getMonth(), hoje.getDate());
    if (admissao < limiteAntiguidade) adicionar('ATENCAO', 'DATA DE ADMISSAO', 'Data de admissão indica mais de 60 anos de vínculo; confirme o valor.');
  }

  const email = textoAuditoriaCadastro_(atual.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) adicionar('ATENCAO', 'EMAIL', 'E-mail informado possui formato inválido.');

  const pis = normalizarPisCpfServidor_(atual.pis);
  if (pis && pis.length !== 11) adicionar('ATENCAO', 'PIS', 'PIS/CPF deve possuir 11 dígitos.');

  if (anterior) {
    const admissaoAnterior = dataAuditoriaCadastro_(anterior.admissao);
    if (admissao && admissaoAnterior && admissao.getTime() !== admissaoAnterior.getTime()) {
      adicionar('ATENCAO', 'DATA DE ADMISSAO', 'Data de admissão foi alterada; confirme porque ela recalcula os períodos de férias.');
    }
    const nomeAnterior = normalizarCabecalho_(anterior.nome || '');
    if (nomeAnterior && nomeAnterior !== normalizarCabecalho_(nome)) {
      adicionar('ATENCAO', 'NOME', 'Nome vinculado à matrícula foi alterado; confirme se não houve troca de pessoa.');
    }
    if (normalizarCabecalho_(anterior.ativo || '') === 'NAO' && normalizarCabecalho_(atual.ativo || '') === 'SIM') {
      adicionar('ATENCAO', 'ATIVO', 'Servidor anteriormente inativo foi reativado; confirme a alteração.');
    }
  }

  return alertas;
}

function auditarCadastroServidor_(atual, anterior, operacao) {
  atual = atual || {};
  const matricula = normalizarChaveMatricula_(atual.matricula);
  const nome = textoAuditoriaCadastro_(atual.nome).toUpperCase();
  const alertas = validarCadastroServidorEntidade_(atual, anterior || null);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = obterAbaAuditoriaCadastros_();
    const existentes = aba.getLastRow() > 1
      ? aba.getRange(2, 1, aba.getLastRow() - 1, 11).getValues()
      : [];
    const assinaturasAtuais = {};
    alertas.forEach(function(alerta) { assinaturasAtuais[alerta.campo + '|' + alerta.mensagem] = true; });

    existentes.forEach(function(linha, indice) {
      if (normalizarChaveMatricula_(linha[2]) !== matricula || String(linha[8]) !== 'PENDENTE') return;
      if (!assinaturasAtuais[String(linha[6]) + '|' + String(linha[7])]) {
        aba.getRange(indice + 2, 9, 1, 2).setValues([['RESOLVIDO', new Date()]]);
      }
    });

    alertas.forEach(function(alerta) {
      const repetido = existentes.some(function(linha) {
        return normalizarChaveMatricula_(linha[2]) === matricula &&
          String(linha[6]) === alerta.campo && String(linha[7]) === alerta.mensagem && String(linha[8]) === 'PENDENTE';
      });
      if (repetido) return;
      aba.appendRow([
        Utilities.getUuid(), new Date(), matricula, nome, operacao || 'ALTERACAO',
        alerta.severidade, alerta.campo, alerta.mensagem, 'PENDENTE', '', 'VALIDACAO_AUTOMATICA'
      ]);
    });
  } finally {
    lock.releaseLock();
  }

  return alertas;
}

function lerCadastrosAtuaisParaAuditoriaEntidade_() {
  const aba = obterPlanilha_().getSheetByName('Servidores');
  if (!aba || aba.getLastRow() <= 1) return [];
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  function idx(nomes) { return indiceCabecalho_(cabecalho, nomes); }
  const indices = {
    nome: idx(['NOME', 'NOME COMPLETO']), matricula: idx(['MATRICULA']), cargo: idx(['CARGO']),
    lotacao: idx(['LOTACAO']), admissao: idx(['DATA DE ADMISSAO', 'DATA ADMISSAO', 'ADMISSAO']), email: idx(['EMAIL', 'E MAIL']),
    pis: idx(['PIS', 'CPF', 'PIS CPF', 'PIS_CPF']), ativo: idx(['ATIVO', 'STATUS'])
  };
  return dados.slice(1).map(function(linha) {
    const item = {};
    Object.keys(indices).forEach(function(chave) { item[chave] = indices[chave] === -1 ? '' : linha[indices[chave]]; });
    return item;
  });
}

/** Reavalia a fotografia atual, inclusive alteracoes feitas pelo AppSheet. */
function reconciliarAuditoriaCadastrosEntidade_() {
  const servidoresAtivos = lerCadastrosAtuaisParaAuditoriaEntidade_().filter(function(item) {
    const ativo = normalizarCabecalho_(item.ativo || 'SIM');
    return ativo !== 'NAO' && ativo !== 'INATIVO';
  });
  const atuais = {};
  servidoresAtivos.forEach(function(servidor) {
    const matricula = normalizarChaveMatricula_(servidor.matricula);
    if (!matricula) return;
    atuais[matricula] = {
      servidor: servidor,
      alertas: validarCadastroServidorEntidade_(servidor, null)
    };
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const aba = obterAbaAuditoriaCadastros_();
    const existentes = aba.getLastRow() > 1 ? aba.getRange(2, 1, aba.getLastRow() - 1, 11).getValues() : [];
    const pendentes = {};
    let alterou = false;
    existentes.forEach(function(linha) {
      if (String(linha[8]) !== 'PENDENTE') return;
      const matricula = normalizarChaveMatricula_(linha[2]);
      const atual = atuais[matricula];
      const assinatura = String(linha[6]) + '|' + String(linha[7]);
      const aindaExiste = atual && atual.alertas.some(function(alerta) { return alerta.campo + '|' + alerta.mensagem === assinatura; });
      if (!aindaExiste) {
        linha[8] = 'RESOLVIDO'; linha[9] = new Date(); alterou = true;
      } else {
        pendentes[matricula + '|' + assinatura] = true;
      }
    });

    const novas = [];
    Object.keys(atuais).forEach(function(matricula) {
      const atual = atuais[matricula];
      atual.alertas.forEach(function(alerta) {
        const chave = matricula + '|' + alerta.campo + '|' + alerta.mensagem;
        if (pendentes[chave]) return;
        novas.push([Utilities.getUuid(), new Date(), matricula, textoAuditoriaCadastro_(atual.servidor.nome).toUpperCase(),
          'RECONCILIACAO', alerta.severidade, alerta.campo, alerta.mensagem, 'PENDENTE', '', 'FOTOGRAFIA_ATUAL']);
        pendentes[chave] = true;
      });
    });

    if (alterou && existentes.length) aba.getRange(2, 1, existentes.length, 11).setValues(existentes);
    if (novas.length) aba.getRange(aba.getLastRow() + 1, 1, novas.length, 11).setValues(novas);
    return { ativosVerificados: servidoresAtivos.length, criados: novas.length, atualizados: alterou };
  } finally {
    lock.releaseLock();
  }
}

function obterAlertasAuditoriaCadastralEntidade_(limite) {
  reconciliarAuditoriaCadastrosEntidade_();
  const aba = obterAbaAuditoriaCadastros_();
  if (aba.getLastRow() <= 1) return [];
  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 11).getDisplayValues();
  return dados.filter(function(linha) {
      if (linha[8] !== 'PENDENTE') return false;
      return true;
    })
    .slice(-Math.max(1, Number(limite || 12)))
    .reverse()
    .map(function(linha) {
      return {
        data: linha[1], matricula: linha[2], nome: linha[3], operacao: linha[4],
        severidade: linha[5], campo: linha[6], motivo: linha[7]
      };
    });
}
