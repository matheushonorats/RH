const fs = require('fs');
const path = require('path');

const srcDir = 'src';

fs.readdirSync(srcDir).forEach(file => {
  const filepath = path.join(srcDir, file);
  if (file.endsWith('.html')) {
    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.endsWith('\\')) {
        console.log(`[LINE ENDING BACKSLASH] in ${filepath} Line ${idx + 1}:`);
        console.log(`  ${idx + 1}: ${line}`);
      }
    });
  }
});
