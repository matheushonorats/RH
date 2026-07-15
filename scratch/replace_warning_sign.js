const fs = require('fs');

try {
  let content = fs.readFileSync('src/Scripts.html', 'utf8');
  if (content.includes('⚠')) {
    console.log("Found ⚠ in Scripts.html. Replacing with [AVISO]...");
    content = content.replace(/⚠/g, '[AVISO]');
    fs.writeFileSync('src/Scripts.html', content, 'utf8');
    console.log("Replaced in Scripts.html.");
  }
} catch (e) {
  console.error(e.message);
}
