(() => {
  function trimUrlPunctuation(value) {
    return String(value || "").replace(/[\]）)>}，。；;、]+$/g, "");
  }

  function normalizeRestaurantInput(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) return { kind: "empty", value: "" };

    const markdownMatch = raw.match(/\((https?:\/\/[^\s)]+)\)/i);
    const inlineUrlMatch = raw.match(/https?:\/\/[^\s<>"']*inline\.app\/booking\/[^\s<>"']+/i);
    const schemeLessMatch = raw.match(/(?:www\.)?(?:[a-z0-9-]+\.)?inline\.app\/booking\/[^\s<>"']+/i);
    const bookingPathMatch = raw.match(/(?:^|\s)(?:\/booking\/)?(-[A-Za-z0-9_-]+)\/(-[A-Za-z0-9_-]+)(?:\/form)?(?:\s|$)/);
    let candidate = markdownMatch?.[1] || inlineUrlMatch?.[0] || schemeLessMatch?.[0] ||
      (bookingPathMatch ? `https://inline.app/booking/${bookingPathMatch[1]}/${bookingPathMatch[2]}` : "");
    if (!candidate) {
      if (/https?:\/\//i.test(raw)) return { kind: "invalid-url", value: raw };
      return { kind: "name", value: raw.replace(/^\[|\]$/g, "").trim() };
    }

    candidate = trimUrlPunctuation(candidate);
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

    const parsed = candidate.match(/^(https:)?\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(?:#.*)?$/i);
    if (!parsed) return { kind: "invalid-url", value: candidate };
    const protocol = (parsed[1] || "").toLowerCase();
    const host = (parsed[2] || "").toLowerCase();
    const pathname = (parsed[3] || "/").replace(/\/form\/?$/, "");
    const query = parsed[4] || "";
    const officialHost = host === "inline.app" || host.endsWith(".inline.app");
    if (protocol !== "https:" || !officialHost || !pathname.startsWith("/booking/")) {
      return { kind: "invalid-url", value: candidate };
    }
    return { kind: "url", value: `https://${host}${pathname}${query}` };
  }

  function setUrlQueryParams(urlValue, entries) {
    const withoutHash = String(urlValue || "").split("#", 1)[0];
    const queryIndex = withoutHash.indexOf("?");
    const base = (queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash).replace(/\/form\/?$/, "");
    const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(entries || {})) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }
    const serialized = params.toString();
    return serialized ? `${base}?${serialized}` : base;
  }

  function bookingIdentity(urlValue) {
    const normalized = normalizeRestaurantInput(urlValue);
    if (normalized.kind !== "url") return "";
    const match = normalized.value.match(/\/booking\/([^/?#]+)\/([^/?#]+)/i);
    if (!match) return "";
    try {
      return `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`;
    } catch (_error) {
      return "";
    }
  }

  function canAdoptFormScope({ senderUrl, expectedUrl, senderActive, reservationEnabled }) {
    const senderIdentity = bookingIdentity(senderUrl);
    const expectedIdentity = bookingIdentity(expectedUrl);
    return Boolean(
      reservationEnabled && senderActive &&
      /\/(?:form|payment|checkout|confirm|confirmation)\/?(?:[?#]|$)/i.test(String(senderUrl || "")) &&
      senderIdentity && senderIdentity === expectedIdentity
    );
  }

  function paymentFieldKind(hint) {
    const value = String(hint || "").toLowerCase();
    if (/autocomplete[:=\s"']*cc-number|卡號|card[\s_-]*(?:number|no\.?|num)|credit[\s_-]*card[\s_-]*(?:number|no)/i.test(value)) return "number";
    if (/autocomplete[:=\s"']*cc-exp-month|到期月份|有效月份|exp(?:iry|iration|ired)?[\s_-]*month/i.test(value)) return "expiryMonth";
    if (/autocomplete[:=\s"']*cc-exp-year|到期年份|有效年份|exp(?:iry|iration|ired)?[\s_-]*year/i.test(value)) return "expiryYear";
    if (/autocomplete[:=\s"']*cc-(?:exp|exp-month|exp-year)|有效期限|到期日|到期日期|expiry|expiration|exp[\s_-]*(?:date|month|year)/i.test(value)) return "expiry";
    if (/autocomplete[:=\s"']*cc-csc|安全碼|(?:信用卡|卡片)驗證碼|cvv|cvc|csc|security[\s_-]*code/i.test(value)) return "cvc";
    if (/autocomplete[:=\s"']*cc-name|持卡人|card[\s_-]*holder|name[\s_-]*on[\s_-]*card/i.test(value)) return "holder";
    return "";
  }

  function contactFieldKind(hint) {
    const value = String(hint || "").toLowerCase();
    if (paymentFieldKind(value)) return "";
    if (/autocomplete[:=\s"']*family-name|姓氏|family[\s_-]*name|surname/i.test(value)) return "family";
    if (/autocomplete[:=\s"']*given-name|名字|given[\s_-]*name|first[\s_-]*name/i.test(value)) return "given";
    if (/autocomplete[:=\s"']*tel|type[:=\s"']*tel|手機|電話|mobile|phone|telephone/i.test(value)) return "phone";
    if (/autocomplete[:=\s"']*email|type[:=\s"']*email|電子信箱|電子郵件|e-?mail|信箱/i.test(value)) return "email";
    if (/autocomplete[:=\s"']*name|訂位人|聯絡人|姓名|full[\s_-]*name|\bname\b/i.test(value)) return "name";
    return "";
  }

  function matchingBookingTabIds(tabs, expectedUrl) {
    const expectedIdentity = bookingIdentity(expectedUrl);
    if (!expectedIdentity) return [];
    return (Array.isArray(tabs) ? tabs : [])
      .filter((tab) => Number.isInteger(tab?.id) && bookingIdentity(tab.url) === expectedIdentity)
      .map((tab) => tab.id);
  }

  function normalizeTime(value) {
    return String(value || "")
      .replace(/：/g, ":")
      .replace(/中午|午餐|上午|下午|晚上|AM|PM/gi, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function normalizeRestaurantName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/xin\s*dian|hotpot/gi, "")
      .replace(/[\s｜|·・()（）\-_/]+/g, "")
      .trim();
  }

  function restaurantMatchScore(candidate, expected) {
    const left = normalizeRestaurantName(candidate);
    const right = normalizeRestaurantName(expected);
    if (!left || !right) return 0;
    if (left.includes(right) || right.includes(left)) return 1;
    const characters = [...new Set(right)];
    return characters.filter((character) => left.includes(character)).length / characters.length;
  }

  function selectRestaurantMatch(results, query) {
    const ranked = (Array.isArray(results) ? results : [])
      .filter((result) => result && typeof result.bookingLink === "string")
      .map((result) => ({ result, score: restaurantMatchScore(result.name, query) }))
      .filter(({ score }) => score >= 0.72)
      .sort((left, right) => right.score - left.score);
    if (!ranked.length) return null;
    if (ranked[1] && ranked[1].score === ranked[0].score) return null;
    return ranked[0].result;
  }

  function timeToMinutes(value) {
    const match = normalizeTime(value).match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const original = String(value || "");
    if (/下午|晚上|PM/i.test(original) && hour < 12) hour += 12;
    return hour * 60 + minute;
  }

  function dateTextToIso(value) {
    const match = String(value || "").match(/(20\d{2})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*日?/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function finalSubmitAction({ autoSubmit, submitAttemptedAt, hasFinalButton }) {
    if (submitAttemptedAt) return "wait";
    if (!hasFinalButton) return "processing";
    return autoSubmit === true ? "submit" : "preview";
  }

  function isAutoConsentText(value) {
    return /我已閱讀並同意|我同意.*(?:信用卡綁定|預收取消費|須知|服務條款|隱私權)|同意.*規則|同意.*注意事項|接受.*條款/.test(String(value || "").trim());
  }

  function splitContactName(value) {
    const name = String(value || "").trim().replace(/\s+/g, " ");
    if (!name) return { familyName: "", givenName: "" };
    const parts = name.split(" ");
    if (parts.length > 1) return { familyName: parts[0], givenName: parts.slice(1).join(" ") };
    return { familyName: name.slice(0, 1), givenName: name.slice(1) };
  }

  function controlStateIsSelected({ checked, ariaChecked, ariaPressed, dataState } = {}) {
    return checked === true || ariaChecked === "true" || ariaPressed === "true" || dataState === "checked";
  }

  function consentControlShouldAct({ isLabel, targetIsSelf, targetVisible, required } = {}) {
    if (isLabel && targetIsSelf) return false;
    if (!targetVisible && !required) return false;
    return true;
  }

  function isSafeOptionalSkipText(value) {
    const text = String(value || "").replace(/\s+/g, "").trim();
    if (!text || /取消|返回|上一步|關閉|確認|付款|授權|送出/.test(text)) return false;
    return /^(?:跳過|略過)(?:預先|預約)?(?:點餐|選餐|加購|選購|套餐|餐點|菜單)?$/.test(text) ||
      /^(?:稍後再?|暫不|不需要|不用|無需)(?:點餐|選餐|加購|選購|套餐|餐點|選擇)?$/.test(text);
  }

  function classifyBookingStage({ captcha, payment, contact, optionalSkip, finalConfirmation, dateOrTime } = {}) {
    if (captcha) return "captcha";
    if (payment) return "payment";
    if (contact) return "contact";
    if (optionalSkip) return "optional";
    if (finalConfirmation) return "confirmation";
    if (dateOrTime) return "availability";
    return "unknown";
  }

  globalThis.InlineHelperCommon = {
    normalizeRestaurantInput,
    setUrlQueryParams,
    bookingIdentity,
    canAdoptFormScope,
    paymentFieldKind,
    contactFieldKind,
    matchingBookingTabIds,
    restaurantMatchScore,
    selectRestaurantMatch,
    normalizeTime,
    timeToMinutes,
    dateTextToIso,
    finalSubmitAction,
    isAutoConsentText,
    splitContactName,
    controlStateIsSelected,
    consentControlShouldAct,
    isSafeOptionalSkipText,
    classifyBookingStage
  };
})();
