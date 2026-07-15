const fs = require('fs');
const path = require('path');

const srcDir = 'src';

fs.readdirSync(srcDir).forEach(file => {
  const filepath = path.join(srcDir, file);
  if (fs.statSync(filepath).isFile()) {
    console.log(`Normalizing line endings in ${filepath}...`);
    let content = fs.readFileSync(filepath, 'utf8');
    // Replace all CRLF with LF first, then make sure all newlines are standard LF
    content = content.replace(/\r\n/g, '\n');
    
    // Write it back as strictly LF
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`[DONE] ${filepath} normalized to LF.`);
  }
});
