# Publicação versionada

Toda publicação deste projeto, seja pelo Codex, Antigravity ou outro agente, deve ser executada a partir da raiz `RH` com:

```powershell
node src/deploy-versionado.cjs
```

Esse comando incrementa automaticamente a versão de correção, atualiza `Version.gs`, envia o código e atualiza o deployment do Web App. Não execute `clasp deploy` diretamente, pois ele não atualiza o número exibido no rodapé.

O destino oficial atual é o deployment `AKfycby0FlCTrL0QIJbFrZD883rn6PKhzpMea5JL7eqz_bN9aglWajMIFZ021uxsi8aDEyAhCw`. O endereço histórico `AKfycbxm851ClYMk27l_N_9eK4hMZbHkGqC1sTdMXGyT1rbFiLl3foMHFswran49tUk4CpYD` funciona como uma porta de entrada estática: ele não simula carregamento nem troca de página sozinho; o botão abre o destino oficial e a versão anterior continua disponível apenas para recuperação controlada.

A fonte publicada está em `src/output/RH-Modo-Seguro-Beta`, pois esse projeto conserva os componentes de sincronização e segurança da versão que foi promovida. O publicador usa automaticamente o `.clasp.json` dessa pasta.
