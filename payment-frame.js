(() => {
  const decodedUrl = (() => {
    try { return decodeURIComponent(location.href); } catch (_error) { return location.href; }
  })();
  const field = /"type"\s*:\s*"card-number"/.test(decodedUrl)
    ? "cardNumber"
    : /"type"\s*:\s*"expiration-date"/.test(decodedUrl)
      ? "expiry"
      : /"type"\s*:\s*"ccv"/.test(decodedUrl)
        ? "securityCode"
        : null;
  const selector = field === "cardNumber"
    ? "#cc-number.card-number"
    : field === "expiry"
      ? "#cc-exp.expiration-date"
      : field === "securityCode"
        ? "#cc-ccv.ccv"
        : null;
  if (!field || !selector) return;

  let finished = false;
  let attempts = 0;

  function setNativeValue(input, value) {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }

  async function fill() {
    if (finished || attempts >= 12) return;
    attempts += 1;
    const input = document.querySelector(selector);
    if (!input) {
      setTimeout(fill, 100);
      return;
    }
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: "REQUEST_PAYMENT_FIELD", field });
    } catch (_error) {
      return;
    }
    if (!response?.ok || response.field !== field || !response.value) return;
    let secret = String(response.value);
    setNativeValue(input, secret);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const expected = secret.replace(/\D/g, "");
    const written = String(input.value || "").replace(/\D/g, "");
    secret = "";
    if (written !== expected) {
      setTimeout(fill, 120);
      return;
    }
    finished = true;
    chrome.runtime.sendMessage({ type: "PAYMENT_FIELD_FILLED", field }).catch(() => {});
  }

  fill();
})();
