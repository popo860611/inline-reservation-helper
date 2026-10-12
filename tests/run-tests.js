const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
require(path.join(root, "common.js"));

const { normalizeRestaurantInput, setUrlQueryParams, restaurantMatchScore, selectRestaurantMatch, timeToMinutes, dateTextToIso } = globalThis.InlineHelperCommon;
const bookingUrl = "https://inline.app/booking/-company/-branch";

assert.equal(normalizeRestaurantInput(bookingUrl).kind, "url");
assert.equal(normalizeRestaurantInput(`inline.app/booking/-company/-branch`).kind, "url");
assert.equal(normalizeRestaurantInput(`${bookingUrl}/form`).value, bookingUrl);
assert.equal(normalizeRestaurantInput(`-company/-branch/form`).value, bookingUrl);
assert.equal(normalizeRestaurantInput(`/booking/-company/-branch/form`).value, bookingUrl);
assert.equal(
  setUrlQueryParams(`${bookingUrl}/form?utm_source=test`, { inline_helper: "1", pre_filled_form: "abc+/=" }),
  `${bookingUrl}?utm_source=test&inline_helper=1&pre_filled_form=abc%2B%2F%3D`
);
assert.equal(normalizeRestaurantInput(`[餐廳](${bookingUrl})`).value, bookingUrl);
assert.equal(normalizeRestaurantInput(`請開這個 ${bookingUrl} 謝謝`).kind, "url");
assert.deepEqual(normalizeRestaurantInput("辛殿麻辣鍋 信義店"), { kind: "name", value: "辛殿麻辣鍋 信義店" });
assert.equal(normalizeRestaurantInput("https://example.com/booking/a").kind, "invalid-url");
assert.equal(timeToMinutes("12:00"), 720);
assert.equal(timeToMinutes("下午 1:30"), 810);
assert.equal(timeToMinutes("18:00\nNT$1,000 x 3"), 1080);
assert.equal(dateTextToIso("2026年10月12日"), "2026-10-12");
assert.equal(dateTextToIso("2026/11/05"), "2026-11-05");
assert.equal(dateTextToIso("2026-02-30"), null);
assert.equal(restaurantMatchScore("辛殿麻辣鍋 Xin Dian Hotpot 信義店 Xinyi", "辛殿信義店"), 1);
assert.equal(selectRestaurantMatch([
  { name: "辛殿麻辣鍋 Xin Dian Hotpot 信義店 Xinyi", bookingLink: bookingUrl },
  { name: "辛殿麻辣鍋 松江店", bookingLink: "https://inline.app/booking/-company/-songjiang" }
], "辛殿信義店").bookingLink, bookingUrl);
assert.equal(selectRestaurantMatch([
  { name: "同名餐廳 台北店", bookingLink: bookingUrl },
  { name: "同名餐廳 台北店", bookingLink: "https://inline.app/booking/-company/-other" }
], "同名餐廳 台北店"), null);
assert.equal(selectRestaurantMatch([
  { name: "涮乃葉日式涮涮鍋吃到飽 欣欣百貨店", bookingLink: bookingUrl },
  { name: "涮乃葉日式涮涮鍋吃到飽 徐匯廣場店", bookingLink: "https://inline.app/booking/-company/-xuhui" }
], "涮乃葉日式涮涮鍋"), null);

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");
assert.ok(popup.includes(`const BUILD_VERSION = "${manifest.version}"`));
assert.deepEqual(manifest.content_scripts[0].js, ["common.js", "content.js"]);
assert.deepEqual(manifest.content_scripts[1].js, ["common.js", "search.js"]);
const popupHtml = fs.readFileSync(path.join(root, "popup.html"), "utf8");
assert.match(popupHtml, /id="open-now"[^>]+type="button"[^>]+formnovalidate/);
assert.match(popupHtml, /id="schedule"[^>]+type="button"[^>]+formnovalidate/);
assert.doesNotMatch(popup, /form\.addEventListener\("submit"/);
assert.match(popup, /#schedule[\s\S]+save\(reservation, true\)/);
assert.match(popup, /#open-now[\s\S]+save\(reservation\);/);
assert.doesNotMatch(popup, /restore\(\), renderUpdateStatus\(\)/);
assert.match(popup, /restore\(\), renderInitialUpdateStatus\(\)/);
assert.match(popupHtml, /id="apply-update"[^>]*>檢查更新<\/button>/);
assert.doesNotMatch(popupHtml, /id="apply-update"[^>]*hidden/);
assert.match(popup, /chrome\.runtime\.sendMessage\(\{ type: "PING_BACKGROUND" \}\)/);
assert.match(popup, /chrome\.runtime\.reload\(\)/);
assert.match(popupHtml, /id="reload-card"[^>]*hidden/);
assert.match(popupHtml, /id="reload-extension"[^>]*>套用插件更新<\/button>/);
assert.match(popup, /window\.addEventListener\("pageshow", renderInitialUpdateStatus\)/);
assert.match(popup, /document\.visibilityState === "visible"/);
assert.match(popup, /!event\.isTrusted/);
assert.match(popup, /manualCheckReadyAt = performance\.now\(\) \+ 500/);
assert.match(popupHtml, /class="header-row"[\s\S]+id="live-mode" type="checkbox" hidden[\s\S]+id="mode-toggle"[^>]*>預演｜不送出<\/button>/);
assert.doesNotMatch(popupHtml, /class="run-mode"/);
assert.doesNotMatch(popupHtml, /id="auto-submit"/);
assert.match(popup, /value\.autoSubmit = liveMode\.checked/);
assert.match(popup, /liveMode\.checked = false/);
assert.match(popup, /modeToggle\.addEventListener\("click"/);
assert.match(popup, /remove\(\["activeReservationTabId", "pendingRestaurantSearch"\]\)/);
assert.match(popup, /flowStatusKind === "error"/);
assert.match(popup, /flowStatusKind === "ok"/);
assert.match(popup, /asset\?\.name === "inline-reservation-helper\.zip"/);
assert.match(popup, /updateButton\.textContent = `下載 v\$\{latestVersion\}`/);

const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
assert.match(background, /message\.type === "PING_BACKGROUND"/);
assert.match(background, /chrome\.runtime\.getManifest\(\)\.version/);
assert.match(background, /flowStatusKind: message\.kind \|\| "ok"/);
assert.match(background, /message\.type === "CHECK_FLOW_SCOPE"/);
assert.match(background, /_sender\.tab\.id === activeReservationTabId/);
assert.match(background, /openScopedReservationTab/);
assert.match(background, /FLOW_SCOPE_MIGRATION = "0\.3\.12"/);
assert.match(background, /migrateUnsafeGlobalFlow/);
assert.match(background, /if \(reservation\) updates\.reservation = \{ \.\.\.reservation, enabled: false \}/);
assert.match(background, /安全更新已停止舊任務/);
assert.match(background, /pendingRestaurantSearch/);
assert.match(background, /diner-network-api\.inline\.app\/diner-network\/search/);
assert.doesNotMatch(background, /new URL\(/);
const content = fs.readFileSync(path.join(root, "content.js"), "utf8");
assert.doesNotMatch(content, /new URL\(/);
assert.ok(content.indexOf("if (!reservation.autoSubmit)") < content.indexOf("finalButton.click()"));
assert.match(content, /if \(!scope\?\.active\) return/);
assert.match(content, /if \(!reservation\?\.enabled\) return/);
assert.doesNotMatch(content, /!reservation\?\.enabled && !helperUrl/);
assert.match(content, /const helperUrl = new URLSearchParams\(location\.search\)\.has\("inline_helper"\)/);
assert.ok(content.indexOf("const helperUrl =") < content.indexOf("if (!helperUrl"));
assert.match(content, /changes\.activeReservationTabId \|\| changes\.reservation/);
assert.match(content, /report\("預演完成", "預演完成：已找到可用時段並填妥資料；沒有送出訂位"\)/);
assert.match(content, /function showPreviewComplete\(\)/);
assert.match(content, /id = "inline-helper-preview-complete"/);
assert.match(content, /尚未送出訂位/);
assert.match(content, /role="status" aria-live="assertive" aria-atomic="true"/);
assert.match(content, /role="dialog" aria-modal="true"/);
assert.match(content, /event\.key === "Escape"/);
assert.match(content, /prefers-reduced-motion:no-preference/);
assert.match(content, /showPreviewComplete\(\);[\s\S]*report\("預演完成"/);
assert.match(content, /function showCaptchaNotice\(\)/);
assert.match(content, /完成後插件會自動繼續/);
assert.match(content, /showCaptchaNotice\(\);[\s\S]*report\("CAPTCHA"/);
assert.match(content, /shownDate\.value !== lastSelectedDate/);
assert.match(content, /selectedTimeIsValid = timeButtonIsInRange/);
assert.match(content, /if \(adultPicker && selectedTimeIsValid\)/);
assert.match(content, /previewCompletedAt: Date\.now\(\)/);
assert.match(content, /reservation: \{ \.\.\.reservation, enabled: false \}/);
assert.match(background, /openScopedReservationTab\("https:\/\/dining\.inline\.app\/zh-tw\/"\)/);
assert.doesNotMatch(background, /inline-helper-search=/);
const search = fs.readFileSync(path.join(root, "search.js"), "utf8");
assert.match(search, /CHECK_FLOW_SCOPE/);
assert.match(search, /changes\.activeReservationTabId \|\| changes\.pendingRestaurantSearch/);

console.log("All inline reservation helper tests passed.");
