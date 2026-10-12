const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
require(path.join(root, "common.js"));

const { normalizeRestaurantInput, restaurantMatchScore, selectRestaurantMatch, timeToMinutes } = globalThis.InlineHelperCommon;
const bookingUrl = "https://inline.app/booking/-company/-branch";

assert.equal(normalizeRestaurantInput(bookingUrl).kind, "url");
assert.equal(normalizeRestaurantInput(`inline.app/booking/-company/-branch`).kind, "url");
assert.equal(normalizeRestaurantInput(`[餐廳](${bookingUrl})`).value, bookingUrl);
assert.equal(normalizeRestaurantInput(`請開這個 ${bookingUrl} 謝謝`).kind, "url");
assert.deepEqual(normalizeRestaurantInput("辛殿麻辣鍋 信義店"), { kind: "name", value: "辛殿麻辣鍋 信義店" });
assert.equal(normalizeRestaurantInput("https://example.com/booking/a").kind, "invalid-url");
assert.equal(timeToMinutes("12:00"), 720);
assert.equal(timeToMinutes("下午 1:30"), 810);
assert.equal(timeToMinutes("18:00\nNT$1,000 x 3"), 1080);
assert.equal(restaurantMatchScore("辛殿麻辣鍋 Xin Dian Hotpot 信義店 Xinyi", "辛殿信義店"), 1);
assert.equal(selectRestaurantMatch([
  { name: "辛殿麻辣鍋 Xin Dian Hotpot 信義店 Xinyi", bookingLink: bookingUrl },
  { name: "辛殿麻辣鍋 松江店", bookingLink: "https://inline.app/booking/-company/-songjiang" }
], "辛殿信義店").bookingLink, bookingUrl);
assert.equal(selectRestaurantMatch([
  { name: "同名餐廳 台北店", bookingLink: bookingUrl },
  { name: "同名餐廳 台北店", bookingLink: "https://inline.app/booking/-company/-other" }
], "同名餐廳 台北店"), null);

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

const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
assert.match(background, /pendingRestaurantSearch/);
assert.match(background, /diner-network-api\.inline\.app\/diner-network\/search/);
assert.match(background, /chrome\.tabs\.create\(\{ url: "https:\/\/dining\.inline\.app\/zh-tw\/"/);
assert.doesNotMatch(background, /inline-helper-search=/);

console.log("All inline reservation helper tests passed.");
