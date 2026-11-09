# Entidade — diagnóstico e plano de evolução para assistente operacional

**Data:** 11/09/2026  
**Base examinada:** código local em `RH/src`, versão declarada `2.3.177`.  
**Finalidade:** orientar uma implementação futura, em etapas pequenas, inclusive por um modelo de menor custo.  
**Escopo:** somente a Entidade e as integrações indispensáveis para ela acompanhar o trabalho. Nenhuma alteração funcional ou publicação foi realizada nesta análise.

## 1. Conclusão para decisão

A Entidade pode cumprir a maior parte do papel desejado **sem API de IA**: acompanhar prazos, conferir registros, detectar sobreposições, listar pessoas, monitorar pendências, organizar prioridades e informar o que mudou. Isso depende de regras confiáveis e de acompanhamento persistente de cada ocorrência.

Recomendo transformá-la em uma **assistente operacional com IA opcional**. A tela principal deve oferecer uma fila curta de providências, com evidência e botão específico para cada caso. O chat continua disponível para dúvidas e explicações, mas deixa de ser a porta de entrada para trabalhar com os avisos.

A API agrega valor ao interpretar uma pergunta livre, explicar uma norma já recuperada, ajudar a redigir uma orientação ou resumir um conjunto de fatos. Não deve escolher quais registros existem nem decidir que uma situação é irregular. Trocar de modelo, isoladamente, não resolve os problemas encontrados.

**Ordem recomendada:** corrigir os defeitos comprovados; criar acompanhamento por ocorrência; conectar as alterações do aplicativo e da planilha a esse acompanhamento; depois aperfeiçoar a IA opcional. Preservar o visual e as animações existentes durante essas etapas.

## 2. Método e limites desta análise

Foram examinados `AIService.gs`, `AIServiceTests.gs`, `CadastroAuditService.gs`, `MaintenanceService.gs`, `EntidadeAlteracoesService.gs`, `EntidadeLancamentosService.gs`, os mecanismos de recuperação normativa de `EstatutoService.gs`, e os trechos relacionados da interface, autenticação e serviços de gravação.

As referências abaixo usam **arquivo e nome de função**, que são mais resistentes que números de linha a alterações futuras. A base normativa compactada não foi objeto de validação jurídica integral. Foram consultadas documentações oficiais sobre API, cotas e gatilhos.

Não foram consultadas chaves, contas dos provedores, conteúdo atual das planilhas, histórico real de execuções nem instalação efetiva dos gatilhos. Portanto, este documento descreve o comportamento do código local, não certifica que a produção executa exatamente essa revisão. Limites, modelos configurados e latência real precisam ser medidos no ambiente durante a implementação. Não foram feitas chamadas de inferência com dados de servidores.

Uma reprodução local isolada confirmou que `removerRaciocinioExpostoEntidade_('Tudo em ordem')` retorna texto vazio e que `respostaEntidadePareceCompleta_('Tudo em ordem', {finish_reason: 'stop'})` retorna `false`.

## 3. O que existe hoje e merece ser preservado

| Capacidade | Situação observada | Orientação |
|---|---|---|
| Consulta de matrícula, lotação, admissão e férias por mês | Há rotas determinísticas em `responderConsultaOperacionalDiretaEntidade_` | Ampliar e testar as intenções; manter cálculo fora da IA |
| Sobreposições e divergências de identificação | Há detector e texto determinístico com IDs e períodos | Preservar o motor e passar a acompanhar cada ocorrência |
| Resumo do dia | `obterBriefingDiarioEntidade` usa `gerarBriefingDeterministicoEntidade_` | Fazer o resumo nascer da fila atual de providências |
| Acompanhamento em segundo plano | Gatilho horário e consulta da interface a cada dez minutos | Separar conferência de dados de geração de linguagem |
| Auditoria de cadastro | Confere campos e mudanças relevantes | Reconciliar com a base atual, inclusive mudanças externas |
| Confirmação de gravações assistidas | Existem serviços de proposta e confirmação | Não liberar gravação direta pelo modelo; revisar integração antes de reativar |
| Proteção da apresentação | HTML escapado e filtros contra resposta incompleta/raciocínio exposto | Preservar, corrigindo rejeições indevidas |
| Histórico e manutenção | Memória, insights, arquivamento e conhecimento consolidado | Substituir aprendizado por feedback simples por aprovação explícita |
| Pré-REP | Aviso atual de conclusão é local, por som e toast | Manter a conferência humana e não enviar os arquivos REP à IA |

## 4. Achados com evidência e correção proposta

Prioridades: **P1** = afeta confiabilidade, utilidade ou custo diretamente; **P2** = melhoria importante; **P3** = evolução posterior. São prioridades de implementação, não classificação jurídica ou de incidente.

### E01 — P1 — “Tudo em ordem” provoca repetição desnecessária

**Evidência:** `AIService.gs`, `chamarEntidade`, `removerRaciocinioExpostoEntidade_`, `respostaEntidadePareceCompleta_` e `alertaAutomaticoEntidadeAcionavel_`.

O prompt solicita exatamente “Tudo em ordem”. Os validadores recusam respostas com menos de 18 caracteres; a frase tem 13. Além disso, o verificador de alerta acionável recusa essa frase. O código repete a chamada antes de encerrar silenciosamente. Alterar apenas o limite de tamanho não resolve todo o caminho.

**Correção:** reconhecer um resultado estruturado `sem_novidades` antes dos validadores de mensagem; enquanto houver compatibilidade textual, reconhecer a frase normalizada como resposta final válida e silenciosa. Não repetir chamada por ausência legítima de alerta.

**Aceite:** uma resposta regular sem novidades causa exatamente uma chamada; nenhuma mensagem, som ou erro aparece.

### E02 — P1 — Há mensagens persistidas, mas falta ciclo de vida por problema

**Evidência:** `obterAbaInsightsEntidade_`, `registrarInsightHistorico_`, `marcarInsightEntidadeComoVisto` e `manterInsightsEntidade_`.

`IA_Insights` armazena um texto agregado por fingerprint. Possui colunas `STATUS`, `MOSTRADO_EM` e `RESOLVIDO_EM`, mas as rotas examinadas de leitura/marcação não atualizam essas colunas por ocorrência: gravam um fingerprint em Script Properties. Não há fluxo operacional completo de atribuição, adiamento e resolução de cada problema. Pendentes antigos podem continuar retidos pela manutenção.

**Correção:** adotar ocorrências com ID estável, evidência, situação, responsável, prazo e histórico. Um aviso permanece o mesmo quando o texto muda. A resolução depende de nova conferência dos dados ou de justificativa humana registrada.

**Aceite:** cancelar o lançamento indevido encerra somente o conflito correspondente; as demais pendências não reaparecem como novas.

### E03 — P1 — Exibir um aviso já pode marcá-lo como lido

**Evidência:** `Scripts.html`, `solicitarBriefingDiarioEntidade`, `consultarInsightEntidade` e `apresentarBriefingDiarioNoChat_`.

O cliente marca como visto ao apresentar badge/ticker. Também pode marcar um insight como visto por ter chegado até 15 segundos depois do resumo. Isso elimina uma notificação sem comprovar leitura. A marcação é do conjunto, não do caso individual.

**Correção:** separar `entregue`, `lido` e `resolvido`; leitura por usuário e ocorrência. Só registrar leitura em interação explícita ou abertura do detalhe. Exibir um resumo não deve confirmar leitura dos casos contidos nele.

### E04 — P1 — Modelo recebe amostras e pode responder como se fossem o conjunto completo

**Evidência:** `obterContextoEntidadeServidor_` corta listas; `compactarDadosContextoEntidade_` corta novamente. Há até seis compulsórias e seis pendências após compactação, por exemplo. O contexto visual pode ser totalmente substituído ao exceder 2.000 caracteres.

O código solicita verificações amplas, mas o modelo não dispõe de todos os registros. Isso explica um mecanismo possível para omissões; não prova a origem de cada resposta histórica. As consultas determinísticas já corrigidas reduzem esse risco para algumas perguntas.

**Correção:** totais e listagens devem vir de consultas completas antes da paginação. Cada recorte precisa declarar `totalEncontrado`, `itensExibidos`, `temMais`, `filtros` e `consultadoEm`. A API recebe apenas os fatos necessários à intenção e não completa uma lista por conta própria.

### E05 — P1 — A comparação não acompanha adequadamente o que foi corrigido

**Evidência:** `criarEstadoResumidoEntidade_` inclui conflitos e divergências, mas `compararEstadosEntidade_` não devolve diferenças desses dois grupos. Suas assinaturas de conflitos também não usam os IDs dos dois lançamentos. `salvarLancamento` e `salvarServidor` invalidam o último insight, reduzindo a informação disponível para comparação da mensagem anterior.

**Correção:** usar identificadores dos registros e regra aplicada; calcular criados, alterados e resolvidos. Manter o último estado válido enquanto um novo está sendo calculado. Separar invalidação do cache de exclusão do histórico.

**Aceite:** registrar “a sobreposição X foi resolvida” e atualizar a contagem uma única vez, sem reapresentar todo o resumo.

### E06 — P1 — Detectar com limite antes de excluir inativos pode esconder casos ativos

**Evidência:** `obterContextoEntidadeServidor_` chama `detectarSobreposicoesLancamentos_(lancamentos, 20)` e só depois `filtrarConflitosServidoresAtivosEntidade_`.

Se os primeiros vinte conflitos incluírem inativos, os casos ativos além desse corte não chegam ao resumo. O filtro mantém cadastro não localizado, o que deve aparecer como vínculo não confirmado, não como certeza de servidor ativo.

**Correção:** avaliar elegibilidade antes do limite de apresentação; obter contagem completa e separar inconsistência de identificação de conflito atribuído a uma pessoa.

### E07 — P1 — As prioridades ainda são montadas por blocos fixos

**Evidência:** `gerarBriefingDeterministicoEntidade_` seleciona alguns conflitos, duas compulsórias e algumas pendências com `slice`. A recomendação pode dizer “priorize o primeiro nome da lista” por existirem compulsórias, embora os primeiros nomes apresentados pertençam a conflitos. O texto determinístico chama alertas preventivos de “Férias compulsórias”, enquanto o próprio prompt exige distinguir o marco legal.

**Correção:** ranquear ocorrências por severidade, prazo, impacto e situação. Identificar o caso exato na recomendação. Usar rótulos distintos para prevenção de acúmulo, prazo atingido e inconsistência de cadastro, conforme os cálculos já aprovados; não mudar a regra legal nesta refatoração.

### E08 — P1 — A auditoria de cadastro pode permanecer desatualizada

**Evidência:** `CadastroAuditService.gs`. A escrita normal chama `auditarCadastroServidor_`; a leitura de alertas revalida especificamente o PIS, mas não reconcilia todos os outros campos nem exclui inativos nesse leitor. O conversor de datas usa `new Date` sem validar ida e volta dos componentes, permitindo normalização de datas impossíveis.

**Correção:** compartilhar validadores com o cadastro; reavaliar as regras sobre a fotografia atual, inclusive após edição externa. Mudanças de valor são eventos de conferência, não necessariamente erros permanentes. Inativos saem da fila operacional e permanecem no histórico.

### E09 — P1 — API ainda participa da detecção automática de problemas

**Evidência:** `gerarInsightEntidade_` chama `chamarEntidade(null, '{}', [])`; `obterInsightEntidadeAtual` pode executar esse caminho durante uma consulta da interface. O fallback determinístico em `chamarEntidade` cobre conflitos em algumas falhas, mas a ausência de ambas as chaves retorna erro antes de produzir essa contingência.

**Correção:** primeiro executar todas as regras locais e persistir ocorrências. A resposta operacional deve existir sem chave ou cota. Se habilitada, a IA explica fatos selecionados em processamento separado, sem retardar a leitura do painel e sem criar uma ocorrência não validada.

### E10 — P1 — Contador de uso não é um limitador confiável

**Evidência:** `podeConsumirCotaEntidade_`, `registrarUsoEntidade_`, `executarRequisicaoEntidade_`.

Há limites diários fixos, mas não reserva atômica por tentativa, controle por minuto ou por modelo. A contagem acontece no sucesso e duas execuções podem sobrescrever incrementos. Retentativas HTTP e retentativas de conteúdo podem multiplicar requisições. Não há telemetria de latência que permita separar tempo de planilha, montagem do prompt e provedor.

**Correção:** criar orçamento configurável por modelo e janela; reservar sob lock curto antes da chamada, contar tentativas separadamente de tokens confirmados, reconciliar uso, respeitar backoff e interromper novas chamadas quando necessário. Registrar tempos e códigos, sem prompt ou dados pessoais nos logs técnicos.

### E11 — P2 — Saída curta e roteamento amplo precisam de medição

**Evidência:** `chamarProvedorEntidade_` usa 450/600 tokens, `reasoning_effort` low/medium e `max_tokens`. `consultaComplexaEntidade_` procura palavras também nas perguntas anteriores. Um assunto antigo pode manter o modelo mais pesado em consultas simples.

**Correção:** rotear pela intenção atual e usar histórico apenas para esclarecer referências. Usar o parâmetro atual do provedor, `max_completion_tokens`, com orçamento por tarefa. Não presumir que ocultar raciocínio elimina seu custo. Medir respostas truncadas antes de reduzir mais os limites. A documentação atual marca `max_tokens` como obsoleto, mas isso não demonstra falha das chamadas atuais. [Groq: API](https://console.groq.com/docs/api-reference), [raciocínio](https://console.groq.com/docs/reasoning).

### E12 — P1 — Memória aprovada por “útil” não equivale a conhecimento confiável

**Evidência:** `avaliarInteracaoEntidade`, `obterMemoriasEntidadeRelevantes_`, `obterHistoricoConversasEntidade_` e `consolidarAprendizadoMemoria_`.

Uma resposta marcada `UTIL` pode ser reutilizada como orientação e posteriormente consolidada. Não há separação suficiente entre preferência, regra do setor, fato temporário de um servidor e interpretação normativa. A busca de conversas é compartilhada e não filtra pelo usuário. A avaliação localiza a interação por ID sem verificar autoria naquele método.

**Correção:** feedback mede utilidade; aprovação de conhecimento é ação distinta, restrita a papel autorizado, com fonte, escopo, validade, autor e revisão. Perguntas pessoais permanecem no histórico autorizado, sem serem promovidas a regra. Definir explicitamente memória individual e memória compartilhada.

Não há treinamento autônomo de pesos no código. O que existe é recuperação de textos anteriores. Para este produto, aprender preferências e procedimentos aprovados é suficiente e mais verificável.

### E13 — P1 — Recuperação normativa pode deixar o decreto de fora

**Evidência:** `buscarTrechosNormativos_` faz `estatuto.concat(decreto).slice(0, quantidade)`. Se o estatuto já preencher a quantidade, nenhum trecho do decreto é enviado, independentemente de sua pertinência. Os trechos são cortados por caracteres. O decreto aparece como texto sintetizado no código, sem gestão explícita de edição e vigência.

**Correção:** ranking conjunto ou quota por fonte; preservar artigo e parágrafos relevantes, link oficial, edição e data de conferência. Não apresentar paráfrase como transcrição literal. Tratar ausência de trecho como limitação de recuperação, não prova de inexistência de fundamento. Respostas fixas também precisam da versão normativa que as sustenta.

Este documento não revalida o mérito jurídico das regras de férias.

### E14 — P1 — Anexar PDF está incompleto na interface examinada

**Evidência:** `index.html` chama `selecionarArquivoEntidade(event)` e `limparArquivoEntidade()`. Não foram encontradas suas definições no JavaScript principal ou complementar examinado. Os serviços assistidos existem, mas não constam na lista `obterFuncoesApiPermitidas_`, nem foram encontrados consumidores no chat atual.

**Correção recomendada para o perfil de uso:** retirar o controle quebrado da interface por enquanto, preservando o código isolado para avaliação posterior. Se houver demanda real, oferecer “Extrair dados do PDF” no formulário de lançamento, com proposta revisável. Não reconectar somente o botão: revisar contrato, autenticação e idempotência primeiro.

### E15 — P1 — Serviços assistidos precisam convergir para a gravação comum

**Evidência:** `confirmarAlteracaoAssistidaEntidade` grava com `setValue`, fora do caminho normal de `salvarServidor`, portanto não executa ali as mesmas invalidações e auditorias. `confirmarLancamentoAssistidoEntidade` lê o token antes de chamar o salvamento e o exclui depois; sem consumo atômico do token, duas confirmações podem tentar criar dois registros. A proposta de PDF assume a data atual quando falta data de solicitação.

**Correção antes de reativar:** passar pelos serviços de domínio existentes, com operação idempotente e revalidação do estado. Dados ausentes devem ser pendência explícita; valores sugeridos precisam ser identificados como sugestão. Propostas vencidas devem ser removidas pela manutenção, não apenas quando alguém tenta usá-las.

### E16 — P2 — Consulta mensal ainda confunde perguntas diferentes

**Evidência:** `ehConsultaFeriasPorMesEntidade_` e `responderFeriasPorMesEntidade_` reconhecem “quem vai sair” mas sempre aplicam interseção com o mês inteiro. Não distinguem começo do gozo, presença em férias e retorno. Usam ano corrente se omitido; cortam em cinquenta lançamentos sem paginação; adicionam campos temporários nos próprios objetos recebidos.

**Correção:** intenções `ferias_no_periodo`, `inicios_no_periodo` e `retornos_no_periodo`, com filtro explicitado e paginação. Para “quem ainda vai sair”, limitar início ao restante do período. Informar ano assumido, resolver referências como “mês que vem” e evitar mutação dos registros de entrada.

### E17 — P2 — Persistência e agendamento precisam de limites explícitos

**Evidência:** resumos e estados serializados são guardados em Script Properties; a reserva de processamento usa cache por 180 segundos. Gatilhos são garantidos a partir de consulta da interface; auditoria cadastral não tem política própria de arquivamento no fluxo de manutenção examinado.

**Correção:** deixar propriedades para metadados pequenos; guardar estados crescentes em tabela própria; medir tamanho em bytes. Usar reserva com proprietário e vencimento, sem assumir que cache é trava durável. Instalar/verificar gatilhos por rotina administrativa, com diagnóstico de última execução, duração, erro e próxima conferência prevista. Definir retenção para auditoria e ocorrências encerradas.

Apps Script documenta limite de 9 KB por valor em Properties e cotas de execução. Gatilhos executam sob a conta criadora; alterações via script/API não disparam automaticamente todos os gatilhos de edição. Por isso, sincronização externa precisa de reconciliação periódica. [Cotas](https://developers.google.com/apps-script/guides/services/quotas), [gatilhos instaláveis](https://developers.google.com/apps-script/guides/triggers/installable).

### E18 — P2 — Ausência de alerta não demonstra saúde do monitor

**Evidência:** no cliente, falha em `consultarInsightEntidade` substitui o estado por `{temAlertas:false}`; no agendado, erro é enviado ao Logger. O usuário pode ver um painel aparentemente tranquilo quando a conferência falhou.

**Correção:** manter o último resultado válido, com “última conferência” e estado `atualizando`, `atualizado` ou `indisponível`. Nunca transformar erro em “nenhuma pendência”.

## 5. Como ela deve trabalhar no setor

### Painel de providências como função principal

O card da Entidade deve mostrar até três prioridades e o total pendente, com acesso à lista completa. Cada item responde: **quem, o que foi encontrado, por que importa, qual prazo e o que fazer agora**.

Exemplo fictício de apresentação:

> **Abono coincide com férias — conferir**  
> Servidor Exemplo · matrícula 12345. O abono do dia 14 está dentro das férias de 01 a 15.  
> Ação: comparar os dois lançamentos e confirmar qual está incorreto.  
> Botões: **Ver os dois registros**, **Assumir conferência**, **Adiar**.

O botão “Resolver” atual envia uma frase genérica ao chat. Substituir por ação ligada ao ID da ocorrência. Não cancelar automaticamente um registro só porque existe sobreposição.

Ao corrigir, revalidar e encerrar o caso. Ao adiar, guardar prazo e motivo. Ao considerar uma exceção válida, guardar justificativa e validade; uma alteração material reabre o caso. Fechar o card apenas oculta a apresentação para aquele usuário.

### Quando interromper

- Após uma gravação: mostrar inconsistência ligada àquela operação, depois de confirmar o salvamento.
- Ao iniciar o expediente: resumo curto de novidades, vencimentos próximos e pendências ainda relevantes.
- Durante o dia: avisar somente criação, agravamento ou novo prazo de um caso; agrupar alterações próximas.
- Em uma resolução: confirmação discreta, normalmente sem som.
- Pré-REP: manter confirmação de carga e conferência humana; não transformar o arquivo temporário em memória ou contexto da API.

Ponto de partida configurável: som apenas para severidade alta; intervalo mínimo de quinze minutos entre avisos automáticos sonoros; uma entrega por ocorrência/revisão/usuário. Esses valores são proposta de produto, não regra existente. Exceções urgentes precisam de regra explícita.

### Novas capacidades úteis sem API

1. Lista de 1DOC pendentes por idade, data do afastamento e responsável pela conferência.
2. Planejamento de ausências por lotação nas próximas semanas, com cobertura calculada. Só alertar “cobertura insuficiente” se houver mínimo de equipe configurado; não inventar esse mínimo.
3. Conferência de alterações que afetam férias: admissão, matrícula, cancelamento e crédito, usando os cálculos já existentes.
4. Avisos de vínculos não conciliados, cadastro incompleto e mudança externa relevante, com origem e registro identificáveis.
5. Resumo semanal de pendências abertas, encerradas e envelhecidas, sem inventar produtividade com base no volume de logs.
6. Saúde da própria assistência: última leitura válida, falha de sincronização, regras executadas e quantidade total examinada.

Adicionar progressivamente. Não criar alertas apenas para parecer ativa.

## 6. Papel da API e avaliação do uso atual

| Tarefa | Precisa de API de IA? | Implementação proposta |
|---|---|---|
| Sobreposição, duplicidade e prazo | Não | Regras sobre dados atuais |
| Contagem, listagem e filtros | Não | Consulta determinística completa e paginada |
| Resumo diário e mudanças | Não | Templates a partir de ocorrências |
| Explicar um aviso específico | Opcional | Texto padrão suficiente; IA para aprofundamento solicitado |
| Dúvida livre sobre legislação cadastrada | Útil | Recuperação normativa + resposta citada, sem conclusão sem fonte |
| Redigir uma mensagem administrativa | Útil | Rascunho para revisão |
| Extrair campos de PDF variado | Útil, opcional | Proposta estruturada com conferência; manter fora do escopo inicial |
| Aprender procedimentos do setor | Não exige treinamento de modelo | Conhecimento aprovado, versionado e recuperável |

**Avaliação:** Groq com modelo rápido e outro mais robusto é uma escolha tecnicamente coerente como camada opcional. O problema atual está principalmente na orquestração: contexto amplo e cortado, chamadas acionadas pela consulta do painel, retentativas, ausência de orçamento concorrente e insuficiência de métricas. Não há evidência medida nesta análise para recomendar uma troca imediata de provedor.

Usar três modos configuráveis: `SEM_IA` (assistência operacional completa), `IA_SOB_DEMANDA` (padrão recomendado) e `IA_EDITORIAL_AGENDADA` (opcional, por exemplo um resumo semanal, sujeito a orçamento). Nenhuma regra crítica depende desses modos.

Se mantiver OpenRouter como contingência, fixar modelos/provedores aprovados e política de dados. O roteador gratuito escolhe entre modelos disponíveis; portanto, qualidade e disponibilidade podem variar. ZDR configurado no Groq não configura automaticamente outro serviço. A política de cada rota precisa ser verificada. [Roteador gratuito](https://openrouter.ai/openrouter/free), [privacidade](https://openrouter.ai/docs/guides/privacy/data-collection), [ZDR](https://openrouter.ai/docs/guides/features/zdr).

Não enviar cadastro completo em toda pergunta. Para explicar uma ocorrência, enviar só seus fatos e trechos normativos relevantes. Preferir identificadores temporários e recolocar nomes localmente quando possível. Não adicionar busca web aberta automática a assuntos de servidores.

A qualidade deve ser medida com casos reais anonimizados: omissão, pessoa incorreta, data incorreta, fundamento ausente, resposta incompleta, tempo e número de chamadas. Velocidade anunciada em tokens por segundo não equivale ao tempo percebido no aplicativo. Os limites publicados variam por modelo e conta e precisam ser lidos no painel; não transformar os valores fixos atuais em garantia. [Limites Groq](https://console.groq.com/docs/rate-limits).

## 7. Contrato técnico proposto

Separar em componentes pequenos, reutilizando regras e serviços existentes:

```text
Gravação confirmada / reconciliação agendada
    → leitura autorizada e consistente
    → regras determinísticas sobre o conjunto completo
    → reconciliar ocorrências e registrar mudanças
    → painel, ticker e notificação por usuário

Pergunta livre / pedido de explicação
    → identificar intenção
    → consulta determinística ou recuperação normativa
    → IA opcional com fatos mínimos
    → validar resposta e apresentar
```

Sugestão de módulos novos, a confirmar na implementação:

- `EntidadeRegrasService.gs`: regras puras; recebe fotografia dos dados e retorna ocorrências.
- `EntidadeOcorrenciasService.gs`: persistência, reconciliação e histórico.
- `EntidadeNotificacoesService.gs`: política de entrega e marcação por usuário.
- `EntidadeConsultasService.gs`: consultas completas e filtros explícitos.
- `AIService.gs`: apenas orquestração de linguagem, recuperação e provedor, gradualmente reduzida.

Modelo mínimo de ocorrência:

```json
{
  "id": "hash(tipoRegra + idsOrdenadosDosRegistros)",
  "regra": "AFASTAMENTOS_SOBREPOSTOS",
  "versaoRegra": 1,
  "registroIds": ["id-a", "id-b"],
  "matricula": "12345",
  "severidade": "ATENCAO",
  "situacao": "ABERTA",
  "evidencia": {"inicio": "2026-09-14", "fim": "2026-09-14"},
  "revisaoEvidencia": "hashDosFatosRelevantes",
  "detectadaEm": "data/hora",
  "verificadaEm": "data/hora",
  "prazo": null,
  "responsavelId": null,
  "adiadaAte": null,
  "motivo": null,
  "resolvidaEm": null
}
```

Não incluir data da consulta ou frase gerada no ID. Guardar origem da base e IDs; número da linha é apenas auxílio visual, porque muda. Evidência alterada atualiza a revisão; correção que torna a regra falsa resolve a ocorrência. Reabertura deve ter evento próprio. Confirmação de recebimento pertence a usuário/ocorrência/revisão e não encerra o problema.

Usar abas auxiliares próprias, por exemplo `Entidade_Ocorrencias`, `Entidade_Eventos` e `Entidade_Leituras`; nomes e esquema são proposta, não estruturas presentes. Dimensionar escrita em lote e retenção. Não alterar cabeçalhos do AppSheet nem escolher outra planilha por conveniência. `Code.gs/obterPlanilha_` atualmente aponta para a base com ID iniciado por `1axqp7d`; confirmar o roteamento real e as possíveis versões beta antes de criar tabelas.

As mensagens produzidas pela API devem referenciar IDs de evidência autorizados. Validar que esses IDs existem; números, datas e pessoas exibidos devem ser reconstruídos de dados estruturados sempre que possível. O modelo pode sugerir uma explicação, mas não promover texto livre a irregularidade confirmada.

## 8. Plano de implementação para outro modelo

Executar uma etapa por vez e entregar código, testes relevantes e breve relatório. Antes de começar, reler os arquivos atuais: a versão pode ter avançado desde `2.3.177`.

### Etapa 1 — Estabilizar o existente

**Escopo:** E01, E14, E18 e fallback sem API de E09.

Corrigir resultado sem novidades; esconder controles sem implementação; preservar último estado válido com sinal de erro; garantir resumo local mesmo sem chaves. Não redesenhar a interface.

**Testes:** “Tudo em ordem” não repete chamada; falha de API não apaga pendências; nenhuma chave mantém resumo e consultas; controle de PDF não chama função ausente.

### Etapa 2 — Ocorrências e prioridades

**Escopo:** E02, E03, E05, E06, E07.

Criar regras/reconciliação, persistência idempotente, leitura por usuário, encerramento por revalidação e prioridade por prazo. Migrar somente as regras existentes primeiro. O novo fluxo deve substituir o antigo progressivamente por chave de configuração; não manter dois emissores do mesmo alerta.

**Testes:** mesmo caso gera um ID; alteração irrelevante não notifica; resolução encerra somente o caso; reabertura notifica conforme política; dois usuários têm leitura independente; os vinte primeiros conflitos de inativos não ocultam conflito ativo; ordem do resumo e recomendação apontam para o mesmo caso.

### Etapa 3 — Integrar gravações e mudanças externas

**Escopo:** E08 e parte de E17.

Disparar reconferência barata após gravação confirmada e reconciliar periodicamente a planilha. Agrupar gravações próximas. Compartilhar validadores e normalização. Não acionar inferência pela simples leitura do painel. Conferir o comportamento das versões beta e do serviço de sessão antes de instalar gatilhos.

**Testes:** edição via AppSheet aparece na próxima reconciliação; cancelamento retira o alerta; falha de sincronização não parece sucesso; inativação retira pendências operacionais; data impossível é inválida; auditoria antiga é reconciliada com cadastro atual.

### Etapa 4 — Consultas e normas

**Escopo:** E04, E13, E16.

Separar intenção, filtro, consulta e apresentação. Recuperar fontes conjuntamente, com referência e revisão. Listagens paginadas devem apresentar total completo. Diferenciar início, permanência e retorno de férias.

**Testes:** férias começando antes do mês; início no último dia; término no primeiro; mês seguinte e troca de ano; inativos e anulados; pedido de todos versus só próximos; mais de cinquenta lançamentos; decreto pertinente aparece mesmo quando existem três candidatos do estatuto; trecho faltante não vira afirmação de inexistência de lei.

### Etapa 5 — IA opcional e memória controlada

**Escopo:** E10, E11, E12 e restante de E17.

Introduzir modos, orçamento, métricas, esquema de resposta, revisão de conhecimento e manutenção. Remover contexto genérico duplicado. Por padrão, desativar inferência automática na rotina e manter disponível para explicações e dúvidas. Só reativar redação agendada se o teste de utilidade demonstrar ganho.

**Testes:** concorrência não perde contagem; 429 respeita espera; erro de transporte permite fallback conforme orçamento; nenhuma rota excede máximo de tentativas definido; feedback não publica conhecimento; memória privada não atravessa usuários; propriedade grande é recusada ou armazenada na tabela; consulta comum após pergunta jurídica usa sua própria intenção.

### Etapa 6 — Evoluções opcionais

Adicionar planejamento de cobertura, resumo semanal e extração de PDF apenas após estabilização e validação de uso. Corrigir E15 antes de habilitar qualquer gravação assistida. Não desenvolver novas animações ou recursos de chat nesta etapa sem pedido específico.

## 9. Critérios gerais de conclusão

1. Com a API indisponível, todas as conferências, contagens, prazos e ações de acompanhamento continuam funcionando.
2. Toda pendência informa origem e registros que comprovam o motivo.
3. Nenhum nome, data ou número de lista operacional depende de invenção ou seleção do modelo.
4. Fechar, ler, adiar e resolver têm significados distintos e auditáveis.
5. A mesma ocorrência não reaparece por mudança cosmética, login ou geração de uma nova frase.
6. A interface mostra quando os dados foram verificados e quando a conferência falhou.
7. Alterações via AppSheet entram na reconciliação; nenhum esquema operacional existente é sobrescrito.
8. Pré-REP mantém atuação humana e processamento local dos dados temporários.
9. Testes usam dados fictícios; medições técnicas não gravam dados pessoais, chaves ou texto integral de documentos.
10. Publicação segue `PUBLICACAO.md`, somente quando solicitada; esta análise não constitui autorização para implementar ou publicar no futuro.

## 10. Prompt de continuidade pronto para uso

> Leia `output/Analise-Entidade-2026-09-11.md` e confira o código atual antes de editar. Implemente somente a Etapa [N] do plano, respeitando seus critérios de aceite. O objetivo é uma assistente operacional cujo núcleo funciona sem API; chat e geração de linguagem são opcionais. Preserve aparência, animações, cálculos de RH, autenticação e esquema do AppSheet, salvo integração estritamente necessária e explicitada. Não reaplique mudanças antigas nem substitua arquivos inteiros de outras conversas. Use os serviços existentes para gravar dados. Valide os cenários listados e entregue um resumo do que mudou e do que não pôde ser comprovado. Não faça deploy, salvo se eu solicitar nesta tarefa.

**Decisão recomendada:** manter a Entidade, reduzir a dependência do chatbot e investir primeiro em acompanhamento confiável de providências. A utilidade virá de saber o que mudou, quem precisa agir e se o caso foi resolvido; a API entra quando uma explicação em linguagem natural acrescentar valor.
