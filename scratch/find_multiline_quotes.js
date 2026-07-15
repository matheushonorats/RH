const fs = require('fs');

try {
  const content = fs.readFileSync('src/Scripts.html', 'utf8');
  
  // Find double-quoted and single-quoted strings that contain literal newlines
  const lines = content.split('\n');
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let quoteStartLine = -1;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';
    
    if (char === '"' && prevChar !== '\\' && !inSingleQuote) {
      if (!inDoubleQuote) {
        inDoubleQuote = true;
        quoteStartLine = i;
      } else {
        inDoubleQuote = false;
      }
    } else if (char === "'" && prevChar !== '\\' && !inDoubleQuote) {
      if (!inSingleQuote) {
        inSingleQuote = true;
        quoteStartLine = i;
      } else {
        inSingleQuote = false;
      }
    } else if (char === '\n') {
      if (inDoubleQuote) {
        // Find line number
        const lineNum = content.slice(0, quoteStartLine).split('\n').length;
        console.log(`[MULTILINE DOUBLE QUOTE] starting around line ${lineNum}`);
        // print context
        const contextLines = content.slice(quoteStartLine - 50, quoteStartLine + 150).split('\n');
        console.log("Context:");
        contextLines.slice(0, 5).forEach(cl => console.log(`  > ${cl}`));
        inDoubleQuote = false; // reset to avoid duplicate prints
      }
      if (inSingleQuote) {
        // Find line number
        const lineNum = content.slice(0, quoteStartLine).split('\n').length;
        console.log(`[MULTILINE SINGLE QUOTE] starting around line ${lineNum}`);
        // print context
        const contextLines = content.slice(quoteStartLine - 50, quoteStartLine + 150).split('\n');
        console.log("Context:");
        contextLines.slice(0, 5).forEach(cl => console.log(`  > ${cl}`));
        inSingleQuote = false; // reset to avoid duplicate prints
      }
    }
  }
  console.log("Check complete.");
} catch (e) {
  console.error(e.message);
}
