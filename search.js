(() => {
  const match = location.hash.match(/inline-helper-search=([^&]+)/);
  if (!match) return;
  const query = decodeURIComponent(match[1]);
  let suggestionClicked = false;
  let searchFilled = false;

  function report(status, detail, kind = "ok") {
    chrome.runtime.sendMessage({ type: "FLOW_STATUS", status, detail, kind }).catch(() => {});
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "").replace(/[｜|·・]/g, "");
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillSearch() {
    if (searchFilled) return true;
    const input = [...document.querySelectorAll("input")].find((item) =>
      /搜尋|search|ask inline|問 inline/i.test(`${item.placeholder} ${item.getAttribute("aria-label") || ""}`)
    );
    if (!input) return false;
    setNativeValue(input, query);
    input.focus();
    searchFilled = true;
    report("搜尋中", `正在 inline Dining 搜尋「${query}」`);
    return true;
  }

  function inspectResults() {
    const bookingLinks = [...document.querySelectorAll('a[href*="inline.app/booking/"], a[href^="/booking/"]')]
      .filter(visible);
    const matchingLinks = bookingLinks.filter((link) => normalize(link.textContent).includes(normalize(query)));
    if (matchingLinks.length === 1) {
      report("已找到", "已找到唯一的官方訂位頁");
      location.href = matchingLinks[0].href;
      return true;
    }

    const restaurantSuggestions = [...document.querySelectorAll('[role="option"]')]
      .filter((option) => visible(option) && option.querySelector("img"));
    const matchingSuggestions = restaurantSuggestions.filter((option) =>
      normalize(option.textContent).includes(normalize(query)) ||
      normalize(query).includes(normalize(option.querySelector("strong")?.textContent))
    );
    if (!suggestionClicked && matchingSuggestions.length === 1) {
      suggestionClicked = true;
      report("選分店", `找到「${(matchingSuggestions[0].textContent || "").trim()}」，正在開啟`);
      matchingSuggestions[0].click();
      return true;
    }
    if (matchingSuggestions.length > 1 || restaurantSuggestions.length > 1) {
      report("選分店", "找到多個可能結果，請點一次正確的餐廳或分店", "error");
      return true;
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    fillSearch();
    inspectResults();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  fillSearch();
  inspectResults();
  setTimeout(() => {
    if (!inspectResults()) report("找不到", "官方搜尋沒有可開啟的訂位結果；請改貼餐廳的 inline 訂位網址", "error");
  }, 3500);
})();
