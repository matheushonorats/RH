const fs = require('fs');
const vm = require('vm');
const path = require('path');

const srcDir = 'src';

fs.readdirSync(srcDir).forEach(file => {
  const filepath = path.join(srcDir, file);
  if (file.endsWith('.gs')) {
    console.log(`Checking syntax of ${filepath}...`);
    try {
      const code = fs.readFileSync(filepath, 'utf8');
      // Compile the .gs code as a script
      new vm.Script(code);
      console.log(`[VALID] ${filepath}`);
    } catch (err) {
      console.error(`[SYNTAX ERROR] in ${filepath}:`, err.message);
      const code = fs.readFileSync(filepath, 'utf8');
      const lines = code.split('\n');
      const matchStack = err.stack.match(/evalmachine\.<anonymous>:(\d+)/);
      if (matchStack) {
        const lineNum = parseInt(matchStack[1], 10);
        console.error(`Error around line ${lineNum}:`);
        for (let i = Math.max(0, lineNum - 5); i < Math.min(lines.length, lineNum + 5); i++) {
          console.error(`${i + 1}: ${lines[i]}`);
        }
      } else {
        console.error(err.stack);
      }
    }
  } else if (file.endsWith('.html')) {
    console.log(`Checking syntax of ${filepath}...`);
    try {
      const html = fs.readFileSync(filepath, 'utf8');
      const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
      let match;
      let blockIndex = 1;
      while ((match = scriptRegex.exec(html)) !== null) {
        const code = match[1];
        try {
          new vm.Script(code);
        } catch (err) {
          console.error(`[SYNTAX ERROR] in ${filepath} block ${blockIndex}:`, err.message);
          const lines = code.split('\n');
          const matchStack = err.stack.match(/evalmachine\.<anonymous>:(\d+)/);
          if (matchStack) {
            const lineNum = parseInt(matchStack[1], 10);
            console.error(`Error around line ${lineNum}:`);
            for (let i = Math.max(0, lineNum - 5); i < Math.min(lines.length, lineNum + 5); i++) {
              console.error(`${i + 1}: ${lines[i]}`);
            }
          } else {
            console.error(err.stack);
          }
        }
        blockIndex++;
      }
      console.log(`[VALID] ${filepath}`);
    } catch (e) {
      console.error(`Failed to read HTML ${filepath}:`, e.message);
    }
  }
});
