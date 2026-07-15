const fs = require('fs');
const path = require('path');

const srcDir = 'src';

fs.readdirSync(srcDir).forEach(file => {
  const filepath = path.join(srcDir, file);
  if (fs.statSync(filepath).isFile()) {
    const content = fs.readFileSync(filepath, 'utf8');
    
    // Check for single \r (not followed by \n)
    let loneCarriageReturns = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\r' && (i === content.length - 1 || content[i + 1] !== '\n')) {
        loneCarriageReturns++;
      }
    }
    
    if (loneCarriageReturns > 0) {
      console.log(`[LONE CARRIAGE RETURN] in ${filepath}: found ${loneCarriageReturns} occurrences.`);
    } else {
      console.log(`[OK] ${file} has no lone carriage returns.`);
    }
  }
});
