/**
 * Gera uma comunicação preventiva individual para programação de férias.
 * A folha é destinada à impressão e coleta de ciência do servidor.
 */
function obterHtmlNotificacaoFeriasCompulsorias(matricula) {
  obterDadosUsuarioLogado();

  const chave = normalizarChaveMatricula_(matricula);
  const servidor = obterListaServidoresInterno_().find(function(item) {
    return normalizarChaveMatricula_(item.matricula) === chave;
  });

  if (!servidor) throw new Error("Servidor não encontrado.");
  if (servidor.status === "Inativo") throw new Error("Não é possível emitir notificação para servidor inativo.");
  if (servidor.feriasCompulsorias !== true) {
    throw new Error("O servidor não consta atualmente no alerta preventivo de férias compulsórias.");
  }

  const esc = escaparHtmlNotificacaoFerias_;
  const saldo = Number(servidor.saldoHoje || 0);
  const vencimento = servidor.dataTerceiroPeriodo || "Não calculado";
  const periodosComSaldo = (servidor.periodosFerias || []).filter(function(periodo) {
    return periodo.status === "Disponível" && Number(periodo.saldo || 0) > 0;
  });
  const quantidadePeriodos = periodosComSaldo.length || Math.max(1, Math.ceil(saldo / 30));
  const descricaoPeriodos = quantidadePeriodos + " " + (quantidadePeriodos === 1 ? "período aquisitivo" : "períodos aquisitivos");
  const diasMinimosGozo = Math.max(0, saldo - 30);
  const periodoJaFracionado = periodosComSaldo.find(function(periodo) {
    return Number(periodo.diasUsados || 0) > 0 && Number(periodo.saldo || 0) > 0;
  });
  const saldoSegundaEtapa = periodoJaFracionado ? Number(periodoJaFracionado.saldo || 0) : 0;
  const diasAteTerceiroPeriodo = Number(servidor.diasParaTerceiroPeriodo);
  const haTempoParaDuasEtapas = !isFinite(diasAteTerceiroPeriodo) || diasAteTerceiroPeriodo > 30;
  const prazoPedido = calcularPrazoPedidoNotificacaoFerias_(vencimento);
  const emitidaEm = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  const situacaoVencimento = vencimento === "Já vencido"
    ? "A data-limite para formação do terceiro período já foi atingida."
    : "A data-limite para formação do terceiro período é <strong>" + esc(vencimento) + "</strong>.";
  let orientacaoSaldo = "O saldo atual já está dentro do limite de 30 dias para programação preventiva.";
  let orientacaoProtocolo = "sobre a necessidade de manter a programação regular das férias";
  if (saldoSegundaEtapa > 0) {
    orientacaoSaldo = "Como o período <strong>" + esc(periodoJaFracionado.referencia || "aquisitivo mais antigo") + "</strong> já foi usufruído parcialmente, deverá programar integralmente os <strong>" + esc(saldoSegundaEtapa) + " dias remanescentes</strong>, correspondentes à segunda e última etapa desse período.";
    orientacaoProtocolo = "da necessidade de programar integralmente os <strong>" + esc(saldoSegundaEtapa) + " dias remanescentes</strong> da segunda e última etapa do período já fracionado";
  } else if (diasMinimosGozo > 0 && haTempoParaDuasEtapas) {
    orientacaoSaldo = "Devendo, desta forma, programar o gozo correspondente a um período aquisitivo, totalizando <strong>30 dias</strong>, que deverá iniciar antes da formação do terceiro período.";
    orientacaoProtocolo = "da necessidade de programar o gozo correspondente a um período aquisitivo, totalizando <strong>30 dias</strong>";
  } else if (diasMinimosGozo > 0) {
    orientacaoSaldo = "Considerando a proximidade da formação do terceiro período e a inexistência de tempo hábil para duas etapas distintas, deverá programar o gozo integral de <strong>30 dias de férias</strong>.";
    orientacaoProtocolo = "da necessidade de programar o gozo integral de <strong>30 dias de férias</strong>, diante da proximidade da formação do terceiro período";
  }

  const html = `
    <div class="notificacao-ferias-documento" style="font-family:Arial,sans-serif;color:#111;background:#fff;width:100%;box-sizing:border-box;padding:26px 42px;line-height:1.45;">
      <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:18px;">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Prefeitura Municipal de São Sebastião</div>
        <div style="font-size:15px;font-weight:700;text-transform:uppercase;margin-top:3px;">Secretaria Municipal de Turismo</div>
        <div style="font-size:18px;font-weight:800;text-transform:uppercase;margin-top:13px;">Comunicado para Programação de Férias</div>
      </div>

      <div style="display:flex;justify-content:space-between;gap:18px;font-size:11px;margin-bottom:15px;">
        <span><strong>Emissão:</strong> ${esc(emitidaEm)}</span>
        <span><strong>Matrícula:</strong> ${esc(servidor.matricula)}</span>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;">
        <tr>
          <td style="border:1px solid #333;padding:7px;width:21%;font-weight:700;background:#f5f5f5;">Servidor</td>
          <td style="border:1px solid #333;padding:7px;">${esc(servidor.nome)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #333;padding:7px;font-weight:700;background:#f5f5f5;">Cargo</td>
          <td style="border:1px solid #333;padding:7px;">${esc(servidor.cargo || "-")}</td>
        </tr>
        <tr>
          <td style="border:1px solid #333;padding:7px;font-weight:700;background:#f5f5f5;">Lotação</td>
          <td style="border:1px solid #333;padding:7px;">${esc(servidor.lotacao || "-")}</td>
        </tr>
      </table>

      <p style="font-size:12.5px;text-align:justify;margin:0 0 13px;">
        Para sua ciência, informamos que o servidor possui <strong>${esc(saldo)} dias de férias disponíveis</strong>, referentes a
        <strong>${esc(descricaoPeriodos)}</strong>. ${situacaoVencimento} ${orientacaoSaldo} Assim, solicita-se que compareça ao setor de Recursos
        Humanos para programar o gozo dessas férias, sob pena de concessão compulsória.
      </p>

      <p style="font-size:12.5px;text-align:justify;margin:0 0 13px;">
        Preencha a folha de solicitação de férias e entregue-a à SETUR até <strong>${esc(prazoPedido)}</strong>, para que a data
        pretendida possa ser analisada e organizada com a chefia. Esse é o prazo preventivo adotado para o planejamento do
        setor; a solicitação somente estará confirmada após a aprovação formal.
      </p>

      <p style="font-size:12.5px;text-align:justify;margin:0 0 15px;">
        A Lei Complementar Municipal nº 146/2011, art. 154, caput, não permite o acúmulo de mais de dois períodos de férias.
        O § 3º permite o parcelamento em até duas etapas, quando requerido pelo servidor e no interesse da Administração.
        Conforme o § 6º do mesmo artigo, caso você não saia de férias até a data-limite indicada, entrará em férias
        compulsoriamente a partir do primeiro dia seguinte ao término do segundo período concessivo, mediante notificação do DGP.
      </p>

      <div style="margin-top:21px;padding-top:8px;border-top:1px solid #bbb;text-align:center;color:#555;font-size:9px;">
        <strong>VIA DO SERVIDOR:</strong> guarde este comunicado para acompanhamento da programação de suas férias.
      </div>

      <div style="margin:21px -42px 0;border-top:2px dashed #555;"></div>

      <div style="padding:17px 42px 0;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;padding-bottom:6px;margin-bottom:10px;">
          <strong style="font-size:12px;letter-spacing:.04em;">PROTOCOLO DE CIÊNCIA — VIA RH</strong>
          <span style="font-size:9.5px;color:#555;">Comunicado emitido em ${esc(emitidaEm)}</span>
        </div>
        <div style="font-size:10.6px;line-height:1.4;text-align:justify;">
          Eu, <strong>${esc(servidor.nome)}</strong>, matrícula <strong>${esc(servidor.matricula)}</strong>, declaro que recebi o
          Comunicado para Programação de Férias e que fui informado(a) sobre o saldo de <strong>${esc(saldo)} dias</strong>,
          bem como ${orientacaoProtocolo}
          ${vencimento && vencimento !== "Já vencido" ? "antes da formação do terceiro período, prevista para <strong>" + esc(vencimento) + "</strong>" : ""}.
        </div>
        <div style="display:grid;grid-template-columns:1fr 145px;gap:28px;margin-top:25px;font-size:10.5px;text-align:center;">
          <div style="border-top:1px solid #111;padding-top:5px;">Assinatura do(a) servidor(a)</div>
          <div style="border-top:1px solid #111;padding-top:5px;">Data: ____/____/________</div>
        </div>
        <div style="margin-top:17px;font-size:9.5px;color:#444;">Recebido pelo RH: ________________________________________________ &nbsp;&nbsp; Data: ____/____/________</div>
      </div>
    </div>`;

  lancarLog(
    "EMITIR_NOTIFICACAO_FERIAS",
    "Férias Compulsórias",
    "Notificação preventiva gerada para " + servidor.nome,
    "",
    "",
    "",
    servidor.matricula
  );

  return html;
}

function calcularPrazoPedidoNotificacaoFerias_(dataTerceiroPeriodo) {
  if (!dataTerceiroPeriodo || dataTerceiroPeriodo === "Já vencido") return "Imediatamente";
  const partes = String(dataTerceiroPeriodo).split("/");
  if (partes.length !== 3) return "Conforme orientação da chefia/RH";
  const data = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
  if (isNaN(data.getTime())) return "Conforme orientação da chefia/RH";
  data.setDate(data.getDate() - 30);
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
}

function escaparHtmlNotificacaoFerias_(valor) {
  return String(valor == null ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
