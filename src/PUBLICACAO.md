# Publicação versionada

Toda publicação deste projeto, seja pelo Codex, Antigravity ou outro agente, deve ser executada a partir da raiz `RH` com:

```powershell
node src/deploy-versionado.cjs
```

Esse comando incrementa automaticamente a versão de correção, atualiza `Version.gs`, envia o código e atualiza o deployment do Web App. Não execute `clasp deploy` diretamente, pois ele não atualiza o número exibido no rodapé.
