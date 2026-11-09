# RH - Modo Seguro Beta

Esta pasta contem a implantacao beta paralela, atualmente compatibilizada com a versao oficial 2.3.122. Os arquivos oficiais da pasta `src` e a implantacao atualmente utilizada pelo RH nao foram alterados por este trabalho.

## O que esta primeira etapa faz

- Acrescenta, no painel **Administracao > Parametrizacoes Gerais**, a escolha local entre **Classico** e **Acelerado - Beta**.
- Mantem **Classico** como padrao para todo usuario e computador.
- Guarda a ultima copia de leitura em IndexedDB somente quando o administrador ativa o modo acelerado naquele navegador.
- Valida a sessao no servidor antes de revelar a copia local.
- Consulta primeiro a revisao leve da nuvem. Se a revisao nao mudou, nao baixa novamente servidores, lancamentos e protocolos.
- Se a revisao mudou, executa a sincronizacao oficial atual em segundo plano.
- Permite voltar ao modo classico e apagar somente a copia local.
- Identifica visualmente esta implantacao como **Beta segura**.

## O que deliberadamente nao foi alterado

- Inclusao, edicao e exclusao de servidores.
- Validacoes de conflitos e cobertura de lotacao.
- Criacao e edicao de lancamentos.
- Upload de anexos para o Google Drive.
- Protocolos, relatorios e processamento do REP.
- Autenticacao, permissoes e auditoria.
- Estrutura das Planilhas e pastas do Drive.

Todas essas operacoes continuam usando os mesmos metodos oficiais. Nesta etapa, o IndexedDB e apenas uma copia de leitura; ele nunca e a fonte oficial.

## Protecoes implementadas

1. Preferencia separada por usuario e navegador.
2. Prazo maximo de sete dias para aceitar uma copia local.
3. Validacao de versao do esquema, usuario e estrutura do snapshot.
4. Fallback automatico para a carga online se IndexedDB estiver indisponivel ou invalido.
5. Exclusao da copia local ao sair da conta ou usar **Limpar copia local**.
6. Nenhuma tentativa de sincronizar PDFs depois que o navegador for fechado.
7. Nenhuma alteracao automatica das planilhas durante a ativacao do modo.

## Publicacao beta isolada

- Aplicativo beta: https://script.google.com/macros/s/AKfycby0FlCTrL0QIJbFrZD883rn6PKhzpMea5JL7eqz_bN9aglWajMIFZ021uxsi8aDEyAhCw/exec
- Projeto Apps Script beta: https://script.google.com/d/18EUWiKIWJ3SyNUERO1fWLIZq7lYXtToM1GZObf3KRRCJRj9q12KjFZlc/edit
- Pasta privada da beta: https://drive.google.com/drive/folders/14T3MLlgt3s9TlKa5NhIijp2mH-KRg-EV
- Copia da planilha usada pela beta: https://docs.google.com/spreadsheets/d/1fC2ySJnWRIHetSxOfeUekEQ10zMJOOnanSXtm7ynqtg/edit

A publicacao pertence a conta institucional `turismo.setur@saosebastiao.sp.gov.br`. Use essa conta Google no primeiro teste. O acesso nao foi tornado publico.

## Como testar o piloto conectado

1. Abra o endereco do **Aplicativo beta** acima usando a conta institucional.
2. Entre com o mesmo usuario interno utilizado no RH.
3. Confirme que o rodape mostra `V2.3.122 BETA CONECTADA` e que o cabecalho exibe o selo **Beta conectada**.
4. Acesse **Administracao > Parametrizacoes Gerais**.
5. Primeiro navegue em **Classico** e confira os totais do painel, ausentes, servidores, lancamentos, protocolos e REP.
6. Selecione **Acelerado - Beta**. A primeira carga preenche a copia local segura do navegador.
7. Recarregue e navegue novamente. Quando a revisao da nuvem nao muda, a beta evita baixar a base completa.
8. Para retornar ao carregamento integral, selecione **Classico** ou use **Limpar copia local**.

Atencao: Classico e Acelerado alteram apenas a estrategia de carregamento. Nos dois modos, inclusoes, edicoes e exclusoes sao gravadas na producao. Durante o piloto, nao edite o mesmo registro ao mesmo tempo nas duas interfaces.

## Recursos separados criados no Drive

- Uma copia independente da planilha oficial, com os dados existentes no momento da criacao.
- `Lancamentos_Files_BETA`, vazia para anexos de teste.
- `Protocolos_BETA`, vazia e preparada para a etapa de protocolos.
- `RHV2 - Arquivos REP`, vazia para arquivos REP processados na beta.
- `RHV2 - Entrada de AFDs`, vazia para testes de entrada de AFD.

A beta foi inicialmente validada em **somente leitura**. O piloto atual esta conectado a producao e permite operacoes reais. A protecao adicional de anexos impede que a beta apague arquivos antigos: somente arquivos enviados pela propria beta podem ser removidos por ela.

## Etapa de espelho validada

A beta consulta a data de alteracao da planilha oficial. Quando detecta uma mudanca, copia os valores atualizados para a planilha beta e somente depois entrega a nova revisao ao navegador. As abas `Usuarios` e `Sessoes` nunca sao sobrescritas, preservando a autenticacao isolada da beta.

Essa foi a etapa anterior de validacao, com fluxo unidirecional **producao -> copia beta -> navegador**. Ela foi concluida antes da liberacao do piloto funcional.

## Piloto conectado a producao

Na revisao `2.3.122-beta-connected.1`, a beta usa a planilha, os anexos e as pastas REP oficiais. Antes da ativacao foi criada automaticamente uma copia integral e datada da planilha oficial dentro da pasta privada da beta.

- Backup preventivo confirmado: https://docs.google.com/spreadsheets/d/1WZmV8a0K4MX6SZNF51yG--NjMcrMv2YCXw7JY8E0dYk/edit

As inclusoes, edicoes e exclusoes feitas pela beta sao reais e aparecem na versao oficial. Os anexos novos sao gravados na pasta oficial, mas a beta somente pode apagar anexos que ela mesma tenha criado. Ao substituir um arquivo REP pela beta, a pasta anterior e preservada durante o piloto.

Como a implantacao beta pertence a outro projeto Apps Script, nao edite o mesmo registro simultaneamente na versao oficial e na beta. Para o piloto inicial, use uma interface por vez nas operacoes de gravacao.

## Segundo computador

Depois de validar no notebook, abra o mesmo endereco beta no segundo PC com a conta Google autorizada. A opcao Classico/Acelerado e a copia local sao independentes em cada navegador; nenhuma instalacao ou permissao de administrador do Windows e necessaria.

## Limitacao consciente desta etapa

Quando a revisao global muda, a beta ainda baixa a base completa usando a funcao oficial `obterDadosCompletos`. A sincronizacao registro a registro exige um historico persistente de alteracoes no servidor. Essa sera uma etapa posterior, pois modifica o backend compartilhado e precisa de testes de regressao antes de ser ligada ao sistema em uso.

## Criterios antes da proxima etapa

- Totais do dashboard identicos entre classico e acelerado.
- Mesmos servidores, lancamentos e protocolos nas duas modalidades.
- Nenhuma duplicidade de gravacao.
- Logout remove a copia local daquele usuario.
- Falha ou bloqueio do IndexedDB leva ao modo online sem impedir o acesso.
- Teste aprovado no notebook antes de liberar um segundo usuario.
