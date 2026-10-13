(() => {
  const HELPER_KEY = "inlineHelperFlowV2";
  const CONTENT_VERSION = "0.3.47";
  const FAST_STEP_MS = 80;
  const NAVIGATION_STEP_MS = 240;
  if (document.documentElement.dataset.inlineHelperVersion === CONTENT_VERSION) return;
  let busy = false;
  let pendingAdvance = false;
  let advanceTimer = null;
  let scheduledDelay = Infinity;
  let dateNavigationPending = false;
  let dateNavigationAt = 0;

  // Keep the first queued check: continuous DOM updates must not postpone it.
  function scheduleAdvance(delay = 0) {
    if (advanceTimer !== null && scheduledDelay <= delay) return;
    if (advanceTimer !== null) clearTimeout(advanceTimer);
    scheduledDelay = delay;
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      scheduledDelay = Infinity;
      advance();
    }, delay);
  }

  document.documentElement.dataset.inlineHelperVersion = CONTENT_VERSION;
  chrome.runtime.sendMessage({ type: "CONTENT_READY", version: CONTENT_VERSION, url: location.href }).catch(() => {});

  // Earlier content-script instances can remain alive after an extension reload.
  // Keep their stale notice hidden even if they recreate its host later.
  const CONSENT_SUPPRESSION_STYLE_ID = "inline-helper-consent-suppression";
  function setConsentNoticeSuppressed(suppressed) {
    if (!document.querySelector(`#${CONSENT_SUPPRESSION_STYLE_ID}`) && document.createElement) {
      const style = document.createElement("style");
      style.id = CONSENT_SUPPRESSION_STYLE_ID;
      style.textContent = 'html[data-inline-helper-consent-suppressed="true"] #inline-helper-consent-notice{display:none!important}';
      document.documentElement.appendChild(style);
    }
    const value = suppressed ? "true" : "false";
    if (document.documentElement.dataset.inlineHelperConsentSuppressed !== value) {
      document.documentElement.dataset.inlineHelperConsentSuppressed = value;
    }
  }

  setConsentNoticeSuppressed(!findManualConsentControl({ modalOnly: true }));

  function report(status, detail, kind = "ok") {
    chrome.runtime.sendMessage({ type: "FLOW_STATUS", status, detail, kind }).catch(() => {});
  }

  function showCaptchaNotice() {
    if (document.querySelector("#inline-helper-captcha-notice")) return;
    const host = document.createElement("div");
    host.id = "inline-helper-captcha-notice";
    host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;width:min(360px,calc(100vw - 32px));pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>*{box-sizing:border-box}.notice{display:flex;gap:12px;padding:14px 16px;border:2px solid #c56b00;border-radius:14px;background:#fff9e8;box-shadow:0 12px 34px rgba(15,23,42,.2);color:#492c00}.mark{font-size:22px;font-weight:900;line-height:1}.copy{font-size:15px;line-height:1.5}.copy strong{display:block;margin-bottom:2px;font-size:17px}</style>
      <section class="notice" role="status" aria-live="assertive" aria-atomic="true">
        <span class="mark" aria-hidden="true">!</span>
        <div class="copy"><strong>需要手動真人驗證</strong>請在 inline 視窗按住「按住不放」。完成後插件會自動繼續，不必重新開始。</div>
      </section>`;
    document.documentElement.appendChild(host);
  }

  function hideCaptchaNotice() {
    document.querySelector("#inline-helper-captcha-notice")?.remove();
  }

  function showConsentNotice(control) {
    if (!control?.closest?.('[role="dialog"], [aria-modal="true"], .house-rules')) {
      hideConsentNotice();
      return;
    }
    setConsentNoticeSuppressed(false);
    let host = document.querySelector("#inline-helper-consent-notice");
    if (host && !host.shadowRoot?.querySelector("button")) {
      host.remove();
      host = null;
    }
    if (!host) {
      host = document.createElement("div");
      host.id = "inline-helper-consent-notice";
      host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;width:min(360px,calc(100vw - 32px));pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `
        <style>*{box-sizing:border-box}.notice{padding:14px 16px;border:2px solid #c56b00;border-radius:14px;background:#fff9e8;box-shadow:0 12px 34px rgba(15,23,42,.2);color:#492c00;font-size:15px;line-height:1.5;pointer-events:auto}.notice strong{display:block;margin-bottom:2px;font-size:17px}button{display:block;width:100%;min-height:42px;margin-top:10px;border:0;border-radius:8px;background:#8a4500;color:#fff;font:inherit;font-weight:700;cursor:pointer}button:disabled{background:#a9a9a9;cursor:not-allowed}</style>
        <section class="notice" role="group" aria-label="訂位規則確認"><strong>等待你同意規則</strong><span>助手正在把 inline 規則捲到底。請閱讀內容，再按下方按鈕表示同意；付款與最後確認仍由你操作。</span><button type="button" disabled>我已閱讀並同意，代我按 inline 同意</button></section>`;
      root.querySelector("button").addEventListener("click", () => {
        const current = findManualConsentControl({ modalOnly: true });
        const target = interactiveControl(current);
        if (!target || target.disabled || target.getAttribute?.("aria-disabled") === "true") return;
        target.click();
        hideConsentNotice();
        setTimeout(advance, NAVIGATION_STEP_MS);
      });
      document.documentElement.appendChild(host);
    }
    const ready = !control.disabled && control.getAttribute?.("aria-disabled") !== "true";
    const button = host.shadowRoot?.querySelector("button");
    if (button && button.disabled !== !ready) button.disabled = !ready;
    const detail = host.shadowRoot?.querySelector("span");
    const text = ready
      ? "規則已捲到底。請閱讀內容，再按下方按鈕表示同意；付款與最後確認仍由你操作。"
      : "助手正在把 inline 規則捲到底。請閱讀內容，再按下方按鈕表示同意；付款與最後確認仍由你操作。";
    if (detail && detail.textContent !== text) detail.textContent = text;
  }

  function hideConsentNotice() {
    setConsentNoticeSuppressed(true);
    document.querySelector("#inline-helper-consent-notice")?.remove();
  }

  function showPreviewComplete() {
    if (document.querySelector("#inline-helper-preview-complete")) return;
    const previouslyFocused = document.activeElement;
    const host = document.createElement("div");
    host.id = "inline-helper-preview-complete";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(15,23,42,.58);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        *{box-sizing:border-box}
        .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
        .card{width:min(420px,100%);max-height:calc(100dvh - 32px);overflow:auto;border:2px solid #16743a;border-radius:20px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.3);color:#142218}
        .head{display:flex;align-items:center;gap:12px;padding:22px 22px 14px;background:#e9f8ed}
        .icon{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border-radius:50%;background:#16743a;color:#fff}
        h2{margin:0;font-size:24px;line-height:1.25;font-weight:800}
        .body{padding:18px 22px 22px}
        .lead{margin:0 0 12px;font-size:17px;line-height:1.6;font-weight:650}
        .warning{margin:0;padding:13px 14px;border:1px solid #d79b22;border-radius:12px;background:#fff7df;color:#6f4600;font-size:16px;line-height:1.5;font-weight:800}
        .note{margin:12px 0 18px;color:#46534b;font-size:14px;line-height:1.55}
        button{width:100%;min-height:48px;border:0;border-radius:12px;background:#16743a;color:#fff;font:inherit;font-size:16px;font-weight:750;cursor:pointer;touch-action:manipulation}
        button:hover{background:#105c2d}
        button:active{background:#0b4722}
        button:focus-visible{outline:3px solid #f4b740;outline-offset:3px}
        @media (prefers-reduced-motion:no-preference){.card{animation:enter .2s ease-out}@keyframes enter{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}}
      </style>
      <p class="sr-only" role="status" aria-live="assertive" aria-atomic="true">等待手動確認，尚未送出訂位。</p>
      <section class="card" role="dialog" aria-modal="true" aria-labelledby="inline-helper-preview-title" aria-describedby="inline-helper-preview-description">
        <div class="head">
          <span class="icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <h2 id="inline-helper-preview-title">等待手動確認</h2>
        </div>
        <div class="body">
          <p class="lead">已找到可用時段，並填妥目前頁面的訂位資料。</p>
          <p class="warning">尚未送出訂位</p>
          <p class="note" id="inline-helper-preview-description">這不代表訂位成功。請自行核對資料並決定是否按下最後的確認訂位按鈕。</p>
          <button type="button">我知道了</button>
        </div>
      </section>`;
    const close = () => {
      host.remove();
      if (previouslyFocused?.isConnected && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
    };
    root.querySelector("button").addEventListener("click", close);
    host.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    document.documentElement.appendChild(host);
    root.querySelector("button").focus();
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
    const controls = [...document.querySelectorAll([
      'input[autocomplete="one-time-code"]', 'input[name*="otp" i]', 'input[id*="otp" i]',
      'iframe[src*="stripe" i]', 'iframe[src*="payment" i]', 'iframe[src*="3ds" i]',
      'iframe[src*="card" i]', 'iframe[title*="card" i]', 'iframe[title*="信用卡" i]'
    ].join(","))].some(visible);
    return Boolean(Object.keys(paymentFields()).length || controls);
  }

  function fieldHint(input) {
    const labels = input.labels ? [...input.labels].map((label) => label.textContent).join(" ") : "";
    let nearby = "";
    for (let parent = input.parentElement, depth = 0; parent && depth < 3; parent = parent.parentElement, depth += 1) {
      if (parent.querySelectorAll("input").length !== 1) break;
      const text = String(parent.textContent || "").trim();
      if (text && text.length < 120) { nearby = text; break; }
    }
    return `${input.id} ${input.name} ${input.placeholder} ${input.getAttribute("aria-label") || ""} type:${input.type} autocomplete:${input.autocomplete || ""} ${labels} ${nearby}`;
  }

  function paymentFields() {
    const found = {};
    for (const input of document.querySelectorAll("input")) {
      if (!visible(input) || input.disabled || input.readOnly || input.hidden ||
          input.getAttribute("aria-hidden") === "true" || input.tabIndex === -1 ||
          /^(hidden|radio|checkbox|submit|button)$/i.test(input.type)) continue;
      const kind = InlineHelperCommon.paymentFieldKind(fieldHint(input));
      if (kind && !found[kind]) found[kind] = input;
    }
    return found;
  }

  function contactFields() {
    const found = {};
    for (const input of document.querySelectorAll("input")) {
      if (!visible(input) || input.disabled || input.readOnly) continue;
      const kind = InlineHelperCommon.contactFieldKind(fieldHint(input));
      if (kind && !found[kind]) found[kind] = input;
    }
    return found;
  }

  function exactButton(...labels) {
    return [...document.querySelectorAll("button")].find((button) =>
      visible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
      labels.includes((button.textContent || "").trim())
    );
  }

  function buttonText(button) {
    return String(button?.innerText || button?.textContent || button?.getAttribute?.("aria-label") || "").trim();
  }

  function findSafeOptionalSkipButton() {
    return [...document.querySelectorAll('button, [role="button"]')].find((button) =>
      visible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
      InlineHelperCommon.isSafeOptionalSkipText(buttonText(button))
    ) || null;
  }

  function hasBookingContactFields() {
    return Object.keys(contactFields()).length > 0;
  }

  function detectStage() {
    if (hasCaptcha()) return "captcha";
    if (hasBookingContactFields() && [...document.querySelectorAll("#name, #phone")].some((input) => visible(input) && !String(input.value || "").trim())) return "contact";
    if (hasInteractivePaymentStep()) return "verification";
    const contact = hasBookingContactFields();
    const optionalSkip = Boolean(findSafeOptionalSkipButton());
    const finalConfirmation = Boolean(exactButton("確認預訂", "確認訂位", "送出訂位", "完成訂位", "送出預訂"));
    const dateOrTime = Boolean(document.querySelector("#adult-picker, #kid-picker, .time-slot"));
    return InlineHelperCommon.classifyBookingStage({
      captcha: false,
      payment: hasInteractivePaymentStep(),
      contact,
      optionalSkip,
      finalConfirmation,
      dateOrTime
    });
  }

  function publishStage(stage) {
    document.documentElement.dataset.inlineHelperStage = stage;
    chrome.runtime.sendMessage({ type: "FLOW_STAGE", stage, version: CONTENT_VERSION }).catch(() => {});
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

  async function navigateToDate(reservation, date) {
    const state = JSON.parse(sessionStorage.getItem(HELPER_KEY) || "{}");
    if (state.timeSelectedAt || state.detailsReached ||
        /\/(?:form|payment|checkout|confirm|confirmation)\/?$/i.test(location.pathname) ||
        hasBookingContactFields() || hasInteractivePaymentStep() ||
        timeButtonIsInRange(selectedTimeButton(), reservation.timeStart, reservation.timeEnd)) return;
    const normalized = InlineHelperCommon.normalizeRestaurantInput(reservation.restaurantQuery);
    const base = normalized.kind === "url" ? normalized.value : location.href;
    const url = InlineHelperCommon.setUrlQueryParams(base, {
      pre_filled_form: encodePrefill(reservation, date),
      inline_helper: "1"
    });
    if (dateNavigationPending) return;
    dateNavigationPending = true;
    dateNavigationAt = Date.now();
    try {
      await chrome.storage.local.set({ lastSelectedDate: date, flowStatus: `正在檢查 ${date}` });
      const latestState = JSON.parse(sessionStorage.getItem(HELPER_KEY) || "{}");
      if (latestState.timeSelectedAt || latestState.detailsReached || hasBookingContactFields() || hasInteractivePaymentStep()) {
        dateNavigationPending = false;
        return;
      }
      location.replace(url);
    } catch (error) {
      dateNavigationPending = false;
      throw error;
    }
  }

  function setNativeValue(element, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillContactName(value) {
    if (!value) return false;
    const fields = contactFields();
    const familyInput = fields.family;
    const givenInput = fields.given;
    if ((familyInput && visible(familyInput)) || (givenInput && visible(givenInput))) {
      const { familyName, givenName } = InlineHelperCommon.splitContactName(value);
      if (familyInput && !String(familyInput.value || "").trim()) return fillField(familyInput, familyName);
      return fillField(givenInput, givenName);
    }
    return fillField(fields.name, value);
  }

  function fillField(input, value) {
    if (!input || !value || String(input.value || "").trim()) return false;
    setNativeValue(input, value);
    return String(input.value || "").trim() === String(value).trim();
  }

  function findTimeButtons({ includeUnavailable = false } = {}) {
    const buttons = [...document.querySelectorAll("button")];
    const slots = buttons.filter((button) => button.classList.contains("time-slot"));
    return (slots.length ? slots : buttons).filter((button) => {
      if (!visible(button)) return false;
      if (!includeUnavailable && (button.disabled || button.getAttribute("aria-disabled") === "true" ||
          button.classList.contains("full") || /額滿|已滿|候補|無空位/i.test(button.textContent || ""))) return false;
      return InlineHelperCommon.timeToMinutes(button.textContent) !== null;
    });
  }

  function findTimeButtonInRange(start, end, rejected = []) {
    const min = InlineHelperCommon.timeToMinutes(start);
    const max = InlineHelperCommon.timeToMinutes(end);
    return findTimeButtons()
      .map((button) => ({ button, value: InlineHelperCommon.timeToMinutes(button.textContent) }))
      .filter((item) => item.value >= min && item.value <= max && !rejected.includes(item.value))
      .sort((a, b) => a.value - b.value)[0]?.button || null;
  }

  function selectedTimeButton() {
    const selected = findTimeButtons().find((button) =>
      button.classList.contains("selected") || button.getAttribute("aria-pressed") === "true" ||
      /已選擇|selected/i.test(button.getAttribute("aria-label") || "")
    );
    if (selected) return selected;
    // Some inline pages show selection only in the bottom booking summary.
    if (!findBookingDetailsButton()) return null;
    return [...document.querySelectorAll("button")].find((button) => visible(button) &&
      !button.classList.contains("time-slot") && /^\s*(?:時段\s*)?\d{1,2}[:：]\d{2}\s*$/.test(button.textContent || "")) || null;
  }

  function findBookingDetailsButton() {
    return [...document.querySelectorAll("button")].find((button) => visible(button) &&
      !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
      /^(?:下一步(?:[，,:：\s]*填寫(?:訂位)?資料)?|填寫(?:訂位)?(?:資料|聯絡資訊))$/.test(buttonText(button)));
  }

  function timeButtonIsInRange(button, start, end) {
    if (!button) return false;
    const value = InlineHelperCommon.timeToMinutes(button.textContent);
    const min = InlineHelperCommon.timeToMinutes(start);
    const max = InlineHelperCommon.timeToMinutes(end);
    return value !== null && min !== null && max !== null && value >= min && value <= max;
  }

  function pageSelectedDate() {
    const dateInput = [...document.querySelectorAll('input[type="date"]')].find(visible);
    if (dateInput?.value) return { value: dateInput.value, element: dateInput };
    const datePicker = document.querySelector("#date-picker");
    for (const element of [...document.querySelectorAll('button, [role="button"]')].filter(visible)) {
      const value = InlineHelperCommon.dateTextToIso(element.textContent);
      if (value) return { value, element: visible(datePicker) ? datePicker : element };
    }
    return null;
  }

  function calendarMonthValue(value) {
    const match = String(value || "").match(/(20\d{2})年(\d{1,2})月/);
    return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
  }

  function selectTargetCalendarDate(targetDate, opener) {
    const cell = document.querySelector(`[data-date="${targetDate}"]`);
    if (cell && visible(cell)) {
      if (getComputedStyle(cell).cursor !== "pointer") return "unavailable";
      report("選日期", `正在選擇 ${targetDate}`);
      cell.click();
      return "selected";
    }

    if (opener && visible(opener)) {
      report("展開日期", `正在開啟月曆以選擇 ${targetDate}`);
      opener.click();
      return "opening";
    }

    const target = new Date(`${targetDate}T12:00:00`);
    const targetMonth = target.getFullYear() * 12 + target.getMonth();
    const shownMonths = [...document.querySelectorAll("h4")].filter(visible)
      .map((heading) => calendarMonthValue(heading.textContent))
      .filter((value) => value !== null)
      .sort((left, right) => left - right);
    if (!shownMonths.length) return "missing";

    if (targetMonth > shownMonths.at(-1)) {
      const next = [...document.querySelectorAll(".nextMonth")].filter(visible).at(-1);
      if (!next) return "missing";
      report("切換月份", `正在前往 ${targetDate.slice(0, 7)}`);
      next.click();
      return "navigating";
    }
    if (targetMonth < shownMonths[0]) {
      const previous = [...document.querySelectorAll(".prevMonth")].filter(visible)[0];
      if (!previous) return "missing";
      report("切換月份", `正在前往 ${targetDate.slice(0, 7)}`);
      previous.click();
      return "navigating";
    }
    return "missing";
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
    const wanted = String(reservation.diningPurpose || "朋友聚餐").trim();
    const labels = wanted === "朋友聚餐" ? [wanted, "一般聚餐"] : [wanted];
    const choices = [...document.querySelectorAll('[role="checkbox"], [role="radio"]')].filter((choice) =>
      visible(choice) && labels.includes((choice.textContent || "").trim())
    );
    const choice = choices.find((item) => {
      let parent = item.parentElement;
      for (let depth = 0; depth < 4 && parent; depth += 1, parent = parent.parentElement) {
        if (/用餐目的/.test(parent.innerText || "")) return true;
      }
      return false;
    }) || choices[0];
    if (!choice || controlIsSelected(choice)) return false;
    choice.click();
    report("填目的", `已選擇用餐目的：${(choice.textContent || "").trim()}`);
    return true;
  }

  function findManualConsentControl({ modalOnly = false } = {}) {
    return [...document.querySelectorAll('button, [role="button"], [role="checkbox"], label')].find((element) =>
      visible(element) && InlineHelperCommon.isAutoConsentText(element.textContent) &&
      consentControlIsActionable(element) &&
      (!modalOnly || Boolean(element.closest('[role="dialog"], [aria-modal="true"], .house-rules')))
    ) || null;
  }

  function interactiveControl(control) {
    if (!control) return null;
    if (control.tagName === "LABEL" && control.htmlFor) return document.getElementById(control.htmlFor) || control;
    return control.querySelector?.('input, button, [role="checkbox"], [role="radio"], [role="switch"]') || control;
  }

  function controlIsSelected(control) {
    const target = interactiveControl(control);
    return InlineHelperCommon.controlStateIsSelected({
      checked: target?.checked,
      ariaChecked: target?.getAttribute?.("aria-checked"),
      ariaPressed: target?.getAttribute?.("aria-pressed"),
      dataState: target?.getAttribute?.("data-state")
    });
  }

  function consentControlIsActionable(control) {
    const target = interactiveControl(control);
    if (!target) return false;
    const required = target.required === true || target.getAttribute?.("aria-required") === "true";
    return InlineHelperCommon.consentControlShouldAct({
      isLabel: control.tagName === "LABEL",
      targetIsSelf: target === control,
      targetVisible: visible(target),
      required
    });
  }

  function waitForManualConsent(control) {
    if (!control) return false;
    const target = interactiveControl(control);
    if (controlIsSelected(target)) return false;
    const modal = control.closest?.('[role="dialog"], [aria-modal="true"], .house-rules');
    if (!modal) {
      hideConsentNotice();
      report("待手動確認", "聯絡資料已填妥；請在 inline 核對預付訂金與取消退款須知，再完成付款與最後確認", "error");
      return true;
    }
    if (target.disabled || target.getAttribute?.("aria-disabled") === "true") {
      const scrollArea = modal && [modal, ...(modal.querySelectorAll?.("*") || [])].find((element) =>
        element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 2 &&
        element.scrollTop < element.scrollHeight - element.clientHeight - 2
      );
      if (scrollArea) {
        const before = scrollArea.scrollTop;
        scrollArea.scrollTop = Math.min(scrollArea.scrollHeight - scrollArea.clientHeight,
          before + Math.max(100, Math.floor(scrollArea.clientHeight * 0.9)));
        if (scrollArea.scrollTop > before) setTimeout(advance, FAST_STEP_MS);
      }
    }
    showConsentNotice(target);
    report("待手動同意", "助手會將規則捲到底；請閱讀後在頁面右上角明確同意，完成後助手會繼續填寫資料", "error");
    return true;
  }

  function findPaymentAuthorizationButton() {
    return [...document.querySelectorAll("button")].find((button) =>
      visible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
      /授權信用卡|信用卡.*確認訂位|支付訂金|前往付款|付款.*確認|預授權/.test((button.textContent || "").trim())
    ) || null;
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

  async function advance() {
    if (document.documentElement.dataset.inlineHelperVersion !== CONTENT_VERSION) {
      observer.disconnect();
      return;
    }
    if (busy) {
      pendingAdvance = true;
      return;
    }
    busy = true;
    let watchForProgress = false;
    try {
      if (!findManualConsentControl({ modalOnly: true })) hideConsentNotice();
      const stage = detectStage();
      const scope = await chrome.runtime.sendMessage({ type: "CHECK_FLOW_SCOPE", stage });
      if (!scope?.active) return;
      publishStage(stage);
      const { reservation } = await chrome.storage.local.get("reservation");
      if (!reservation?.enabled) return;
      watchForProgress = true;
      if (dateNavigationPending) {
        if (Date.now() - dateNavigationAt >= 5000) {
          watchForProgress = false;
          dateNavigationPending = false;
          await chrome.storage.local.set({ reservation: { ...reservation, enabled: false } });
          report("日期載入失敗", "已要求切換日期，但 inline 在 5 秒內未載入新頁面；請確認網路與頁面錯誤，再從外掛繼續。", "error");
        }
        return;
      }
      const helperUrl = new URLSearchParams(location.search).has("inline_helper");
      const state = JSON.parse(sessionStorage.getItem(HELPER_KEY) || "{}");
      const flowPath = /\/(?:form|payment|checkout|confirm|confirmation)\/?$/i.test(location.pathname);
      const detailsVisible = flowPath || hasBookingContactFields() || hasInteractivePaymentStep();
      if (detailsVisible && !state.detailsReached) {
        state.detailsReached = true;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
      }
      if (state.detailsReached && !detailsVisible) {
        watchForProgress = false;
        report("流程中斷", "已進入資料頁，現在卻回到選位頁；助手已停止重新找日期，請檢查目前頁面", "error");
        return;
      }

      if (hasCaptcha()) {
        showCaptchaNotice();
        report("CAPTCHA", "等待你手動完成人類驗證；完成後助手會繼續", "error");
        return;
      }
      hideCaptchaNotice();
      const modalConsentControl = findManualConsentControl({ modalOnly: true });
      if (waitForManualConsent(modalConsentControl)) return;
      hideConsentNotice();
      if (!helperUrl && !detailsVisible && !state.timeSelectedAt) {
        await navigateToDate(reservation, reservation.dateStart);
        return;
      }

      const adultPicker = detailsVisible ? null : document.querySelector("#adult-picker");
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

      const { lastSelectedDate } = await chrome.storage.local.get("lastSelectedDate");
      const shownDate = pageSelectedDate();
      if (adultPicker && shownDate && lastSelectedDate && shownDate.value !== lastSelectedDate) {
        const dateResult = selectTargetCalendarDate(lastSelectedDate, shownDate.element);
        if (["selected", "opening", "navigating"].includes(dateResult)) return;
        if (dateResult === "unavailable") {
          const following = nextDate(lastSelectedDate);
          if (following <= reservation.dateEnd) {
            await chrome.storage.local.set({ lastSelectedDate: following });
            report("下一天", `${lastSelectedDate} 無法選擇，接著檢查 ${following}`);
            setTimeout(advance, FAST_STEP_MS);
          } else {
            await chrome.storage.local.set({ reservation: { ...reservation, enabled: false } });
            report("沒有日期", `${reservation.dateStart} 至 ${reservation.dateEnd} 沒有可選日期`, "error");
          }
          return;
        }
        markNeedsAttention({ element: shownDate.element, label: "用餐日期" });
        report("日期失敗", `找不到 ${lastSelectedDate} 的月曆日期格，已停止以避免選錯日期`, "error");
        return;
      }
      if (adultPicker && selectBookingOption()) return;
      const selectedTime = selectedTimeButton();
      const selectedTimeIsValid = timeButtonIsInRange(selectedTime, reservation.timeStart, reservation.timeEnd);
      if (adultPicker && selectedTimeIsValid && (!state.timeSelectedAt || state.selectionVerifiedVersion !== CONTENT_VERSION)) {
        state.timeSelectedAt ||= Date.now();
        state.selectionVerifiedVersion = CONTENT_VERSION;
        delete state.pendingTimeSelection;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
      }
      if (adultPicker && !selectedTimeIsValid && state.timeSelectedAt &&
          (!state.bookingButtonClickedAt || state.selectionVerifiedVersion !== CONTENT_VERSION)) {
        // Older versions recorded a click before inline accepted the selection.
        delete state.timeSelectedAt;
        delete state.bookingButtonClickedAt;
        delete state.bookingButtonAttempts;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
      }
      if (adultPicker && !selectedTimeIsValid && !state.timeSelectedAt) {
        const scanDate = lastSelectedDate || reservation.dateStart;
        const rejected = state.rejectedTimes?.[scanDate] || [];
        const pending = state.pendingTimeSelection;
        if (pending && pending.date === scanDate) {
          if (Date.now() - pending.clickedAt < 1500) {
            report("確認時段", "已按時段，正在確認 inline 是否接受選取");
            return;
          }
          if (pending.attempts >= 3) {
            state.rejectedTimes ||= {};
            state.rejectedTimes[scanDate] = [...new Set([...rejected, pending.minutes])];
            delete state.pendingTimeSelection;
            sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
            report("時段未接受", "inline 未接受這個時段，正在檢查其他可用時段");
            return;
          }
        }
        const timeButton = findTimeButtonInRange(reservation.timeStart, reservation.timeEnd, rejected);
        if (timeButton) {
          const minutes = InlineHelperCommon.timeToMinutes(timeButton.textContent);
          state.pendingTimeSelection = { date: scanDate, minutes, clickedAt: Date.now(),
            attempts: pending?.date === scanDate && pending.minutes === minutes ? pending.attempts + 1 : 1 };
          sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
          report("選時段", `正在選擇 ${(timeButton.textContent || "").trim()}`);
          timeButton.click();
          return;
        }
        const loading = [...document.querySelectorAll('[aria-busy="true"], [role="progressbar"]')].some(visible);
        const noAvailability = /(?:當日|本日|當天|此日期|所選日期).{0,20}(?:無|沒有|已無).{0,10}(?:空位|時段)|沒有可預訂的時段|無可用時段/.test(pageText());
        if (!loading && (findTimeButtons({ includeUnavailable: true }).length || noAvailability)) {
          const current = lastSelectedDate || reservation.dateStart;
          const following = nextDate(current);
          if (following <= reservation.dateEnd) {
            report("下一天", `${current} 沒有區間內時段，接著檢查 ${following}`);
            await navigateToDate(reservation, following);
          } else {
            await chrome.storage.local.set({ reservation: { ...reservation, enabled: false } });
            report("沒有空位", `${reservation.dateStart} 至 ${reservation.dateEnd} 沒有找到 ${reservation.timeStart}–${reservation.timeEnd}`, "error");
          }
          return;
        }
      }

      if ((selectedTimeIsValid || !adultPicker) && !hasBookingContactFields() && !hasInteractivePaymentStep()) {
        const safeSkipButton = findSafeOptionalSkipButton();
        if (safeSkipButton) {
          const label = buttonText(safeSkipButton);
          const signature = `${location.pathname}|${label}`;
          if (state.lastSafeSkipSignature === signature && Date.now() - Number(state.lastSafeSkipAt || 0) < 1500) {
            report("等待換頁", `已按「${label}」，正在確認頁面是否前進`);
            return;
          }
          state.lastSafeSkipSignature = signature;
          state.lastSafeSkipAt = Date.now();
          sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
          report("略過選購", `已辨識可略過的額外選購「${label}」，正在繼續訂位`);
          safeSkipButton.click();
          return;
        }
      }
      if (adultPicker && (selectedTimeIsValid || state.timeSelectedAt)) {
        const bookingButton = findBookingDetailsButton();
        if (bookingButton && !bookingButton.disabled &&
            (!state.bookingButtonClickedAt || (selectedTimeIsValid &&
              Date.now() - state.bookingButtonClickedAt >= 1500 &&
              Number(state.bookingButtonAttempts || 1) < 3))) {
          state.bookingButtonAttempts = Number(state.bookingButtonAttempts || (state.bookingButtonClickedAt ? 1 : 0)) + 1;
          state.timeSelectedAt ||= Date.now();
          state.bookingButtonClickedAt = Date.now();
          sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
          report("下一步", "正在進入訂位資料頁");
          bookingButton.click();
          return;
        }
      }

      if (state.timeSelectedAt && !detailsVisible) {
        if (Date.now() - state.timeSelectedAt >= 15000) {
          watchForProgress = false;
          await chrome.storage.local.set({ reservation: { ...reservation, enabled: false } });
          report("資料頁未開啟", "inline 在選時段後 15 秒仍未開啟資料頁；請檢查時段是否已選取、下一步是否可按，或頁面是否有錯誤提示，再從外掛繼續。", "error");
          return;
        }
        report("等待資料頁", "已選擇符合條件的時段，正在等待 inline 開啟資料頁；不會重新找日期");
        return;
      }

      const contact = contactFields();
      for (const [input, value, label] of [
        [contact.phone, reservation.contactPhone, "手機"],
        [contact.email, reservation.contactEmail, "Email"]
      ]) {
        if (!input || !value || String(input.value || "").trim()) continue;
        const filled = fillField(input, value);
        report(filled ? "已填寫" : "填寫失敗", filled ? `已填入${label}` : `${label}欄位未接受填入，請手動完成`, filled ? "ok" : "error");
        if (filled) setTimeout(advance, FAST_STEP_MS);
        return;
      }
      const nameMissing = Boolean(reservation.contactName && (
        (contact.family && !String(contact.family.value || "").trim()) ||
        (contact.given && !String(contact.given.value || "").trim()) ||
        (contact.name && !String(contact.name.value || "").trim())
      ));
      if (nameMissing) {
        const filled = fillContactName(reservation.contactName);
        report(filled ? "已填寫" : "填寫失敗", filled ? "已填入訂位姓名" : "姓名欄位未接受填入，請手動完成", filled ? "ok" : "error");
        if (filled) setTimeout(advance, FAST_STEP_MS);
        return;
      }
      if (chooseDiningPurpose(reservation)) return;

      hideConsentNotice();

      if (hasInteractivePaymentStep()) {
        await chrome.storage.local.set({ reservation: { ...reservation, enabled: false } });
        report("待手動付款", "聯絡資料已填妥；請在 inline 頁面自行填寫信用卡並確認付款。", "ok");
        return;
      }

      const manualConsentControl = findManualConsentControl();
      if (waitForManualConsent(manualConsentControl)) return;

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

      const paymentAuthorizationButton = findPaymentAuthorizationButton();
      if (paymentAuthorizationButton) {
        await chrome.storage.local.set({ reservation: { ...reservation, enabled: false } });
        report("待手動授權", "已停在付款／信用卡授權按鈕前；請自行核對金額並操作，外掛不會按付款", "error");
        return;
      }

      const finalButton = exactButton("確認預訂", "確認訂位", "送出訂位", "完成訂位", "送出預訂");
      if (finalButton) {
        await chrome.storage.local.set({
          reservation: { ...reservation, enabled: false },
          previewCompletedAt: Date.now()
        });
        showPreviewComplete();
        report("待手動確認", "資料已填妥；外掛已停止，請自行核對並按最後確認訂位", "ok");
        return;
      }
      report("等待頁面", "資料已填妥，等待 inline 顯示下一步；外掛不會自動付款或送出訂位");
    } catch (error) {
      watchForProgress = false;
      report("發生錯誤", `訂位頁處理失敗：${error?.message || "頁面流程無法繼續"}`, "error");
    } finally {
      busy = false;
      if (pendingAdvance) {
        pendingAdvance = false;
        scheduleAdvance();
      } else if (watchForProgress) {
        scheduleAdvance(250);
      }
    }
  }

  function isHelperMutation(record) {
    const ownedNode = (node) => Boolean(node?.id?.startsWith("inline-helper-") ||
      node?.parentElement?.closest?.('[id^="inline-helper-"]'));
    if (record.type === "attributes" && record.target === document.documentElement &&
      record.attributeName?.startsWith("data-inline-helper-")) return true;
    if (ownedNode(record.target)) return true;
    const nodes = [...(record.addedNodes || []), ...(record.removedNodes || [])];
    return nodes.length > 0 && nodes.every(ownedNode);
  }

  const observer = new MutationObserver((records = []) => {
    if (records.length && records.every(isHelperMutation)) return;
    scheduleAdvance();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  document.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleAdvance();
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (document.documentElement.dataset.inlineHelperVersion !== CONTENT_VERSION) return false;
    if (message.type === "ADVANCE_FLOW") {
      advance();
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "FILL_CONTACT_DETAILS") {
      (async () => {
        const scope = await chrome.runtime.sendMessage({ type: "CHECK_FLOW_SCOPE", stage: "contact" });
        const { reservation } = await chrome.storage.local.get("reservation");
        if (!scope?.active || !reservation || !hasBookingContactFields()) {
          return { ok: false, error: "目前不是這次任務的訂位資料頁，請切回原訂位分頁。" };
        }
        const fields = contactFields();
        if (fields.phone && reservation.contactPhone) fillField(fields.phone, reservation.contactPhone);
        if (fields.email && reservation.contactEmail) fillField(fields.email, reservation.contactEmail);
        if (reservation.contactName) fillContactName(reservation.contactName);
        chooseDiningPurpose(reservation);
        const nameAccepted = Boolean(String(fields.name?.value || fields.family?.value || "").trim());
        const phoneAccepted = Boolean(String(fields.phone?.value || "").trim());
        if (!nameAccepted || !phoneAccepted) {
          report("補填失敗", "姓名或手機欄位未接受填入，請在 inline 頁面手動完成", "error");
          return { ok: false, error: "姓名或手機欄位未接受填入，請在 inline 頁面手動完成。" };
        }
        publishStage(detectStage());
        report("待手動付款", "聯絡資料已填入；信用卡位於金流 iframe，請在 inline 頁面手動填寫並確認");
        return { ok: true };
      })().then(sendResponse).catch(() => sendResponse({ ok: false, error: "聯絡資料填入失敗，請在 inline 頁面手動完成。" }));
      return true;
    }
    return false;
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (document.documentElement.dataset.inlineHelperVersion !== CONTENT_VERSION) {
      observer.disconnect();
      return;
    }
    if (areaName === "local" && changes.reservation?.newValue?.enabled &&
        !changes.reservation?.oldValue?.enabled) {
      dateNavigationPending = false;
      const state = JSON.parse(sessionStorage.getItem(HELPER_KEY) || "{}");
      if (state.timeSelectedAt && !state.detailsReached) {
        state.timeSelectedAt = Date.now();
        delete state.bookingButtonClickedAt;
        delete state.bookingButtonAttempts;
        delete state.pendingTimeSelection;
        delete state.rejectedTimes;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
      }
    }
    if (areaName === "local" && (changes.activeReservationTabId || changes.reservation)) advance();
  });
  advance();
})();
