const { execSync } = require('child_process');

const code = execSync('git show HEAD~1:src/Scripts.html', { encoding: 'utf8' });
const lines = code.split('\n');
for (let i = 1250; i < 1290; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
