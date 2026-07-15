# Testes Manuais — RH Central de Documentos v2.0

Cenários críticos para validação após cada deploy. Execute com dois usuários distintos sempre que indicado.

---

## 1. Autorização e Acesso

| # | Cenário | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| A1 | Acesso negado a não cadastrado | Abra o Web App com uma conta Google não listada na aba `Usuarios` | Tela de erro: "Seu e-mail não está autorizado" |
| A2 | Acesso negado a usuário bloqueado | Defina `Ativo = Não` para um usuário e tente acessar | Tela de erro: "Sua conta está inativa" |
| A3 | Consulta não consegue criar lançamento | Logue como papel `Consulta` e tente salvar um lançamento | Erro: "Você não possui permissão..." |
| A4 | Operador não acessa painel Admin | Logue como `Operador` e navegue até a aba Administração | Aba deve estar oculta ou retornar erro de permissão |
| A5 | Bootstrap do proprietário | Abra o Web App com a conta dona da planilha e aba `Usuarios` vazia | Administrador criado automaticamente na aba |

---

## 2. Lançamentos

| # | Cenário | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| L1 | Criar lançamento básico | Preencher form e salvar sem anexo | Linha inserida na aba `Lançamentos` com colunas `Criado_Por` e `Criado_Em` preenchidas |
| L2 | Editar lançamento existente | Abrir lançamento existente, alterar tipo, salvar | `Editado_Por` e `Editado_Em` atualizados; demais colunas preservadas |
| L3 | Upload de PDF válido | Anexar PDF < 10 MB | Upload concluído; URL do Drive retornada e salva na aba |
| L4 | Rejeição de arquivo não-PDF | Tentar anexar `.docx` ou `.jpg` | Erro: "Apenas arquivos PDF são autorizados" |
| L5 | Rejeição de PDF > 10 MB | Tentar anexar PDF acima do limite | Erro: "Tamanho do arquivo excede..." |
| L6 | Arquivo órfão limpo em falha | Simule falha de rede após upload mas antes do `salvarLancamento` (interrompa com DevTools) | Arquivo deve ser removido do Drive automaticamente |
| L7 | Concorrência — dois usuários salvando | Dois usuários salvam ao mesmo tempo | Apenas um é bloqueado temporariamente (< 15s); ambos gravam sem corrupção |

---

## 3. Protocolos

| # | Cenário | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| P1 | Criar protocolo com múltiplos lançamentos | Selecionar 3 pendentes e criar | ID sequencial `SETUR-AAAA-XXXXXX` gerado; coluna `ID_Protocolo` preenchida nos 3 lançamentos |
| P2 | ID sequencial não duplica | Criar dois protocolos rapidamente | IDs diferentes e incrementais |
| P3 | Concorrência — dois protocolos simultâneos | Dois usuários clicam "Criar Protocolo" ao mesmo tempo | Um aguarda o lock; ambos recebem IDs únicos |
| P4 | Contagem de documentos correta | Criar protocolo com 2 lançamentos; verificar lista | Coluna "Qtd Doc" exibe 2 (sem N leituras duplicadas) |
| P5 | Transição de status | Clicar no botão de tramitação e escolher novo status | Status atualizado na aba `Protocolos` e no log |

---

## 4. E-mails e Créditos de Férias

| # | Cenário | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| E1 | Envio de alerta diário | Executar `verificarEEnviarEmailsDiarios` manualmente no Apps Script | E-mail recebido no destino configurado com lista de ausências |
| E2 | Sem alertas — sem e-mail | Nenhum lançamento futuro dentro do intervalo | Nenhum e-mail enviado; log registra "Nenhum alerta" |
| C1 | Geração de créditos — sem duplicatas | Executar `menuGerarGeral` duas vezes seguidas | Segunda execução registra apenas "Duplicados pulados: N" sem criar novos |
| C2 | Créditos criados em lote | Executar com 5+ servidores | Todos os créditos aparecem na aba `Creditos_Ferias`; sem timeout |

---

## 5. Rotação de Logs

| # | Cenário | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| R1 | Exportação automática | Inserir manualmente 5001 linhas na aba `Logs` e disparar qualquer ação de log | Arquivo CSV criado na pasta `SETUR_RH_Logs_Historicos` no Drive; aba `Logs` esvaziada |
| R2 | Falha não limpa a aba | Simule falha de escrita no Drive (remova temporariamente a permissão de Drive) | Aba `Logs` preservada; erro registrado no `Logger` sem perda de dados |

---

## 6. Segurança — XSS

| # | Cenário | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| X1 | Injeção via nome de servidor | Cadastrar servidor com nome `<img src=x onerror=alert(1)>` | Nome exibido como texto literal na tabela, sem execução de JS |
| X2 | Injeção via tipo de lançamento | Salvar lançamento com tipo `'><script>alert(1)</script>` | Texto exibido corretamente, sem popup |
| X3 | URL de anexo maliciosa | Editar diretamente a planilha com URL `javascript:alert(1)` na coluna `anexo1` | Anexo não aparece como link no modal (validação `drive.google.com` rejeita) |

---

## 7. Servidores

| # | Cenário | Passos | Resultado Esperado |
|---|---------|--------|--------------------|
| S1 | Matrícula duplicada | Tentar cadastrar dois servidores com a mesma matrícula | Erro: "Já existe um servidor cadastrado com a matrícula X" |
| S2 | Concorrência no cadastro | Dois operadores cadastram a mesma matrícula simultaneamente | Um recebe o erro de duplicidade; nenhuma linha duplicada na planilha |
| S3 | Fórmulas preservadas | Cadastrar novo servidor | Colunas de saldo de férias calculadas corretamente para a nova linha |
