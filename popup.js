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
  diningPurpose: document.querySelector("#dining-purpose"),
  releaseAt: document.querySelector("#release-at"),
  prepMinutes: document.querySelector("#prep-minutes")
};

const statusBox = document.querySelector("#status");
const updateCard = document.querySelector(".update-card");
const updateMode = document.querySelector("#update-mode");
const updateButton = document.querySelector("#apply-update");
const reloadCard = document.querySelector("#reload-card");
const backgroundVersionDetail = document.querySelector("#background-version-detail");
const pageRuntimeVersion = document.querySelector("#page-runtime-version");
const reloadExtensionButton = document.querySelector("#reload-extension");
const liveMode = document.querySelector("#live-mode");
const modeToggle = document.querySelector("#mode-toggle");
const BUILD_VERSION = "0.3.25";
let pendingUpdateAction = null;
let manualCheckReadyAt = 0;

function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function checkedAt() {
  return new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

function renderInitialUpdateStatus() {
  document.querySelector("#extension-version").textContent = `v${BUILD_VERSION}`;
  updateButton.hidden = false;
  updateButton.disabled = false;
  updateButton.textContent = "檢查更新";
  updateCard.classList.remove("available");
  pendingUpdateAction = { type: "check" };
  manualCheckReadyAt = performance.now() + 500;

  updateMode.textContent = `目前 v${BUILD_VERSION}｜尚未手動檢查`;
}

function renderRunMode() {
  modeToggle.textContent = liveMode.checked ? "實際｜自動確認" : "預演｜不送出";
  modeToggle.classList.toggle("live", liveMode.checked);
  modeToggle.setAttribute("aria-pressed", String(liveMode.checked));
}

async function checkBackgroundVersion() {
  let backgroundVersion = "未啟動";
  try {
    const response = await chrome.runtime.sendMessage({ type: "PING_BACKGROUND" });
    if (response?.ok && response.version) backgroundVersion = response.version;
  } catch (_error) {}

  const { loadedPageHelperVersion } = await chrome.storage.local.get("loadedPageHelperVersion");
  pageRuntimeVersion.textContent = loadedPageHelperVersion
    ? `頁面助手 v${loadedPageHelperVersion}${loadedPageHelperVersion === BUILD_VERSION ? "｜已套用" : "｜請重新載入 inline 頁面"}`
    : "頁面助手：開啟 inline 後才會偵測";
  const ready = backgroundVersion === BUILD_VERSION;
  reloadCard.hidden = ready;
  backgroundVersionDetail.textContent = `畫面版本 ${BUILD_VERSION}｜背景版本 ${backgroundVersion}`;
  return ready;
}

async function checkForUpdates() {
  const repository = String(globalThis.UPDATE_CONFIG?.githubRepository || "").trim();
  updateButton.disabled = true;
  updateButton.textContent = "檢查中…";
  updateMode.textContent = `目前 v${BUILD_VERSION}｜正在檢查 GitHub`;
  updateCard.classList.remove("available");

  if (!repository) {
    updateMode.textContent = `目前 v${BUILD_VERSION}｜未設定更新來源`;
    updateButton.textContent = "重新檢查";
    updateButton.disabled = false;
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
      const zipAsset = Array.isArray(release.assets)
        ? release.assets.find((asset) => asset?.name === "inline-reservation-helper.zip")
        : null;
      const updateUrl = zipAsset?.browser_download_url || release.html_url;
      updateMode.textContent = `發現新版 v${latestVersion}｜由你手動下載`;
      updateCard.classList.add("available");
      updateButton.textContent = `下載 v${latestVersion}`;
      pendingUpdateAction = { type: "release", url: updateUrl };
    } else if (latestVersion && compareVersions(latestVersion, BUILD_VERSION) < 0) {
      updateMode.textContent = `檢查完成 ${checkedAt()}｜尚無比 v${BUILD_VERSION} 更新的公開版本`;
      updateButton.textContent = "再次檢查";
      pendingUpdateAction = { type: "check" };
    } else {
      updateMode.textContent = `檢查完成 ${checkedAt()}｜v${BUILD_VERSION} 已是最新版`;
      updateButton.textContent = "再次檢查";
      pendingUpdateAction = { type: "check" };
    }
  } catch (_error) {
    updateMode.textContent = `檢查失敗 ${checkedAt()}｜請稍後重試`;
    updateButton.textContent = "重新檢查";
    pendingUpdateAction = { type: "check" };
  } finally {
    updateButton.disabled = false;
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

updateButton.addEventListener("click", async (event) => {
  if (!event.isTrusted || performance.now() < manualCheckReadyAt) return;
  if (pendingUpdateAction?.type === "release" && pendingUpdateAction.url) {
    await chrome.tabs.create({ url: pendingUpdateAction.url, active: true });
    setStatus("已開始取得新版。解壓縮並覆蓋原資料夾後，到擴充功能頁按「重新載入」。", "ok");
    return;
  }
  await checkForUpdates();
});

reloadExtensionButton.addEventListener("click", async () => {
  reloadExtensionButton.disabled = true;
  reloadExtensionButton.textContent = "正在套用…";
  await chrome.storage.local.set({ reloadInlineAfterExtensionRestart: true });
  chrome.runtime.reload();
});

modeToggle.addEventListener("click", async () => {
  liveMode.checked = !liveMode.checked;
  renderRunMode();
  const { reservation } = await chrome.storage.local.get("reservation");
  const updates = { selectedRunMode: liveMode.checked ? "live" : "preview" };
  if (reservation) updates.reservation = { ...reservation, autoSubmit: liveMode.checked };
  await chrome.storage.local.set(updates);
  setStatus(
    liveMode.checked
      ? "已切換為實際模式；條款與金額會自動確認，只有需要填卡、OTP 或 CAPTCHA 時才會停止。"
      : "已切換為預演模式；只找位與填寫，不會送出最終訂位。",
    liveMode.checked ? "error" : "ok"
  );
});

window.addEventListener("pageshow", renderInitialUpdateStatus);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") renderInitialUpdateStatus();
});

function setStatus(message, kind = "") {
  statusBox.textContent = message;
  statusBox.className = kind;
  statusBox.setAttribute("role", kind === "error" ? "alert" : "status");
  if (kind === "error") statusBox.focus({ preventScroll: false });
}

function readReservation() {
  const value = Object.fromEntries(Object.entries(fields).map(([key, element]) => [
    key, element.type === "checkbox" ? element.checked : element.value.trim()
  ]));
  value.autoSubmit = liveMode.checked;
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
  return InlineHelperCommon.normalizeRestaurantInput(value).kind === "url";
}

function validate(reservation, scheduling = false) {
  if (!reservation.restaurantQuery) throw new Error("請輸入餐廳名稱或 inline 訂位網址。");
  const restaurant = InlineHelperCommon.normalizeRestaurantInput(reservation.restaurantQuery);
  if (restaurant.kind === "invalid-url") {
    throw new Error("網址必須是 https://inline.app/booking/... 官方訂位頁。");
  }
  reservation.restaurantQuery = restaurant.value;
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
  await chrome.storage.local.remove(["activeReservationTabId", "pendingRestaurantSearch"]);
  await chrome.storage.local.set({ reservation, flowStatus: "準備開始" });
}

async function restore() {
  const { reservation, lastOpenedAt, flowStatus, flowStatusKind, lastSelectedDate, selectedRunMode } = await chrome.storage.local.get([
    "reservation", "lastOpenedAt", "flowStatus", "flowStatusKind", "lastSelectedDate", "selectedRunMode"
  ]);
  liveMode.checked = selectedRunMode === "live" || (selectedRunMode === undefined && reservation?.autoSubmit === true);
  renderRunMode();
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
  if (flowStatus) setStatus(
    `${flowStatus}${lastSelectedDate ? `；目前日期 ${lastSelectedDate}` : ""}`,
    flowStatusKind === "error" ? "error" : flowStatusKind === "ok" ? "ok" : ""
  );
  else if (alarm) setStatus(`已排程：${new Date(alarm.scheduledTime).toLocaleString("zh-TW")}`, "ok");
  else if (lastOpenedAt) setStatus(`上次啟動：${new Date(lastOpenedAt).toLocaleString("zh-TW")}`);
  else setStatus("填妥三個區塊後，即可開始找位。");
}

document.querySelector("#schedule").addEventListener("click", async () => {
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
    const modeText = reservation.autoSubmit
      ? "實際模式：條款與金額會自動確認；需要填卡、OTP 或 CAPTCHA 時才會停止。"
      : "模擬模式：只找位與填寫，會停在最後送出前。";
    const searchText = response.mode === "url"
      ? "已忽略排程時間，立即開始尋找可用時段。"
      : "已忽略排程時間並開啟 inline 官方搜尋；若有多家分店，請選擇一次。";
    setStatus(`${modeText}${searchText}`, "ok");
  } catch (error) { setStatus(error.message, "error"); }
});

document.querySelector("#cancel").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CANCEL" });
  const { reservation } = await chrome.storage.local.get("reservation");
  if (reservation) await chrome.storage.local.set({ reservation: { ...reservation, enabled: false }, flowStatus: "排程已取消" });
  setStatus("排程已取消。");
});

liveMode.checked = false;
renderRunMode();
Promise.all([restore(), renderInitialUpdateStatus(), checkBackgroundVersion()]).catch((error) => setStatus(error.message, "error"));
