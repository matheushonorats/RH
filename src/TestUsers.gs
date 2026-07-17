function minhaFuncaoTeste(a, b) {
  return a + b;
}

function testGlobalCall() {
  const result = globalThis['minhaFuncaoTeste'].apply(null, [2, 3]);
  console.log("Result: " + result);
}
