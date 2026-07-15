const fs = require('fs');

try {
  const content = fs.readFileSync('src/Scripts.html', 'utf8');
  const lines = content.split('\n');
  
  // Regex to find backticks
  let openBacktickIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let col = 0;
    while (col < line.length) {
      if (line[col] === '`') {
        // Check if escaped
        if (col === 0 || line[col - 1] !== '\\') {
          if (openBacktickIdx === -1) {
            openBacktickIdx = i;
          } else {
            if (i > openBacktickIdx) {
              console.log(`[MULTILINE TEMPLATE] starting at line ${openBacktickIdx + 1} and ending at line ${i + 1}:`);
              for (let k = openBacktickIdx; k <= i; k++) {
                console.log(`  ${k + 1}: ${lines[k]}`);
              }
            }
            openBacktickIdx = -1;
          }
        }
      }
      col++;
    }
  }
} catch (e) {
  console.error(e.message);
}
