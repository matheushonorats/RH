// Feriados recorrentes; referência municipal: Decreto São Sebastião 9964/2026.
// Pontos facultativos e escalas especiais são configurados pela equipe.
function calendarioFeriadosEntidade_(ano) {
  ano=Number(ano);if(!Number.isInteger(ano)||ano<2000||ano>2100)return [];
  const a=ano%19,b=Math.floor(ano/100),c=ano%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mes=Math.floor((h+l-7*m+114)/31),dia=(h+l-7*m+114)%31+1;
  const fixos=[['01-01','Confraternização Universal'],['01-20','Padroeiro de São Sebastião'],['03-16','Aniversário de São Sebastião'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],['07-09','Revolução Constitucionalista (SP)'],['09-07','Independência do Brasil'],['10-12','Nossa Senhora Aparecida'],['11-02','Finados'],['11-15','Proclamação da República'],['12-25','Natal']];
  if(ano>=2024)fixos.push(['11-20','Consciência Negra']);
  const lista=fixos.map(([data,nome])=>({data:ano+'-'+data,nome}));
  [[-2,'Paixão de Cristo'],[60,'Corpus Christi (São Sebastião)']].forEach(([offset,nome])=>{const dt=new Date(Date.UTC(ano,mes-1,dia+offset));lista.push({data:dt.toISOString().slice(0,10),nome});});
  return lista.sort((a,b)=>a.data.localeCompare(b.data));
}
