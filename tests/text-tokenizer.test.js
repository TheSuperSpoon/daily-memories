import assert from "node:assert/strict";
import test from "node:test";
import { BASE_CAPTION_STOP_WORDS, meaningfulCaptionWords, tokenizeNaturalLanguage } from "../js/text-tokenizer.js";

test("natural tokenizer separates Chinese words and normalizes English", () => {
  assert.deepEqual(tokenizeNaturalLanguage("今天天气很好, HELLO world!"), ["今天", "天气", "很好", "hello", "world"]);
});

test("base caption stop words remove common Chinese and English words", () => {
  assert.equal(BASE_CAPTION_STOP_WORDS.has("今天"), true);
  assert.equal(BASE_CAPTION_STOP_WORDS.has("the"), true);
  assert.deepEqual(meaningfulCaptionWords("今天 the 天气 很好"), ["天气", "很好"]);
});
