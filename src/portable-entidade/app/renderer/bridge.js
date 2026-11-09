(function () {
  'use strict';

  function executor() {
    let sucesso = function () {};
    let falha = function (erro) { console.error(erro); };
    let objetoUsuario;
    const proxy = new Proxy({}, {
      get: function (_alvo, propriedade) {
        if (propriedade === 'then') return undefined;
        if (propriedade === 'withSuccessHandler') return function (fn) { sucesso = fn; return proxy; };
        if (propriedade === 'withFailureHandler') return function (fn) { falha = fn; return proxy; };
        if (propriedade === 'withUserObject') return function (valor) { objetoUsuario = valor; return proxy; };
        return function (...argumentos) {
          window.entidadeDesktop.chamar(String(propriedade), argumentos)
            .then(function (resultado) { sucesso(resultado, objetoUsuario); })
            .catch(function (erro) { falha(erro, objetoUsuario); });
          return proxy;
        };
      }
    });
    return proxy;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { get: executor });
  window.__ENTIDADE_PORTATIL__ = true;
})();
