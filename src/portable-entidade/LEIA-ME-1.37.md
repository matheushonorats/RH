# Entidade.V1 — 1.37

Férias: valida o limite de duas partes de gozo por período aquisitivo,
mantendo a ordem de consumo dos créditos mais antigos usada pelo programa.
Edição não conta a própria linha duas vezes; cancelados ficam fora. Pecúnia
consome saldo sem criar outra parte de afastamento. Prorrogações contíguas
formam um mesmo gozo. Programações futuras também entram na contagem.

O histórico é preservado: registros antigos acima do limite podem ser
corrigidos sem acrescentar outra parte. A ficha mostra as partes por período.
O controle da licença-prêmio foi adiado conforme solicitado.

Conflitos: uma janela persistente identifica a pessoa, os períodos solicitado
e existente, 1Doc/protocolo quando disponíveis e as datas exatas coincidentes.
Mostra os vários registros conflitantes, com indicação se houver mais de 20.
O limite de férias também informa as datas das partes consideradas.
A pré-validação ocorre antes dos uploads; voltar ao formulário preserva os dados.
O servidor confere novamente sob bloqueio de concorrência antes de gravar.

Dados, filas, armazenamento, auditoria e atualização assinada são preservados.
Aguarde a fila ficar sem pendências e reabra a portátil para carregar a atualização.
