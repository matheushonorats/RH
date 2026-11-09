'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.join(__dirname,'..');
const ler = p => fs.readFileSync(path.join(raiz,p),'utf8');
const fontes = {
  web: ler('output/RH-Modo-Seguro-Beta/Scripts.html') + ler('output/RH-Modo-Seguro-Beta/RepEnhancements.html'),
  portatil: ler('portable-entidade/app/renderer/index.html')
};
function trecho(s,a,b) { const inicio=s.indexOf(a),fim=s.indexOf(b,inicio+a.length);assert.ok(inicio>=0&&fim>inicio,a);return s.slice(inicio,fim); }
for (const [edicao, fonte] of Object.entries(fontes)) {
  function preparar(dia = {saldoCompensacaoExatoDia:-2,extraDia:-1.5,compensacao:{minutosAplicados:30}}) {
    const botao={}, texto={};
    const campos = {
      'form-lancamento':{dataset:{origemRep:'sim'}},'lanc-tipo':{value:'Declaração de Horas'},
      'lanc-linha':{value:''},'lanc-data-falta':{value:'2026-10-05'},'lanc-matricula':{value:'123'},
      'lanc-qtd-horas':{value:'',dataset:{},dispatchEvent(){this.eventos=(this.eventos||0)+1;},focus(){}},
      'lanc-debito-dia-rep':{style:{},querySelector:sel=>sel==='button'?botao:texto}
    };
    const ctx={document:{getElementById:id=>campos[id]},repOnlineCarregando:false,
      ehDeclaracaoHoras_:t=>t==='Declaração de Horas',normalizarMatriculaRep_:v=>String(v||'').replace(/^0+/,''),
      configuracaoCalculoRepAtual:{compensacaoMinutosExatos:true},obterJornadaReferenciaRep_:()=>8,
      obterServidorCadastroRep_:e=>({matricula:e.matricula}),
      minutosParaHoraRep_:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),
      Event:class{constructor(tipo){this.type=tipo;}},
      dadosRepProcessados:[{pis:'PIS-A',matricula:'123',dias:[{dataOriginal:'2026-10-05',...dia}]},
        {pis:'PIS-B',matricula:'456',dias:[{dataOriginal:'2026-10-05',saldoCompensacaoExatoDia:-7}]}]
    };
    vm.createContext(ctx);
    vm.runInContext(trecho(fonte,'function obterDeficitDiaRep_(', 'function atualizarHorasDevidasRep_('),ctx);
    vm.runInContext(trecho(fonte,'function obterDebitoDiaDeclaracaoRep_(', 'function garantirModalLancamentosLoteRep_('),ctx);
    return {ctx,campos,botao,texto};
  }
  test(edicao+': consulta somente a pessoa e o dia escolhidos e usa o débito restante',()=>{
    const {ctx,campos}=preparar();
    assert.equal(ctx.obterDebitoDiaDeclaracaoRep_().minutos,90);
    assert.match(ctx.obterDebitoDiaDeclaracaoRep_().mensagem,/05\/10\/2026: 01:30h/);
    campos['lanc-matricula'].value='456';
    assert.equal(ctx.obterDebitoDiaDeclaracaoRep_().minutos,420);
    campos['lanc-data-falta'].value='2026-10-06';
    assert.equal(ctx.obterDebitoDiaDeclaracaoRep_().minutos,null);
  });
  test(edicao+': mostra o valor sem sobrescrever a digitação e botão reconsulta antes de preencher',()=>{
    const {ctx,campos,botao,texto}=preparar();
    campos['lanc-qtd-horas'].value='00:25';
    ctx.atualizarDebitoDiaDeclaracaoRep_();
    assert.equal(campos['lanc-qtd-horas'].value,'00:25');
    assert.equal(botao.textContent,'Usar 01:30h');assert.equal(botao.disabled,false);
    assert.match(texto.textContent,/01:30h/);
    ctx.dadosRepProcessados[0].dias[0].compensacao.minutosAplicados=60;
    ctx.usarDebitoDiaDeclaracaoRep_();
    assert.equal(campos['lanc-qtd-horas'].value,'01:00');
    assert.equal(campos['lanc-qtd-horas'].eventos,1);
    campos['lanc-data-falta'].value='2026-10-06';
    ctx.atualizarDebitoDiaDeclaracaoRep_();
    assert.equal(campos['lanc-qtd-horas'].value,'');
  });
  test(edicao+': batidas inconsistentes, carga pendente, edição e outros tipos não recebem sugestão',()=>{
    const {ctx,campos,botao}=preparar({pendencia:true,extraDia:-3});
    assert.equal(ctx.obterDebitoDiaDeclaracaoRep_().minutos,null);
    ctx.atualizarDebitoDiaDeclaracaoRep_();assert.equal(botao.disabled,true);
    ctx.repOnlineCarregando=true;assert.match(ctx.obterDebitoDiaDeclaracaoRep_().mensagem,/Aguarde/);
    ctx.repOnlineCarregando=false;campos['lanc-linha'].value='10';assert.equal(ctx.obterDebitoDiaDeclaracaoRep_(),null);
    campos['lanc-linha'].value='';campos['lanc-tipo'].value='Autorização de Horas Extras';assert.equal(ctx.obterDebitoDiaDeclaracaoRep_(),null);
    campos['lanc-tipo'].value='Declaração de Horas';delete campos['form-lancamento'].dataset.origemRep;assert.equal(ctx.obterDebitoDiaDeclaracaoRep_(),null);
  });
  test(edicao+': falta inteira desconta declaração e compensação; dia resolvido não sugere horas',()=>{
    const {ctx,botao}=preparar({semRegistro:true,declaracaoHoras:{minutosAplicados:120},compensacao:{minutosAplicados:60}});
    assert.equal(ctx.obterDebitoDiaDeclaracaoRep_().minutos,300);
    ctx.dadosRepProcessados[0].dias[0]={dataOriginal:'2026-10-05',extraDia:0,saldoCompensacaoExatoDia:0};
    ctx.atualizarDebitoDiaDeclaracaoRep_();assert.equal(botao.disabled,true);
    assert.equal(ctx.obterDebitoDiaDeclaracaoRep_().minutos,0);
  });
}
