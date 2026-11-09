(function () {
  'use strict';
  let estado = { estado: 'ocioso' }; let ocupado = false; let ultimaConsulta = 0;
  const ponte = window.entidadeDesktop;
  function renderizar() {
    const botao = document.getElementById('botao-versao-app'); if (!botao) return;
    const disponivel = ['disponivel', 'baixando', 'conferindo', 'pronta'].includes(estado.estado);
    botao.classList.toggle('versao-atualizacao-disponivel', disponivel);
    botao.setAttribute('aria-disabled', ocupado ? 'true' : 'false');
    botao.href = '#'; botao.target = '_self';
    botao.title = disponivel ? 'Atualização do portátil. Seus dados serão preservados; o reinício depende da sua confirmação.' : 'Consultar atualização do programa portátil';
    botao.textContent = estado.estado === 'baixando' ? 'Baixando · ' + Math.min(100, Math.max(0, Number(estado.percentual) || 0)) + '%'
      : estado.estado === 'conferindo' ? 'Conferindo atualização…'
        : estado.estado === 'pronta' ? 'Reiniciar e atualizar · ' + estado.versao
          : estado.estado === 'disponivel' ? 'Atualizar · ' + estado.versao
            : 'Versão ' + document.body.dataset.appVersion;
  }
  async function consultar(manual = false) {
    if (ocupado || (!manual && Date.now() - ultimaConsulta < 60000) || ['baixando', 'conferindo', 'pronta'].includes(estado.estado)) return;
    ultimaConsulta = Date.now();
    try {
      estado = await ponte.atualizacao('verificar'); renderizar();
      if (manual && !['disponivel', 'pronta'].includes(estado.estado)) mostrarToast(estado.estado === 'atualizado' ? 'Você está usando o pacote mais recente do portátil.' : 'Ainda não há um novo pacote do portátil publicado. Nenhuma alteração foi feita.', 'info');
    } catch (erro) { if (manual) mostrarToast(erro.message, 'warning'); }
  }
  window.atualizarAvisoVersaoPendente_ = renderizar;
  window.solicitarAtualizacaoSegura_ = async function (evento) {
    evento.preventDefault(); if (ocupado) return;
    if (typeof existemGravacoesPendentes_ === 'function' && existemGravacoesPendentes_()) return mostrarToast('Aguarde as gravações serem confirmadas antes de atualizar. Nada foi descartado.', 'warning');
    if (document.querySelector('.modal-overlay.active, dialog[open], [data-inline="sim"][data-dirty="sim"], [data-leitura-ia-em-andamento="sim"]')) return mostrarToast('Termine ou cancele o formulário ou a leitura em andamento antes de atualizar.', 'warning');
    if (!['disponivel', 'pronta'].includes(estado.estado)) return consultar(true);
    ocupado = true; renderizar();
    try {
      if (estado.estado === 'pronta') {
        const resultado = await ponte.atualizacao('aplicar');
        if (resultado?.cancelado) mostrarToast('Atualização pronta. Você pode reiniciar depois.', 'info');
      } else {
        estado = { ...estado, estado: 'baixando', percentual: 0 }; renderizar();
        estado = await ponte.atualizacao('baixar');
        mostrarToast('Pacote conferido. Quando terminar seu trabalho, clique no botão da versão para reiniciar e atualizar.', 'success');
      }
    } catch (erro) { estado = { estado: 'ocioso' }; mostrarToast(erro.message, 'warning'); }
    finally { ocupado = false; renderizar(); }
  };
  ponte.aoProgressoAtualizacao(dados => { estado = dados; renderizar(); });
  function iniciar() { renderizar(); consultar(); setInterval(consultar, 15 * 60 * 1000); window.addEventListener('focus', () => consultar()); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
