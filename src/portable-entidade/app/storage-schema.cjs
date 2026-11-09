const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const ESQUEMA = {
  Servidores: ['MATRICULA', 'NOME', 'CARGO', 'LOTACAO', 'DATA DE ADMISSAO', 'SITUACAO', 'EMAIL', 'ATIVO', 'PIS', 'ANIVERSARIO_DIA_MES', 'PENALIDADE_FERIAS', 'PENALIDADE_ABONOS'],
  'Lançamentos': ['ID', 'N PROC 1DOC', 'DATA SOLICITACAO', 'TIPO DE DOCUMENTO', 'NOME', 'MATRICULA', 'DATA INICIO', 'QUANTIDADE DIAS FERIAS', 'DIAS', 'MES HE', 'ANO HE', 'QUANTIDADE HE', 'ANEXO 1', 'ANEXO 2', 'ANEXO 3', 'DESPACHO INDIVIDUAL', 'OBSERVACAO INDIVIDUAL', 'STATUS', 'ID_PROTOCOLO', 'CRIADO_POR', 'CRIADO_EM', 'EDITADO_POR', 'EDITADO_EM', 'DIAS_PECUNIA', 'ID_OPERACAO', 'PLEITO ELEITORAL', 'MOVIMENTO ELEITORAL'],
  Creditos_Ferias: ['ID', 'DATA', 'MATRICULA', 'REFERENCIA', 'QTD DIAS', 'DATA LIBERACAO', 'PENALIDADE_DIAS'],
  Protocolos: ['ID', 'DATA GERACAO', 'STATUS', 'LINK DIRETO', 'CRIADO_POR'],
  Usuarios: ['E-mail', 'Nome', 'Papel', 'Ativo', 'Senha', 'SessoesRevogadasEm'],
  Configuracoes: ['Chave', 'Valor', 'Descrição']
};

const ALTERNATIVAS = {
  'MATRICULA': ['MATRICULA'], 'NOME': ['NOME', 'NOME COMPLETO', 'SERVIDOR'],
  'DATA DE ADMISSAO': ['DATA DE ADMISSAO', 'ADMISSAO'],
  'N PROC 1DOC': ['N PROC 1DOC', '1DOC', 'PROTOCOLO', 'N 1DOC'],
  'DATA SOLICITACAO': ['DATA SOLICITACAO', 'DATA'],
  'TIPO DE DOCUMENTO': ['TIPO DE DOCUMENTO', 'TIPO'],
  'DATA INICIO': ['DATA INICIO', 'DATA DE INICIO', 'DATA DE SAIDA FALTA'],
  'QUANTIDADE DIAS FERIAS': ['QUANTIDADE DIAS FERIAS', 'QUANTIDADE DIAS', 'QUANTIDADE FERIAS', 'QTD FERIAS'],
  'QUANTIDADE HE': ['QUANTIDADE HE', 'QUANT HORAS', 'QTD HORAS'],
  'REFERENCIA': ['REFERENCIA', 'PERIODO AQUISITIVO'],
  'LINK DIRETO': ['LINK DIRETO', 'LINK', 'ARQUIVO', 'PDF'],
  'DATA GERACAO': ['DATA GERACAO', 'DATA', 'TIMESTAMP']
};

function analisarPlanilha(guias) {
  const adaptacoes = [];
  const problemas = [];
  const nomes = Object.keys(guias || {});
  for (const [nome, colunas] of Object.entries(ESQUEMA)) {
    const encontrado = nomes.find(item => normalizar(item) === normalizar(nome));
    if (!encontrado) {
      adaptacoes.push({ tipo: 'criar-guia', guia: nome, colunas,
        mensagem: `Falta o espaço “${nome}”. Podemos criar essa guia vazia para organizar essas informações.` });
      continue;
    }
    const linhas = guias[encontrado] || [];
    const cabecalho = (linhas[0] || []).map(normalizar);
    const repetidos = cabecalho.filter((valor, indice) => valor && cabecalho.indexOf(valor) !== indice);
    if (repetidos.length) problemas.push({ guia: encontrado, mensagem: `Na guia “${encontrado}”, duas colunas têm o mesmo nome: ${[...new Set(repetidos)].join(', ')}. Precisamos escolher qual coluna contém a informação correta.` });
    const faltantes = colunas.filter(coluna => !(ALTERNATIVAS[normalizar(coluna)] || [normalizar(coluna)]).some(alias => cabecalho.includes(alias)));
    if (faltantes.length) adaptacoes.push({ tipo: 'adicionar-colunas', guia: encontrado, colunas: faltantes,
      mensagem: `Na guia “${encontrado}”, faltam os espaços: ${faltantes.join(', ')}. Podemos acrescentá-los no final, sem apagar as colunas que você já tem.` });
  }
  return { compativel: !adaptacoes.length && !problemas.length,
    podeAdaptar: !problemas.length, adaptacoes, problemas,
    mensagem: problemas.length ? 'Precisamos conferir alguns nomes de colunas antes de conectar.'
      : adaptacoes.length ? 'A planilha precisa de alguns espaços novos para funcionar. Confira a lista antes de permitir as mudanças.'
        : 'A organização da planilha está pronta para o Entidade.' };
}

module.exports = { ESQUEMA, analisarPlanilha, normalizar };
