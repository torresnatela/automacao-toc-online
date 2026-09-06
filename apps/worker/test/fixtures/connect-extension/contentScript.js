// Réplica do content script da TOConline Connect (protocolo observado em 2026-09-06):
// a página faz `postMessage({ type: btoa("platform"), ... })`; com `hasExtension`
// responde-se ao handshake, senão faz-se relay do `payload` ao background e
// devolve-se a resposta com o mesmo `promise` (hash) para a página a correlacionar.
const PEDIDO = btoa("platform");
const RESPOSTA = btoa("platform-extension");

window.addEventListener(
  "message",
  (event) => {
    if (event.source !== window || !event.data || event.data.type !== PEDIDO) return;
    if (event.data.hasExtension !== undefined) {
      window.postMessage(
        { type: RESPOSTA, loaded: true, version: 0.1, name: "TOConline Connect (fixture)", promise: event.data.hash },
        "*",
      );
      return;
    }
    chrome.runtime.sendMessage(event.data.payload, (response) => {
      window.postMessage({ type: RESPOSTA, response, promise: event.data.hash }, "*");
    });
  },
  false,
);
