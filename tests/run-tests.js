const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
require(path.join(root, "common.js"));

const { normalizeRestaurantInput, timeToMinutes } = globalThis.InlineHelperCommon;
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

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");
assert.ok(popup.includes(`const BUILD_VERSION = "${manifest.version}"`));
assert.deepEqual(manifest.content_scripts[0].js, ["common.js", "content.js"]);
assert.deepEqual(manifest.content_scripts[1].js, ["common.js", "search.js"]);

console.log("All inline reservation helper tests passed.");
