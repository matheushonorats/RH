# Leitura de cartões com IA

A publicação canônica está em `output/RH-Modo-Seguro-Beta`. A leitura usa
Gemini diretamente, com Groq como alternativa para imagens. OpenRouter não
participa mais da transcrição, mas suas demais integrações não foram removidas.

Em Administração → Configurações, salve a chave Gemini em **IA do cartão manual**.
O formulário também permite substituir a chave Groq sem remover a Gemini.
As novas chaves ficam em Script Properties, nunca no código, retorno da API
ou log de auditoria. Apenas administradores podem configurá-las.

Padrão: `gemini-2.5-flash-lite`. A propriedade `GEMINI_MODEL_VISAO` permite
troca explícita pelo administrador; não há upgrade automático para modelo caro.
Para esse modelo, o thinking fica desligado e a saída é limitada a 8.192 tokens,
em modo JSON compatível. O servidor valida até 31 dias e seis posições por dia,
sem enviar restrições adicionais de schema que possam impedir a requisição.
O teto é uma reserva, não consumo obrigatório; o uso real é reconciliado.
Falhas distinguem MAX_TOKENS, filtro de conteúdo, ausência de resposta e formato
inválido, sem atribuir automaticamente o erro à qualidade da foto. O diagnóstico
registra apenas código, tamanho da resposta e consumo, nunca fotos ou transcrição.
O Gemini tem uma tentativa por leitura, evitando repetir automaticamente
chamadas recusadas por cota. Resposta incompleta, bloqueada ou JSON inválido
aciona a Groq, quando configurada e quando os anexos são imagens.

O PDF enviado pelo formulário é convertido em duas imagens temporárias.
O adaptador Gemini também suporta PDF direto, sem plugin pago de OCR.
Nada é salvo automaticamente: a transcrição preenche uma proposta para revisão.
O custo reduzido não garante precisão de manuscritos nem cota ilimitada.
Os limites internos continuam em `EntidadeGovernancaService.gs`; limites reais
dependem do projeto Google, modelo e plano, e o consumo confirmado é contabilizado
usando `usageMetadata.totalTokenCount`.

Testes: `node --test tests/rep-cartao-gemini.test.cjs tests/rep-cartao-pdf.test.cjs tests/rep-cartao-ia-cota.test.cjs tests/cartao-ia-config-segura.test.cjs`.
Os testes usam respostas simuladas; validar uma foto preenchida no ambiente real
é necessário para confirmar a qualidade e autorização da chave da API.
