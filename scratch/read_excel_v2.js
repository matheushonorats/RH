const ExcelJS = require('exceljs');

async function readExcel() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('referencias-sistema/Gestão de Pessoas v2.xlsx');
  
  workbook.worksheets.forEach(sheet => {
    console.log(`\n=== ABA: ${sheet.name} (${sheet.rowCount} linhas) ===`);
    // Print header row (row 1)
    const headerRow = sheet.getRow(1);
    const headers = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      headers.push(`Col${colNum}: ${cell.value}`);
    });
    console.log('Colunas: ' + headers.join(' | '));
    
    // Print first 3 data rows
    for (let r = 2; r <= Math.min(4, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        let v = cell.value;
        if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
        if (v instanceof Date) v = v.toLocaleDateString('pt-BR');
        vals.push(`C${colNum}:${String(v).substring(0,30)}`);
      });
      console.log(`  Row${r}: ${vals.join(' | ')}`);
    }
  });
}

readExcel().catch(console.error);
