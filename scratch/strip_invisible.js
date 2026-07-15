const fs = require('fs');
const path = require('path');

const srcDir = 'src';

fs.readdirSync(srcDir).forEach(file => {
  const filepath = path.join(srcDir, file);
  if (fs.statSync(filepath).isFile()) {
    let content = fs.readFileSync(filepath, 'utf8');
    
    // Check for variation selector \uFE0F (65039)
    if (content.includes('\uFE0F')) {
      console.log(`[INFE0F FOUND] in ${filepath}. Stripping it...`);
      content = content.replace(/\uFE0F/g, '');
      fs.writeFileSync(filepath, content, 'utf8');
      console.log(`[STRIPPED] ${filepath}`);
    }
  }
});
