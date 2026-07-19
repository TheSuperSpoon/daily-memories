export const BASE_CAPTION_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "for", "from", "i", "in", "is", "it", "me",
  "my", "of", "on", "or", "our", "so", "the", "this", "to", "we", "with", "you", "your",
  "了", "的", "我", "你", "他", "她", "它", "我们", "你们", "他们", "今天", "就是", "一个", "没有",
  "这", "那", "在", "和", "也", "都", "很", "就", "又", "还", "有", "是", "吗", "呢", "吧",
]);

function fallbackTokens(text) {
  return text.match(/[\p{Script=Han}]+|[a-z0-9']{2,}/gu) ?? [];
}

export function tokenizeNaturalLanguage(value, locale = "zh") {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return [];
  if (typeof Intl?.Segmenter !== "function") return fallbackTokens(text);

  const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
  return [...segmenter.segment(text)]
    .filter((part) => part.isWordLike)
    .map((part) => part.segment)
    .filter((word) => /\p{Script=Han}/u.test(word) || /^[a-z0-9']{2,}$/u.test(word));
}

export function meaningfulCaptionWords(value, stopWords = BASE_CAPTION_STOP_WORDS) {
  return tokenizeNaturalLanguage(value).filter((word) => !stopWords.has(word));
}
