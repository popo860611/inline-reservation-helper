const fields = {
  restaurantQuery: document.querySelector("#restaurant-query"),
  dateStart: document.querySelector("#date-start"),
  dateEnd: document.querySelector("#date-end"),
  timeStart: document.querySelector("#time-start"),
  timeEnd: document.querySelector("#time-end"),
  adults: document.querySelector("#adults"),
  children: document.querySelector("#children"),
  contactName: document.querySelector("#contact-name"),
  contactPhone: document.querySelector("#contact-phone"),
  contactEmail: document.querySelector("#contact-email"),
  releaseAt: document.querySelector("#release-at"),
  prepMinutes: document.querySelector("#prep-minutes"),
  autoSubmit: document.querySelector("#auto-submit")
};

const form = document.querySelector("#reservation-form");
const statusBox = document.querySelector("#status");
const updateCard = document.querySelector(".update-card");
const updateMode = document.querySelector("#update-mode");
const updateButton = document.querySelector("#apply-update");
const BUILD_VERSION = "0.3.0";
let pendingUpdateAction = null;

function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function renderUpdateStatus() {
  document.querySelector("#extension-version").textContent = `v${BUILD_VERSION}`;
  updateButton.hidden = true;
  updateCard.classList.remove("available");

  let backgroundVersion = "";
  try {
    const response = await chrome.runtime.sendMessage({ type: "PING_BACKGROUND" });
    if (response?.ok) backgroundVersion = response.version;
  } catch (_error) {}

  if (backgroundVersion && backgroundVersion !== BUILD_VERSION) {
    updateMode.textContent = `新版檔案已就緒｜背景仍是 v${backgroundVersion}`;
    updateCard.classList.add("available");
    updateButton.hidden = false;
    pendingUpdateAction = { type: "reload" };
    return;
  }

  const repository = String(globalThis.UPDATE_CONFIG?.githubRepository || "").trim();
  if (!repository) {
    updateMode.textContent = `目前 v${BUILD_VERSION}｜Git 開發版`;
    return;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const release = await response.json();
    const latestVersion = String(release.tag_name || "").replace(/^v/i, "");
    if (latestVersion && compareVersions(latestVersion, BUILD_VERSION) > 0) {
      updateMode.textContent = `發現新版 v${latestVersion}｜按更新取得`;
      updateCard.classList.add("available");
      updateButton.hidden = false;
      pendingUpdateAction = { type: "release", url: release.html_url };
    } else {
      updateMode.textContent = `目前 v${BUILD_VERSION}｜已是最新版`;
    }
  } catch (_error) {
    updateMode.textContent = `目前 v${BUILD_VERSION}｜版本檢查失敗`;
  }
}

function compareVersions(left, right) {
  const a = left.split(".").map((value) => Number(value) || 0);
  const b = right.split(".").map((value) => Number(value) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

updateButton.addEventListener("click", async () => {
  if (pendingUpdateAction?.type === "reload") {
    updateButton.textContent = "套用中…";
    chrome.runtime.reload();
    return;
  }
  if (pendingUpdateAction?.type === "release" && pendingUpdateAction.url) {
    await chrome.tabs.create({ url: pendingUpdateAction.url, active: true });
    setStatus("已開啟新版下載頁。下載並覆蓋原資料夾後，再回到擴充功能按重新載入。", "ok");
  }
});

function setStatus(message, kind = "") {
  statusBox.textContent = message;
  statusBox.className = kind;
}

function readReservation() {
  const value = Object.fromEntries(Object.entries(fields).map(([key, element]) => [
    key, element.type === "checkbox" ? element.checked : element.value.trim()
  ]));
  return {
    ...value,
    adults: Number(value.adults),
    children: Number(value.children),
    prepMinutes: Number(value.prepMinutes || 0),
    language: "zh",
    enabled: true
  };
}

function isInlineUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "inline.app" || url.hostname.endsWith(".inline.app")) && url.pathname.startsWith("/booking/");
  } catch { return false; }
}

function validate(reservation, scheduling = false) {
  if (!reservation.restaurantQuery) throw new Error("請輸入餐廳名稱或 inline 訂位網址。");
  if (/^https?:/i.test(reservation.restaurantQuery) && !isInlineUrl(reservation.restaurantQuery)) {
    throw new Error("網址必須是 https://inline.app/booking/... 官方訂位頁。");
  }
  if (!reservation.dateStart || !reservation.dateEnd || reservation.dateStart > reservation.dateEnd) {
    throw new Error("請確認日期區間，結束日期不可早於開始日期。");
  }
  const days = Math.floor((new Date(reservation.dateEnd) - new Date(reservation.dateStart)) / 86400000) + 1;
  if (days > 14) throw new Error("一次最多搜尋 14 天，請縮小日期區間。");
  if (!reservation.timeStart || !reservation.timeEnd || reservation.timeStart > reservation.timeEnd) {
    throw new Error("請確認時間區間，最晚時間不可早於最早時間。");
  }
  if (!Number.isInteger(reservation.adults) || reservation.adults < 1 || reservation.adults > 20) {
    throw new Error("大人人數需介於 1 到 20。");
  }
  if (!reservation.contactName || !reservation.contactPhone) throw new Error("請填入訂位姓名與手機號碼。");
  if (scheduling && !reservation.releaseAt) throw new Error("設定排程時請填入啟動時間。");
}

async function save(reservation, scheduling = false) {
  validate(reservation, scheduling);
  await chrome.storage.local.set({ reservation, flowStatus: "準備開始" });
}

async function restore() {
  const { reservation, lastOpenedAt, flowStatus, lastSelectedDate } = await chrome.storage.local.get([
    "reservation", "lastOpenedAt", "flowStatus", "lastSelectedDate"
  ]);
  fields.dateStart.value ||= localDate(1);
  fields.dateEnd.value ||= localDate(7);
  if (reservation) {
    for (const [key, field] of Object.entries(fields)) {
      if (reservation[key] !== undefined) {
        if (field.type === "checkbox") field.checked = Boolean(reservation[key]);
        else field.value = reservation[key];
      }
    }
  }
  const alarm = await chrome.alarms.get("inline-reservation-open");
  if (flowStatus) setStatus(`${flowStatus}${lastSelectedDate ? `；目前日期 ${lastSelectedDate}` : ""}`);
  else if (alarm) setStatus(`已排程：${new Date(alarm.scheduledTime).toLocaleString("zh-TW")}`, "ok");
  else if (lastOpenedAt) setStatus(`上次啟動：${new Date(lastOpenedAt).toLocaleString("zh-TW")}`);
  else setStatus("填妥三個區塊後，即可開始找位。");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const reservation = readReservation();
    await save(reservation, true);
    const when = new Date(reservation.releaseAt).getTime();
    if (!Number.isFinite(when) || when <= Date.now()) throw new Error("啟動時間必須晚於現在。");
    const response = await chrome.runtime.sendMessage({ type: "SCHEDULE", when, prepWhen: when - reservation.prepMinutes * 60000 });
    if (!response?.ok) throw new Error(response?.error || "無法建立排程。");
    setStatus(`排程完成：${new Date(when).toLocaleString("zh-TW")}`, "ok");
  } catch (error) { setStatus(error.message, "error"); }
});

document.querySelector("#open-now").addEventListener("click", async () => {
  try {
    const reservation = readReservation();
    await save(reservation);
    const response = await chrome.runtime.sendMessage({ type: "OPEN_NOW", reservation });
    if (!response?.ok) throw new Error(response?.error || "無法開始找位。");
    setStatus(isInlineUrl(reservation.restaurantQuery) ? "已開始尋找可用時段。" : "已開啟官方搜尋；若有多家分店，請選擇一次。", "ok");
  } catch (error) { setStatus(error.message, "error"); }
});

document.querySelector("#cancel").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CANCEL" });
  const { reservation } = await chrome.storage.local.get("reservation");
  if (reservation) await chrome.storage.local.set({ reservation: { ...reservation, enabled: false }, flowStatus: "排程已取消" });
  setStatus("排程已取消。");
});

Promise.all([restore(), renderUpdateStatus()]).catch((error) => setStatus(error.message, "error"));
