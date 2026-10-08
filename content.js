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

  function minutes(value) {
    const match = normalizeTime(value).match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  function findTimeButtonInRange(start, end) {
    const min = minutes(start);
    const max = minutes(end);
    return [...document.querySelectorAll("button")]
      .filter((button) => visible(button) && !button.disabled)
      .map((button) => ({ button, value: minutes(button.textContent) }))
      .filter((item) => item.value !== null && item.value >= min && item.value <= max)
      .sort((a, b) => a.value - b.value)[0]?.button || null;
  }

  function nextDate(value) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function encodePrefill(reservation, date) {
    const json = JSON.stringify({
      language: reservation.language || "zh",
      date,
      adults: Number(reservation.adults),
      kids: Number(reservation.children || 0),
      time: reservation.timeStart
    });
    return btoa(unescape(encodeURIComponent(json)));
  }

  function navigateToDate(reservation, date) {
    const url = new URL(location.href);
    url.searchParams.set("pre_filled_form", encodePrefill(reservation, date));
    url.searchParams.set("inline_helper", "1");
    chrome.storage.local.set({ lastSelectedDate: date, flowStatus: `正在檢查 ${date}` }).then(() => {
      location.replace(url.toString());
    });
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

      if (!new URL(location.href).searchParams.has("inline_helper")) {
        navigateToDate(reservation, reservation.dateStart);
        return;
      }

      if (hasCaptcha()) {
        const captchaState = JSON.parse(sessionStorage.getItem(HELPER_KEY) || "{}");
        captchaState.captchaSeen = true;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(captchaState));
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

      const kidPicker = document.querySelector("#kid-picker");
      if (kidPicker) {
        const option = [...kidPicker.options].find((item) =>
          (item.textContent || "").includes(`${reservation.children || 0}位小孩`)
        );
        if (option && String(kidPicker.value) !== String(option.value)) {
          setNativeValue(kidPicker, option.value);
          report("選人數", `已選擇 ${reservation.adults} 位大人、${reservation.children || 0} 位小孩`);
          return;
        }
      }

      const timeButton = findTimeButtonInRange(reservation.timeStart, reservation.timeEnd);
      const bookingButton = exactButton("完成預訂");
      if (timeButton && !bookingButton) {
        const attempts = Number(state.timeClickAttempts || 0);
        if (attempts >= 2) {
          report("請手動", `${reservation.timeStart}–${reservation.timeEnd} 的時段自動點擊兩次仍未生效`, "error");
          return;
        }
        state.timeClickAttempts = attempts + 1;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
        report(
          "選時段",
          state.captchaSeen
            ? `CAPTCHA 已通過，重新選擇 ${(timeButton.textContent || "").trim()}`
            : `正在選擇 ${(timeButton.textContent || "").trim()}`
        );
        timeButton.click();
        return;
      }

      if (bookingButton && adultPicker) {
        const attempts = Number(state.bookingClickAttempts || 0);
        if (attempts >= 2) {
          report("請手動", "自動進入資料頁兩次仍未生效，請手動按完成預訂", "error");
          return;
        }
        state.bookingClickAttempts = attempts + 1;
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

      if (!timeButton && adultPicker && !bookingButton) {
        const { lastSelectedDate } = await chrome.storage.local.get("lastSelectedDate");
        const current = lastSelectedDate || reservation.dateStart;
        const following = nextDate(current);
        const scanCount = Number(state.scanCount || 0) + 1;
        state.scanCount = scanCount;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
        if (following <= reservation.dateEnd && scanCount < 14) {
          report("下一天", `${current} 沒有區間內時段，接著檢查 ${following}`);
          setTimeout(() => navigateToDate(reservation, following), 1500);
        } else {
          report("沒有空位", `${reservation.dateStart} 至 ${reservation.dateEnd} 沒有找到 ${reservation.timeStart}–${reservation.timeEnd}`, "error");
        }
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
