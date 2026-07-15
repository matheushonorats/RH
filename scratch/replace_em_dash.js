const fs = require('fs');
const path = require('path');

const srcDir = 'src';

fs.readdirSync(srcDir).forEach(file => {
  const filepath = path.join(srcDir, file);
  if (fs.statSync(filepath).isFile()) {
    let content = fs.readFileSync(filepath, 'utf8');
    if (content.includes('—')) {
      console.log(`[EM DASH FOUND] in ${filepath}. Replacing with hyphen...`);
      content = content.replace(/—/g, '-');
      fs.writeFileSync(filepath, content, 'utf8');
      console.log(`[REPLACED] ${filepath}`);
    }
  }
});
