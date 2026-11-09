const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function proteger(texto) {
  return String(texto || '').slice(0, 8000)
    .replace(/(?:Bearer\s+)[\w.\-]+/gi, 'Bearer [oculto]')
    .replace(/\b(?:sk-[\w-]+|AIza[\w-]+)\b/g, '[chave oculta]')
    .replace(/((?:api[_-]?key|senha|password|access_token|refresh_token|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}&]+/gi, '$1[oculto]');
}

class Diagnostics {
  constructor(pasta, versao) {
    this.pasta = path.join(pasta, 'diagnosticos');
    fs.mkdirSync(this.pasta, { recursive: true });
    this.arquivo = path.join(this.pasta, 'erros.jsonl');
    this.versao = versao;
  }

  registrar(codigo, mensagem, erro, contexto = {}) {
    const referencia = crypto.randomUUID().slice(0, 8).toUpperCase();
    const registro = {
      data: new Date().toISOString(), codigo, referencia, versao: this.versao,
      mensagem: proteger(mensagem), detalhe: proteger(erro && erro.message),
      local: proteger(erro && erro.stack),
      operacao: String(contexto.operacao || '').slice(0, 100)
    };
    if (fs.existsSync(this.arquivo) && fs.statSync(this.arquivo).size > 5 * 1024 * 1024) {
      fs.copyFileSync(this.arquivo, path.join(this.pasta, 'erros-anteriores.jsonl'));
      fs.writeFileSync(this.arquivo, '');
    }
    fs.appendFileSync(this.arquivo, JSON.stringify(registro) + '\n', 'utf8');
    return { codigo, referencia, mensagem: registro.mensagem };
  }

  relatorio() {
    const arquivos = ['erros-anteriores.jsonl', 'erros.jsonl'];
    const registros = arquivos.flatMap(nome => {
      const arquivo = path.join(this.pasta, nome);
      if (!fs.existsSync(arquivo)) return [];
      return fs.readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map(linha => {
        try { return JSON.parse(linha); } catch (_) { return { codigo: 'ENT-LOG-LEITURA', mensagem: 'Uma linha do relatório não pôde ser lida.' }; }
      });
    });
    return { programa: 'Entidade.V1', versao: this.versao, geradoEm: new Date().toISOString(),
      ambiente: { plataforma: process.platform, arquitetura: process.arch, electron: process.versions.electron }, registros };
  }
}

module.exports = { Diagnostics, proteger };
