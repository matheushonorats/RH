let entrada = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', pedaco => { entrada += pedaco; });
process.stdin.on('end', async () => {
  try {
    const { url, opcoes = {} } = JSON.parse(entrada);
    if (!String(url).startsWith('https://')) throw new Error('Endereço externo inseguro. [ENT-LOCAL-REDE]');
    const cabecalhos = { ...(opcoes.headers || {}) };
    if (opcoes.contentType) cabecalhos['Content-Type'] = opcoes.contentType;
    const resposta = await fetch(url, { method: opcoes.method || 'GET', headers: cabecalhos,
      body: opcoes.payload, redirect: 'follow', signal: AbortSignal.timeout(Number(opcoes.timeoutSeconds || 300) * 1000) });
    process.stdout.write(JSON.stringify({ status: resposta.status, texto: await resposta.text(), cabecalhos: Object.fromEntries(resposta.headers) }));
  } catch (erro) { process.stdout.write(JSON.stringify({ erro: 'A conexão com o serviço externo falhou. [ENT-LOCAL-REDE]' })); }
});
