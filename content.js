(() => {
  const HELPER_KEY = "inlineHelperFlow";
  let busy = false;

  function report(status, detail, kind = "ok") {
    chrome.runtime.sendMessage({ type: "FLOW_STATUS", status, detail, kind }).catch(() => {});
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function pageText() {
    return (document.body?.innerText || "").replace(/\s+/g, " ");
  }

  function hasCaptcha() {
    const text = pageText();
    return /按壓不放以確認|確認您是人類|Human verification|Access to this page has been denied/i.test(text);
  }

  function hasPaymentStep() {
    return /信用卡|卡號|付款|支付|訂金|預付|OTP|驗證碼|CVV|CVC/i.test(pageText());
  }

  function exactButton(text) {
    return [...document.querySelectorAll("button")].find((button) =>
      visible(button) && !button.disabled && (button.textContent || "").trim() === text
    );
  }

  function normalizeTime(value) {
    return String(value || "")
      .replace(/：/g, ":")
      .replace(/中午|午餐|上午|AM/gi, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function findTimeButton(time) {
    const wanted = normalizeTime(time);
    return [...document.querySelectorAll("button")].find((button) =>
      visible(button) && !button.disabled && normalizeTime(button.textContent) === wanted
    );
  }

  function setNativeValue(element, value) {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      "value"
    )?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillInput(selectors, value) {
    if (!value) return false;
    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input && visible(input)) {
        setNativeValue(input, value);
        return true;
      }
    }
    return false;
  }

  function fillByHint(pattern, value) {
    if (!value) return false;
    const inputs = [...document.querySelectorAll("input, textarea")].filter(visible);
    const input = inputs.find((item) => {
      const label = item.labels ? [...item.labels].map((x) => x.textContent).join(" ") : "";
      return pattern.test(`${item.name} ${item.id} ${item.placeholder} ${label}`);
    });
    if (!input) return false;
    setNativeValue(input, value);
    return true;
  }

  function checkRequiredAgreements() {
    for (const checkbox of document.querySelectorAll('input[type="checkbox"]')) {
      if (!visible(checkbox) || checkbox.checked) continue;
      const label = checkbox.labels ? [...checkbox.labels].map((x) => x.textContent).join(" ") : "";
      if (checkbox.required || /同意|已閱讀|條款|規則/.test(label)) checkbox.click();
    }
  }

  async function advance() {
    if (busy) return;
    busy = true;
    try {
      const { reservation } = await chrome.storage.local.get("reservation");
      if (!reservation?.enabled && !new URL(location.href).searchParams.has("inline_helper")) return;

      if (hasCaptcha()) {
        report("CAPTCHA", "等待你手動完成人類驗證", "error");
        return;
      }

      const state = JSON.parse(sessionStorage.getItem(HELPER_KEY) || "{}");
      const adultPicker = document.querySelector("#adult-picker");
      if (adultPicker && String(adultPicker.value) !== String(reservation.adults)) {
        const option = [...adultPicker.options].find((item) =>
          (item.textContent || "").includes(`${reservation.adults}位大人`)
        );
        if (option) {
          setNativeValue(adultPicker, option.value);
          report("3人", `已選擇 ${reservation.adults} 位大人`);
          return;
        }
      }

      const timeButton = findTimeButton(reservation.time);
      const bookingButton = exactButton("完成預訂");
      if (timeButton && !state.timeSelected) {
        state.timeSelected = true;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
        report("選時段", `正在選擇 ${reservation.time}`);
        timeButton.click();
        return;
      }

      if (bookingButton && state.timeSelected && !state.bookingAdvanced) {
        state.bookingAdvanced = true;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
        report("下一步", "正在進入訂位資料頁");
        bookingButton.click();
        return;
      }

      const filled = [
        fillInput(['input[type="tel"]'], reservation.contactPhone) ||
          fillByHint(/手機|電話|phone|mobile|tel/i, reservation.contactPhone),
        fillInput(['input[type="email"]'], reservation.contactEmail) ||
          fillByHint(/email|e-mail|電子信箱|信箱/i, reservation.contactEmail),
        fillInput(['input[autocomplete="name"]'], reservation.contactName) ||
          fillByHint(/姓名|訂位人|name/i, reservation.contactName)
      ];
      if (filled.some(Boolean)) {
        checkRequiredAgreements();
        report("已填寫", "聯絡資料已填入本頁");
      }

      if (!reservation.autoSubmit) {
        report("待確認", "已完成自動填寫，等待你送出");
        return;
      }

      if (hasPaymentStep()) {
        report("付款", "偵測到付款、訂金或驗證碼，已暫停", "error");
        return;
      }

      if (!reservation.contactName || !reservation.contactPhone) {
        report("缺資料", "請先在插件填入姓名與手機", "error");
        return;
      }

      checkRequiredAgreements();
      const finalLabels = ["確認預訂", "確認訂位", "送出訂位", "完成訂位", "送出預訂"];
      const finalButton = finalLabels.map(exactButton).find(Boolean);
      if (finalButton && !state.submitted) {
        state.submitted = true;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
        report("送出中", "正在送出最終訂位");
        finalButton.click();
        return;
      }

      if (!timeButton && adultPicker) {
        report("無12點", `隨機日期目前沒有 ${reservation.time} 可選`, "error");
      }
    } finally {
      busy = false;
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer.timer);
    observer.timer = setTimeout(advance, 250);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  advance();
})();
