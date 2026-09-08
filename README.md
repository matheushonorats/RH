# RH — Central de Documentos da SETUR

Sistema web de gestão de pessoas da Secretaria Municipal de Turismo de São Sebastião/SP. A aplicação reúne cadastro de servidores, lançamentos funcionais, protocolos, relatórios, férias, conferência de ponto e horas extras em uma única interface.

Versão publicada: **V2.3.157**

Plataforma: **Google Apps Script + Google Planilhas + Google Drive**

Idioma e fuso: **Português do Brasil · America/Sao_Paulo**

> Este repositório contém o código-fonte. Dados pessoais, anexos, credenciais e conteúdo da planilha de produção não devem ser versionados.

## 1. Objetivo

O projeto substitui controles manuais dispersos por um fluxo único e auditável para o RH. A interface foi pensada para usuários administrativos, inclusive em computadores antigos e telas menores, sem exigir instalação local.

O sistema oferece dois modos de acesso sobre a mesma base:

- **Versão oficial:** confirma cada gravação diretamente com a nuvem antes de liberar a interface.
- **Versão mais rápida (beta conectada):** usa cache no navegador e uma fila segura para enviar alterações em segundo plano. A tela informa o que está local, pendente, enviando, confirmado ou com erro.

As duas versões consultam a mesma fonte de dados. A beta não é uma base paralela e, por isso, uma alteração confirmada nela aparece na oficial.

## 2. Funcionalidades

### Visão geral

- indicadores de servidores e documentos;
- ausências atuais e próximas;
- alertas administrativos;
- atualização seletiva para reduzir recarregamentos.

### Servidores

- cadastro e edição;
- identificação por matrícula/PIS, sem depender do nome como chave principal;
- histórico funcional;
- vínculos entre cadastros e registros do relógio de ponto;
- créditos e saldos de férias;
- validações de duplicidade e concorrência.

### Lançamentos

- férias, afastamentos e demais documentos configuráveis;
- anexos em PDF no Google Drive;
- edição, cancelamento e exclusão conforme permissão;
- lançamentos cancelados não consomem saldo de férias nem bloqueiam novo período;
- trilha de criação e edição;
- fila persistente para evitar perda durante falhas de conexão.

### Protocolos

- agrupamento de lançamentos;
- numeração sequencial protegida contra concorrência;
- tramitação e status;
- consulta dos documentos vinculados;
- anexos e pastas no Drive.

### Leitor de ponto

- leitura de arquivos AFD armazenados no Drive;
- download paralelo e processamento no navegador;
- calendário compartilhado de feriados exibido e editado somente na competência selecionada, sem remover os demais meses;
- conciliação por PIS;
- cartões com marcações organizadas em linha;
- inclusão manual semelhante a uma planilha, com navegação por Tab;
- entrada e saída no mesmo dia ou após meia-noite;
- ajustes individuais e em lote;
- justificativas, descartes e marcações adicionais;
- cálculo de jornada, intervalo, horas devidas e horas extras;
- arredondamento configurável;
- conferência individual;
- PDFs do servidor, alertas e autorização de horas extras.

### Compensação de horas

- registro dos dias de hora extra na ordem informada pelo servidor;
- teto autorizado por dia;
- valor total que o servidor deseja compensar;
- entrada em `HH:MM` ou somente em minutos;
- distribuição automática sem ultrapassar o débito, o teto documental ou o saldo disponível;
- prévia antes da gravação;
- reaproveitamento de autorizações ainda não consumidas.

### Administração

- usuários e papéis;
- configurações gerais;
- tipos de documento;
- parâmetros do leitor de ponto;
- auditoria;
- proteção dos dados e capacidade da planilha.

## 3. Arquitetura

```text
Navegador
  ├─ interface HTML/CSS/JavaScript
  ├─ cache de leitura
  └─ fila local da beta
          │
          ▼
Google Apps Script
  ├─ autenticação e autorização
  ├─ serviços de domínio
  ├─ validações e bloqueios de concorrência
  ├─ auditoria e manutenção
  └─ acesso centralizado à base
          │
          ├─ Google Planilhas: dados estruturados
          └─ Google Drive: PDFs, AFDs, relatórios e históricos
```

O front-end não grava diretamente na planilha. Toda operação passa por funções do servidor, que verificam sessão, papel do usuário, formato dos dados e conflitos.

## 4. Organização do código

| Arquivo | Responsabilidade |
|---|---|
| `src/index.html` | estrutura principal da interface |
| `src/Styles.html` | estilos gerais |
| `src/WorkspaceLayout.html` | compactação e responsividade das telas |
| `src/Scripts.html` | estado e comportamento da interface |
| `src/Auth.gs` | login, sessão e autorização |
| `src/ServidoresService.gs` | cadastro de servidores |
| `src/LancamentosService.gs` | lançamentos e anexos |
| `src/ProtocolosService.gs` | protocolos e tramitação |
| `src/RepOnlineService.gs` | dados e regras do leitor de ponto |
| `src/RepEnhancements.html` | interação avançada do leitor de ponto |
| `src/RelatoriosService.gs` | relatórios e documentos gerados |
| `src/SyncQueueService.gs` | fila persistente de gravações |
| `src/AuditLog.gs` | trilha de auditoria |
| `src/DataProtectionService.gs` | integridade, cópias e diagnóstico |
| `src/MaintenanceService.gs` | manutenção automática e capacidade |
| `src/Setup.gs` | criação e atualização da estrutura inicial |
| `src/Version.gs` | versão exibida no sistema |

Arquivos em `src/output/`, `src/work/`, `src/.tmp/`, credenciais locais e dependências não fazem parte da publicação no GitHub.

## 5. Fonte dos dados

### Google Planilhas

A planilha principal funciona como banco de dados estruturado. As abas incluem, entre outras:

- `Usuarios`;
- `Servidores`;
- `Lançamentos`;
- `Protocolos`;
- `Configuracoes`;
- `Tipos_Documento`;
- `Creditos_Ferias`;
- tabelas do Leitor REP;
- `Fila_Sincronizacao`;
- `Logs`.

Os nomes e cabeçalhos são contrato do sistema. Alterações manuais devem ser feitas somente com cópia de segurança e revisão do código.

### Google Drive

O Drive armazena:

- anexos dos lançamentos;
- documentos de protocolo;
- arquivos de entrada do relógio de ponto;
- arquivos relacionados ao REP;
- relatórios exportados;
- cópias completas da base;
- históricos técnicos retirados da planilha ativa.

## 6. Proteção contra perda e contra o limite da planilha

O Google Planilhas possui [limite oficial de 10 milhões de células por arquivo](https://support.google.com/drive/answer/37603?hl=pt-BR). Ter backup não resolve o problema de capacidade: uma planilha cheia pode continuar existindo e, ainda assim, recusar novos dados.

A V2.3.157 adiciona uma estratégia em camadas:

1. **Diagnóstico de capacidade:** soma as células reservadas em todas as abas e mostra o percentual no painel Administração → Proteção dos dados.
2. **Avisos antecipados:** registra as faixas normal, atenção, alta e crítica; envia alerta aos responsáveis configurados quando a faixa muda.
3. **Cópia antes da manutenção:** nenhuma compactação automática começa sem validar a estrutura e confirmar a cópia completa.
4. **Compactação física:** remove somente linhas vazias reservadas abaixo do último dado, mantendo folga para novos registros. Limpar o conteúdo sem excluir a linha não seria suficiente.
5. **Rotação de auditoria:** ao atingir o limite operacional da aba `Logs`, os registros vão para CSV no Drive e as linhas reservadas são efetivamente liberadas.
6. **Fila de sincronização:** operações concluídas ou canceladas há mais de 90 dias são arquivadas. Pendências e erros nunca entram nessa limpeza.
7. **Memória auxiliar:** dados antigos da Entidade são consolidados e arquivados segundo a política definida no serviço de manutenção.
8. **Histórico preservado:** arquivos arquivados podem ser abertos pelo painel de proteção.

Essa rotina reduz drasticamente o crescimento inútil, mas nenhum arquivo de Planilhas é infinito. Antes de a base operacional se aproximar do limite crítico, a evolução prevista é particionar o histórico funcional por período ou migrar as tabelas de maior crescimento para um banco dedicado, mantendo a interface e as regras atuais.

## 7. Cópias de segurança e recuperação

- uma cópia completa é criada automaticamente no Drive em intervalo diário;
- a cópia inclui todas as abas e fórmulas;
- o administrador pode criar uma cópia manual;
- a integridade mínima é validada antes da cópia;
- a restauração nunca é automática;
- a beta não cria uma segunda rotina concorrente: a manutenção agendada pertence ao projeto oficial.

Em uma recuperação:

1. interrompa novas gravações;
2. abra Administração → Proteção dos dados;
3. confira a última cópia e os históricos;
4. duplique a cópia escolhida;
5. valide cabeçalhos, totais e anexos;
6. somente depois altere o identificador da base usada pelo aplicativo;
7. faça um teste de leitura e um lançamento controlado.

Nunca substitua a produção por uma cópia sem validar o conteúdo.

## 8. Segurança

- sessão própria vinculada ao usuário autorizado;
- papéis de consulta, operador e administrador;
- revogação de sessões após redefinição de acesso;
- validação de permissão também no servidor;
- bloqueios de usuário ou de script em operações concorrentes;
- validação de datas, horários, tamanhos e formatos;
- limite de quantidade em operações em lote;
- rejeição de JSON inválido em vez de sobrescrever silenciosamente;
- URLs e textos tratados antes de exibição;
- trilha de auditoria;
- arquivos locais de autenticação ignorados pelo Git.

O manifesto atual executa o web app com a conta responsável pela implantação. Por isso, o acesso público ao endereço não equivale a acesso aos dados: as funções do servidor exigem autenticação e cadastro autorizado.

## 9. Desempenho

As principais medidas atuais são:

- cache de leituras estáveis;
- reprocessamento direcionado somente ao servidor alterado;
- downloads paralelos de AFD, preservando a ordem dos arquivos;
- renderização seletiva do leitor de ponto;
- fila em segundo plano na beta;
- prevenção de cliques e envios duplicados;
- mensagens imediatas de salvamento e estado da sincronização;
- layouts compactos para reduzir rolagem e custo de renderização.

Evite ler a planilha inteira dentro de laços. Prefira uma leitura em matriz, processamento em memória e uma gravação em lote.

## 10. Ambiente de desenvolvimento

### Requisitos

- Node.js LTS;
- npm;
- conta Google autorizada no projeto;
- Google Apps Script API ativada;
- `clasp` instalado pelas dependências do projeto.

### Instalação

```bash
npm install
npm run login
```

O arquivo `.clasprc.json` contém credenciais locais e nunca deve ser enviado ao GitHub.

### Vinculação

`.clasp.json` define o projeto Apps Script e `rootDir: "src/"`. Para trabalhar em uma cópia isolada, troque o `scriptId` somente na sua cópia local e não publique essa alteração sem revisão.

### Comandos

```bash
npm run status
npm run pull
npm run push
npm run deploy
```

`npm run deploy` incrementa a versão, envia os arquivos e atualiza o endereço oficial. Não use `push --watch` sobre a produção durante o expediente.

## 11. Processo seguro de alteração

1. confirme a versão atualmente publicada;
2. faça uma cópia ou trabalhe na beta;
3. preserve alterações locais não relacionadas;
4. implemente a mudança no menor conjunto possível de arquivos;
5. execute verificações de sintaxe e regressão;
6. valide visualmente nas resoluções de notebook e monitor;
7. teste leitura antes de testar escrita;
8. use dados controlados ao testar escrita;
9. publique primeiro a beta;
10. valide a fila e a confirmação na nuvem;
11. publique a oficial mantendo o mesmo endereço;
12. registre a versão e o resultado.

## 12. Testes críticos

Antes de cada publicação, validar pelo menos:

- login autorizado, usuário inativo e perfis sem permissão;
- criação, edição, cancelamento e exclusão de lançamento;
- férias canceladas fora do cálculo de saldo e conflito;
- upload e abertura de anexos;
- protocolo sequencial;
- leitura de múltiplos AFDs;
- inclusão manual e marcação após meia-noite;
- ajuste individual e em lote;
- compensação respeitando ordem, teto e valor total;
- arredondamento na tela e na autorização de HE;
- conferência do servidor;
- impressão da autorização em uma página;
- fila pendente, erro, repetição e confirmação;
- proteção contra operação duplicada;
- cópia de segurança, capacidade e rotação;
- responsividade em tela menor;
- funcionamento da versão oficial após a publicação da beta.

O roteiro histórico de testes manuais está em `TESTES.md`. Verificações auxiliares usadas durante desenvolvimento podem existir localmente em `src/work/`, mas não são publicadas.

## 13. Publicação e rollback

### Oficial

```bash
npm run deploy
```

O script `src/deploy-versionado.cjs` atualiza `src/Version.gs`, envia o projeto e aponta a implantação existente para a nova versão. O endereço permanece igual.

### Beta conectada

A beta possui projeto Apps Script e implantação próprios, mas usa a mesma base autorizada. Seu pacote local fica fora do controle de versão para impedir mistura acidental com a oficial.

### Retorno

Se houver problema:

1. não apague a implantação atual;
2. selecione uma versão estável no gerenciamento de implantações;
3. atualize a implantação existente para essa versão;
4. confirme o rodapé e os fluxos de leitura;
5. preserve os registros enviados durante o incidente para reconciliação.

Versões ligadas a implantações ativas não devem ser excluídas do histórico.

## 14. Solução de problemas

### Alteração aparece na beta, mas ainda não na oficial

Abra o status da sincronização. Se houver pendência, mantenha a aba aberta e use a opção de tentar novamente. Atualizar a página não deve apagar a fila persistida.

### Navegador parece congelar após salvar

Evite clicar repetidamente. Observe o indicador de estado: ele diferencia processamento local, envio e confirmação. Em erro, a operação permanece na fila para nova tentativa.

### REP não reflete arquivos novos

Confirme se o arquivo está na pasta de entrada correta, depois use a sincronização do módulo. Arquivos muito grandes podem levar mais tempo para baixar e processar, embora o carregamento seja paralelo.

### Erro de limite de versões do Apps Script

O Apps Script permite no máximo 200 versões imutáveis por projeto. No histórico do projeto, use **Excluir versões em massa**, preservando todas as versões ligadas a implantações ativas. É possível remover até 100 por operação.

### Capacidade da planilha em atenção

Abra Administração → Proteção dos dados. Confira o percentual e as abas maiores. Não exclua linhas manualmente antes de confirmar uma cópia. A manutenção automática cuida das linhas vazias e dos históricos técnicos elegíveis; tabelas funcionais exigem plano de particionamento antes de qualquer arquivamento.

## 15. Diretrizes para contribuições

- não inclua dados reais de servidores em testes ou capturas;
- não versione planilhas exportadas da produção;
- não publique credenciais, tokens ou cookies;
- preserve compatibilidade com Google Apps Script V8;
- mantenha as validações no servidor;
- não use o nome do servidor como identificador único;
- não altere cálculos de RH sem cenário de teste reproduzível;
- não arquive dados funcionais sem implementar a consulta ao histórico;
- documente mudanças que afetem implantação, planilha ou Drive.

## 16. Estado atual e próximos passos

A V2.3.157 entrega o pacote de estabilidade, desempenho, reorganização visual, fila segura, validações adicionais, tela de escolha de versão, proteção de capacidade, edição de feriados por competência, confirmação discreta da leitura do ponto, salvamento consciente de marcações a conferir, inclusão do primeiro cartão manual de um servidor, atualização compartilhada reforçada do REP e reenvio automático de pendências após falhas temporárias.

Próximos passos recomendados:

1. observar por um ciclo de uso real o tempo de leitura e confirmação;
2. registrar mensalmente o crescimento das abas operacionais;
3. definir o período legal de retenção para cada tipo de registro;
4. preparar uma camada de consulta por ano antes de particionar dados funcionais;
5. avaliar banco dedicado quando o volume ou a simultaneidade deixarem de ser adequados ao Planilhas;
6. ampliar testes automatizados das regras de ponto e férias.

## 17. Guia de contexto para outra IA ou novo mantenedor

Esta seção é o contrato técnico do projeto. Antes de editar qualquer função, leia também os arquivos relacionados e procure o mesmo nome no pacote da beta. Não deduza regras de RH apenas pela aparência da tela.

### 17.1 Fonte de verdade e identidades

- A fonte de verdade compartilhada é a planilha aberta por `obterPlanilha_()` em `Code.gs`.
- A identificação funcional principal é a **matrícula normalizada**, não o nome.
- `normalizarChaveMatricula_()` remove zeros iniciais de chaves numéricas e normaliza valores não numéricos.
- No REP, a chave original é o **PIS/identificador do relógio**. `Vinculos_REP` relaciona esse valor ao PIS oficial e à matrícula.
- Alterar o nome do servidor não deve criar outra pessoa nem quebrar o histórico; qualquer código novo que relacione registros pelo nome está incorreto.
- O texto armazenado em `Lançamentos.NOME` pode conter `matrícula: nome`. `identidadeLancamentoConsistente_()` verifica divergências antigas.
- IDs de lançamento, protocolo, apontamento e operação de fila são independentes. Nunca reutilize um como substituto do outro.

### 17.2 Resolução e contrato da planilha

`Code.gs` contém a resolução da planilha de produção. Essa configuração é deliberadamente centralizada. Ao criar ambiente de teste:

1. use uma cópia da planilha;
2. altere o vínculo somente no projeto de teste;
3. confira o ID antes de qualquer gravação;
4. nunca publique uma alteração de ID por engano na oficial;
5. não confie em `getActiveSpreadsheet()` no web app, pois ele pode retornar `null`.

`normalizarCabecalho_()` permite acentos, caixa e separadores diferentes. `indiceCabecalho_()` deve ser usado para localizar colunas legadas. Código novo não deve assumir números fixos de coluna quando a aba possui cabeçalhos históricos.

### 17.3 Esquemas criados pelo Setup

#### `Usuarios`

| Coluna | Uso |
|---|---|
| E-mail | login canônico em minúsculas |
| Nome | apresentação |
| Papel | Administrador/Admin, Operador ou Consulta |
| Ativo | Sim/Não |
| Senha/Hash e colunas auxiliares | podem ser adicionadas pelas rotinas de autenticação |
| SessoesRevogadasEm | invalida tokens criados antes da redefinição |

#### `Logs`

`Data/Hora`, `Usuário`, `Ação`, `Módulo`, `Descrição`, `Campo Alterado`, `Valor Antes`, `Valor Depois`, `ID Registro`.

É uma tabela append-only até a rotação. Ao chegar a 5.000 linhas, o conteúdo é exportado e a aba é fisicamente compactada. Não remova `regravarTabelaCompactada_()` e não volte a usar apenas `clearContent()`.

#### `Tipos_Documento`

`ID`, `Nome do Tipo`, `Conta Férias`, `Conta Abonadas`, `Campos Visíveis`, `Ativo`.

`Campos Visíveis` controla partes do formulário. Mudanças aqui afetam validação, tela e relatórios.

#### `Configuracoes`

`Chave`, `Valor`, `Descrição`. As chaves são lidas como mapa. Preserve compatibilidade com valores antigos e normalize booleanos e números.

#### `Fila_Sincronizacao`

| Ordem | Coluna |
|---:|---|
| 1 | ID_OPERACAO |
| 2–3 | CRIADO_EM, ATUALIZADO_EM |
| 4–6 | USUARIO, TIPO_OPERACAO, DESCRICAO |
| 7 | PAYLOAD_JSON |
| 8–10 | STATUS, TENTATIVAS, ULTIMO_ERRO |
| 11 | ANEXOS_ESPERADOS |
| 12–17 | três pares de ID e URL de anexo |
| 18 | CONCLUIDO_EM |

Estados usuais: `AGUARDANDO_UPLOAD`, `PRONTA`, `ERRO`, `CONCLUIDA` e `CANCELADA`. Uma operação pertence ao e-mail autenticado. O mesmo `ID_OPERACAO` torna o salvamento idempotente.

#### Tabelas auxiliares da Entidade

- `IA_Memoria`: ID, data, usuário, pergunta, resposta, avaliação, correção e ativo.
- `IA_Insights`: ID, data, fingerprint, alerta, resposta, provedor, status, exibição e resolução.
- `IA_Conhecimento`: chave, atualização, pergunta, orientação validada e ativo.

Essas tabelas podem ser consolidadas e arquivadas. Não devem ser usadas como fonte primária de fatos funcionais.

#### Colunas obrigatórias adicionadas a tabelas existentes

- `Servidores`: `Ativo`, `PIS`, `ANIVERSARIO_DIA_MES`.
- `Creditos_Ferias`: `PENALIDADE_DIAS`.
- `Lançamentos`: `ID_Protocolo`, `Criado_Por`, `Criado_Em`, `Editado_Por`, `Editado_Em`, `Dias_Pecunia`, `ID_Operacao`.
- `Protocolos`: `Criado_Por`.

### 17.4 Esquemas do REP

| Aba | Cabeçalhos e finalidade |
|---|---|
| `REP_Arquivos` | Chave_REP, Numero_REP, Nome_Original, Pasta_Partes_ID, Total_Partes, tamanhos, intervalo, locais, auditoria, Ativo e Formato |
| `REP_Apontamentos` | ID, PIS, Data, Escopo, Evento_Chave, Texto, Status, auditoria, conclusão e Ativo |
| `REP_Justificativas` | PIS, Data, Linha_Lancamento, auditoria e Ativo |
| `REP_Compensacoes` | PIS, Data, Minutos, Observacao, auditoria, Ativo e Origens_JSON |
| `REP_Autorizacoes_Compensacao` | PIS, Data_Origem, Minutos_Autorizados, auditoria, Ativo e Ordem_Documento |
| `REP_Validacoes` | PIS, Data, Validado, Observacao, auditoria e Ativo |
| `REP_Descartes_HE` | PIS, Data, Descartado, auditoria, Ativo, Saldo_Minutos e Saldo_Ajustado |
| `REP_Feriados` | Data, auditoria e Ativo |
| `REP_Ajustes` | PIS, Competencia, Ajustes_JSON, auditoria e Ativo |
| `REP_Conferencias` | PIS, Competencia, Conferido, Conferido_Em, Conferido_Por e Ativo |
| `Vinculos_REP` | Identificador_REP, PIS_Oficial, Matricula, Nome, Lotacao, auditoria e Ativo |

O servidor cria essas abas sob demanda com `obterAbaRepOnline_()`. Ao mudar cabeçalhos, atualize o array de contrato, a leitura, a escrita, a beta, os testes e qualquer importador.

### 17.5 Pipeline do Leitor REP

1. `listarArquivosPastaEntradaRep()` enumera apenas `.txt` e `.afd` na pasta autorizada.
2. O navegador baixa cada arquivo em partes; a V2.3.157 trabalha com até dois arquivos em paralelo.
3. Cada parte é validada e o hash SHA-256 do arquivo completo permite conferir integridade.
4. O parser transforma linhas AFD em marcações normalizadas.
5. Duplicatas vindas de múltiplos relógios são conciliadas.
6. O PIS é resolvido contra servidor/vínculo.
7. Ajustes, justificativas, descartes, compensações, validações e conferências são combinados.
8. `processDataRep` calcula os dias no navegador.
9. Uma alteração simples pode reprocessar somente o PIS afetado; mudança de filtro, mês, ano ou regra força recálculo completo.
10. A interface renderiza o resultado e gera relatórios a partir do mesmo estado calculado.

Invariantes:

- preserve a marcação real e registre separadamente a considerada;
- aceite pares adicionais de entrada/saída para retorno em hora extra;
- uma saída após 00:00 pertence ao turno anterior quando explicitamente lançada dessa forma;
- sequência ímpar de marcações é inconsistente, não deve ser inventada automaticamente;
- arredondamento precisa produzir o mesmo total na tela e no documento;
- filtros visuais não podem alterar o saldo calculado;
- o botão Conferir grava por PIS e competência;
- operações em lote validam tudo antes e retornam reconhecimento parcial quando apenas parte foi confirmada.

### 17.6 Regra de compensação

Há três limites diferentes e todos precisam ser respeitados:

1. **débito do servidor:** quanto falta compensar;
2. **teto da origem:** quanto o documento permite retirar de cada dia com HE;
3. **total solicitado agora:** quanto o servidor efetivamente pediu para compensar, que pode ser menor que o débito.

As origens devem ser consumidas na `Ordem_Documento`, mesmo quando as datas não estão em ordem cronológica. O valor exibido pode alternar entre `HH:MM` e minutos, mas o armazenamento/cálculo usa minutos inteiros. Nunca distribua além do menor limite aplicável e nunca transforme um campo vazio em autorização ilimitada.

Ao permitir marcações ainda não salvas dentro do ajuste em lote, a prévia deve calcular sobre o estado mesclado da janela. Depois, a gravação deve preservar a ordem das operações e reprocessar o servidor uma única vez.

### 17.7 Férias e lançamentos anulados

`ehLancamentoAnulado_()` e `statusLancamentoInativo_()` são a regra única de exclusão lógica. Estados anulados, cancelados, excluídos ou não efetivados:

- não consomem saldo;
- não bloqueiam período;
- não contam como abono;
- não aparecem como ausência válida;
- continuam preservados para auditoria.

Na edição de férias ativas, a própria linha precisa ser devolvida temporariamente ao saldo antes de validar a nova data/quantidade. Uma linha anulada só volta a valer quando a ação de reativação for explícita. Não mude o texto visual sem revisar as funções de normalização de status.

### 17.8 Fluxo de um lançamento com anexo na beta

```text
Usuário confirma
  → navegador cria ID_OPERACAO
  → registra operação persistente
  → envia cada anexo e vincula ID/URL
  → marca payload como PRONTA
  → chama salvarLancamento
  → servidor verifica se ID_OPERACAO já existe
     ├─ existe: confirma sem duplicar
     └─ não existe: valida e grava
  → marca operação CONCLUIDA
  → incrementa RH_VERSAO_DADOS
  → interface mostra confirmação da nuvem
```

Se qualquer fase falhar, a fila retém payload, quantidade de tentativas e último erro. Não limpe `localStorage`/IndexedDB como solução de interface enquanto houver pendências. `Ctrl+F5` deve renovar arquivos estáticos, não apagar a fila persistida.

### 17.9 Autenticação e API

- o token aleatório é entregue após login válido;
- a sessão persistente dura até sete dias de inatividade;
- o cache de sessão acelera consultas por até seis horas;
- a persistência é renovada em intervalos, não em toda chamada;
- redefinir o acesso grava `SessoesRevogadasEm` e invalida tokens anteriores;
- tentativas de login são limitadas em cache;
- `executarApiBackend(token, funcName, args)` é a única ponte genérica da interface;
- somente funções presentes em `obterFuncoesApiPermitidas_()` podem ser chamadas;
- nomes iniciados por salvar, atualizar, excluir, criar e equivalentes incrementam a versão dos dados.

Ao criar nova função pública:

1. valide o usuário dentro da função;
2. valide o papel adequado;
3. valide tamanho, tipo e formato dos argumentos;
4. use lock compatível;
5. registre auditoria se houver mutação;
6. adicione à lista permitida somente se a interface precisar chamá-la;
7. trate-a como mutação em `executarApiBackend` quando aplicável;
8. teste usuário sem permissão.

### 17.10 Concorrência

| Lock | Quando usar |
|---|---|
| `ScriptLock` | sequências, alterações administrativas e tabelas compartilhadas por todos |
| `UserLock` | fila pertencente ao usuário, para evitar duplo envio entre abas sem bloquear todo o sistema |
| `DocumentLock` com fallback para `ScriptLock` | gravações REP ligadas à planilha; no web app o document lock pode ser `null` |

Nunca adquira novamente o mesmo lock dentro de uma função já bloqueada. Nesses casos, use variantes como `lancarLogSemLock_()`. Não mantenha lock durante processamento demorado ou chamadas externas quando a gravação protegida puder ser isolada.

### 17.11 Cache e invalidação

- `_leiturasEmLoteAtivas_` e `_cacheLeiturasEmLote_` reaproveitam uma leitura somente durante uma resposta agregada.
- `RH_VERSAO_DADOS` sinaliza mutações entre clientes.
- o contexto da Entidade usa uma chave própria de cache e deve ser invalidado após mudanças em servidores/lançamentos.
- o cache do navegador melhora leitura, mas nunca substitui a confirmação do servidor.
- ao adicionar um novo dado que afeta dashboard, REP ou Entidade, localize todas as invalidações relacionadas.

### 17.12 Pastas do Drive

As pastas são descobertas/criadas preferencialmente ao lado da planilha e seus IDs ficam em propriedades do script:

- `RHV2 - Entrada de AFDs`: arquivos originais a ler;
- `RHV2 - Arquivos REP`: partes e arquivos processados;
- pastas de anexos e protocolos definidas nos serviços correspondentes;
- `SETUR_RH_Backups_Automaticos`: cópias completas;
- `SETUR_RH_Arquivos_Historicos`: fila e tabelas auxiliares arquivadas;
- `SETUR_RH_Logs_Historicos`: rotações de auditoria legadas.

Não use uma busca global por nome quando houver ID persistido confiável. Antes de mover ou excluir um arquivo, confirme que ele pertence à pasta autorizada.

### 17.13 Manutenção e capacidade

A manutenção oficial roda diariamente. A beta detecta `betaConectadaProducao_` e não instala uma segunda rotina sobre a mesma base.

Ordem obrigatória:

1. obter lock;
2. validar abas críticas;
3. confirmar backup (ou backup diário ainda válido);
4. arquivar registros elegíveis;
5. compactar tabelas regravadas;
6. liberar excesso de linhas vazias mantendo folga;
7. recalcular capacidade;
8. registrar resultado;
9. liberar lock.

Nunca arquive automaticamente `Servidores`, `Lançamentos`, `Protocolos`, créditos ou tabelas REP funcionais apenas para reduzir tamanho. Primeiro é necessário implementar leitura transparente do histórico. A proteção atual controla crescimento técnico e espaço vazio; o particionamento funcional é a etapa futura para escala de longo prazo.

### 17.14 Arquivos que normalmente mudam juntos

| Alteração | Revisar em conjunto |
|---|---|
| novo campo de servidor | Setup, ServidoresService, Scripts, index, relatórios, Entidade e beta |
| novo campo de lançamento | Setup, índices de cabeçalho, leitura, gravação, formulário, detalhes, relatórios, fila e beta |
| nova regra de férias | LancamentosService, ServidoresService/resumo, dashboard, relatórios, e-mails e testes |
| nova regra REP | RepOnlineService, RepEnhancements, Scripts, PDFs, configuração, beta e testes |
| novo status | normalizadores, filtros, contagens, cores, relatórios, conflito e auditoria |
| nova chamada da interface | função servidor, permissão, allowlist, wrapper do cliente e tratamento de erro |
| mudança visual global | Styles, WorkspaceLayout, modais, breakpoints e impressão |
| mudança de impressão | CSS `@media print`, gerador HTML, A4 real e teste com mês de 31 dias |
| proteção/capacidade | DataProtectionService, MaintenanceService, AuditLog, SyncQueue, painel Admin e beta |

### 17.15 Regras de interface

- não remover funções para ganhar espaço; reorganizar e usar divulgação progressiva;
- cabeçalho global e cabeçalho da página devem permanecer compactos;
- informações críticas precisam aparecer em notebook sem rolagem horizontal;
- cartões de marcação não podem ocultar o horário;
- quatro marcações usuais devem caber lado a lado; pares extras continuam na mesma linha quando houver espaço;
- modais devem manter título e ações visíveis, rolando apenas o corpo;
- menus fecham por clique externo, Escape e nova seleção;
- botões devem mostrar pressionamento e estado ocupado;
- salvamentos devem dar resposta imediata e depois confirmação da nuvem;
- mensagens comuns ficam do lado apropriado da tela; status técnico permanece discreto no rodapé;
- o fantasma de status representa estado por cor, glow e transição, sem animações ociosas invasivas;
- `prefers-reduced-motion` deve ser respeitado;
- estilos de tela não podem vazar para impressão.

### 17.16 Matriz de publicação

| Item | Oficial | Beta conectada |
|---|---|---|
| Projeto Apps Script | principal | separado |
| Implantação | endereço oficial existente | endereço beta existente |
| Planilha | produção | mesma produção |
| Drive/REP | produção | mesmos arquivos autorizados |
| Escrita | síncrona | fila + segundo plano |
| Manutenção diária | ativa | desativada para evitar duplicidade |
| Arquivos locais | `src/` | `src/output/RH-Modo-Seguro-Beta/` (ignorado no Git) |

Uma correção de regra compartilhada precisa ser portada para a beta antes da publicação. Diferenças intencionais da beta — fila, estado visual e cache — não devem ser copiadas cegamente para a oficial.

### 17.17 Checklist obrigatório para uma IA

Antes de editar:

- confirme pedido, versão, pasta e implantação;
- confira arquivos modificados e preserve trabalho existente;
- descubra a chave canônica e todos os consumidores do dado;
- leia as funções completas, não apenas o trecho encontrado;
- diferencie regra de negócio, apresentação e persistência;
- não use dados reais em testes.

Antes de publicar:

- valide sintaxe de todos os `.gs` alterados;
- valide cada bloco `<script>` dos HTMLs;
- execute regressões de férias, REP, fila, permissão e capacidade;
- compare oficial e beta nos arquivos compartilhados;
- confira a versão exibida;
- teste layout de notebook, desktop, modal e impressão;
- publique beta primeiro;
- verifique que o endereço publicado responde;
- publique a oficial sem criar novo endereço;
- confira a implantação e o número da versão;
- nunca force publicação se o Google indicar limite de versões sem antes preservar implantações ativas.

Depois de publicar:

- faça leitura sem mutação;
- acompanhe erros de execução;
- confirme status da fila;
- teste uma gravação controlada somente quando autorizado;
- documente o que mudou e como retornar.

### 17.18 O que não está resolvido por completo

- Google Planilhas continua sendo a base operacional e possui limite finito.
- A V2.3.157 impede desperdício de células e arquiva crescimento técnico, mas ainda não particiona `Lançamentos` e tabelas REP funcionais por ano.
- Cópias no mesmo ecossistema Google protegem contra erro operacional, mas uma estratégia de continuidade mais forte deve incluir exportação periódica independente.
- Alguns testes são de regressão local e ainda não substituem testes integrados completos contra uma cópia controlada da planilha.
- A beta conectada melhora a percepção de velocidade, mas quotas e indisponibilidade do Google continuam sendo dependências externas.

Uma IA não deve ocultar essas limitações nem prometer funcionamento infinito. A próxima evolução de arquitetura deve adicionar repositório de dados particionado ou banco dedicado atrás da camada de serviços, sem reescrever a interface de uma só vez.

---

Uso institucional da Secretaria Municipal de Turismo de São Sebastião/SP.
