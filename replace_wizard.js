const fs = require('fs');

let indexHtml = fs.readFileSync('src/index.html', 'utf8');
let wizardHtml = fs.readFileSync('wizard.html', 'utf8');

// The block to replace starts with:
// <div class="modal-body"> (inside form id="form-lancamento")
// and ends with:
// </form>

// Let's use string operations to find the precise boundaries.
const formStartMarker = '<form id="form-lancamento" onsubmit="salvarDadosLancamento(event)">';
const formEndMarker = '</form>';

const startIndex = indexHtml.indexOf(formStartMarker);
if (startIndex === -1) throw new Error("Could not find form-lancamento start marker");

const startBodyIndex = indexHtml.indexOf('<div class="modal-body">', startIndex);
if (startBodyIndex === -1) throw new Error("Could not find modal-body inside form-lancamento");

const endFormIndex = indexHtml.indexOf(formEndMarker, startBodyIndex);
if (endFormIndex === -1) throw new Error("Could not find form-lancamento end marker");

// We want to replace from startBodyIndex up to endFormIndex with wizardHtml
const part1 = indexHtml.substring(0, startBodyIndex);
const part2 = indexHtml.substring(endFormIndex);

const newIndexHtml = part1 + wizardHtml + '\n        ' + part2;

fs.writeFileSync('src/index.html', newIndexHtml);
console.log("Substituição do Wizard concluída com sucesso!");
