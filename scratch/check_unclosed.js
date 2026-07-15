const fs = require('fs');
const path = require('path');

const srcDir = 'src';

fs.readdirSync(srcDir).forEach(file => {
  const filepath = path.join(srcDir, file);
  if (fs.statSync(filepath).isFile()) {
    const content = fs.readFileSync(filepath, 'utf8');
    
    // Count quotes and brackets
    const counts = {
      doubleQuotes: (content.match(/"/g) || []).length,
      singleQuotes: (content.match(/'/g) || []).length,
      backticks: (content.match(/`/g) || []).length,
      openBraces: (content.match(/\{/g) || []).length,
      closeBraces: (content.match(/\}/g) || []).length,
      openParens: (content.match(/\(/g) || []).length,
      closeParens: (content.match(/\)/g) || []).length,
      openScript: (content.match(/<script>/gi) || []).length,
      closeScript: (content.match(/\/script>/gi) || []).length,
    };
    
    console.log(`--- ${file} ---`);
    console.log(`Double quotes: ${counts.doubleQuotes} (${counts.doubleQuotes % 2 === 0 ? 'EVEN' : 'ODD!'})`);
    console.log(`Single quotes: ${counts.singleQuotes} (${counts.singleQuotes % 2 === 0 ? 'EVEN' : 'ODD!'})`);
    console.log(`Backticks: ${counts.backticks} (${counts.backticks % 2 === 0 ? 'EVEN' : 'ODD!'})`);
    console.log(`Braces: { = ${counts.openBraces}, } = ${counts.closeBraces} (${counts.openBraces === counts.closeBraces ? 'MATCH' : 'MISMATCH!'})`);
    console.log(`Parens: ( = ${counts.openParens}, ) = ${counts.closeParens} (${counts.openParens === counts.closeParens ? 'MATCH' : 'MISMATCH!'})`);
    if (file.endsWith('.html')) {
      console.log(`Script tags: <script> = ${counts.openScript}, </script> = ${counts.closeScript} (${counts.openScript === counts.closeScript ? 'MATCH' : 'MISMATCH!'})`);
    }
  }
});
