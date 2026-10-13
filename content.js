(() => {
  const HELPER_KEY = "inlineHelperFlowV2";
  const CONTENT_VERSION = "0.3.30";
  const FAST_STEP_MS = 80;
  const NAVIGATION_STEP_MS = 240;
  if (document.documentElement.dataset.inlineHelperVersion === CONTENT_VERSION) return;
  let busy = false;

  document.documentElement.dataset.inlineHelperVersion = CONTENT_VERSION;
  chrome.runtime.sendMessage({ type: "CONTENT_READY", version: CONTENT_VERSION, url: location.href }).catch(() => {});

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
      <p class="sr-only" role="status" aria-live="assertive" aria-atomic="true">預演完成，尚未送出訂位。</p>
      <section class="card" role="dialog" aria-modal="true" aria-labelledby="inline-helper-preview-title" aria-describedby="inline-helper-preview-description">
        <div class="head">
          <span class="icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <h2 id="inline-helper-preview-title">預演完成</h2>
        </div>
        <div class="body">
          <p class="lead">已找到可用時段，並填妥目前頁面的訂位資料。</p>
          <p class="warning">尚未送出訂位</p>
          <p class="note" id="inline-helper-preview-description">這是預演結果，不代表訂位成功。插件沒有按下最後的確認訂位按鈕。</p>
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
    const control = document.querySelector([
      'input[autocomplete^="cc-"]', 'input[name*="card" i]', 'input[id*="card" i]',
      'input[autocomplete="one-time-code"]', 'input[name*="otp" i]', 'input[id*="otp" i]',
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
    return Boolean([...document.querySelectorAll('input[type="tel"], input[type="email"], input[autocomplete="name"], input[autocomplete="family-name"]')].find(visible));
  }

  function detectStage() {
    const contact = hasBookingContactFields();
    const optionalSkip = Boolean(findSafeOptionalSkipButton());
    const finalConfirmation = Boolean(exactButton("確認預訂", "確認訂位", "送出訂位", "完成訂位", "送出預訂"));
    const dateOrTime = Boolean(document.querySelector("#adult-picker, #kid-picker, .time-slot"));
    return InlineHelperCommon.classifyBookingStage({
      captcha: Boolean(hasCaptcha()),
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
    element.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.blur();
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

  function fillContactName(value) {
    if (!value) return false;
    const familyInput = document.querySelector('#familyName, input[autocomplete="family-name"]');
    const givenInput = document.querySelector('#givenName, input[autocomplete="given-name"]');
    if ((familyInput && visible(familyInput)) || (givenInput && visible(givenInput))) {
      const { familyName, givenName } = InlineHelperCommon.splitContactName(value);
      const familyChanged = fillInput(['#familyName', 'input[autocomplete="family-name"]'], familyName);
      const givenChanged = fillInput(['#givenName', 'input[autocomplete="given-name"]'], givenName);
      return familyChanged || givenChanged;
    }
    return fillInput(['#name', 'input[autocomplete="name"]'], value) || fillByHint(/訂位人姓名|訂位人|姓名/i, value);
  }

  function contactValuesMatch(reservation) {
    const familyInput = document.querySelector('#familyName, input[autocomplete="family-name"]');
    const givenInput = document.querySelector('#givenName, input[autocomplete="given-name"]');
    let nameMatches = true;
    if ((familyInput && visible(familyInput)) || (givenInput && visible(givenInput))) {
      const split = InlineHelperCommon.splitContactName(reservation.contactName);
      nameMatches = (!familyInput || String(familyInput.value || "").trim() === split.familyName) &&
        (!givenInput || String(givenInput.value || "").trim() === split.givenName);
    } else {
      const nameInput = document.querySelector('#name, input[autocomplete="name"]');
      if (nameInput && visible(nameInput)) nameMatches = String(nameInput.value || "").trim() === String(reservation.contactName || "").trim();
    }
    const phoneInput = [...document.querySelectorAll('#phone, input[type="tel"]')].find(visible);
    const emailInput = [...document.querySelectorAll('#email, input[type="email"]')].find(visible);
    const phoneMatches = !phoneInput || String(phoneInput.value || "").replace(/\D/g, "") === String(reservation.contactPhone || "").replace(/\D/g, "");
    const emailMatches = !emailInput || !reservation.contactEmail || String(emailInput.value || "").trim().toLowerCase() === String(reservation.contactEmail).trim().toLowerCase();
    return nameMatches && phoneMatches && emailMatches;
  }

  function fillNextContactField(reservation) {
    if (fillContactName(reservation.contactName)) return "姓名";
    if (fillInput(['#phone', 'input[type="tel"]'], reservation.contactPhone) || fillByHint(/手機|電話|phone|mobile|tel/i, reservation.contactPhone)) return "手機";
    if (fillInput(['#email', 'input[type="email"]'], reservation.contactEmail) || fillByHint(/email|e-mail|電子信箱|信箱/i, reservation.contactEmail)) return "Email";
    return "";
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
    const purposeChoices = [...document.querySelectorAll('[role="checkbox"], [role="radio"]')].filter((item) => {
      let parent = item.parentElement;
      for (let depth = 0; depth < 4 && parent; depth += 1, parent = parent.parentElement) {
        if (/用餐目的/.test(parent.innerText || "")) return true;
      }
      return false;
    });
    if (!purposeChoices.length || purposeChoices.some(controlIsSelected)) return false;
    const aliases = wanted === "朋友聚餐" ? ["朋友聚餐", "一般聚餐", "親友聚餐", "同住親友聚餐"] : [wanted];
    const choiceText = (item) => String(item.textContent || item.getAttribute("aria-label") ||
      (item.labels ? [...item.labels].map((label) => label.textContent).join(" ") : "")).trim();
    const choice = aliases.map((label) => purposeChoices.find((item) => choiceText(item) === label)).find(Boolean);
    if (!choice || controlIsSelected(choice)) return false;
    choice.click();
    report("填目的", `已選擇用餐目的：${choiceText(choice) || wanted}`);
    return true;
  }

  function diningPurposeNeedsAttention() {
    const choices = [...document.querySelectorAll('[role="checkbox"], [role="radio"]')].filter((item) => {
      let parent = item.parentElement;
      for (let depth = 0; depth < 4 && parent; depth += 1, parent = parent.parentElement) {
        if (/用餐目的/.test(parent.innerText || "")) return true;
      }
      return false;
    });
    if (!choices.length || choices.some(controlIsSelected)) return null;
    return { element: choices[0].parentElement || choices[0], label: "用餐目的" };
  }

  function findManualConsentControl({ modalOnly = false } = {}) {
    return [...document.querySelectorAll('button, [role="button"], [role="checkbox"], label')].find((element) =>
      visible(element) && InlineHelperCommon.isAutoConsentText(element.textContent) &&
      consentControlIsActionable(element) &&
      (!modalOnly || Boolean(element.closest('[role="dialog"], [aria-modal="true"]')))
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

  function acceptManualConsent(control) {
    if (!control) return false;
    const target = interactiveControl(control);
    if (controlIsSelected(target)) return false;
    const disabled = target.disabled || target.getAttribute("aria-disabled") === "true";
    if (disabled) {
      const scope = target.closest('[role="dialog"], [aria-modal="true"]') || document;
      const scrollable = [scope, ...scope.querySelectorAll("div, section, main")].find((element) =>
        element.scrollHeight > element.clientHeight + 8
      );
      if (scrollable) {
        scrollable.scrollTop = scrollable.scrollHeight;
        scrollable.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
      report("閱讀條款", "正在捲到規則與注意事項底部，完成後會自動同意");
      setTimeout(advance, NAVIGATION_STEP_MS);
      return true;
    }
    target.click();
    report("已同意條款", "已按下規則與注意事項的同意按鈕；尚未填寫或授權信用卡");
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

  function isSuccessPage() {
    return /\/(success|complete|confirmation)(\/|$)/i.test(location.pathname) || /訂位成功|預約成功|已完成訂位/.test(pageText());
  }

  async function advance() {
    if (busy) return;
    busy = true;
    try {
      const scope = await chrome.runtime.sendMessage({ type: "CHECK_FLOW_SCOPE" });
      if (!scope?.active) return;
      const { reservation } = await chrome.storage.local.get("reservation");
      if (!reservation?.enabled) return;
      const helperUrl = new URLSearchParams(location.search).has("inline_helper");
      const state = JSON.parse(sessionStorage.getItem(HELPER_KEY) || "{}");
      publishStage(detectStage());

      if (isSuccessPage()) {
        await chrome.storage.local.set({ reservation: { ...reservation, enabled: false }, flowLeaseUntil: 0, flowStatus: "訂位完成" });
        report("完成", "inline 已顯示訂位成功");
        return;
      }
      if (hasCaptcha()) {
        showCaptchaNotice();
        report("CAPTCHA", "等待你手動完成人類驗證；完成後助手會繼續", "error");
        return;
      }
      hideCaptchaNotice();
      const modalConsentControl = findManualConsentControl({ modalOnly: true });
      if (acceptManualConsent(modalConsentControl)) return;
      if (!helperUrl && !/\/form\/?$/.test(location.pathname)) {
        navigateToDate(reservation, reservation.dateStart);
        return;
      }

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
      if (adultPicker && !selectedTimeIsValid) {
        const timeButton = findTimeButtonInRange(reservation.timeStart, reservation.timeEnd);
        if (timeButton) {
          report("選時段", `正在選擇 ${(timeButton.textContent || "").trim()}`);
          timeButton.click();
          return;
        }
        if (findTimeButtons().length || document.querySelector(".time-slot")) {
          const current = lastSelectedDate || reservation.dateStart;
          const following = nextDate(current);
          const scanCount = Number(state.scanCount || 0) + 1;
          state.scanCount = scanCount;
          sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
          if (following <= reservation.dateEnd && scanCount < 14) {
            report("下一天", `${current} 沒有區間內時段，接著檢查 ${following}`);
            setTimeout(() => navigateToDate(reservation, following), NAVIGATION_STEP_MS);
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
      if (adultPicker && selectedTimeIsValid) {
        const bookingButton = exactButton("完成預訂", "填寫訂位資料", "下一步");
        if (bookingButton) {
          report("下一步", "正在進入訂位資料頁");
          bookingButton.click();
          return;
        }
      }

      const changedContact = fillNextContactField(reservation);
      if (changedContact) {
        report("填寫資料", `正在填寫並確認${changedContact}`);
        setTimeout(advance, NAVIGATION_STEP_MS);
        return;
      }
      if (hasBookingContactFields() && !contactValuesMatch(reservation)) {
        report("資料未寫入", "Inline 清除了聯絡資料，助手會停止以避免空白送出", "error");
        return;
      }
      if (chooseDiningPurpose(reservation)) return;
      const missingPurpose = diningPurposeNeedsAttention();
      if (missingPurpose) {
        markNeedsAttention(missingPurpose);
        report("缺必填", "找不到可安全對應的用餐目的，請手動選擇", "error");
        return;
      }
      if (hasBookingContactFields()) report("已填寫", "姓名、手機與 Email 已逐欄確認寫入");

      const manualConsentControl = findManualConsentControl();
      if (manualConsentControl && state.authorizationStepAttemptedAt) {
        delete state.authorizationStepAttemptedAt;
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
      }
      if (acceptManualConsent(manualConsentControl)) return;

      if (hasInteractivePaymentStep()) {
        report("需填信用卡", "訂位資料已自動填妥；信用卡、OTP 或付款驗證請由你手動完成", "error");
        return;
      }

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
        if (state.authorizationStepAttemptedAt) {
          report("進入確認頁", "已按過前往確認頁，正在等待 inline 顯示最終確認資料");
          return;
        }
        state.authorizationStepAttemptedAt = Date.now();
        sessionStorage.setItem(HELPER_KEY, JSON.stringify(state));
        report("進入確認頁", "條款與金額已處理，正在開啟最終確認資料頁");
        paymentAuthorizationButton.click();
        return;
      }

      const finalButton = exactButton("確認預訂", "確認訂位", "送出訂位", "完成訂位", "送出預訂");
      const finalAction = InlineHelperCommon.finalSubmitAction({
        autoSubmit: reservation.autoSubmit,
        submitAttemptedAt: state.submitAttemptedAt,
        hasFinalButton: Boolean(finalButton)
      });
      if (finalAction === "processing") {
        report("預演處理中", "資料已填妥，正在等待 inline 顯示最終確認步驟");
        return;
      }
      if (finalAction === "preview") {
        await chrome.storage.local.set({
          reservation: { ...reservation, enabled: false },
          flowLeaseUntil: 0,
          previewCompletedAt: Date.now()
        });
        showPreviewComplete();
        report("預演完成", "預演完成：已找到可用時段並填妥資料；沒有送出訂位");
        return;
      }
      if (finalAction === "wait") {
        report("請確認", "已送出一次，但尚未看到成功頁；為避免重複訂位，請查看頁面訊息", "error");
        return;
      }
      if (finalAction === "submit") {
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
    observer.timer = setTimeout(advance, FAST_STEP_MS);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.activeReservationTabId || changes.reservation)) advance();
  });
  advance();
})();
