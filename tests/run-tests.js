const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
require(path.join(root, "common.js"));

const { normalizeRestaurantInput, setUrlQueryParams, bookingIdentity, canAdoptFormScope, paymentFieldKind, contactFieldKind, matchingBookingTabIds, restaurantMatchScore, selectRestaurantMatch, timeToMinutes, dateTextToIso, isAutoConsentText, splitContactName, controlStateIsSelected, consentControlShouldAct, isSafeOptionalSkipText, classifyBookingStage } = globalThis.InlineHelperCommon;
const bookingUrl = "https://inline.app/booking/-company/-branch";
const targetBookingUrl = "https://inline.app/booking/-MX-yyjCqn5gCDe7CBbr:inline-live-2/-MX-yytm3G1ci3oFvkwp?language=zh-tw";

assert.equal(normalizeRestaurantInput(bookingUrl).kind, "url");
assert.equal(normalizeRestaurantInput(`inline.app/booking/-company/-branch`).kind, "url");
assert.equal(normalizeRestaurantInput(`${bookingUrl}/form`).value, bookingUrl);
assert.equal(normalizeRestaurantInput(`-company/-branch/form`).value, bookingUrl);
assert.equal(normalizeRestaurantInput(`/booking/-company/-branch/form`).value, bookingUrl);
assert.equal(bookingIdentity(`${bookingUrl}/form`), "-company/-branch");
assert.equal(bookingIdentity("https://inline.app/booking/-company/-other/form"), "-company/-other");
assert.equal(bookingIdentity("https://example.com/booking/-company/-branch/form"), "");
assert.equal(bookingIdentity(targetBookingUrl), bookingIdentity(targetBookingUrl.replace(":inline-live-2", "%3Ainline-live-2")));
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
for (const step of ["payment", "checkout", "confirm", "confirmation"]) {
  assert.equal(canAdoptFormScope({
    senderUrl: `${bookingUrl}/${step}`, expectedUrl: bookingUrl,
    senderActive: true, reservationEnabled: true
  }), true);
}
assert.equal(canAdoptFormScope({
  senderUrl: bookingUrl, expectedUrl: bookingUrl,
  senderActive: true, reservationEnabled: true
}), false);
assert.equal(paymentFieldKind("信用卡卡號"), "number");
assert.equal(paymentFieldKind("信用卡有效期限 (月/年)"), "expiry");
assert.equal(paymentFieldKind("信用卡安全碼 (3-4 碼)"), "cvc");
assert.equal(paymentFieldKind("持卡人姓名"), "holder");
assert.equal(paymentFieldKind("簡訊驗證碼 autocomplete:one-time-code"), "");
assert.equal(paymentFieldKind("autocomplete:cc-exp-month"), "expiryMonth");
assert.equal(paymentFieldKind("autocomplete:cc-exp-year"), "expiryYear");
assert.equal(contactFieldKind("type:tel"), "phone");
assert.equal(contactFieldKind("type:email"), "email");
assert.equal(contactFieldKind("id:familyName"), "family");
assert.equal(contactFieldKind("持卡人姓名"), "");
assert.equal(contactFieldKind("信用卡卡號"), "");
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
assert.doesNotMatch(popupHtml, /payment-card|card-vault|enable-tappay/);
assert.doesNotMatch(popup, /FILL_CARD|CardVault|permissions\.request/);
assert.equal(manifest.optional_host_permissions, undefined);
assert.equal(manifest.optional_permissions, undefined);
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
assert.match(popupHtml, /class="header-row"[\s\S]+id="mode-toggle"/);
assert.doesNotMatch(popupHtml, /class="run-mode"/);
assert.doesNotMatch(popupHtml, /id="auto-submit"/);
assert.match(popup, /value\.autoSubmit = liveMode\.checked/);
assert.match(popup, /liveMode\.checked = reservation\?\.autoSubmit === true/);
assert.match(popup, /remove\(\["activeReservationTabId", "pendingRestaurantSearch"\]\)/);
assert.match(popup, /flowStatusKind === "error"/);
assert.match(popup, /flowStatusKind === "ok"/);
assert.match(popup, /asset\?\.name === "inline-reservation-helper\.zip"/);
assert.match(popup, /updateButton\.textContent = `下載 v\$\{latestVersion\}`/);

const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
assert.match(background, /storage\.local\.remove\("savedPaymentCard"\)/);
assert.match(background, /message\.type === "PING_BACKGROUND"/);
assert.match(background, /chrome\.runtime\.getManifest\(\)\.version/);
assert.match(background, /flowStatusKind: message\.kind \|\| "ok"/);
assert.match(background, /message\.type === "CHECK_FLOW_SCOPE"/);
assert.match(background, /message\.type === "RESUME_CURRENT_FLOW"/);
assert.match(background, /reservation: \{ \.\.\.reservation, enabled: true \}/);
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
assert.match(background, /FLOW_SCOPE_MIGRATION = "0\.3\.51"/);
assert.match(background, /migrateUnsafeGlobalFlow/);
assert.match(background, /if \(reservation\) updates\.reservation = \{ \.\.\.reservation, enabled: false \}/);
assert.match(background, /安全更新已停止舊任務/);
assert.match(background, /pendingRestaurantSearch/);
assert.match(background, /diner-network-api\.inline\.app\/diner-network\/search/);
assert.doesNotMatch(background, /new URL\(/);
const content = fs.readFileSync(path.join(root, "content.js"), "utf8");
assert.doesNotMatch(content, /new URL\(/);
assert.doesNotMatch(content, /paymentAuthorizationButton\.click\(\)|acceptManualConsent\(/);
assert.doesNotMatch(content, /inline 已顯示訂位成功|flowStatus: "訂位完成"|isSuccessPage\(/);
assert.match(content, /if \(!scope\?\.active\) return/);
assert.match(content, /if \(!reservation\?\.enabled\) return/);
assert.doesNotMatch(content, /!reservation\?\.enabled && !helperUrl/);
assert.match(content, /const helperUrl = new URLSearchParams\(location\.search\)\.has\("inline_helper"\)/);
assert.ok(content.indexOf("const helperUrl =") < content.indexOf("if (!helperUrl"));
assert.match(content, /changes\.activeReservationTabId \|\| changes\.reservation/);
assert.match(content, /report\("預演完成", "預演完成：已找到可用時段並填妥資料，尚未送出訂位"/);
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
assert.match(content, /if \(adultPicker && \(selectedTimeIsValid \|\| state\.timeSelectedAt\)\)/);
assert.doesNotMatch(content, /function checkRequiredAgreements/);
assert.doesNotMatch(content, /checkbox\.click\(\)/);
assert.match(content, /function findManualConsentControl\(\{ modalOnly = false \} = \{\}\)/);
assert.match(content, /InlineHelperCommon\.isAutoConsentText\(element\.textContent\)/);
assert.match(content, /findManualConsentControl\(\{ modalOnly: true \}\)/);
assert.match(content, /function fillContactName\(value\)/);
assert.match(content, /const fields = contactFields\(\)/);
assert.match(content, /InlineHelperCommon\.splitContactName\(value\)/);
assert.ok(content.indexOf("fillContactName(reservation.contactName)") < content.lastIndexOf("if (hasInteractivePaymentStep())"));
assert.ok(content.indexOf("fillField(contact.phone") < content.lastIndexOf("if (hasInteractivePaymentStep())"));
assert.ok(content.indexOf("fillField(contact.email") < content.lastIndexOf("if (hasInteractivePaymentStep())"));
assert.ok(content.indexOf("fillContactName(reservation.contactName)") < content.lastIndexOf("waitForManualConsent(manualConsentControl)"));
assert.match(content, /自行填寫信用卡/);
assert.match(content, /String\(input\.value \|\| ""\)\.trim\(\)\) return false/);
assert.match(content, /await chrome\.storage\.local\.set\(\{ reservation: \{ \.\.\.reservation, enabled: false \} \}\)/);
assert.match(background, /_sender\.url !== chrome\.runtime\.getURL\("popup\.html"\)/);
assert.doesNotMatch(background, /storage\.(?:local|sync|session)\.set\([^\n]*card/);
assert.match(content, /function waitForManualConsent\(control\)/);
assert.match(content, /\.house-rules/);
assert.match(content, /助手會將規則捲到底/);
assert.match(content, /我已閱讀並同意，代我按 inline 同意/);
assert.match(content, /function interactiveControl\(control\)/);
assert.match(content, /function controlIsSelected\(control\)/);
assert.match(content, /function consentControlIsActionable\(control\)/);
assert.match(content, /InlineHelperCommon\.consentControlShouldAct/);
assert.match(content, /if \(controlIsSelected\(target\)\) return false/);
assert.match(content, /待手動同意/);
assert.ok(content.indexOf("waitForManualConsent(manualConsentControl)") < content.indexOf("const paymentAuthorizationButton = findPaymentAuthorizationButton()"));
assert.ok(content.includes(`const CONTENT_VERSION = "${manifest.version}"`));
assert.match(content, /const FAST_STEP_MS = 80/);
assert.match(content, /const NAVIGATION_STEP_MS = 240/);
assert.match(content, /function findSafeOptionalSkipButton\(\)/);
assert.match(content, /InlineHelperCommon\.isSafeOptionalSkipText/);
assert.match(content, /!hasBookingContactFields\(\) && !hasInteractivePaymentStep\(\)/);
assert.match(content, /safeSkipButton\.click\(\)/);
assert.ok(content.indexOf("safeSkipButton.click()") < content.indexOf('const bookingButton = findBookingDetailsButton('));
assert.match(content, /function detectStage\(\)/);
assert.match(content, /type: "FLOW_STAGE"/);
assert.match(background, /message\.type === "FLOW_STAGE"/);
assert.match(content, /function scheduleAdvance\(delay = 0\)/);
assert.match(content, /dataset\.inlineHelperVersion === CONTENT_VERSION\) return/);
assert.match(content, /dataset\.inlineHelperVersion = CONTENT_VERSION/);
assert.match(content, /type: "CONTENT_READY"/);
assert.match(background, /message\.type === "CONTENT_READY"/);
assert.match(popup, /pageRuntimeVersion/);
assert.match(popup, /resume-current-flow/);
assert.match(popupHtml, /id="resume-current-flow"/);
assert.match(content, /querySelectorAll\('\[role="checkbox"\], \[role="radio"\]'\)/);
assert.match(content, /controlIsSelected\(choice\)/);
assert.match(content, /function findPaymentAuthorizationButton\(\)/);
assert.match(content, /待手動授權/);
assert.ok(content.indexOf("const missing = unansweredRequired()") < content.indexOf("const paymentAuthorizationButton = findPaymentAuthorizationButton()"));
assert.doesNotMatch(content, /authorizationStepAttemptedAt/);
assert.ok(content.indexOf("state.submitAttemptedAt = Date.now()") < content.indexOf("finalButton.click()"));
assert.doesNotMatch(content, /\/\(payment\|checkout\|credit-card\|deposit\)/);
assert.match(content, /input\[autocomplete="one-time-code"\]/);
assert.match(content, /previewCompletedAt: Date\.now\(\)/);
assert.match(content, /reservation: \{ \.\.\.reservation, enabled: false \}/);
assert.match(background, /openScopedReservationTab\("https:\/\/dining\.inline\.app\/zh-tw\/"\)/);
assert.doesNotMatch(background, /inline-helper-search=/);
const search = fs.readFileSync(path.join(root, "search.js"), "utf8");
assert.match(search, /CHECK_FLOW_SCOPE/);
assert.match(search, /changes\.activeReservationTabId \|\| changes\.pendingRestaurantSearch/);

execFileSync(process.execPath, [path.join(__dirname, "flow-integration.js")], { stdio: "pipe" });

assert.equal(globalThis.InlineHelperCommon.finalSubmitAction({hasFinalButton: true}), "preview");
assert.equal(globalThis.InlineHelperCommon.finalSubmitAction({autoSubmit: true, hasFinalButton: true}), "submit");
assert.equal(globalThis.InlineHelperCommon.finalSubmitAction({autoSubmit: true, hasFinalButton: false}), "processing");
assert.equal(globalThis.InlineHelperCommon.finalSubmitAction({autoSubmit: true, hasFinalButton: true, submitAttemptedAt: 1}), "wait");

execFileSync(process.execPath, [path.join(__dirname, "run-mode-integration.js")], { stdio: "pipe" });
console.log("All inline reservation helper tests passed.");
