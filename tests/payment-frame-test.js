const assert = require("node:assert/strict");
const path = require("node:path");

class TestInput {
  constructor() { this.value = ""; }
  focus() {}
  blur() {}
  dispatchEvent() { return true; }
}

Object.defineProperty(TestInput.prototype, "value", {
  get() { return this._value || ""; },
  set(value) { this._value = String(value); },
  configurable: true
});

async function run() {
  const input = new TestInput();
  const messages = [];
  global.location = { href: 'https://js.tappaysdk.com/sdk/tpdirect/tappay-field/html/v5.14.0?%7B%22type%22%3A%22card-number%22%7D' };
  global.HTMLInputElement = TestInput;
  global.InputEvent = class { constructor(type, options) { this.type = type; this.options = options; } };
  global.Event = class { constructor(type, options) { this.type = type; this.options = options; } };
  global.document = { querySelector: (selector) => selector === "#cc-number.card-number" ? input : null };
  global.chrome = {
    runtime: {
      sendMessage: async (message) => {
        messages.push(message);
        if (message.type === "REQUEST_PAYMENT_FIELD") {
          return { ok: true, field: "cardNumber", value: "4".repeat(16) };
        }
        return { ok: true };
      }
    }
  };

  require(path.resolve(__dirname, "..", "payment-frame.js"));
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(input.value, "4".repeat(16));
  assert.deepEqual(messages.map((message) => message.type), ["REQUEST_PAYMENT_FIELD", "PAYMENT_FIELD_FILLED"]);
  assert.equal(messages[1].field, "cardNumber");
  console.log("Payment frame isolated autofill test passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
