# Entidade.V1 — 1.36

Inclui “Copiar pendências do mês” junto ao nome da pessoa no Leitor REP,
com faltas, batidas a conferir e horas ainda devidas. O texto também mostra
os dias com saldo restante e os limites autorizados disponíveis para compensação.
Recalcula todos os relógios da pessoa no mês, sem herdar filtros de dias ou locais.
A mensagem é somente copiada; o envio pelo WhatsApp continua a cargo do usuário.

Compensação em lote e individual aceita um pedido maior que o saldo sem
fabricar minutos: pedido de 30 com 27 disponíveis mantém o pedido digitado,
considera somente 27 e exibe um aviso. O documento autorizado é preservado;
a retirada efetiva respeita saldo, autorização e débito. No lote, os mesmos
minutos não são utilizados duas vezes em destinos diferentes.

Continua obrigatório informar “Quanto compensar” nos dias desejados.
Entradas inválidas e conflitos de gravação continuam protegidos.

Dados, filas, armazenamento e auditoria são preservados. Aguarde a fila ficar
sem pendências e reabra a portátil para carregar a nova interface.
