const https = require('https');
const id = '1c-zisPErpWoXRlMFZkL0ZF7OI0W4X90hk3yr4o2-i3E';
const sheets = ['Servidores', 'Lançamentos', 'Lancamentos', 'Protocolos', 'Creditos_Ferias', 'Creditos de Ferias'];

async function fetchCSV(sheetName) {
  return new Promise((resolve) => {
    https.get(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const firstLine = data.split('\n')[0];
        console.log(`=== ${sheetName} ===`);
        console.log(firstLine);
        resolve();
      });
    });
  });
}

(async () => {
  for (let s of sheets) await fetchCSV(s);
})();
