const ALARM_NAME = "inline-reservation-open";
const PREP_ALARM_NAME = "inline-reservation-prepare";

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildBookingUrl(reservation) {
  const url = new URL(reservation.bookingUrl);
  const selectedDate = reservation.date || randomFutureDate(reservation.randomDays || 30);
  const prefilled = {
    language: reservation.language || "zh",
    date: selectedDate,
    adults: Number(reservation.adults),
    time: reservation.time
  };

  url.searchParams.set("pre_filled_form", utf8ToBase64(JSON.stringify(prefilled)));
  url.searchParams.set("inline_helper", "1");
  return { url: url.toString(), selectedDate };
}

function randomFutureDate(days) {
  const offset = 1 + Math.floor(Math.random() * Math.max(1, Number(days)));
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function openReservation(reservation) {
  const booking = buildBookingUrl(reservation);
  await chrome.tabs.create({ url: booking.url, active: true });
  await chrome.action.setBadgeBackgroundColor({ color: "#16803c" });
  await chrome.action.setBadgeText({ text: "GO" });

  await chrome.storage.local.set({
    lastOpenedAt: Date.now(),
    lastOpenedUrl: booking.url,
    lastSelectedDate: booking.selectedDate
  });
}

async function prepareReservation(reservation) {
  const url = new URL(reservation.bookingUrl);
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
chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  if (reason === "update") {
    const version = chrome.runtime.getManifest().version;
    await chrome.storage.local.set({
      updateStatus: `已從 v${previousVersion || "舊版"} 更新至 v${version}`
    });
  }
});

chrome.runtime.onUpdateAvailable.addListener(async (details) => {
  await chrome.storage.local.set({
    updateStatus: `v${details.version} 已下載，瀏覽器閒置後會自動套用`
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const { reservation } = await chrome.storage.local.get("reservation");
  if (!reservation?.enabled) return;

  if (alarm.name === PREP_ALARM_NAME) {
    await prepareReservation(reservation);
    return;
  }

  if (alarm.name !== ALARM_NAME) return;
  await openReservation(reservation);
  await chrome.storage.local.set({
    reservation: { ...reservation, enabled: false }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
      .then(() => sendResponse({ ok: true }))
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
