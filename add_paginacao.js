const fs = require('fs');
let content = fs.readFileSync('src/index.html', 'utf8');

content = content.replace(
  /              <\/table>\r?\n            <\/div>\r?\n          <\/section>\r?\n          \r?\n          <!-- View 3/g,
  '              </table>\n              <div id="paginacao-servidores" style="padding: 0 16px;"></div>\n            </div>\n          </section>\n          \n          <!-- View 3'
);

content = content.replace(
  /              <\/table>\r?\n            <\/div>\r?\n          <\/section>\r?\n          \r?\n          <!-- View 4/g,
  '              </table>\n              <div id="paginacao-lancamentos" style="padding: 0 16px;"></div>\n            </div>\n          </section>\n          \n          <!-- View 4'
);

content = content.replace(
  /              <\/table>\r?\n            <\/div>\r?\n          <\/section>\r?\n          \r?\n          <!-- View 5/g,
  '              </table>\n              <div id="paginacao-protocolos" style="padding: 0 16px;"></div>\n            </div>\n          </section>\n          \n          <!-- View 5'
);

fs.writeFileSync('src/index.html', content);
console.log("Substituição de Paginação concluída!");
