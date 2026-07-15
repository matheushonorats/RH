const fs = require('fs');
const path = require('path');

const srcDir = 'src';

fs.readdirSync(srcDir).forEach(file => {
  const filepath = path.join(srcDir, file);
  const buffer = fs.readFileSync(filepath);
  // Check for BOM (EF BB BF)
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    console.log(`[BOM DETECTED] in ${filepath}. Stripping it...`);
    const stripped = buffer.slice(3);
    fs.writeFileSync(filepath, stripped);
    console.log(`[STRIPPED] ${filepath}`);
  } else {
    console.log(`[OK] ${filepath} has no BOM.`);
  }
});
