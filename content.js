(() => {
  const HELPER_KEY = "inlineHelperFlowV2";
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
    const frame = document.querySelector('iframe[id*="captcha" i], iframe[src*="captcha" i], [id*="captcha-modal" i]');
    return (frame && visible(frame)) ||
      /按壓不放以確認|確認您是人類|Human verification|Access to this page has been denied/i.test(pageText());
  }

  function hasInteractivePaymentStep() {
    if (/\/(payment|checkout|credit-card|deposit)(\/|$)/i.test(location.pathname)) return true;
    const control = document.querySelector([
      'input[autocomplete^="cc-"]', 'input[name*="card" i]', 'input[id*="card" i]',
      'iframe[src*="stripe" i]', 'iframe[src*="payment" i]', 'iframe[src*="3ds" i]'
    ].join(","));
    return Boolean(control && visible(control));
  }

  function exactButton(...labels) {
    return [...document.querySelectorAll("button")].find((button) =>
      visible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
      labels.includes((button.textContent || "").trim())
    );
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
      language: reservation.language || "zh", date,
      adults: Number(reservation.adults), kids: Number(reservation.children || 0),
      time: reservation.timeStart
    });
    return btoa(unescape(encodeURIComponent(json)));
  }

  function navigateToDate(reservation, date) {
    const normalized = InlineHelperCommon.normalizeRestaurantInput(reservation.restaurantQuery);
    const base = normalized.kind === "url" ? normalized.value : location.href;
    const url = InlineHelperCommon.setUrlQueryParams(base, {
      pre_filled_form: encodePrefill(reservation, date),
      inline_helper: "1"
    });
    chrome.storage.local.set({ lastSelectedDate: date, flowStatus: `正在檢查 ${date}` }).then(() => location.replace(url));
  }

  function setNativeValue(element, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
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
        if (String(input.value || "").trim() === String(value).trim()) return false;
        setNativeValue(input, value);
        return true;
      }
    }
    return false;
  }

  function fillByHint(pattern, value) {
    if (!value) return false;
    const input = [...document.querySelectorAll("input, textarea")].filter(visible).find((item) => {
      const label = item.labels ? [...item.labels].map((x) => x.textContent).join(" ") : "";
      return pattern.test(`${item.name} ${item.id} ${item.placeholder} ${label}`);
    });
    if (!input || String(input.value || "").trim() === String(value).trim()) return false;
    setNativeValue(input, value);
    return true;
  }

  function findTimeButtons() {
    return [...document.querySelectorAll("button")].filter((button) => {
      if (!visible(button) || button.disabled || button.getAttribute("aria-disabled") === "true") return false;
      if (button.classList.contains("full") || /額滿|已滿|候補|無空位/i.test(button.textContent || "")) return false;
      return InlineHelperCommon.timeToMinutes(button.textContent) !== null;
    });
  }

  function findTimeButtonInRange(start, end) {
    const min = InlineHelperCommon.timeToMinutes(start);
    const max = InlineHelperCommon.timeToMinutes(end);
    return findTimeButtons()
      .map((button) => ({ button, value: InlineHelperCommon.timeToMinutes(button.textContent) }))
      .filter((item) => item.value >= min && item.value <= max)
      .sort((a, b) => a.value - b.value)[0]?.button || null;
  }

  function selectedTimeButton() {
    return findTimeButtons().find((button) =>
      button.classList.contains("selected") || button.getAttribute("aria-pressed") === "true" ||
      /已選擇|selected/i.test(button.getAttribute("aria-label") || "")
    );
  }

  function selectBookingOption() {
    const nodes = [...document.querySelectorAll("p,h2,h3,h4,button")].filter(visible);
    const headingIndex = nodes.findIndex((node) =>
      node.tagName !== "BUTTON" && /^(用餐)?(桌型|座位|餐區|區域|方案|套餐)/.test((node.textContent || "").trim())
    );
    if (headingIndex < 0) return false;
    const choices = [];
    for (let index = headingIndex + 1; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.tagName !== "BUTTON" && /用餐時段|選擇時段/.test((node.textContent || "").trim())) break;
      if (node.tagName === "BUTTON" && !node.disabled && !/完成預訂|確認訂位/.test(node.textContent || "")) choices.push(node);
    }
    if (!choices.length || choices.some((choice) => choice.getAttribute("aria-pressed") === "true" || choice.classList.contains("selected"))) return false;
    choices[0].click();
    report("選餐區", `已選擇第一個可用選項：${(choices[0].textContent || "").trim()}`);
    return true;
  }

  function findRequiredChoiceGroup(input) {
    let parent = input.parentElement;
    for (let depth = 0; depth < 5 && parent; depth += 1, parent = parent.parentElement) {
      const choices = [...parent.querySelectorAll('[role="checkbox"], [role="radio"]')].filter(visible);
      if (choices.length) return { parent, choices };
    }
    return null;
  }

  function chooseDiningPurpose(reservation) {
    const hiddenRequired = [...document.querySelectorAll('input[required]')].filter((input) => !visible(input));
    for (const input of hiddenRequired) {
      const group = findRequiredChoiceGroup(input);
      if (!group || !/用餐目的/.test(group.parent.innerText || "")) continue;
      if (group.choices.some((choice) => choice.getAttribute("aria-checked") === "true")) return false;
      const wanted = String(reservation.diningPurpose || "朋友聚餐");
      const choice = group.choices.find((item) => (item.textContent || "").trim() === wanted) || group.choices[0];
      if (!choice) return false;
      choice.click();
      report("填目的", `已選擇用餐目的：${(choice.textContent || "").trim()}`);
      return true;
    }
    return false;
  }

  function checkRequiredAgreements() {
    let changed = false;
    for (const checkbox of document.querySelectorAll('input[type="checkbox"][required]')) {
      if (!visible(checkbox) || checkbox.checked) continue;
      checkbox.click();
      changed = true;
    }
    for (const control of document.querySelectorAll('[role="checkbox"][aria-required="true"]')) {
      if (!visible(control) || control.getAttribute("aria-checked") === "true") continue;
      control.click();
      changed = true;
    }
    return changed;
  }

  function unansweredRequired() {
    for (const input of document.querySelectorAll("input[required], textarea[required], select[required]")) {
      if (input.checkValidity()) continue;
      const group = !visible(input) ? findRequiredChoiceGroup(input) : null;
      if (group) {
        const label = (group.parent.innerText || "").trim().split("\n").map((item) => item.trim()).find(Boolean) || "餐廳自訂問題";
        return { element: group.parent, label };
      }
      const label = input.labels ? [...input.labels].map((item) => item.textContent.trim()).find(Boolean) : "";
      return { element: input, label: label || input.placeholder || "必填欄位" };
    }
    return null;
  }

  function markNeedsAttention(missing) {
    missing.element.style.outline = "3px solid #d97706";
    missing.element.style.outlineOffset = "3px";
    missing.element.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function isSuccessPage() {
    return /\/(success|complete|confirmation)(\/|$)/i.test(location.pathname) || /訂位成功|預約成功|已完成訂位/.test(pageText());
  }

  async function advance() {
    if (busy) return;
    busy = true;
    try {
      const { reservation } = await chrome.storage.local.get("reservation");
      const helperUrl = new URLSearchParams(location.search).has("inline_helper");
      if (!reservation?.enabled && !helperUrl) return;

      if (isSuccessPage()) {
        await chrome.storage.local.set({ reservation: { ...reservation, enabled: false }, flowStatus: "訂位完成" });
        report("完成", "inline 已顯示訂位成功");
        return;
      }
      if (hasCaptcha()) {
        report("CAPTCHA", "等待你手動完成人類驗證；完成後助手會繼續", "error");
        return;
      }
      if (hasInteractivePaymentStep()) {
        report("需付款", "已進入信用卡、訂金或驗證頁，請由你手動完成", "error");
        return;
      }
      if (!helperUrl && !/\/form\/?$/.test(location.pathname)) {
        navigateToDate(reservation, reservation.dateStart);
        return;
      }

      const state = JSON.parse(sessionStorage.getItem(HELPER_KEY) || "{}");
      const adultPicker = document.querySelector("#adult-picker");
      if (adultPicker) {
        const option = [...adultPicker.options].find((item) => (item.textContent || "").includes(`${reservation.adults}位大人`));
        if (option && String(adultPicker.value) !== String(option.value)) {
          setNativeValue(adultPicker, option.value);
          report("選人數", `已選擇 ${reservation.adults} 位大人`);
          return;
        }
      }
      const kidPicker = document.querySelector("#kid-picker");
      if (kidPicker) {
        const option = [...kidPicker.options].find((item) => (item.textContent || "").includes(`${reservation.children || 0}位小孩`));
        if (option && String(kidPicker.value) !== String(option.value)) {
          setNativeValue(kidPicker, option.value);
          report("選人數", `已選擇 ${reservation.children || 0} 位小孩`);
          return;
        }
      }

      if (adultPicker && selectBookingOption()) return;
      if (adultPicker && !selectedTimeButton()) {
        const timeButton = findTimeButtonInRange(reservation.timeStart, reservation.timeEnd);
        if (timeButton) {
          report("選時段", `正在選擇 ${(timeButton.textContent || "").trim()}`);
          timeButton.click();
          return;
        }
        if (findTimeButtons().length || document.querySelector(".time-slot")) {
          const { lastSelectedDate } = await chrome.storage.local.get("lastSelectedDate");
          const current = lastSelectedDate || reservation.dateStart;
          const following = nextDate(current);
          const scanCount = Number(state.scanCount || 0) + 1;
          state.scanCount = scanCount;
          sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
          if (following <= reservation.dateEnd && scanCount < 14) {
            report("下一天", `${current} 沒有區間內時段，接著檢查 ${following}`);
            setTimeout(() => navigateToDate(reservation, following), 800);
          } else {
            report("沒有空位", `${reservation.dateStart} 至 ${reservation.dateEnd} 沒有找到 ${reservation.timeStart}–${reservation.timeEnd}`, "error");
          }
          return;
        }
      }

      if (adultPicker && selectedTimeButton()) {
        const paymentButton = [...document.querySelectorAll("button")].find((button) =>
          visible(button) && /授權信用卡|支付訂金|前往付款|付款.*確認/.test((button.textContent || "").trim())
        );
        if (paymentButton) {
          report("需預授權", "此時段需要訂金或信用卡預授權，已停在送出前讓你手動確認", "error");
          return;
        }
        const bookingButton = exactButton("完成預訂", "填寫訂位資料", "下一步");
        if (bookingButton) {
          report("下一步", "正在進入訂位資料頁");
          bookingButton.click();
          return;
        }
      }

      const changed = [
        fillInput(['#phone', 'input[type="tel"]'], reservation.contactPhone) || fillByHint(/手機|電話|phone|mobile|tel/i, reservation.contactPhone),
        fillInput(['#email', 'input[type="email"]'], reservation.contactEmail) || fillByHint(/email|e-mail|電子信箱|信箱/i, reservation.contactEmail),
        fillInput(['#name', 'input[autocomplete="name"]'], reservation.contactName) || fillByHint(/姓名|訂位人|name/i, reservation.contactName)
      ];
      if (chooseDiningPurpose(reservation)) return;
      if (checkRequiredAgreements()) return;
      if (changed.some(Boolean)) report("已填寫", "聯絡資料已填入本頁");

      const missing = unansweredRequired();
      if (missing) {
        markNeedsAttention(missing);
        report("缺必填", `請手動完成「${missing.label}」，完成後助手會繼續`, "error");
        return;
      }
      if (!reservation.contactName || !reservation.contactPhone) {
        report("缺資料", "請先在插件填入姓名與手機", "error");
        return;
      }

      const finalButton = exactButton("確認預訂", "確認訂位", "送出訂位", "完成訂位", "送出預訂");
      if (!reservation.autoSubmit) {
        if (!finalButton) {
          report("預演處理中", "資料已填妥，正在等待 inline 顯示最終確認步驟");
          return;
        }
        await chrome.storage.local.set({
          reservation: { ...reservation, enabled: false },
          previewCompletedAt: Date.now()
        });
        report("預演完成", "預演完成：已找到可用時段並填妥資料；沒有送出訂位");
        return;
      }
      if (finalButton) {
        if (state.submitAttemptedAt) {
          report("請確認", "已送出一次，但尚未看到成功頁；為避免重複訂位，請查看頁面訊息", "error");
          return;
        }
        state.submitAttemptedAt = Date.now();
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
        report("送出中", "正在送出最終訂位");
        finalButton.click();
      }
    } catch (error) {
      report("發生錯誤", `訂位頁處理失敗：${error?.message || "頁面流程無法繼續"}`, "error");
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
