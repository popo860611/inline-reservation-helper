const fields = {
  restaurantName: document.querySelector("#restaurant-name"),
  bookingUrl: document.querySelector("#booking-url"),
  date: document.querySelector("#booking-date"),
  time: document.querySelector("#booking-time"),
  adults: document.querySelector("#adults"),
  releaseAt: document.querySelector("#release-at"),
  prepMinutes: document.querySelector("#prep-minutes"),
  randomDays: document.querySelector("#random-days"),
  contactName: document.querySelector("#contact-name"),
  contactPhone: document.querySelector("#contact-phone"),
  contactEmail: document.querySelector("#contact-email"),
  autoSubmit: document.querySelector("#auto-submit")
};

const form = document.querySelector("#reservation-form");
const statusBox = document.querySelector("#status");

async function renderUpdateStatus() {
  const manifest = chrome.runtime.getManifest();
  const { updateStatus } = await chrome.storage.local.get("updateStatus");
  document.querySelector("#extension-version").textContent = `v${manifest.version}`;
  document.querySelector("#update-mode").textContent = updateStatus || (
    manifest.update_url
      ? "已啟用，由瀏覽器自動安裝新版"
      : "Git 開發版：自動顯示版本，更新後需重新載入"
  );
}

function setStatus(message, kind = "") {
  statusBox.textContent = message;
  statusBox.className = kind;
}

function readReservation() {
  const value = Object.fromEntries(Object.entries(fields).map(([key, element]) => [
    key,
    element.type === "checkbox" ? element.checked : element.value.trim()
  ]));
  return {
    ...value,
    adults: Number(value.adults),
    prepMinutes: Number(value.prepMinutes),
    randomDays: Number(value.randomDays),
    language: "zh",
    enabled: true
  };
}

function validate(reservation) {
  const url = new URL(reservation.bookingUrl);
  const allowedHost = url.hostname === "inline.app" || url.hostname.endsWith(".inline.app");
  if (url.protocol !== "https:" || !allowedHost || !url.pathname.startsWith("/booking/")) {
    throw new Error("請貼上 https://inline.app/booking/... 的官方訂位網址。");
  }
  if (!reservation.time) {
    throw new Error("請填妥用餐時段。");
  }
  if (!Number.isInteger(reservation.adults) || reservation.adults < 1 || reservation.adults > 20) {
    throw new Error("人數需介於 1 到 20；仍以餐廳實際規則為準。");
  }
  if (
    !Number.isInteger(reservation.prepMinutes) ||
    reservation.prepMinutes < 0 ||
    reservation.prepMinutes > 30
  ) {
    throw new Error("暖機時間需介於 0 到 30 分鐘。");
  }
  if (!Number.isInteger(reservation.randomDays) || reservation.randomDays < 1 || reservation.randomDays > 60) {
    throw new Error("隨機日期範圍需介於 1 到 60 天。");
  }
}

async function save(reservation) {
  validate(reservation);
  await chrome.storage.local.set({ reservation });
}

async function restore() {
  const { reservation, lastOpenedAt, flowStatus, lastSelectedDate } = await chrome.storage.local.get([
    "reservation",
    "lastOpenedAt",
    "flowStatus",
    "lastSelectedDate"
  ]);
  if (reservation) {
    for (const [key, field] of Object.entries(fields)) {
      if (reservation[key] !== undefined) {
        if (field.type === "checkbox") field.checked = Boolean(reservation[key]);
        else field.value = reservation[key];
      }
    }
  }

  const alarm = await chrome.alarms.get("inline-reservation-open");
  if (flowStatus) {
    const dateText = lastSelectedDate ? `；本次日期 ${lastSelectedDate}` : "";
    setStatus(`${flowStatus}${dateText}`);
  } else if (alarm) {
    setStatus(`已排程：${new Date(alarm.scheduledTime).toLocaleString("zh-TW")}`, "ok");
  } else if (lastOpenedAt) {
    setStatus(`上次開啟：${new Date(lastOpenedAt).toLocaleString("zh-TW")}`);
  } else {
    setStatus("尚未設定排程。建議先用「現在開啟測試」確認餐廳網址。");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const reservation = readReservation();
    validate(reservation);
    if (!reservation.releaseAt) throw new Error("使用排程時，請填寫自動啟動時間。");
    const when = new Date(reservation.releaseAt).getTime();
    if (!Number.isFinite(when) || when <= Date.now()) {
      throw new Error("訂位開放時間必須晚於現在。");
    }
    await save(reservation);
    const prepWhen = when - reservation.prepMinutes * 60_000;
    const response = await chrome.runtime.sendMessage({
      type: "SCHEDULE",
      when,
      prepWhen
    });
    if (!response?.ok) throw new Error(response?.error || "無法建立排程。");
    const prepText = reservation.prepMinutes
      ? `，並提前 ${reservation.prepMinutes} 分鐘暖機`
      : "";
    setStatus(`已啟用：${new Date(when).toLocaleString("zh-TW")} 準點開啟${prepText}`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.querySelector("#open-now").addEventListener("click", async () => {
  try {
    const reservation = readReservation();
    await save(reservation);
    const response = await chrome.runtime.sendMessage({ type: "OPEN_NOW", reservation });
    if (!response?.ok) throw new Error(response?.error || "無法開啟訂位頁。");
    setStatus("已啟動。若出現 CAPTCHA，請在頁面手動完成；插件會自動接續。", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.querySelector("#cancel").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CANCEL" });
  const { reservation } = await chrome.storage.local.get("reservation");
  if (reservation) {
    await chrome.storage.local.set({ reservation: { ...reservation, enabled: false } });
  }
  setStatus("排程已取消。");
});

Promise.all([restore(), renderUpdateStatus()]).catch((error) =>
  setStatus(error.message, "error")
);
