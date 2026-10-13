const ALARM_NAME = "inline-reservation-open";
const PREP_ALARM_NAME = "inline-reservation-prepare";
const FLOW_SCOPE_MIGRATION = "0.3.12";
const RELOAD_INLINE_AFTER_RESTART = "reloadInlineAfterExtensionRestart";
importScripts("common.js");
let paymentSessionQueue = Promise.resolve();

function senderMatchesActiveFlow(sender, activeReservationTabId, flowLeaseUntil) {
  return Number.isInteger(sender.tab?.id) && sender.tab.id === activeReservationTabId && Number(flowLeaseUntil || 0) > Date.now();
}

function paymentFieldFromSenderUrl(value) {
  let decoded = String(value || "");
  try { decoded = decodeURIComponent(decoded); } catch (_error) {}
  if (/"type"\s*:\s*"card-number"/.test(decoded)) return "cardNumber";
  if (/"type"\s*:\s*"expiration-date"/.test(decoded)) return "expiry";
  if (/"type"\s*:\s*"ccv"/.test(decoded)) return "securityCode";
  return null;
}

async function readActivePaymentSession(sender) {
  const [{ activeReservationTabId, flowLeaseUntil }, { paymentAutofillSession }, { paymentAutofillResult }] = await Promise.all([
    chrome.storage.local.get(["activeReservationTabId", "flowLeaseUntil"]),
    chrome.storage.session.get("paymentAutofillSession"),
    chrome.storage.session.get("paymentAutofillResult")
  ]);
  if (!senderMatchesActiveFlow(sender, activeReservationTabId, flowLeaseUntil)) return { active: false, completed: false };
  if (paymentAutofillResult?.tabId === sender.tab.id) return { active: false, completed: true };
  if (!paymentAutofillSession || Number(paymentAutofillSession.expiresAt || 0) <= Date.now()) {
    await chrome.storage.session.remove("paymentAutofillSession");
    return { active: false, completed: false };
  }
  return { active: true, completed: false, session: paymentAutofillSession };
}

function clearPaymentField(field, sender) {
  paymentSessionQueue = paymentSessionQueue.then(async () => {
    const state = await readActivePaymentSession(sender);
    if (!state.active || !state.session || !(field in state.session)) return;
    const next = { ...state.session };
    delete next[field];
    const remaining = ["cardholderName", "cardNumber", "expiry", "securityCode"].some((key) => Boolean(next[key]));
    if (remaining) {
      await chrome.storage.session.set({ paymentAutofillSession: next });
    } else {
      await chrome.storage.session.remove("paymentAutofillSession");
      await chrome.storage.session.set({ paymentAutofillResult: { tabId: sender.tab.id, completedAt: Date.now() } });
    }
  });
  return paymentSessionQueue;
}

async function migrateUnsafeGlobalFlow() {
  const { flowScopeMigration, reservation } = await chrome.storage.local.get([
    "flowScopeMigration", "reservation"
  ]);
  if (flowScopeMigration === FLOW_SCOPE_MIGRATION) return;
  await chrome.storage.local.remove(["activeReservationTabId", "pendingRestaurantSearch"]);
  const updates = {
    flowScopeMigration: FLOW_SCOPE_MIGRATION,
    flowStatus: "安全更新已停止舊任務；請從插件重新開始找位",
    flowStatusKind: "ok"
  };
  if (reservation) updates.reservation = { ...reservation, enabled: false };
  await chrome.storage.local.set(updates);
}

const flowScopeMigrationReady = migrateUnsafeGlobalFlow();

async function reloadActiveReservationTabAfterUpdate() {
  await flowScopeMigrationReady;
  const stored = await chrome.storage.local.get(RELOAD_INLINE_AFTER_RESTART);
  if (!stored[RELOAD_INLINE_AFTER_RESTART]) return;
  await chrome.storage.local.remove(RELOAD_INLINE_AFTER_RESTART);
  try {
    const tabs = await chrome.tabs.query({ url: ["https://inline.app/booking/*"] });
    const injectableTabs = tabs.filter((tab) => Number.isInteger(tab.id));
    const results = await Promise.allSettled(injectableTabs.map(async (tab) => {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["common.js"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["payment-frame.js"] });
    }));
    const failedTabs = injectableTabs.filter((_tab, index) => results[index].status === "rejected");
    await Promise.allSettled(failedTabs.map((tab) => chrome.tabs.reload(tab.id)));
    await chrome.storage.local.set({
      flowStatus: failedTabs.length
        ? `新版助手已注入 ${injectableTabs.length - failedTabs.length} 個頁面；另重新整理 ${failedTabs.length} 個頁面`
        : `新版助手已注入 ${injectableTabs.length} 個 inline 頁面`,
      flowStatusKind: failedTabs.length === injectableTabs.length && injectableTabs.length ? "error" : "ok"
    });
  } catch (_error) {}
}

const extensionReady = reloadActiveReservationTabAfterUpdate();

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildBookingUrl(reservation) {
  const normalized = InlineHelperCommon.normalizeRestaurantInput(reservation.restaurantQuery);
  if (normalized.kind !== "url") throw new Error("找不到有效的 inline 官方訂位網址，請重新貼上網址。");
  const selectedDate = reservation.dateStart;
  const prefilled = {
    language: reservation.language || "zh",
    date: selectedDate,
    adults: Number(reservation.adults),
    kids: Number(reservation.children || 0),
    time: reservation.timeStart
  };

  const url = InlineHelperCommon.setUrlQueryParams(normalized.value, {
    pre_filled_form: utf8ToBase64(JSON.stringify(prefilled)),
    inline_helper: "1"
  });
  return { url, selectedDate };
}

async function resolveRestaurantName(query) {
  const endpoint = `https://diner-network-api.inline.app/diner-network/search?query=${encodeURIComponent(query)}&limit=10&language=zh-tw`;
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`inline 搜尋服務回應 ${response.status}`);
  const payload = await response.json();
  const match = InlineHelperCommon.selectRestaurantMatch(payload.result, query);
  if (!match) return null;
  const normalized = InlineHelperCommon.normalizeRestaurantInput(match.bookingLink);
  if (normalized.kind !== "url") return null;
  return { name: match.name, bookingUrl: normalized.value };
}

async function openScopedReservationTab(url) {
  const tab = await chrome.tabs.create({ url, active: true });
  if (!Number.isInteger(tab?.id)) throw new Error("無法識別這次開啟的訂位分頁。");
  await chrome.storage.local.set({ activeReservationTabId: tab.id });
  return tab;
}

async function openReservation(reservation) {
  const normalized = InlineHelperCommon.normalizeRestaurantInput(reservation.restaurantQuery);
  if (normalized.kind === "invalid-url" || normalized.kind === "empty") {
    throw new Error("餐廳網址無效，請貼上 inline 官方訂位網址或輸入餐廳名稱。");
  }
  reservation.restaurantQuery = normalized.value;
  await chrome.storage.local.set({ flowLeaseUntil: Date.now() + 30 * 60_000 });
  if (normalized.kind === "name") {
    try {
      const resolved = await resolveRestaurantName(reservation.restaurantQuery);
      if (resolved) {
        const booking = buildBookingUrl({ ...reservation, restaurantQuery: resolved.bookingUrl });
        await openScopedReservationTab(booking.url);
        await chrome.action.setBadgeBackgroundColor({ color: "#16803c" });
        await chrome.action.setBadgeText({ text: "GO" });
        await chrome.storage.local.set({
          lastOpenedAt: Date.now(),
          lastOpenedUrl: booking.url,
          lastSelectedDate: booking.selectedDate,
          flowStatus: `已找到：${resolved.name}`
        });
        return { mode: "url", resolvedName: resolved.name };
      }
    } catch (error) {
      await chrome.storage.local.set({ flowStatus: `官方名稱搜尋暫時失敗：${error.message}` });
    }

    await chrome.storage.local.set({
      pendingRestaurantSearch: {
        query: reservation.restaurantQuery,
        createdAt: Date.now()
      },
      lastOpenedAt: Date.now(),
      flowStatus: `正在搜尋：${reservation.restaurantQuery}`
    });
    await openScopedReservationTab("https://dining.inline.app/zh-tw/");
    return { mode: "search" };
  }
  const booking = buildBookingUrl(reservation);
  await openScopedReservationTab(booking.url);
  await chrome.action.setBadgeBackgroundColor({ color: "#16803c" });
  await chrome.action.setBadgeText({ text: "GO" });

  await chrome.storage.local.set({
    lastOpenedAt: Date.now(),
    lastOpenedUrl: booking.url,
    lastSelectedDate: booking.selectedDate
  });
  return { mode: "url" };
}

async function prepareReservation(reservation) {
  const normalized = InlineHelperCommon.normalizeRestaurantInput(reservation.restaurantQuery);
  if (normalized.kind !== "url") return;
  const url = InlineHelperCommon.setUrlQueryParams(normalized.value, { language: "zh-tw" });
  await chrome.tabs.create({ url, active: true });
  await chrome.action.setBadgeBackgroundColor({ color: "#aa6f00" });
  await chrome.action.setBadgeText({ text: "READY" });
}

async function restoreAlarm() {
  const { reservation } = await chrome.storage.local.get("reservation");
  if (!reservation?.enabled || !reservation.releaseAt) return;

  const when = new Date(reservation.releaseAt).getTime();
  if (!Number.isFinite(when) || when <= Date.now()) return;

  const alarm = await chrome.alarms.get(ALARM_NAME);
  if (!alarm) chrome.alarms.create(ALARM_NAME, { when });

  const prepMinutes = Number(reservation.prepMinutes || 0);
  const prepWhen = when - prepMinutes * 60_000;
  if (prepMinutes > 0 && prepWhen > Date.now()) {
    const prepAlarm = await chrome.alarms.get(PREP_ALARM_NAME);
    if (!prepAlarm) chrome.alarms.create(PREP_ALARM_NAME, { when: prepWhen });
  }
}

chrome.runtime.onStartup.addListener(restoreAlarm);
chrome.runtime.onInstalled.addListener(restoreAlarm);
chrome.alarms.onAlarm.addListener(async (alarm) => {
  await flowScopeMigrationReady;
  const { reservation } = await chrome.storage.local.get("reservation");
  if (!reservation?.enabled) return;

  if (alarm.name === PREP_ALARM_NAME) {
    await prepareReservation(reservation);
    return;
  }

  if (alarm.name !== ALARM_NAME) return;
  await openReservation(reservation);
  await chrome.storage.local.set({ scheduledTriggeredAt: Date.now() });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING_BACKGROUND") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  if (message.type === "PAYMENT_AUTOFILL_STATUS") {
    readActivePaymentSession(_sender)
      .then(({ active, completed }) => sendResponse({ ok: true, active, completed }))
      .catch(() => sendResponse({ ok: false, active: false, completed: false }));
    return true;
  }

  if (message.type === "REQUEST_PAYMENT_CARDHOLDER") {
    readActivePaymentSession(_sender).then((state) => {
      const senderUrl = String(_sender.url || _sender.tab?.url || "");
      const allowed = senderUrl.startsWith("https://inline.app/booking/");
      sendResponse({ ok: allowed && state.active, value: allowed && state.active ? state.session.cardholderName || "" : "" });
    }).catch(() => sendResponse({ ok: false, value: "" }));
    return true;
  }

  if (message.type === "REQUEST_PAYMENT_FIELD") {
    readActivePaymentSession(_sender).then((state) => {
      const field = paymentFieldFromSenderUrl(_sender.url);
      const allowed = String(_sender.url || "").startsWith("https://js.tappaysdk.com/") && field;
      sendResponse({ ok: Boolean(allowed && state.active), field, value: allowed && state.active ? state.session[field] || "" : "" });
    }).catch(() => sendResponse({ ok: false, value: "" }));
    return true;
  }

  if (message.type === "PAYMENT_FIELD_FILLED") {
    const inferredField = paymentFieldFromSenderUrl(_sender.url);
    const field = message.field === "cardholderName" ? "cardholderName" : inferredField;
    const senderUrl = String(_sender.url || _sender.tab?.url || "");
    const allowed = field === "cardholderName"
      ? senderUrl.startsWith("https://inline.app/booking/")
      : senderUrl.startsWith("https://js.tappaysdk.com/") && message.field === inferredField;
    if (!allowed) {
      sendResponse({ ok: false });
      return false;
    }
    clearPaymentField(field, _sender).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "CLEAR_PAYMENT_AUTOFILL") {
    chrome.storage.session.remove(["paymentAutofillSession", "paymentAutofillResult"])
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "CONTENT_READY") {
    chrome.storage.local.set({
      loadedPageHelperVersion: String(message.version || "未知"),
      loadedPageHelperUrl: String(_sender.tab?.url || message.url || "")
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "FLOW_STAGE") {
    chrome.storage.local.get("activeReservationTabId").then(({ activeReservationTabId }) => {
      if (_sender.tab?.id === activeReservationTabId) {
        return chrome.storage.local.set({
          loadedPageHelperStage: String(message.stage || "unknown"),
          loadedPageHelperVersion: String(message.version || "未知")
        });
      }
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "CHECK_FLOW_SCOPE") {
    extensionReady.then(() => chrome.storage.local.get([
      "activeReservationTabId", "lastOpenedUrl", "reservation", "flowLeaseUntil"
    ])).then(async ({ activeReservationTabId, lastOpenedUrl, reservation, flowLeaseUntil }) => {
      const senderTabId = _sender.tab?.id;
      let active = Number.isInteger(senderTabId) && senderTabId === activeReservationTabId;
      const leaseActive = Number(flowLeaseUntil || 0) > Date.now();
      const activeMatchingForm = Number.isInteger(senderTabId) && InlineHelperCommon.canAdoptFormScope({
        senderUrl: _sender.tab?.url,
        expectedUrl: lastOpenedUrl || reservation?.restaurantQuery,
        senderActive: _sender.tab?.active,
        reservationEnabled: reservation?.enabled || leaseActive
      });
      if ((!active || !reservation?.enabled) && leaseActive && activeMatchingForm) {
        active = true;
        await chrome.storage.local.set({
          activeReservationTabId: senderTabId,
          reservation: { ...reservation, enabled: true },
          flowStatus: "已接手目前顯示的訂位資料頁",
          flowStatusKind: "ok"
        });
      }
      sendResponse({ active });
    });
    return true;
  }

  if (message.type === "FLOW_STATUS") {
    chrome.storage.local.get("activeReservationTabId").then(async ({ activeReservationTabId }) => {
      if (!Number.isInteger(_sender.tab?.id) || _sender.tab.id !== activeReservationTabId) {
        sendResponse({ ok: false, ignored: true });
        return;
      }
      const status = String(message.status || "").slice(0, 8);
      await chrome.action.setBadgeBackgroundColor({
        color: message.kind === "error" ? "#a22b26" : "#226c36"
      });
      await chrome.action.setBadgeText({ text: status });
      await chrome.storage.local.set({
        flowStatus: message.detail || message.status,
        flowStatusKind: message.kind || "ok"
      });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "OPEN_NOW") {
    flowScopeMigrationReady.then(() => openReservation(message.reservation))
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: `背景開啟失敗：${error.message}` }));
    return true;
  }

  if (message.type === "SCHEDULE") {
    Promise.all([
      chrome.alarms.clear(ALARM_NAME),
      chrome.alarms.clear(PREP_ALARM_NAME)
    ]).then(() => {
      if (message.prepWhen && message.prepWhen > Date.now()) {
        chrome.alarms.create(PREP_ALARM_NAME, { when: message.prepWhen });
      }
      chrome.alarms.create(ALARM_NAME, { when: message.when });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "CANCEL") {
    Promise.all([
      chrome.alarms.clear(ALARM_NAME),
      chrome.alarms.clear(PREP_ALARM_NAME),
      chrome.storage.local.remove(["activeReservationTabId", "pendingRestaurantSearch", "flowLeaseUntil"]),
      chrome.storage.session.remove(["paymentAutofillSession", "paymentAutofillResult"])
    ]).then(() => sendResponse({ ok: true }));
    return true;
  }
});
