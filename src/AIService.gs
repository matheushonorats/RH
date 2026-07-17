/**
 * RH Central de Documentos v2.0
 * Módulo de Inteligência Artificial "Entidade" (AIService)
 */

/**
 * Função principal chamada pelo frontend (via google.script.run)
 * Recebe uma mensagem do usuário e um contexto local (resumo de dados da tela).
 */
function chamarEntidade(mensagemUsuario, contextoLocalStr) {
  try {
    const config = obterListaConfiguracoes().find(c => c.chave === 'OPENROUTER_API_KEY');
    if (!config || !config.valor || config.valor.trim() === '') {
      return { erro: "A chave da API do OpenRouter (OPENROUTER_API_KEY) não foi configurada em Administração > Parametrizações Gerais." };
    }
    
    const apiKey = config.valor.trim();
    const url = "https://openrouter.ai/api/v1/chat/completions";
    
    // Obter dados gerais do sistema como contexto de fundo
    const dadosContexto = {
      telaAtual: contextoLocalStr,
      dataAtual: new Date().toLocaleDateString('pt-BR')
    };

    const systemPrompt = `Você é a 'Entidade', uma assistente virtual proativa e vigia do sistema de RH da Secretaria Municipal de Turismo de São Sebastião/SP.
Sua função é auxiliar os gestores, avisar sobre prazos, identificar erros nos dados e responder dúvidas.
Você deve ser concisa, prestativa e não intrusiva.
Use a formatação markdown para destacar itens.

Contexto atual do sistema (enviado pelo frontend):
${JSON.stringify(dadosContexto, null, 2)}

Regras:
1. Se o usuário pedir para fazer uma ação que requer abrir um formulário (ex: criar lançamento), responda sugerindo usar o sistema, e você pode incluir na sua resposta o comando especial '[ABRIR_MODAL_LANCAMENTO]' ou '[ABRIR_MODAL_SERVIDOR]' ou '[ABRIR_MODAL_PROTOCOLO]'. A interface irá interceptar isso e abrir a janela.
2. Seja direta e evite respostas muito longas.`;

    const messages = [
      { role: "system", content: systemPrompt }
    ];
    
    // Se não for uma varredura silenciosa, adiciona a pergunta do usuário
    if (mensagemUsuario) {
      messages.push({ role: "user", content: mensagemUsuario });
    } else {
      messages.push({ role: "user", content: "Analise o contexto atual do sistema. Há algo que exija atenção urgente (como férias compulsórias próximas, ou pendências de 1Doc)? Se houver, dê um aviso curto apontando as pendências. Se não houver absolutamente nada urgente, responda exatamente 'Tudo em ordem'." });
    }

    const payload = {
      model: "anthropic/claude-3-haiku",
      messages: messages,
      temperature: 0.3
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": "https://script.google.com",
        "X-Title": "RH SETUR 2.0"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log("Erro API OpenRouter: " + responseBody);
      return { erro: "Não foi possível conectar à Entidade no momento. Tente novamente mais tarde." };
    }
    
    const data = JSON.parse(responseBody);
    if (!data.choices || data.choices.length === 0) {
      return { erro: "Resposta vazia da IA." };
    }
    
    let respostaIA = data.choices[0].message.content;
    
    // Se for varredura silenciosa e tudo estiver em ordem
    if (!mensagemUsuario && respostaIA.includes("Tudo em ordem")) {
      return { silencioso: true };
    }
    
    // Registrar ação da IA no log se for uma recomendação proativa
    if (!mensagemUsuario) {
      lancarLog("VIGIA_IA", "IA_Entidade", "A Entidade detectou pendências e alertou o usuário.", "", "", "", "");
    }
    
    return { resposta: respostaIA };
    
  } catch (error) {
    Logger.log("Erro interno em chamarEntidade: " + error.toString());
    return { erro: "Ocorreu um erro interno ao processar sua solicitação." };
  }
}
