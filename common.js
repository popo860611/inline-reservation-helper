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
    let candidate = markdownMatch?.[1] || inlineUrlMatch?.[0] || schemeLessMatch?.[0] || "";
    if (!candidate) {
      if (/https?:\/\//i.test(raw)) return { kind: "invalid-url", value: raw };
      return { kind: "name", value: raw.replace(/^\[|\]$/g, "").trim() };
    }

    candidate = trimUrlPunctuation(candidate);
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

    try {
      const url = new URL(candidate);
      const officialHost = url.hostname === "inline.app" || url.hostname.endsWith(".inline.app");
      if (url.protocol !== "https:" || !officialHost || !url.pathname.startsWith("/booking/")) {
        return { kind: "invalid-url", value: candidate };
      }
      url.hash = "";
      return { kind: "url", value: url.toString() };
    } catch (_error) {
      return { kind: "invalid-url", value: candidate };
    }
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

  globalThis.InlineHelperCommon = {
    normalizeRestaurantInput,
    restaurantMatchScore,
    selectRestaurantMatch,
    normalizeTime,
    timeToMinutes
  };
})();
