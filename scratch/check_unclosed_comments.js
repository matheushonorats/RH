const fs = require('fs');

try {
  const content = fs.readFileSync('src/Scripts.html', 'utf8');
  let index = 0;
  let openCommentIdx = -1;
  
  while (index < content.length) {
    if (content[index] === '/' && content[index + 1] === '*') {
      openCommentIdx = index;
      index += 2;
    } else if (content[index] === '*' && content[index + 1] === '/' && openCommentIdx !== -1) {
      openCommentIdx = -1;
      index += 2;
    } else {
      index++;
    }
  }
  
  if (openCommentIdx !== -1) {
    console.log(`[UNCLOSED COMMENT FOUND] starting at index ${openCommentIdx}:`);
    const lineNum = content.slice(0, openCommentIdx).split('\n').length;
    console.log(`Around line ${lineNum}:`);
    console.log(content.slice(openCommentIdx, openCommentIdx + 200));
  } else {
    console.log("All /* comments are successfully closed!");
  }
} catch (e) {
  console.error(e.message);
}
