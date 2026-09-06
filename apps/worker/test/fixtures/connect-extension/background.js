// Réplica mínima do background da TOConline Connect: `login-fetch-logout` faz
// logout por fetch, abre um separador na página de login e executa lá o guião
// (XPath) que a página do TOConline lhe entregou. Os passos `follow` com
// `closeTab` fecham o separador — é o que os testes usam para simular a
// extensão a fechar-nos a porta.

function executarGuiao(acoes) {
  const porXPath = (xpath) =>
    document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  for (const acao of acoes || []) {
    const alvo = porXPath(acao.element);
    if (!alvo) continue;
    switch (acao.type) {
      case "input-value":
        alvo.value = acao.value;
        alvo.dispatchEvent(new Event("input", { bubbles: true }));
        break;
      case "form-submit":
        alvo.submit();
        break;
      case "element-click":
        alvo.click();
        break;
      default:
        break;
    }
  }
}

function esperarCarregado(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function ouvinte(id, info) {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(ouvinte);
        resolve();
      }
    });
  });
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (!remetente.tab) {
    responder({ allowed: false });
    return false;
  }
  if (mensagem.action !== "login-fetch-logout") {
    responder({ failed: true });
    return false;
  }
  (async () => {
    if (mensagem.logout && mensagem.logout.url) {
      try {
        await fetch(mensagem.logout.url);
      } catch {
        // o logout é melhor-esforço, como na extensão real
      }
    }
    if (!mensagem.login) {
      responder({ logout: { ok: true } });
      return;
    }
    const tab = await chrome.tabs.create({ url: mensagem.login.url });
    await esperarCarregado(tab.id);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: executarGuiao,
      args: [mensagem.login.actions || []],
    });
    const fechar = (mensagem.follow || []).find((passo) => passo.closeTab !== undefined);
    if (fechar) {
      setTimeout(() => chrome.tabs.remove(tab.id), fechar.closeTabTimeout || 300);
    }
    responder({ finished: true, tabInfo: { id: tab.id } });
  })().catch((err) => responder({ failed: true, error: String(err) }));
  return true;
});
