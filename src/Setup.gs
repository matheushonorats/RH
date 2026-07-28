/**
 * Script de Inicialização e Configuração Automática
 * RH Central de Documentos v2.0
 * 
 * Cria as abas de infraestrutura necessárias se não existirem
 * e insere colunas adicionais para auditoria e controle.
 */

// Configurações das abas e esquemas de colunas
const CONFIG_SETUP = {
  abasNovas: {
    "Usuarios": [
      "E-mail", 
      "Nome", 
      "Papel", // Admin, Operador, Consulta
      "Ativo"  // Sim, Não
    ],
    "Logs": [
      "Data/Hora", 
      "Usuário", 
      "Ação", 
      "Módulo", 
      "Descrição", 
      "Campo Alterado",
      "Valor Antes", 
      "Valor Depois", 
      "ID Registro"
    ],
    "Tipos_Documento": [
      "ID",
      "Nome do Tipo", 
      "Conta Férias", // Sim, Não
      "Conta Abonadas", // Sim, Não
      "Campos Visíveis", // JSON ou lista de campos
      "Ativo" // Sim, Não
    ],
    "Configuracoes": [
      "Chave", 
      "Valor", 
      "Descrição"
    ],
    "IA_Memoria": [
      "ID",
      "Data",
      "Usuário",
      "Pergunta",
      "Resposta",
      "Avaliação",
      "Correção",
      "Ativo"
    ],
    "IA_Insights": [
      "ID",
      "Data",
      "Fingerprint",
      "Alerta",
      "Resposta",
      "Provedor",
      "Status",
      "Mostrado_Em",
      "Resolvido_Em"
    ],
    "IA_Conhecimento": [
      "CHAVE",
      "DATA_ATUALIZACAO",
      "PERGUNTA_REFERENCIA",
      "ORIENTACAO_VALIDADA",
      "ATIVO"
    ]
  },
  abasExistentesModificadas: {
    "Servidores": {
      "colunasNovas": ["Ativo", "PIS"],
      "valoresPadrao": {
        "Ativo": "Sim"
      }
    },
    "Lançamentos": {
      "colunasNovas": ["ID_Protocolo", "Criado_Por", "Criado_Em", "Editado_Por", "Editado_Em", "Dias_Pecunia"],
      "valoresPadrao": {
        "ID_Protocolo": "",
        "Criado_Por": "Sistema (Migração)",
        "Criado_Em": new Date(),
        "Editado_Por": "Sistema (Migração)",
        "Editado_Em": new Date(),
        "Dias_Pecunia": ""
      }
    },
    "Protocolos": {
      "colunasNovas": ["Criado_Por"],
      "valoresPadrao": {
        "Criado_Por": "Sistema (Migração)"
      }
    }
  }
};

/**
 * Função principal de Setup. Deve ser executada manualmente
 * uma única vez após fazer a cópia da planilha.
 */
function executarConfiguracaoInicial() {
  const ss = obterPlanilha_();
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    Logger.log("UI do Spreadsheet não disponível neste contexto (executando via editor/web).");
  }
  
  try {
    // 1. Criar abas novas se não existirem
    let relatorioAbasNovas = [];
    for (let nomeAba in CONFIG_SETUP.abasNovas) {
      let aba = ss.getSheetByName(nomeAba);
      if (!aba) {
        aba = ss.insertSheet(nomeAba);
        const colunas = CONFIG_SETUP.abasNovas[nomeAba];
        aba.appendRow(colunas);
        // Formatar o cabeçalho em negrito e fundo cinza escuro
        aba.getRange(1, 1, 1, colunas.length)
           .setFontWeight("bold")
           .setBackground("#434343")
           .setFontColor("#ffffff")
           .setHorizontalAlignment("center");
        aba.setFrozenRows(1);
        relatorioAbasNovas.push(`SUCESSO: Aba '${nomeAba}' criada.`);
      } else {
        relatorioAbasNovas.push(`MANTIDA: Aba '${nomeAba}' ja existe.`);
      }
    }
    
    // 2. Modificar abas existentes (adicionar novas colunas de controle/auditoria)
    let relatorioAbasModificadas = [];
    for (let nomeAba in CONFIG_SETUP.abasExistentesModificadas) {
      let aba = ss.getSheetByName(nomeAba);
      if (!aba) {
        relatorioAbasModificadas.push(`ERRO: Aba obrigatoria '${nomeAba}' nao encontrada na planilha!`);
        continue;
      }
      
      const configAba = CONFIG_SETUP.abasExistentesModificadas[nomeAba];
      const colunasExistentes = aba.getDataRange().getValues()[0];
      const numLinhas = aba.getLastRow();
      
      configAba.colunasNovas.forEach(novaCol => {
        // Verifica se a coluna já existe no cabeçalho
        let indiceCol = colunasExistentes.indexOf(novaCol);
        if (indiceCol === -1) {
          // Adiciona no final dos cabeçalhos
          const novaPosicao = colunasExistentes.length + 1;
          aba.getRange(1, novaPosicao).setValue(novaCol);
          
          // Formata o novo cabeçalho para seguir o padrão do cabeçalho da planilha
          aba.getRange(1, novaPosicao)
             .setFontWeight("bold")
             .setBackground("#434343")
             .setFontColor("#ffffff")
             .setHorizontalAlignment("center");
          
          // Preenche os dados históricos existentes se houver linhas
          if (numLinhas > 1) {
            const valorPadrao = configAba.valoresPadrao[novaCol];
            const rangePreenchimento = aba.getRange(2, novaPosicao, numLinhas - 1, 1);
            rangePreenchimento.setValue(valorPadrao);
          }
          
          colunasExistentes.push(novaCol); // atualiza lista local
          relatorioAbasModificadas.push(`SUCESSO: Coluna '${novaCol}' adicionada à aba '${nomeAba}'.`);
        } else {
          relatorioAbasModificadas.push(`MANTIDA: Coluna '${novaCol}' já existe na aba '${nomeAba}'.`);
        }
      });
    }

    // 3. Alimentar os dados padrão nas tabelas novas se estiverem vazias
    popularDadosPadrao(ss);
    
    // 4. Criar gatilhos de tempo automáticos (idempotente)
    let totalGatilhosCriados = criarGatilhosDiarios_();
    
    // 5. Mostrar relatório final para o usuário
    let mensagemCompleta = "Resultado da Inicializacao do Sistema v2.0:\n\n" + 
                           "--- NOVAS ABAS DE INFRAESTRUTURA ---\n" + relatorioAbasNovas.join("\n") + "\n\n" +
                           "--- MUDANCAS DE AUDITORIA/CONTROLE ---\n" + relatorioAbasModificadas.join("\n") + "\n\n" +
                           `--- GATILHOS DIARIOS AUTOMATICOS ---\n${totalGatilhosCriados} gatilhos diarios verificados/criados.\n\n` +
                           "Sistema configurado com sucesso e pronto para uso!";
    
    Logger.log(mensagemCompleta);
    if (ui) {
      ui.alert("Sucesso no Setup", mensagemCompleta, ui.ButtonSet.OK);
    }
    
  } catch (erro) {
    Logger.log("Erro na execucao do Setup: " + erro.toString());
    if (ui) {
      ui.alert("Erro no Setup", "Ocorreu um erro ao configurar a planilha:\n\n" + erro.toString(), ui.ButtonSet.OK);
    }
  }
}

/**
 * Cria os gatilhos de tempo diários de forma idempotente.
 * Esta função termina com "_" para ser privada e não ser exposta a chamadas Web.
 */
function criarGatilhosDiarios_() {
  const gatilhos = ScriptApp.getProjectTriggers();
  let funcoesExistentes = new Set(gatilhos.map(g => g.getHandlerFunction()));
  let count = 0;
  
  // 1. Gatilho de créditos automáticos (diário entre 00:00 e 01:00)
  if (!funcoesExistentes.has("gerarCreditosAutomaticos")) {
    ScriptApp.newTrigger("gerarCreditosAutomaticos")
      .timeBased()
      .everyDays(1)
      .atHour(0)
      .create();
    count++;
  }
  
  // 2. Gatilho de e-mails diários (diário entre 07:00 e 08:00)
  if (!funcoesExistentes.has("verificarEEnviarEmailsDiarios")) {
    ScriptApp.newTrigger("verificarEEnviarEmailsDiarios")
      .timeBased()
      .everyDays(1)
      .atHour(7)
      .create();
    count++;
  }

  // 3. Vigia da Entidade (a cada hora; a IA só é chamada quando há mudança relevante)
  if (!funcoesExistentes.has("executarVigiaEntidadeAgendado")) {
    ScriptApp.newTrigger("executarVigiaEntidadeAgendado")
      .timeBased()
      .everyHours(1)
      .create();
    count++;
  }

  // 4. Manutenção das tabelas auxiliares (diário entre 02:00 e 03:00)
  if (!funcoesExistentes.has("executarManutencaoAutomaticaSistema")) {
    ScriptApp.newTrigger("executarManutencaoAutomaticaSistema")
      .timeBased()
      .everyDays(1)
      .atHour(2)
      .create();
    count++;
  }
  
  return count;
}

/**
 * Popular dados padrão necessários para o sistema iniciar
 */
function popularDadosPadrao(ss) {
  // Configurações Gerais iniciais
  const abaConfig = ss.getSheetByName("Configuracoes");
  if (abaConfig && abaConfig.getLastRow() === 1) {
    const dadosConfig = [
      ["EMAIL_DESTINO", "turismo.setur@saosebastiao.sp.gov.br, turismo.eventos@saosebastiao.sp.gov.br", "E-mail(s) para onde serão enviados os alertas diários (separados por vírgula)"],
      ["DIAS_INTERVALO_FERIAS", "15", "Antecedência em dias para avisar sobre início de Férias"],
      ["DIAS_INTERVALO_ABONO", "5", "Antecedência em dias para avisar sobre início de Abono/Abonada Natalícia"],
      ["LIMITE_ABONADAS_ANO", "5", "Quantidade máxima permitida de faltas abonadas no ano corrente por servidor"],
      ["LIMITE_ABONADAS_MES", "1", "Quantidade máxima de faltas abonadas permitida em um único mês por servidor"]
    ];
    dadosConfig.forEach(linha => abaConfig.appendRow(linha));
    Logger.log("Configurações padrão inicializadas.");
  }
  
  // Tipos de Documento iniciais
  const abaTipos = ss.getSheetByName("Tipos_Documento");
  if (abaTipos && abaTipos.getLastRow() === 1) {
    const dadosTipos = [
      ["abonada", "Abonada", "Não", "Sim", "[\"data_falta\", \"anexo1\", \"anexo2\", \"anexo3\", \"despacho_individual\", \"observacao_individual\"]", "Sim"],
      ["abonada_natalicia", "Abonada Natalícia", "Não", "Não", "[\"data_falta\", \"anexo1\", \"anexo2\", \"anexo3\", \"despacho_individual\", \"observacao_individual\"]", "Sim"],
      ["abonada_eleitoral", "Abonada Eleitoral", "Não", "Não", "[\"data_falta\", \"anexo1\", \"anexo2\", \"anexo3\", \"despacho_individual\", \"observacao_individual\"]", "Sim"],
      ["ferias", "Férias", "Sim", "Não", "[\"data_inicio\", \"dias_ferias\", \"anexo1\", \"anexo2\", \"anexo3\", \"despacho_individual\", \"observacao_individual\"]", "Sim"],
      ["ferias_pecunia", "Férias (1/3 Pecúnia)", "Sim", "Não", "[\"data_inicio\", \"dias_ferias\", \"dias_pecunia\", \"anexo1\", \"anexo2\", \"anexo3\", \"despacho_individual\", \"observacao_individual\"]", "Sim"],
      ["licenca_premio", "Licença Prêmio", "Não", "Não", "[\"data_inicio\", \"dias_ferias\", \"anexo1\", \"anexo2\", \"anexo3\", \"despacho_individual\", \"observacao_individual\"]", "Sim"],
      ["hora_extra", "Hora Extra", "Não", "Não", "[\"data_falta\", \"quant_horas\", \"anexo1\", \"anexo2\", \"anexo3\", \"despacho_individual\", \"observacao_individual\"]", "Sim"],
      ["estagio_probatorio", "Avaliação do Estágio Probatório", "Não", "Não", "[\"data_falta\", \"anexo1\", \"anexo2\", \"anexo3\", \"despacho_individual\", \"observacao_individual\"]", "Sim"],
      ["não_efetivado", "Não Efetivado (Anulado)", "Não", "Não", "[\"data_falta\", \"anexo1\", \"anexo2\", \"anexo3\", \"despacho_individual\", \"observacao_individual\"]", "Sim"]
    ];
    dadosTipos.forEach(linha => abaTipos.appendRow(linha));
    Logger.log("Tipos de documento iniciais inicializados.");
  }
}
