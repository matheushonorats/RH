const fs = require('fs');
const vm = require('vm');
const path = require('path');

try {
  let indexHtml = fs.readFileSync('src/index.html', 'utf8');
  const stylesHtml = fs.readFileSync('src/Styles.html', 'utf8');
  const scriptsHtml = fs.readFileSync('src/Scripts.html', 'utf8');

  // Simulate include function
  indexHtml = indexHtml.replace(/<\?!=\s*incluir\("Styles"\);\s*\?>/gi, stylesHtml);
  indexHtml = indexHtml.replace(/<\?!=\s*incluir\("Scripts"\);\s*\?>/gi, scriptsHtml);

  console.log("Merged file created in memory.");

  // Find all script blocks in the merged HTML and validate their syntax
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 1;
  let hasErrors = false;

  while ((match = scriptRegex.exec(indexHtml)) !== null) {
    const code = match[1];
    // Skip external script tags with no body
    if (!code.trim()) continue;

    console.log(`Validating script block ${index}...`);
    try {
      new vm.Script(code);
      console.log(`Block ${index} is valid.`);
    } catch (err) {
      hasErrors = true;
      console.error(`[SYNTAX ERROR] in script block ${index}:`, err.message);
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
    index++;
  }

  if (!hasErrors) {
    console.log("ALL SCRIPT BLOCKS ARE SYNTAX VALID IN MERGED HTML!");
  }
} catch (e) {
  console.error("Error during merge simulation:", e.message);
}
