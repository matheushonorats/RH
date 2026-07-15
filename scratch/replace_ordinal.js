const fs = require('fs');
const path = require('path');

const srcDir = 'src';

fs.readdirSync(srcDir).forEach(file => {
  const filepath = path.join(srcDir, file);
  if (fs.statSync(filepath).isFile()) {
    let content = fs.readFileSync(filepath, 'utf8');
    let modified = false;
    
    // Replace º with o
    if (content.includes('º')) {
      console.log(`Replacing º in ${filepath}`);
      content = content.replace(/º/g, 'o');
      modified = true;
    }
    
    // Replace ª with a
    if (content.includes('ª')) {
      console.log(`Replacing ª in ${filepath}`);
      content = content.replace(/ª/g, 'a');
      modified = true;
    }
    
    if (modified) {
      fs.writeFileSync(filepath, content, 'utf8');
      console.log(`[SAVED] ${filepath}`);
    }
  }
});
