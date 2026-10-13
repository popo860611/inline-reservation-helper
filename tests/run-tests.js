const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
require(path.join(root, "common.js"));

const { normalizeRestaurantInput, setUrlQueryParams, bookingIdentity, canAdoptFormScope, matchingBookingTabIds, restaurantMatchScore, selectRestaurantMatch, timeToMinutes, dateTextToIso, finalSubmitAction, isAutoConsentText, splitContactName, controlStateIsSelected, consentControlShouldAct, isSafeOptionalSkipText, classifyBookingStage } = globalThis.InlineHelperCommon;
const bookingUrl = "https://inline.app/booking/-company/-branch";

assert.equal(normalizeRestaurantInput(bookingUrl).kind, "url");
assert.equal(normalizeRestaurantInput(`inline.app/booking/-company/-branch`).kind, "url");
assert.equal(normalizeRestaurantInput(`${bookingUrl}/form`).value, bookingUrl);
assert.equal(normalizeRestaurantInput(`-company/-branch/form`).value, bookingUrl);
assert.equal(normalizeRestaurantInput(`/booking/-company/-branch/form`).value, bookingUrl);
assert.equal(bookingIdentity(`${bookingUrl}/form`), "-company/-branch");
assert.equal(bookingIdentity("https://inline.app/booking/-company/-other/form"), "-company/-other");
assert.equal(bookingIdentity("https://example.com/booking/-company/-branch/form"), "");
assert.equal(canAdoptFormScope({
  senderUrl: `${bookingUrl}/form`, expectedUrl: bookingUrl,
  senderActive: true, reservationEnabled: true
}), true);
assert.equal(canAdoptFormScope({
  senderUrl: "https://inline.app/booking/-company/-other/form", expectedUrl: bookingUrl,
  senderActive: true, reservationEnabled: true
}), false);
assert.equal(canAdoptFormScope({
  senderUrl: `${bookingUrl}/form`, expectedUrl: bookingUrl,
  senderActive: false, reservationEnabled: true
}), false);
assert.equal(canAdoptFormScope({
  senderUrl: `${bookingUrl}/form`, expectedUrl: bookingUrl,
  senderActive: true, reservationEnabled: false
}), false);
assert.deepEqual(matchingBookingTabIds([
  { id: 11, url: `${bookingUrl}/form` },
  { id: 12, url: `${bookingUrl}?inline_helper=1` },
  { id: 13, url: "https://inline.app/booking/-company/-other/form" },
  { id: "14", url: `${bookingUrl}/form` }
], bookingUrl), [11, 12]);
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
assert.equal(finalSubmitAction({ autoSubmit: false, submitAttemptedAt: 0, hasFinalButton: false }), "processing");
assert.equal(finalSubmitAction({ autoSubmit: false, submitAttemptedAt: 0, hasFinalButton: true }), "preview");
assert.equal(finalSubmitAction({ autoSubmit: true, submitAttemptedAt: 0, hasFinalButton: true }), "submit");
assert.equal(finalSubmitAction({ autoSubmit: true, submitAttemptedAt: Date.now(), hasFinalButton: true }), "wait");
assert.equal(isAutoConsentText("我已閱讀並同意規則與注意事項"), true);
assert.equal(isAutoConsentText("我同意上述信用卡綁定及預收取消費須知"), true);
assert.equal(isAutoConsentText("我願意收到餐廳優惠與活動資訊"), false);
assert.deepEqual(splitContactName("張廷菘"), { familyName: "張", givenName: "廷菘" });
assert.deepEqual(splitContactName("王 小明"), { familyName: "王", givenName: "小明" });
assert.equal(controlStateIsSelected({ ariaChecked: "true" }), true);
assert.equal(controlStateIsSelected({ dataState: "checked" }), true);
assert.equal(controlStateIsSelected({ checked: false, ariaChecked: "false" }), false);
assert.equal(consentControlShouldAct({ isLabel: true, targetIsSelf: true, targetVisible: true, required: false }), false);
assert.equal(consentControlShouldAct({ isLabel: true, targetIsSelf: false, targetVisible: false, required: false }), false);
assert.equal(consentControlShouldAct({ isLabel: true, targetIsSelf: false, targetVisible: true, required: false }), true);
assert.equal(consentControlShouldAct({ isLabel: true, targetIsSelf: false, targetVisible: false, required: true }), true);
assert.equal(isSafeOptionalSkipText("跳過預先點餐"), true);
assert.equal(isSafeOptionalSkipText("略過加購"), true);
assert.equal(isSafeOptionalSkipText("稍後選擇"), true);
assert.equal(isSafeOptionalSkipText("不需要"), true);
assert.equal(isSafeOptionalSkipText("預先點餐"), false);
assert.equal(isSafeOptionalSkipText("確認訂位"), false);
assert.equal(isSafeOptionalSkipText("取消訂位"), false);
assert.equal(isSafeOptionalSkipText("返回"), false);
assert.equal(classifyBookingStage({ optionalSkip: true, dateOrTime: true }), "optional");
assert.equal(classifyBookingStage({ payment: true, contact: true }), "payment");
assert.equal(classifyBookingStage({ captcha: true, payment: true }), "captcha");
assert.equal(classifyBookingStage({ contact: true }), "contact");
assert.equal(classifyBookingStage({}), "unknown");
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
assert.match(popup, /reloadInlineAfterExtensionRestart: true/);
assert.ok(popup.indexOf("reloadInlineAfterExtensionRestart: true") < popup.indexOf("chrome.runtime.reload()"));
assert.match(popupHtml, /id="reload-card"[^>]*hidden/);
assert.match(popupHtml, /id="reload-extension"[^>]*>套用插件更新<\/button>/);
assert.match(popupHtml, /id="save-settings"[^>]*>儲存設定<\/button>/);
assert.match(popupHtml, /id="save-settings-status"/);
assert.match(popup, /saveSettingsButton\.addEventListener\("click"/);
assert.match(popup, /設定已儲存/);
assert.match(popup, /有尚未儲存的變更/);
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
assert.match(popup, /selectedRunMode: liveMode\.checked \? "live" : "preview"/);
assert.match(popup, /reservation = \{ \.\.\.reservation, autoSubmit: liveMode\.checked \}/);
assert.match(popup, /selectedRunMode === "live"/);
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
assert.match(background, /senderTabId === activeReservationTabId/);
assert.match(background, /activeMatchingForm/);
assert.match(background, /InlineHelperCommon\.canAdoptFormScope/);
assert.match(background, /activeReservationTabId: senderTabId/);
assert.match(background, /reloadActiveReservationTabAfterUpdate/);
assert.match(background, /chrome\.tabs\.query\(\{ url: \["https:\/\/inline\.app\/booking\/\*"\] \}\)/);
assert.match(background, /chrome\.scripting\.executeScript\(\{ target: \{ tabId: tab\.id \}, files: \["common\.js"\] \}\)/);
assert.match(background, /chrome\.scripting\.executeScript\(\{ target: \{ tabId: tab\.id \}, files: \["content\.js"\] \}\)/);
assert.match(background, /Promise\.allSettled\(injectableTabs\.map/);
assert.match(background, /failedTabs\.map\(\(tab\) => chrome\.tabs\.reload\(tab\.id\)\)/);
assert.ok(manifest.permissions.includes("scripting"));
assert.ok(manifest.host_permissions.includes("https://inline.app/*"));
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
assert.match(content, /document\.querySelector\("#date-picker"\)/);
assert.match(content, /element: visible\(datePicker\) \? datePicker : element/);
assert.match(content, /function selectTargetCalendarDate\(targetDate, opener\)/);
assert.match(content, /querySelector\(`\[data-date="\$\{targetDate\}"\]`\)/);
assert.match(content, /getComputedStyle\(cell\)\.cursor !== "pointer"/);
assert.match(content, /opener && visible\(opener\)[\s\S]*opener\.click\(\)[\s\S]*return "opening"/);
assert.match(content, /querySelectorAll\("h4"\)\]\.filter\(visible\)/);
assert.match(content, /querySelectorAll\("\.nextMonth"\)/);
assert.match(content, /querySelectorAll\("\.prevMonth"\)/);
assert.match(content, /\["selected", "opening", "navigating"\]\.includes\(dateResult\)/);
assert.match(content, /dateResult === "unavailable"/);
assert.match(content, /沒有可選日期/);
assert.ok(content.indexOf("shownDate.value !== lastSelectedDate") < content.indexOf("if (adultPicker && selectBookingOption())"));
assert.match(content, /selectedTimeIsValid = timeButtonIsInRange/);
assert.match(content, /if \(adultPicker && selectedTimeIsValid\)/);
assert.doesNotMatch(content, /function checkRequiredAgreements/);
assert.doesNotMatch(content, /checkbox\.click\(\)/);
assert.match(content, /function findManualConsentControl\(\{ modalOnly = false \} = \{\}\)/);
assert.match(content, /InlineHelperCommon\.isAutoConsentText\(element\.textContent\)/);
assert.match(content, /findManualConsentControl\(\{ modalOnly: true \}\)/);
assert.match(content, /function fillContactName\(value\)/);
assert.match(content, /#familyName, input\[autocomplete="family-name"\]/);
assert.match(content, /#givenName, input\[autocomplete="given-name"\]/);
assert.match(content, /InlineHelperCommon\.splitContactName\(value\)/);
assert.ok(content.indexOf("fillContactName(reservation.contactName)") < content.indexOf("if (hasInteractivePaymentStep())"));
assert.ok(content.indexOf("fillInput(['#phone'") < content.indexOf("if (hasInteractivePaymentStep())"));
assert.ok(content.indexOf("fillInput(['#email'") < content.indexOf("if (hasInteractivePaymentStep())"));
assert.ok(content.indexOf("fillContactName(reservation.contactName)") < content.lastIndexOf("acceptManualConsent(manualConsentControl)"));
assert.match(content, /訂位資料已自動填妥；信用卡、OTP 或付款驗證請由你手動完成/);
assert.match(content, /function acceptManualConsent\(control\)/);
assert.match(content, /function interactiveControl\(control\)/);
assert.match(content, /function controlIsSelected\(control\)/);
assert.match(content, /function consentControlIsActionable\(control\)/);
assert.match(content, /InlineHelperCommon\.consentControlShouldAct/);
assert.match(content, /if \(controlIsSelected\(target\)\) return false/);
assert.match(content, /target\.click\(\);[\s\S]*已同意條款/);
assert.match(content, /scrollable\.scrollTop = scrollable\.scrollHeight/);
assert.ok(content.indexOf("acceptManualConsent(manualConsentControl)") < content.indexOf("const paymentAuthorizationButton = findPaymentAuthorizationButton()"));
assert.match(content, /const CONTENT_VERSION = "0\.3\.28"/);
assert.match(content, /const FAST_STEP_MS = 80/);
assert.match(content, /const NAVIGATION_STEP_MS = 240/);
assert.match(content, /function findSafeOptionalSkipButton\(\)/);
assert.match(content, /InlineHelperCommon\.isSafeOptionalSkipText/);
assert.match(content, /!hasBookingContactFields\(\) && !hasInteractivePaymentStep\(\)/);
assert.match(content, /safeSkipButton\.click\(\)/);
assert.ok(content.indexOf("safeSkipButton.click()") < content.indexOf('exactButton("完成預訂"'));
assert.match(content, /function detectStage\(\)/);
assert.match(content, /type: "FLOW_STAGE"/);
assert.match(background, /message\.type === "FLOW_STAGE"/);
assert.match(content, /observer\.timer = setTimeout\(advance, FAST_STEP_MS\)/);
assert.match(content, /dataset\.inlineHelperVersion === CONTENT_VERSION\) return/);
assert.match(content, /dataset\.inlineHelperVersion = CONTENT_VERSION/);
assert.match(content, /type: "CONTENT_READY"/);
assert.match(background, /message\.type === "CONTENT_READY"/);
assert.match(popup, /pageRuntimeVersion/);
assert.match(content, /querySelectorAll\('\[role="checkbox"\], \[role="radio"\]'\)/);
assert.match(content, /controlIsSelected\(choice\)/);
assert.match(content, /function findPaymentAuthorizationButton\(\)/);
assert.match(content, /正在開啟最終確認資料頁/);
assert.match(content, /paymentAuthorizationButton\.click\(\)/);
assert.ok(content.indexOf("if (hasCaptcha())") < content.indexOf("paymentAuthorizationButton.click()"));
assert.ok(content.indexOf("if (hasInteractivePaymentStep())") < content.indexOf("paymentAuthorizationButton.click()"));
assert.ok(content.indexOf("shownDate.value !== lastSelectedDate") < content.indexOf("paymentAuthorizationButton.click()"));
assert.ok(content.indexOf("selectedTimeIsValid = timeButtonIsInRange") < content.indexOf("paymentAuthorizationButton.click()"));
assert.ok(content.indexOf("const missing = unansweredRequired()") < content.indexOf("paymentAuthorizationButton.click()"));
assert.match(content, /authorizationStepAttemptedAt/);
assert.match(content, /delete state\.authorizationStepAttemptedAt/);
assert.match(content, /finalAction === "processing"/);
assert.match(content, /finalAction === "preview"/);
assert.match(content, /finalAction === "wait"/);
assert.match(content, /finalAction === "submit"/);
assert.doesNotMatch(content, /\/\(payment\|checkout\|credit-card\|deposit\)/);
assert.match(content, /input\[autocomplete="one-time-code"\]/);
assert.match(content, /previewCompletedAt: Date\.now\(\)/);
assert.match(content, /reservation: \{ \.\.\.reservation, enabled: false \}/);
assert.match(background, /openScopedReservationTab\("https:\/\/dining\.inline\.app\/zh-tw\/"\)/);
assert.doesNotMatch(background, /inline-helper-search=/);
const search = fs.readFileSync(path.join(root, "search.js"), "utf8");
assert.match(search, /CHECK_FLOW_SCOPE/);
assert.match(search, /changes\.activeReservationTabId \|\| changes\.pendingRestaurantSearch/);

console.log("All inline reservation helper tests passed.");
