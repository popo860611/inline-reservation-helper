const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
require(path.join(root, "common.js"));
const common = globalThis.InlineHelperCommon;
const bookingUrl = "https://inline.app/booking/-company/-branch";

function paymentInput(label, value = "") {
  return {
    id: "", name: "", placeholder: "", autocomplete: "", type: "text", value,
    disabled: false, readOnly: false, labels: [{ textContent: label }],
    getAttribute: () => null,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 200, height: 40 }),
    dispatchEvent: () => {}
  };
}

async function testContactFill(initialName, expectedName, enabled = true) {
  const inputs = [
    paymentInput("手機"),
    paymentInput("Email"),
    paymentInput("訂位人姓名", initialName)
  ];
  const timers = [];
  const reservation = {
    enabled, contactName: "測試姓名", contactPhone: "0912345678",
    contactEmail: "test@example.com", dateStart: "2026-10-14", dateEnd: "2026-10-14",
    timeStart: "12:00", timeEnd: "12:00"
  };
  const document = {
    documentElement: { dataset: {} }, body: { innerText: "" },
    querySelectorAll: (selector) => selector === "input" ? inputs : [],
    querySelector: () => null
  };
  let messageHandler;
  const chrome = {
    runtime: {
      sendMessage: async (message) => message.type === "CHECK_FLOW_SCOPE" ? { active: true } : { ok: true },
      onMessage: { addListener: (handler) => { messageHandler = handler; } }
    },
    storage: {
      local: {
        get: async () => ({ reservation, lastSelectedDate: undefined }),
        set: async () => {}
      },
      onChanged: { addListener: () => {} }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), {
    document, chrome, InlineHelperCommon: common,
    location: { href: `${bookingUrl}/form`, search: "", pathname: "/booking/-company/-branch/form" },
    URLSearchParams,
    sessionStorage: { getItem: () => null, setItem: () => {} },
    MutationObserver: class { observe() {} },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    Event: class { constructor(type) { this.type = type; } },
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    clearTimeout: () => {}
  });
  if (!enabled) {
    await new Promise(setImmediate);
    assert.deepEqual(inputs.map((input) => input.value), ["", "", initialName]);
    const result = await new Promise((resolve) => messageHandler({ type: "FILL_CONTACT_DETAILS" }, {}, resolve));
    assert.equal(result.ok, true);
  }
  for (let step = 0; step < 5; step += 1) {
    await new Promise(setImmediate);
    if (!timers.length) break;
    timers.shift()();
  }
  await new Promise(setImmediate);
  assert.deepEqual(inputs.map((input) => input.value), ["0912345678", "test@example.com", expectedName]);
}

async function testDateScanStopsAfterTimeOrDetails() {
  async function runScenario({ offerTime, revealDetailsBeforeTimer }) {
    let showTime = true;
    let showDetails = false;
    let timeClicks = 0;
    let redirects = 0;
    let observerCallback;
    const timers = [];
    const saved = new Map();
    const reservation = {
      enabled: true, restaurantQuery: bookingUrl,
      dateStart: "2026-10-19", dateEnd: "2026-10-22",
      timeStart: "17:30", timeEnd: "18:00"
    };
    const adultPicker = { value: "2", options: [{ value: "2", textContent: "2位大人" }] };
    const timeButton = {
      tagName: "BUTTON", textContent: `${offerTime ? "17:30" : "11:30"} NT$200 x 2`, disabled: false,
      classList: { contains: () => false }, getAttribute: () => null,
      getBoundingClientRect: () => ({ width: 200, height: 40 }),
      click: () => { timeClicks += 1; showTime = false; }
    };
    const phone = paymentInput("手機");
    const document = {
      documentElement: { dataset: {} }, body: { innerText: "" },
      querySelector: (selector) => selector === "#adult-picker" ? adultPicker : null,
      querySelectorAll: (selector) => selector === "input" ? (showDetails ? [phone] : []) :
        selector === "button" || selector.includes('button, [role="button"]') ? (showTime ? [timeButton] : []) : []
    };
    const location = {
      href: `${bookingUrl}?inline_helper=1`, search: "?inline_helper=1",
      pathname: "/booking/-company/-branch", replace: () => { redirects += 1; }
    };
    const chrome = {
      runtime: {
        sendMessage: async (message) => message.type === "CHECK_FLOW_SCOPE" ? { active: true } : { ok: true },
        onMessage: { addListener: () => {} }
      },
      storage: {
        local: {
          get: async () => ({ reservation, lastSelectedDate: "2026-10-19" }),
          set: async () => { if (revealDetailsBeforeTimer) showDetails = true; }
        },
        onChanged: { addListener: () => {} }
      }
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), {
      document, chrome, InlineHelperCommon: common, location, URLSearchParams,
      sessionStorage: { getItem: (key) => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
      MutationObserver: class { constructor(callback) { observerCallback = callback; } observe() {} },
      getComputedStyle: () => ({ display: "block", visibility: "visible" }),
      setTimeout: (callback) => { timers.push(callback); return timers.length; }, clearTimeout: () => {},
      Date
    });
    await new Promise(setImmediate);
    if (offerTime) {
      assert.equal(timeClicks, 1);
      observerCallback();
      for (let step = 0; step < 4 && timers.length; step += 1) { timers.shift()(); await new Promise(setImmediate); }
      assert.equal(timeClicks, 1);
      assert.equal(redirects, 0);
    } else {
      await new Promise(setImmediate);
      assert.equal(redirects, 0);
    }
  }
  await runScenario({ offerTime: true });
  await runScenario({ offerTime: false, revealDetailsBeforeTimer: true });
}

async function testDateRangeScansEveryDay() {
  const reservation = { enabled: true, restaurantQuery: bookingUrl, adults: 2,
    dateStart: "2026-10-17", dateEnd: "2026-10-30", timeStart: "17:30", timeEnd: "19:30" };
  const saved = new Map([["inlineHelperFlowV2", JSON.stringify({ scanCount: 14 })]]);
  let current = reservation.dateStart;
  let now = 10000;
  class TestDate extends Date { static now() { return now; } }
  let observerCallback;
  let redirects = [];
  let pendingWrite;
  let releaseWrite;
  let countWrites = 0;
  const statuses = [];
  const time = { tagName: "BUTTON", textContent: "17:30", disabled: true,
    classList: { contains: (name) => name === "full" }, getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 40 }),
    click: () => { throw new Error("Never select a full slot"); } };
  const mount = () => {
    const timers = new Map();
    let timerId = 0;
    const chrome = {
      runtime: { sendMessage: async (message) => { statuses.push(message); return { active: true }; }, onMessage: { addListener() {} } },
      storage: { local: {
        get: async () => ({ reservation, lastSelectedDate: current }),
        set: async (value) => {
          if (value.lastSelectedDate) { countWrites += 1; current = value.lastSelectedDate; if (pendingWrite) await pendingWrite; }
          if (value.reservation) Object.assign(reservation, value.reservation);
        }
      }, onChanged: { addListener() {} } }
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), {
      document: { documentElement: { dataset: {} }, body: { innerText: "" },
        querySelector: (selector) => selector === "#adult-picker" ? { value: "2", options: [] } : null,
        querySelectorAll: (selector) => selector === "button" ? [time] : [] },
      chrome, InlineHelperCommon: common, URLSearchParams, Date: TestDate, btoa: (value) => Buffer.from(value, "binary").toString("base64"),
      location: { href: `${bookingUrl}?inline_helper=1`, search: "?inline_helper=1", pathname: "/booking/-company/-branch", replace: (url) => redirects.push(url) },
      sessionStorage: { getItem: (key) => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
      MutationObserver: class { constructor(callback) { observerCallback = callback; } observe() {} disconnect() {} },
      getComputedStyle: () => ({ display: "block", visibility: "visible" }),
      setTimeout: (callback) => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: (id) => timers.delete(id)
    });
    return timers;
  };
  pendingWrite = new Promise((resolve) => { releaseWrite = resolve; });
  const timers = mount();
  await new Promise(setImmediate);
  for (let i = 0; i < 20; i += 1) observerCallback();
  const [id, callback] = timers.entries().next().value;
  timers.delete(id); callback();
  releaseWrite(); pendingWrite = null;
  await new Promise(setImmediate);
  assert.equal(countWrites, 1, "DOM changes must not duplicate next-day navigation");
  assert.equal(redirects.length, 1);
  assert.equal(current, "2026-10-18");
  for (let day = 18; day <= 30; day += 1) {
    mount();
    await new Promise(setImmediate);
  }
  assert.equal(current, "2026-10-30");
  assert.equal(countWrites, 13, "Scan through the configured last day despite stale scan counters");
  assert.equal(redirects.length, 13);
  assert.equal(reservation.enabled, false);
  assert.ok(statuses.some((message) => message.status === "沒有空位"));
  reservation.enabled = true;
  current = reservation.dateStart;
  const stalledTimers = mount();
  await new Promise(setImmediate);
  now += 6000;
  const [stalledId, stalledCheck] = stalledTimers.entries().next().value;
  stalledTimers.delete(stalledId); stalledCheck();
  await new Promise(setImmediate);
  assert.equal(reservation.enabled, false);
  assert.ok(statuses.some((message) => message.status === "日期載入失敗"));
}

async function testTimeSelectionAcceptance(accept, footerOnly = false, nextLabel = "下一步，填寫訂位資料", onForm = false, withdrawn = false) {
  let now = 10000;
  class TestDate extends Date { static now() { return now; } }
  let selected = onForm;
  let withdrawnAfterClick = false;
  let slotClicks = 0;
  let nextClicks = 0;
  let redirects = 0;
  const timers = new Map();
  let timerId = 0;
  const saved = new Map([["inlineHelperFlowV2", JSON.stringify({ timeSelectedAt: 1000 })]]);
  const reservation = { enabled: true, restaurantQuery: bookingUrl, adults: 2,
    dateStart: "2026-10-17", dateEnd: "2026-10-30", timeStart: "17:30", timeEnd: "19:30" };
  const slot = { tagName: "BUTTON", textContent: "10月17日17:30", get disabled() { return footerOnly || withdrawnAfterClick; },
    classList: { contains: (name) => name === "time-slot" || ((footerOnly || withdrawnAfterClick) && name === "full") },
    getAttribute: () => null, getBoundingClientRect: () => ({ width: 100, height: 40 }),
    click: () => { slotClicks += 1; selected = accept; } };
  const summary = { ...slot, textContent: "17:30", disabled: false,
    classList: { contains: () => false },
    click: () => { throw new Error("A booking summary is not an available slot"); } };
  const next = { ...summary, textContent: nextLabel,
    get disabled() { return !selected; }, click: () => { nextClicks += 1; if (withdrawn) { selected = false; withdrawnAfterClick = true; } } };
  const chrome = {
    runtime: { sendMessage: async () => ({ active: true }), onMessage: { addListener() {} } },
    storage: { local: { get: async () => ({ reservation, lastSelectedDate: "2026-10-17" }), set: async () => {} }, onChanged: { addListener() {} } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), {
    document: { documentElement: { dataset: {} }, body: { innerText: "" },
      querySelector: (selector) => selector === "#adult-picker" ? { value: "2", options: [] } : null,
      querySelectorAll: (selector) => selector === "button" ? [slot, summary, next] : [] },
    chrome, InlineHelperCommon: common, URLSearchParams, Date: TestDate,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    location: { href: `${bookingUrl}?inline_helper=1`, search: "?inline_helper=1", pathname: onForm ? "/booking/-company/-branch/form" : "/booking/-company/-branch", replace: () => { redirects += 1; } },
    sessionStorage: { getItem: (key) => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    setTimeout: (callback) => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: (id) => timers.delete(id)
  });
  await new Promise(setImmediate);
  if (!accept && !footerOnly) {
    assert.equal(JSON.parse(saved.get("inlineHelperFlowV2")).timeSelectedAt, undefined,
      "Clicking a slot must not count as an accepted selection");
  }
  for (let step = 0; step < 20 && timers.size && !redirects && (!nextClicks || withdrawn); step += 1) {
    now += 500;
    const [id, callback] = timers.entries().next().value;
    timers.delete(id); callback();
    await new Promise(setImmediate);
  }
  if (onForm) {
    assert.equal(slotClicks, 0);
    assert.equal(nextClicks, 0, "Never click 完成預訂 on a contact form");
    assert.equal(redirects, 0);
  } else if (withdrawn) {
    assert.equal(slotClicks, 1);
    assert.equal(nextClicks, 1);
    assert.equal(redirects, 1, "Server withdrawal must resume date scanning instead of waiting for details");
  } else if (accept) {
    assert.equal(slotClicks, 1);
    assert.equal(nextClicks, 1, "Recognize inline selection in the footer and the next-button wording");
    assert.equal(redirects, 0);
    assert.ok(JSON.parse(saved.get("inlineHelperFlowV2")).timeSelectedAt);
  } else {
    assert.equal(slotClicks, footerOnly ? 0 : 3);
    assert.equal(nextClicks, 0);
    assert.equal(redirects, 1, "Unaccepted or full slots must continue the date search");
  }
}

async function testWaitingFlowRecovers() {
  let now = 10000;
  let observerCallback;
  let visibilityCallback;
  let active = true;
  let scopeRequests = 0;
  let releaseScope;
  let storageCallback;
  let clicks = 0;
  let reservation = { enabled: true, adults: 2, timeStart: "17:30", timeEnd: "18:00" };
  const messages = [];
  const timers = new Map();
  const saved = new Map();
  let timerId = 0;
  const time = {
    tagName: "BUTTON", textContent: "17:30", disabled: false,
    classList: { contains: (name) => name === "selected" }, getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 40 })
  };
  const next = { ...time, textContent: "填寫訂位資料", click: () => { clicks += 1; } };
  const document = {
    documentElement: { dataset: {} }, body: { innerText: "" }, visibilityState: "visible",
    addEventListener: (_name, callback) => { visibilityCallback = callback; },
    querySelector: (selector) => selector === "#adult-picker" ? { value: "2", options: [] } : null,
    querySelectorAll: (selector) => selector === "button" || selector === 'button, [role="button"]' ? [time, next] : []
  };
  const chrome = {
    runtime: {
      sendMessage: async (message) => {
        messages.push(message);
        if (message.type !== "CHECK_FLOW_SCOPE") return {};
        scopeRequests += 1;
        if (scopeRequests === 1) return new Promise((resolve) => { releaseScope = resolve; });
        return { active };
      }, onMessage: { addListener() {} }
    },
    storage: { local: { get: async () => ({ reservation }), set: async (value) => { reservation = value.reservation; } }, onChanged: { addListener(callback) { storageCallback = callback; } } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), {
    document, chrome, InlineHelperCommon: common,
    location: { href: `${bookingUrl}?inline_helper=1`, search: "?inline_helper=1", pathname: "/booking/-company/-branch" },
    URLSearchParams, sessionStorage: { getItem: (key) => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    MutationObserver: class { constructor(callback) { observerCallback = callback; } observe() {} disconnect() {} },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    Date: { now: () => now },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id)
  });
  const tick = async () => {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id);
    timer.callback();
    await new Promise(setImmediate);
  };
  // Many site updates must retain one runnable check, even during an awaited scope request.
  for (let i = 0; i < 20; i += 1) observerCallback();
  assert.equal(timers.size, 1);
  await tick();
  assert.equal(scopeRequests, 1);
  releaseScope({ active: true });
  await new Promise(setImmediate);
  assert.equal(clicks, 1, JSON.stringify(messages));
  assert.equal(timers.size, 1, "An update arriving while busy must be replayed");
  await tick();
  assert.equal(scopeRequests, 2);
  assert.equal(clicks, 1, "Do not double click while inline is transitioning");
  observerCallback();
  assert.equal(timers.size, 1);
  assert.equal(timers.values().next().value.delay, 0, "Page updates must preempt the fallback check immediately");
  now += 2000;
  await tick();
  assert.equal(clicks, 2, "Retry a selected slot when inline ignored the first next click");
  now += 2000;
  await tick();
  assert.equal(clicks, 3);
  now += 2000;
  await tick();
  assert.equal(clicks, 3, "Limit next-button attempts");
  active = false;
  await tick();
  assert.equal(timers.size, 0);
  active = true;
  visibilityCallback();
  await tick();
  assert.equal(timers.size, 1, "Returning to the task tab must resume without a DOM change");
  now = 26000;
  await tick();
  assert.equal(reservation.enabled, false);
  assert.ok(messages.some((message) => message.status === "資料頁未開啟" && message.kind === "error"));
  assert.equal(timers.size, 0, "A stalled transition must stop with an explanation");
  const stoppedReservation = reservation;
  reservation = { ...reservation, enabled: true };
  storageCallback({ reservation: { oldValue: stoppedReservation, newValue: reservation } }, "local");
  await new Promise(setImmediate);
  assert.equal(clicks, 4, "Explicit resume must reset the transition timeout and retry budget");
  assert.equal(reservation.enabled, true);
}

async function testTapPayRequiresManualCard(autoSubmit = false) {
  const holder = paymentInput("持卡人姓名");
  const frame = {
    src: "https://js.tappaysdk.com/sdk/tpdirect/tappay-field/html/v5.14.0",
    getBoundingClientRect: () => ({ width: 300, height: 40 })
  };
  const messages = [];
  const writes = [];
  const reservation = { enabled: true, restaurantQuery: bookingUrl, autoSubmit };
  const document = {
    documentElement: { dataset: {} }, body: { innerText: "" },
    querySelectorAll: (selector) => selector === "input" ? [holder] :
      selector.includes("iframe") ? [frame] : [],
    querySelector: () => null
  };
  const chrome = {
    runtime: {
      sendMessage: async (message) => { messages.push(message); return { active: true }; },
      onMessage: { addListener: () => {} }
    },
    storage: {
      local: {
        get: async () => ({ reservation }),
        set: async (value) => { writes.push(value); }
      },
      onChanged: { addListener: () => {} }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), {
    document, chrome, InlineHelperCommon: common,
    location: { href: `${bookingUrl}/form`, search: "", pathname: "/booking/-company/-branch/form" },
    URLSearchParams, sessionStorage: { getItem: () => null, setItem: () => {} },
    MutationObserver: class { observe() {} },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    Event: class { constructor(type) { this.type = type; } },
    setTimeout: () => 0, clearTimeout: () => {}
  });
  await new Promise(setImmediate);
  assert.equal(messages.find((message) => message.type === "FLOW_STAGE")?.stage, "verification");
  assert.match(messages.find((message) => message.type === "FLOW_STATUS")?.detail || "", /自行填寫信用卡/);
  assert.equal(writes.some((write) => write.reservation?.enabled === false), true);
}

async function testOldConsentNoticeClearsAfterTaskStops() {
  let removed = false;
  let suppressionStyle;
  let storageChanged;
  let observerDisconnected = false;
  const notice = { remove: () => { removed = true; } };
  const document = {
    documentElement: { dataset: {}, appendChild: (element) => { suppressionStyle = element; } }, body: { innerText: "" },
    querySelectorAll: () => [],
    querySelector: (selector) => selector === "#inline-helper-consent-notice" ? notice :
      selector === "#inline-helper-consent-suppression" ? suppressionStyle : null,
    createElement: () => ({ id: "", textContent: "" })
  };
  const chrome = {
    runtime: {
      sendMessage: async (message) => message.type === "CHECK_FLOW_SCOPE" ? { active: true } : { ok: true },
      onMessage: { addListener: () => {} }
    },
    storage: {
      local: { get: async () => ({ reservation: { enabled: false } }), set: async () => {} },
      onChanged: { addListener: (listener) => { storageChanged = listener; } }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), {
    document, chrome, InlineHelperCommon: common,
    location: { href: `${bookingUrl}/form`, search: "", pathname: "/booking/-company/-branch/form" },
    URLSearchParams, sessionStorage: { getItem: () => null, setItem: () => {} },
    MutationObserver: class { observe() {} disconnect() { observerDisconnected = true; } },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    setTimeout: () => 0, clearTimeout: () => {}
  });
  await new Promise(setImmediate);
  assert.equal(removed, true);
  assert.equal(document.documentElement.dataset.inlineHelperConsentSuppressed, "true");
  assert.match(suppressionStyle.textContent, /#inline-helper-consent-notice\{display:none!important\}/);
  // An older script can recreate the notice after this instance removes it.
  // The persistent CSS rule still hides the recreated host before paint.
  assert.equal(document.documentElement.dataset.inlineHelperConsentSuppressed, "true");
  document.documentElement.dataset.inlineHelperVersion = "newer-version";
  storageChanged({ reservation: {} }, "local");
  assert.equal(observerDisconnected, true);
}

async function testMarketingSuccessTextDoesNotSubmit() {
  let clicks = 0;
  const button = {
    tagName: "BUTTON", textContent: "授權信用卡", disabled: false,
    classList: { contains: () => false },
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 200, height: 40 }),
    click: () => { clicks += 1; }
  };
  const messages = [];
  const writes = [];
  const reservation = { enabled: true, contactName: "測試姓名", contactPhone: "0912345678", autoSubmit: true };
  const document = {
    documentElement: { dataset: {} },
    body: { innerText: "餐廳說明：預約成功後請留意通知。" },
    querySelectorAll: (selector) => selector === "button" || selector.includes('button, [role="button"]') ? [button] : [],
    querySelector: () => null
  };
  const chrome = {
    runtime: {
      sendMessage: async (message) => { messages.push(message); return { active: true }; },
      onMessage: { addListener: () => {} }
    },
    storage: {
      local: {
        get: async () => ({ reservation }),
        set: async (value) => { writes.push(value); }
      },
      onChanged: { addListener: () => {} }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), {
    document, chrome, InlineHelperCommon: common,
    location: { href: `${bookingUrl}/confirmation`, search: "", pathname: "/booking/-company/-branch/confirmation" },
    URLSearchParams, sessionStorage: { getItem: () => null, setItem: () => {} },
    MutationObserver: class { observe() {} },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    setTimeout: () => 0, clearTimeout: () => {}
  });
  await new Promise(setImmediate);
  assert.equal(clicks, 0);
  assert.equal(writes.some((write) => write.reservation?.enabled === false), true);
  assert.match(messages.find((message) => message.type === "FLOW_STATUS")?.detail || "", /自行核對金額並操作/);
  assert.equal(messages.some((message) => message.type === "FLOW_STATUS" && /訂位成功/.test(message.detail)), false);
}

async function testDepositConsentDoesNotRecreateRulesNotice(payment) {
  const inputs = [paymentInput("訂位人姓名", "已填姓名"), paymentInput("手機", "0912345678")];
  if (payment) inputs.push(paymentInput("持卡人姓名"));
  const deposit = {
    tagName: "BUTTON", textContent: "", disabled: false,
    getAttribute: (name) => name === "aria-required" ? "true" : name === "aria-checked" ? "false" : null,
    getBoundingClientRect: () => ({ width: 20, height: 20 }),
    click: () => { throw new Error("Must not accept deposit terms during this test"); }
  };
  const label = {
    tagName: "LABEL", htmlFor: "deposit-policy",
    textContent: "我同意上述預付訂金及取消訂位退款須知，並理解需完成線上預付訂金始視為訂位成功。",
    closest: () => null,
    getBoundingClientRect: () => ({ width: 300, height: 40 })
  };
  let observerCallback;
  let noticeCreated = 0;
  let style;
  let notice = { remove: () => { notice = null; } };
  const timers = [];
  const messages = [];
  let reservation = { enabled: true, contactName: "已填姓名", contactPhone: "0912345678" };
  const document = {
    documentElement: { dataset: {}, appendChild: (node) => { style = node; } }, body: { innerText: "" },
    getElementById: () => deposit,
    createElement: (tag) => {
      if (tag !== "style") noticeCreated += 1;
      return { id: "", textContent: "" };
    },
    querySelector: (selector) => selector === "#inline-helper-consent-notice" ? notice :
      selector === "#inline-helper-consent-suppression" ? style : null,
    querySelectorAll: (selector) => selector === "input" ? inputs :
      selector === 'button, [role="button"], [role="checkbox"], label' ? [label] : []
  };
  const chrome = {
    runtime: { sendMessage: async (message) => { messages.push(message); return { active: true }; }, onMessage: { addListener() {} } },
    storage: { local: { get: async () => ({ reservation }), set: async (value) => { reservation = value.reservation; } }, onChanged: { addListener() {} } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), {
    document, chrome, InlineHelperCommon: common,
    location: { href: `${bookingUrl}/form`, search: "", pathname: "/booking/-company/-branch/form" },
    URLSearchParams, sessionStorage: { getItem: () => null, setItem() {} },
    MutationObserver: class { constructor(callback) { observerCallback = callback; } observe() {} disconnect() {} },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    setTimeout: (callback) => { timers.push(callback); return timers.length; }, clearTimeout() {}
  });
  await new Promise(setImmediate);
  const scheduledBeforeHelperMutation = timers.length;
  for (let i = 0; i < 12; i += 1) {
    observerCallback([{ type: "childList", target: document.documentElement, addedNodes: [{ id: "inline-helper-consent-notice" }], removedNodes: [] }]);
  }
  assert.equal(timers.length, scheduledBeforeHelperMutation, "Helper mutations must not schedule the flow again");
  for (let i = 0; i < 12; i += 1) {
    observerCallback([{ type: "childList", target: {}, addedNodes: [{ id: "site-content" }], removedNodes: [] }]);
    timers.shift()();
    await new Promise(setImmediate);
  }
  assert.equal(noticeCreated, 0, "Deposit consent must never create the rules notice");
  assert.equal(notice, null);
  assert.equal(document.documentElement.dataset.inlineHelperConsentSuppressed, "true");
  assert.equal(messages.some((message) => message.status === "待手動同意"), false);
  assert.equal(reservation.enabled, !payment);
  assert.deepEqual(inputs.slice(0, 2).map((input) => input.value), ["已填姓名", "0912345678"]);
}

async function testConsentResumesWithoutDisablingTask() {
  let modalOpen = true;
  let oldNoticeRemoved = false;
  let notice = { shadowRoot: { querySelector: () => null }, remove: () => { oldNoticeRemoved = true; notice = null; } };
  let suppressionStyle;
  let observerCallback;
  let clickNotice;
  let inlineClicks = 0;
  const helperButton = { disabled: true, addEventListener: (_type, callback) => { clickNotice = callback; } };
  const helperDetail = { textContent: "" };
  const scrollArea = { clientHeight: 400, scrollHeight: 1000, scrollTop: 0 };
  const modal = { querySelectorAll: () => [scrollArea] };
  const timers = [];
  const messages = [];
  const writes = [];
  const consent = {
    tagName: "BUTTON", textContent: "我已閱讀並同意規則與注意事項", disabled: true,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 200, height: 40 }),
    closest: (selector) => selector.includes(".house-rules") ? modal : null,
    click: () => { inlineClicks += 1; modalOpen = false; }
  };
  const reservation = { enabled: true, contactName: "測試姓名", contactPhone: "0912345678" };
  const document = {
    documentElement: { dataset: {}, appendChild: (node) => {
      if (node.id === "inline-helper-consent-suppression") suppressionStyle = node;
      else notice = node;
    } },
    body: { innerText: "" },
    createElement: () => {
      const host = { style: {}, remove: () => { notice = null; } };
      host.attachShadow = () => {
        host.shadowRoot = { innerHTML: "", querySelector: (selector) =>
          selector === "button" ? helperButton : selector === "span" ? helperDetail : null };
        return host.shadowRoot;
      };
      return host;
    },
    querySelector: (selector) => selector === "#inline-helper-consent-notice" ? notice :
      selector === "#inline-helper-consent-suppression" ? suppressionStyle : null,
    querySelectorAll: (selector) => modalOpen && selector.includes('button, [role="button"], [role="checkbox"], label') ? [consent] : []
  };
  const chrome = {
    runtime: {
      sendMessage: async (message) => { messages.push(message); return { active: true }; },
      onMessage: { addListener: () => {} }
    },
    storage: {
      local: {
        get: async () => ({ reservation }),
        set: async (value) => { writes.push(value); }
      },
      onChanged: { addListener: () => {} }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), {
    document, chrome, InlineHelperCommon: common,
    location: { href: `${bookingUrl}/form`, search: "", pathname: "/booking/-company/-branch/form" },
    URLSearchParams, sessionStorage: { getItem: () => null, setItem: () => {} },
    MutationObserver: class { constructor(callback) { observerCallback = callback; } observe() {} },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    clearTimeout: () => {}
  });
  await new Promise(setImmediate);
  assert.ok(notice);
  assert.equal(oldNoticeRemoved, true);
  assert.equal(document.documentElement.dataset.inlineHelperConsentSuppressed, "false");
  assert.equal(scrollArea.scrollTop, 360);
  assert.equal(helperButton.disabled, true);
  assert.equal(inlineClicks, 0);
  assert.equal(writes.some((write) => write.reservation?.enabled === false), false);
  assert.match(messages.find((message) => message.type === "FLOW_STATUS")?.detail || "", /規則捲到底/);
  timers.shift()();
  await new Promise(setImmediate);
  assert.equal(scrollArea.scrollTop, 600);
  assert.equal(inlineClicks, 0);
  consent.disabled = false;
  observerCallback();
  timers.shift()();
  await new Promise(setImmediate);
  assert.equal(helperButton.disabled, false);
  assert.equal(inlineClicks, 0);
  clickNotice();
  await new Promise(setImmediate);
  assert.equal(inlineClicks, 1);
  assert.equal(notice, null);
  assert.equal(document.documentElement.dataset.inlineHelperConsentSuppressed, "true");
  assert.equal(writes.some((write) => write.reservation?.enabled === false), false);
  timers.at(-1)();
  await new Promise(setImmediate);
  assert.match(messages.filter((message) => message.type === "FLOW_STATUS").at(-1)?.detail || "", /等待 inline 顯示下一步/);
}

async function testScopedBackgroundRelay() {
  const stored = {
    flowScopeMigration: "0.3.51",
    activeReservationTabId: 7,
    lastOpenedUrl: bookingUrl,
    reservation: { restaurantQuery: bookingUrl, enabled: false },
    loadedPageHelperStage: "payment"
  };
  let messageHandler;
  let tabUrl = `${bookingUrl}/payment`;
  const sent = [];
  const writes = [];
  const injected = [];
  const activated = [];
  let staleContactScript = true;
  let activeTabIsTask = true;
  const chrome = {
    runtime: {
      id: "test-extension",
      getURL: (name) => `chrome-extension://test-extension/${name}`,
      onMessage: { addListener: (handler) => { messageHandler = handler; } },
      onStartup: { addListener: () => {} },
      onInstalled: { addListener: () => {} }
    },
    alarms: { onAlarm: { addListener: () => {} } },
    scripting: { executeScript: async (options) => { injected.push(options.files[0]); } },
    storage: { local: {
      get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, stored[key]])),
      set: async (value) => { writes.push(value); Object.assign(stored, value); },
      remove: async () => {}
    } },
    tabs: {
      get: async () => ({ id: 7, active: activeTabIsTask, url: tabUrl }),
      query: async () => [activeTabIsTask
        ? { id: 7, active: true, url: tabUrl }
        : { id: 9, active: true, url: "chrome://extensions" }],
      update: async (id, options) => { activated.push({ id, options }); activeTabIsTask = true; },
      sendMessage: async (id, message) => {
        if (message.type === "FILL_CONTACT_DETAILS" && staleContactScript) {
          staleContactScript = false;
          throw new Error("old extension context");
        }
        sent.push({ id, message });
        return { ok: true };
      }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "background.js"), "utf8"), {
    chrome, InlineHelperCommon: common, importScripts: () => {}
  });
  const sender = { id: "test-extension", url: "chrome-extension://test-extension/popup.html" };
  assert.notEqual(messageHandler({ type: "FILL_CARD_FROM_POPUP" }, sender, () => {}), true);
  tabUrl = `${bookingUrl}/form`;
  const refill = (data) => new Promise((resolve) => messageHandler({ type: "FILL_CONTACT_FROM_POPUP" }, data, resolve));
  assert.equal((await refill(sender)).ok, true);
  assert.equal(sent.at(-1).message.type, "FILL_CONTACT_DETAILS");
  assert.deepEqual(injected, ["common.js", "content.js"]);
  tabUrl = "https://inline.app/booking/-company/-other/form";
  assert.equal((await refill(sender)).ok, false);
  assert.equal((await refill({ id: "other", url: "chrome-extension://other/popup.html" })).ok, false);
  stored.reservation.enabled = true;
  const checkScope = (stage) => new Promise((resolve) => messageHandler(
    { type: "CHECK_FLOW_SCOPE", stage },
    { tab: { id: 8, active: true, url: bookingUrl } }, resolve
  ));
  assert.equal((await checkScope("availability")).active, false);
  assert.equal((await checkScope("payment")).active, true);
  assert.equal(stored.activeReservationTabId, 8);
  const inactiveScope = await new Promise((resolve) => messageHandler(
    { type: "CHECK_FLOW_SCOPE", stage: "availability" },
    { tab: { id: 8, active: false, url: bookingUrl } }, resolve
  ));
  assert.equal(inactiveScope.active, true, "The scoped task must continue when its tab is in the background");
  const wrongRestaurantScope = await new Promise((resolve) => messageHandler(
    { type: "CHECK_FLOW_SCOPE", stage: "availability" },
    { tab: { id: 8, active: false, url: "https://inline.app/booking/-company/-other" } }, resolve
  ));
  assert.equal(wrongRestaurantScope.active, false);
  tabUrl = `${bookingUrl}/form`;
  stored.reservation.enabled = false;
  stored.reservation.autoSubmit = true;
  const resume = (data) => new Promise((resolve) => messageHandler({ type: "RESUME_CURRENT_FLOW" }, data, resolve));
  assert.equal((await resume(sender)).ok, true);
  assert.equal(stored.reservation.enabled, true);
  assert.equal(stored.reservation.autoSubmit, true);
  assert.equal(stored.activeReservationTabId, 7);
  assert.deepEqual(injected.slice(-2), ["common.js", "content.js"]);
  assert.equal(sent.at(-1).message.type, "ADVANCE_FLOW");
  stored.reservation.enabled = false;
  activeTabIsTask = false;
  assert.equal((await resume(sender)).ok, true);
  assert.equal(activated.length, 1);
  assert.equal(activated[0].id, 7);
  assert.equal(activated[0].options.active, true);
  assert.equal(stored.reservation.enabled, true);
  assert.equal((await resume({ id: "other", url: "chrome-extension://other/popup.html" })).ok, false);
}

Promise.all([
  testContactFill("", "測試姓名"),
  testContactFill("使用者自己填的姓名", "使用者自己填的姓名"),
  testContactFill("", "測試姓名", false),
  testDateScanStopsAfterTimeOrDetails(),
  testWaitingFlowRecovers(),
  testDateRangeScansEveryDay(),
  testTimeSelectionAcceptance(true),
  testTimeSelectionAcceptance(true, false, "完成預訂"),
  testTimeSelectionAcceptance(true, false, "完成預訂", true),
  testTimeSelectionAcceptance(true, false, "完成預訂", false, true),
  testTimeSelectionAcceptance(false),
  testTimeSelectionAcceptance(false, true),
  testTapPayRequiresManualCard(),
  testTapPayRequiresManualCard(true),
  testOldConsentNoticeClearsAfterTaskStops(),
  testDepositConsentDoesNotRecreateRulesNotice(true),
  testDepositConsentDoesNotRecreateRulesNotice(false),
  testMarketingSuccessTextDoesNotSubmit(),
  testConsentResumesWithoutDisablingTask(),
  testScopedBackgroundRelay()
])
  .then(() => console.log("Payment flow integration tests passed."))
  .catch((error) => { console.error(error); process.exitCode = 1; });
