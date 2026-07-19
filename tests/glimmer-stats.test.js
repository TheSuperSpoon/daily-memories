import assert from "node:assert/strict";
import test from "node:test";
import { calculateRelationshipStats, captionWords, daysBetweenInclusive } from "../js/glimmer-stats.js";

test("relationship day counts are inclusive and reject reversed ranges", () => {
  assert.equal(daysBetweenInclusive("2026-03-29", "2026-03-29"), 1);
  assert.equal(daysBetweenInclusive("2026-03-29", "2026-03-30"), 2);
  assert.equal(daysBetweenInclusive("2026-03-30", "2026-03-29"), 0);
});

test("caption tokenization uses natural English and Chinese word boundaries", () => {
  assert.deepEqual(captionWords("Hello, HELLO! 今天很好 a"), ["hello", "hello", "今天", "很好"]);
});

test("relationship stats cover empty data, stop words, ties, and interrupted streaks", () => {
  const monthData = [{
    items: [
      { note: "beta alpha and" },
      { note: "alpha beta" },
    ],
    days: {
      "2026-07-20": { ray: {}, mel: {} },
      "2026-07-21": { ray: {}, mel: {} },
      "2026-07-22": { ray: {} },
      "2026-07-23": { ray: {}, mel: {} },
    },
  }];
  assert.deepEqual(calculateRelationshipStats({
    relationshipStart: "2026-07-20",
    glimmerStart: "2026-07-20",
    today: "2026-07-23",
    monthData,
    stopWords: new Set(["and"]),
  }), { daysTogether: 4, photoCount: 2, topWord: "alpha", longestStreak: 2 });

  assert.deepEqual(calculateRelationshipStats({
    relationshipStart: "2026-07-20",
    glimmerStart: "2026-07-20",
    today: "2026-07-20",
    monthData: [{ items: [], days: {} }],
    stopWords: new Set(),
  }), { daysTogether: 1, photoCount: 0, topWord: "-", longestStreak: 0 });
});
