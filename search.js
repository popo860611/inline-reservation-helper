(() => {
  let suggestionClicked = false;
  let searchFilled = false;
  let started = false;

  function report(status, detail, kind = "ok") {
    chrome.runtime.sendMessage({ type: "FLOW_STATUS", status, detail, kind }).catch(() => {});
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "").replace(/[｜|·・]/g, "");
  }

  function matchScore(candidate, expected) {
    const left = normalize(candidate);
    const right = normalize(expected);
    if (!left || !right) return 0;
    if (left.includes(right) || right.includes(left)) return 1;
    const characters = [...new Set(right)];
    return characters.filter((character) => left.includes(character)).length / characters.length;
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  async function isActiveFlowTab() {
    const response = await chrome.runtime.sendMessage({ type: "CHECK_FLOW_SCOPE" });
    return Boolean(response?.active);
  }

  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillSearch(query) {
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

  function inspectResults(query) {
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
    const scoredSuggestions = restaurantSuggestions
      .map((option) => ({ option, score: matchScore(option.textContent, query) }))
      .filter(({ score }) => score >= 0.72)
      .sort((left, right) => right.score - left.score);
    const matchingSuggestions = scoredSuggestions
      .filter(({ score }) => score === scoredSuggestions[0]?.score)
      .map(({ option }) => option);
    if (!suggestionClicked && matchingSuggestions.length === 1) {
      suggestionClicked = true;
      report("選分店", `找到「${(matchingSuggestions[0].textContent || "").trim()}」，正在開啟`);
      chrome.storage.local.remove("pendingRestaurantSearch").catch(() => {});
      matchingSuggestions[0].click();
      return true;
    }
    if (matchingSuggestions.length > 1 || restaurantSuggestions.length > 1) {
      report("選分店", "找到多個可能結果，請點一次正確的餐廳或分店", "error");
      return true;
    }
    return false;
  }

  async function start() {
    if (started || !(await isActiveFlowTab())) return;
    const { pendingRestaurantSearch } = await chrome.storage.local.get("pendingRestaurantSearch");
    const query = String(pendingRestaurantSearch?.query || "").trim();
    const age = Date.now() - Number(pendingRestaurantSearch?.createdAt || 0);
    if (!query || age < 0 || age > 120_000) {
      if (pendingRestaurantSearch) await chrome.storage.local.remove("pendingRestaurantSearch");
      return;
    }
    started = true;

    const inspectActiveResults = async () => {
      if (!(await isActiveFlowTab())) return;
      fillSearch(query);
      inspectResults(query);
    };
    const observer = new MutationObserver(inspectActiveResults);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    await inspectActiveResults();
    setTimeout(async () => {
      if (!(await isActiveFlowTab())) return;
      if (!inspectResults(query)) {
        chrome.storage.local.remove("pendingRestaurantSearch").catch(() => {});
        report("找不到", "官方搜尋沒有可開啟的訂位結果；請改貼餐廳的 inline 訂位網址", "error");
      }
    }, 5000);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.activeReservationTabId || changes.pendingRestaurantSearch)) {
      start().catch((error) => report("搜尋失敗", `餐廳名稱搜尋失敗：${error.message}`, "error"));
    }
  });
  start().catch((error) => report("搜尋失敗", `餐廳名稱搜尋失敗：${error.message}`, "error"));
})();
