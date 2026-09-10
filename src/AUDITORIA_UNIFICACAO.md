# Auditoria para unificação da versão oficial e da beta

## Decisão recomendada

A beta deve ser promovida como interface oficial, mas o aplicativo final deve permanecer em **um único projeto do Google Apps Script e uma única URL operacional**. Manter dois projetos gravando a mesma planilha não é uma arquitetura segura de produção.

## Riscos críticos encontrados

1. **Bloqueios de gravação não são compartilhados entre projetos.** O `ScriptLock` da oficial não bloqueia a beta e vice-versa. Duas alterações simultâneas no mesmo registro podem competir.
2. **Filas locais pertencem à URL de cada versão.** Uma pendência criada na oficial não acompanha automaticamente o usuário ao abrir a beta. As filas precisam estar vazias antes do corte.
3. **Rotinas automáticas poderiam executar em duplicidade.** Créditos de férias, e-mails, aniversariantes e análise automática existiam nos dois projetos. A beta conectada foi alterada para delegar essas rotinas à oficial.
4. **Propriedades internas são separadas.** Sessões, contadores, marcadores de e-mail, consumo da IA e estados de manutenção não são compartilhados entre projetos.
5. **Numeração sequencial de protocolos podia repetir.** Corrigido para consultar os números realmente gravados na planilha antes de gerar o próximo.
6. **Ações existentes na tela podiam faltar na lista autorizada do servidor.** Corrigidos edição de protocolo, abono eleitoral e leitura dos limites de compensação.

## Compatibilidade de dados

- Oficial e beta conectada utilizam a mesma planilha principal.
- Os serviços possuem o mesmo conjunto principal de funções; as diferenças adicionais da beta são proteções, espelhamento e interface.
- Identificadores aleatórios usados nos demais registros não dependem de contador local, portanto não apresentam o mesmo defeito do protocolo.
- As novas colunas de abono eleitoral são criadas por nome e toleram bases antigas.

## Procedimento seguro de promoção

1. Publicar o código consolidado no projeto oficial, mantendo a URL oficial.
2. Antes do corte, confirmar que nenhum navegador possui alterações pendentes nas duas versões.
3. Suspender gravações na beta separada e deixar nela apenas um aviso apontando para a oficial.
4. Executar uma cópia integral da planilha antes da troca.
5. Validar login, cadastro, lançamentos, protocolos, REP, compensações, relatórios e anexos na URL oficial.
6. Manter a versão anterior do Apps Script disponível para retorno imediato.
7. Após o período de observação, remover os gatilhos e encerrar o projeto beta separado.

## Critério para liberar a unificação

O corte só deve ocorrer quando as filas dos computadores estiverem sem pendências e os testes essenciais tiverem sido concluídos na publicação oficial. Isso impede que uma alteração ainda guardada no navegador antigo fique abandonada.
