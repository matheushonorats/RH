const fs = require('fs');
const path = require('path');

const srcDir = 'src';

fs.readdirSync(srcDir).forEach(file => {
  const filepath = path.join(srcDir, file);
  if (fs.statSync(filepath).isFile()) {
    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Find non-ASCII characters
      for (let i = 0; i < line.length; i++) {
        const charCode = line.charCodeAt(i);
        if (charCode > 127) {
          // Allow Portuguese characters like á, é, í, ó, ú, ç, ã, õ, etc.
          // Character codes for standard Portuguese vowels and ç are between 192 and 255.
          // If it is outside this range, report it!
          if (charCode < 192 || charCode > 255) {
            console.log(`[NON-ASCII/LATIN] in ${filepath} Line ${idx + 1} Col ${i + 1}: CharCode ${charCode} ("${line[i]}")`);
          }
        }
      }
    });
  }
});
