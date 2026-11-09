# Entidade.V1 — manutenção conjunta

Toda alteração funcional solicitada pelo usuário deve ser aplicada e verificada
na versão web e na portátil Windows, incluindo a base local da portátil.

- Web oficial: `output/RH-Modo-Seguro-Beta` e a implantação fixa configurada em
  `deploy-versionado.cjs`. Os arquivos antigos da raiz e `RH-LocalFirst-V1` não
  são as fontes do aplicativo portátil atual.
- Portátil atual: `portable-entidade/app`, recuperada da edição instalada 1.25.
  Preservar seleção de armazenamento, isolamento de bases, auditoria e atualização
  assinada. A base local executa as regras de `app/source-app`.
- Executar `node portable-entidade/sync-shared.cjs` após alterar as regras
  compartilhadas; ampliar a sincronização se a mudança atingir outros módulos.
  Não substituir a portátil pela antiga distribuição 1.23.
- Testar cancelamento, edição de anexos e integridade em uma base temporária.
  Nunca usar os dados reais como dados de teste.
- Atualizar a versão web, a fonte local, a interface e o pacote portátil em
  conjunto. Preservar a pasta de dados e as filas do usuário durante a entrega.
