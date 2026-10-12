const ALARM_NAME = "inline-reservation-open";
const PREP_ALARM_NAME = "inline-reservation-prepare";
importScripts("common.js");

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildBookingUrl(reservation) {
  const normalized = InlineHelperCommon.normalizeRestaurantInput(reservation.restaurantQuery);
  if (normalized.kind !== "url") throw new Error("找不到有效的 inline 官方訂位網址，請重新貼上網址。");
  const url = new URL(normalized.value);
  const selectedDate = reservation.dateStart;
  const prefilled = {
    language: reservation.language || "zh",
    date: selectedDate,
    adults: Number(reservation.adults),
    kids: Number(reservation.children || 0),
    time: reservation.timeStart
  };

  url.searchParams.set("pre_filled_form", utf8ToBase64(JSON.stringify(prefilled)));
  url.searchParams.set("inline_helper", "1");
  return { url: url.toString(), selectedDate };
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

async function openReservation(reservation) {
  const normalized = InlineHelperCommon.normalizeRestaurantInput(reservation.restaurantQuery);
  if (normalized.kind === "invalid-url" || normalized.kind === "empty") {
    throw new Error("餐廳網址無效，請貼上 inline 官方訂位網址或輸入餐廳名稱。");
  }
  reservation.restaurantQuery = normalized.value;
  if (normalized.kind === "name") {
    try {
      const resolved = await resolveRestaurantName(reservation.restaurantQuery);
      if (resolved) {
        const booking = buildBookingUrl({ ...reservation, restaurantQuery: resolved.bookingUrl });
        await chrome.tabs.create({ url: booking.url, active: true });
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
    await chrome.tabs.create({ url: "https://dining.inline.app/zh-tw/", active: true });
    return { mode: "search" };
  }
  const booking = buildBookingUrl(reservation);
  await chrome.tabs.create({ url: booking.url, active: true });
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
  const url = new URL(normalized.value);
  url.searchParams.set("language", "zh-tw");
  await chrome.tabs.create({ url: url.toString(), active: true });
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

  if (message.type === "FLOW_STATUS") {
    const status = String(message.status || "").slice(0, 8);
    chrome.action.setBadgeBackgroundColor({
      color: message.kind === "error" ? "#a22b26" : "#226c36"
    });
    chrome.action.setBadgeText({ text: status });
    chrome.storage.local.set({ flowStatus: message.detail || message.status });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "OPEN_NOW") {
    openReservation(message.reservation)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
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
      chrome.alarms.clear(PREP_ALARM_NAME)
    ]).then(() => sendResponse({ ok: true }));
    return true;
  }
});
