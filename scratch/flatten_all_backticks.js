const fs = require('fs');

try {
  let content = fs.readFileSync('src/Scripts.html', 'utf8');
  
  // We want to find template literals (backticks) that span multiple lines and flatten them.
  // We can do this by matching `...` and replacing any newlines inside them.
  // To avoid matching escaped backticks, we use a regex or a simple parser.
  
  let result = '';
  let inBacktick = false;
  let currentTemplate = '';
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';
    
    if (char === '`' && prevChar !== '\\') {
      if (!inBacktick) {
        inBacktick = true;
        currentTemplate = '`';
      } else {
        inBacktick = false;
        currentTemplate += '`';
        // Flatten the template (replace literal newlines with spaces or \n if needed, but for HTML templates, spaces are fine!)
        const flattened = currentTemplate.replace(/\r?\n/g, ' ');
        result += flattened;
        currentTemplate = '';
      }
    } else {
      if (inBacktick) {
        currentTemplate += char;
      } else {
        result += char;
      }
    }
  }
  
  fs.writeFileSync('src/Scripts.html', result, 'utf8');
  console.log("Successfully flattened all multiline template literals in Scripts.html!");
} catch (e) {
  console.error(e.message);
}
