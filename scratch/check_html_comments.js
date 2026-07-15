const fs = require('fs');

try {
  const content = fs.readFileSync('src/index.html', 'utf8');
  let index = 0;
  let openCommentIdx = -1;
  
  while (index < content.length) {
    if (content[index] === '<' && content[index + 1] === '!' && content[index + 2] === '-' && content[index + 3] === '-') {
      openCommentIdx = index;
      index += 4;
    } else if (content[index] === '-' && content[index + 1] === '-' && content[index + 2] === '>' && openCommentIdx !== -1) {
      openCommentIdx = -1;
      index += 3;
    } else {
      index++;
    }
  }
  
  if (openCommentIdx !== -1) {
    console.log(`[UNCLOSED HTML COMMENT FOUND] starting at index ${openCommentIdx}:`);
    const lineNum = content.slice(0, openCommentIdx).split('\n').length;
    console.log(`Around line ${lineNum}:`);
    console.log(content.slice(openCommentIdx, openCommentIdx + 200));
  } else {
    console.log("All <!-- HTML comments are successfully closed!");
  }
} catch (e) {
  console.error(e.message);
}
