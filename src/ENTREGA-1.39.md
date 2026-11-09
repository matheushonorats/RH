# Entidade.V1 — ajustes 1.39 e roteiro de conferência

**Entrega concluída:** web 1.39 publicada na implantação fixa; portátil deste PC atualizada para 1.39, com backup da 1.38. Pacote ZIP conferido contra as fontes e a instalação, sem perfis ou bancos de usuário.

**Validação:** 174 testes automatizados aprovados; verificações de interface nas duas edições; inspeção isolada sem alteração de estado; teste nativo de inicialização, base local, isolamento, REP, PDF, Excel e relatório de HE aprovado.

As mudanças se aplicam à web, à portátil e à base local da portátil.
Os testes automatizados usam bases temporárias, sem dados reais.

| Pedido | O que mudou | Como conferir |
|---|---|---|
| Identificação ao rolar | Nome, cargo e lotação em faixa compacta somente após o cabeçalho sair da vista | Abra um espelho e role até o meio do mês; volte ao início |
| Documentos médicos | Cobertura explícita de horas, restante da jornada ou dias inteiros no atestado | Em + Lançamento escolha Declaração de Horas ou Atestado e veja “O que este documento justifica?” |
| Falta/horas/batida cobertas pelo documento | Restante da jornada aceito pelo RH deixa de gerar débito ou falta de retorno; horas informadas abatem apenas o alcance do documento | Numa base de teste, use documento de 1h sobre débito de 2h: deve restar 1h; escolha restante da jornada para um caso sem retorno: o alerta de retorno deve sair |
| Atestado iniciado após trabalho | Primeiro dia pode ser parcial; os demais continuam integrais | Teste um atestado de três dias, com cobertura parcial no primeiro |
| Declaração somente em Lançamentos | Retirado o atalho próprio do espelho | Use o botão já existente + Lançamento |
| Animações | Entrada leve dos cartões, sem repeti-la a cada salvamento | Role os dias; com “reduzir movimento” do Windows, a entrada é desativada |
| Reset por servidor/mês | Limpa marcações e ajustes operacionais, preservando RH, outros meses, pessoas e AFDs | Apenas numa base de teste, abra Mais ações junto aos controles do servidor, leia a confirmação e compare outra pessoa e outro mês |
| Apagar todas as marcações de um dia | Mais ações do dia → Limpar marcações do dia | Teste com marcações fictícias; o original permanece auditado |
| Trabalho durante afastamento | Ação para desconsiderar as batidas desse trabalho | Num conflito fictício, use Desconsiderar trabalho neste dia; o afastamento permanece |
| Validar alerta | Botão abaixo do saldo diário | Abra um dia com alerta e confira a posição |
| Entidade de terno | Frase e traje temporário | Durante carregamentos, aguarde a rotação aleatória das frases |
| Saída em dia não útil | Aviso com data e motivo, sem aplicar restrição médica genérica | Selecione uma saída de férias/abono em sábado ou feriado e confira o aviso antes de salvar |
| Calendário pré-carregado | Feriados nacionais, de SP e de São Sebastião, editáveis | Veja julho/2026: 09/07; janeiro: 20/01; março: 16/03; junho: 04/06. Alterações são compartilhadas e recalculam o REP |
| Prévia durante leitura | Arquivos, nomes e totais recebidos ao fundo; sem edição | Sincronize os arquivos e observe a prévia até a conclusão |
| Progresso de AFDs | Cartões com nome e estado em lugar das bolinhas | Observe aguardando, carregando, concluído ou falha |
| WhatsApp | Campo opcional no cadastro e botão no espelho | Cadastre DDD e número, aguarde salvar e abra o botão: a conversa deve receber o texto pronto, sem enviá-lo |
| Campos antigos de Ajustar | Ausência registrada no RH e Justificativa ocultos; integração e histórico preservados | Abra Ajustar e confira que os demais controles permanecem |
| Dois botões de pasta | Mantido somente o superior, ao lado de sincronizar | O quadro inferior contém apenas informações |
| Compensação | Atalhos Usar todo saldo e Usar horas devidas, com valores editáveis | Escolha uma origem e um destino na compensação em lote e clique nos atalhos |
| Visual mais leve | Ações secundárias em menus, saldo sem faixa lateral colorida e rodapés de ação consistentes | Compare espelho, ajuste diário e lote; as funções existentes continuam acessíveis |
| Comunicado sem autorização repetitiva | Cada origem mostra apenas data e saldo; limites internos preservados | Copie pendências ou abra o WhatsApp: não deve aparecer “aguarda autorização” |
| AFD isolado | Leitura local independente, pesquisa, paginação e diagnóstico | Clique Inspecionar AFD isolado no início do REP, selecione um arquivo e compare o espelho antes/depois. Em Todos os registros aparecem também os registros técnicos originais |

## Alcance dos documentos médicos

O operador informa a cobertura aceita pelo RH. Uma declaração de comparecimento não equivale automaticamente a afastamento integral. O [CFM distingue os documentos](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2024/2381_2024.pdf); o [estatuto municipal, art. 93](https://saosebastiao.sp.leg.br/images/24110146_estatuto.pdf), também trata de documentos com ou sem afastamento integral. Não foi criada concessão automática de deslocamento ou de dias além do documento.

## Calendário

Os feriados seguem as datas recorrentes e o [calendário municipal de referência de 2026](https://www.saosebastiao.sp.gov.br/sistemas/oficialdocs/arquivos/04269964.pdf). Pontos facultativos, mudanças futuras e escalas especiais precisam de conferência da equipe. As datas podem ser corrigidas no REP.

## Cuidados no teste

Espere as filas terminarem antes de atualizar ou reabrir o programa. Teste limpeza/reset somente numa base de demonstração. O diagnóstico isolado pode ser usado sem importar o arquivo: ele não altera o espelho, não envia dados ao Drive e não valida criptograficamente a assinatura do AFD.
