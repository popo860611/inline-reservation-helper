(() => {
  const match = location.hash.match(/inline-helper-search=([^&]+)/);
  if (!match) return;
  const query = decodeURIComponent(match[1]);

  function report(status, detail, kind = "ok") {
    chrome.runtime.sendMessage({ type: "FLOW_STATUS", status, detail, kind }).catch(() => {});
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "").replace(/[｜|·・]/g, "");
  }

  function fillSearch() {
    const input = [...document.querySelectorAll("input")].find((item) =>
      /搜尋|search|ask inline/i.test(`${item.placeholder} ${item.getAttribute("aria-label") || ""}`)
    );
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    if (setter) setter.call(input, query); else input.value = query;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    report("搜尋中", `正在 inline Dining 搜尋「${query}」`);
    return true;
  }

  function inspectResults() {
    const links = [...document.querySelectorAll('a[href*="inline.app/booking/"], a[href^="/booking/"]')];
    const exact = links.filter((link) => normalize(link.textContent).includes(normalize(query)));
    if (exact.length === 1) {
      location.href = exact[0].href;
      return;
    }
    if (links.length || exact.length > 1) {
      report("選分店", "找到多個可能結果，請點選正確餐廳或分店", "error");
    }
  }

  const observer = new MutationObserver(() => inspectResults());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (!fillSearch()) setTimeout(fillSearch, 1200);
  setTimeout(inspectResults, 1800);
})();
