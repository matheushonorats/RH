# 🚀 Configuração do Ambiente de Desenvolvimento (Clasp)

Este projeto utiliza o **Google Clasp** (Command Line Apps Script Projects) para permitir que você edite o código do RH Central de Documentos localmente no seu computador e envie as atualizações diretamente para o Apps Script do Google de forma automática, sem precisar copiar e colar.

---

## 🛠️ Passo a Passo para Inicializar o Ambiente

### Passo 1: Habilitar a API do Google Apps Script
Antes de logar pelo terminal, o Google exige que você ative a permissão de desenvolvedor na sua conta Google.
1. Acesse o site oficial: 👉 [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings)
2. Role até a opção **Google Apps Script API** (na parte inferior da tela).
3. Mude a chave para **Ativado (ON)**.

---

### Passo 2: Fazer o Login no Clasp
Abra o seu terminal na pasta do projeto e execute o comando abaixo:
```bash
npm run login
```
*Isso abrirá uma janela no seu navegador solicitando que você escolha sua conta Google e conceda as permissões de acesso ao clasp.*

---

### Passo 3: Criar a Cópia da Planilha e obter o Script ID
Como concordamos em usar uma cópia de testes para não interferir na produção:
1. Abra a sua planilha atual de RH.
2. Faça uma cópia dela: Vá em **Arquivo > Fazer uma cópia**. Dê um nome adequado (ex: *[TESTE] Gestão de Pessoas - SETUR*).
3. Abra a nova planilha cópia, acesse o menu superior **Extensões > Apps Script**.
4. Apague qualquer código temporário que exista no editor do Google.
5. No menu lateral esquerdo do Apps Script, clique em **Configurações do Projeto** (ícone de engrenagem).
6. Copie o código exibido no campo **ID do Projeto** (ou *Script ID*), que é uma sequência longa de letras e números.

---

### Passo 4: Vincular o Script ao Clasp local
Abra o arquivo `.clasp.json` na raiz da pasta do seu computador e substitua o valor `"SEU_SCRIPT_ID_AQUI"` pelo ID do Script que você copiou no Passo 3:

```json
{
  "scriptId": "COLOQUE_AQUI_O_ID_DO_SEU_SCRIPT",
  "rootDir": "src/"
}
```

---

## 💻 Comandos Úteis do Clasp

Após configurar o arquivo `.clasp.json`, você poderá gerenciar o deploy com os seguintes comandos no terminal:

* **Subir alterações para o Google:**
  ```bash
  npm run push
  ```
  *(Envia todo o código da pasta `src/` para o editor do Apps Script no Google Drive)*

* **Modo Observador (Watch):**
  ```bash
  npm run watch
  ```
  *(Fica monitorando a pasta local. Toda vez que você salvar um arquivo no seu editor de código, ele envia automaticamente para o Google em tempo real)*

* **Baixar alterações do Google (se editou direto no navegador):**
  ```bash
  npm run pull
  ```

---

## 🛠️ Próximo Passo

Assim que você habilitar a API e atualizar o `.clasp.json`, execute o primeiro `npm run push` para enviar o código base (`Setup.gs`, `Code.gs`, `index.html`, etc.) para o seu editor do Google Apps Script. 

Depois, abra o Apps Script no navegador e execute a função `executarConfiguracaoInicial` no arquivo `Setup.gs` para estruturar a sua nova planilha cópia!
