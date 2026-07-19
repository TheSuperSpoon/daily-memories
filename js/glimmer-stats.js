function parseDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function daysBetweenInclusive(fromKey, toKey) {
  return Math.max(0, Math.floor((parseDate(toKey) - parseDate(fromKey)) / 86400000) + 1);
}

export function captionWords(note) {
  return (note || "")
    .toLowerCase()
    .match(/[\p{Script=Han}]{2,}|[a-z0-9']{2,}/gu) ?? [];
}

export function calculateRelationshipStats({ relationshipStart, glimmerStart, today, monthData, stopWords }) {
  const items = monthData.flatMap((data) => data.items);
  const completeDays = new Set();
  monthData.forEach((data) => {
    Object.entries(data.days).forEach(([key, day]) => {
      if (key >= glimmerStart && key <= today && day?.ray && day?.mel) completeDays.add(key);
    });
  });

  let longestStreak = 0;
  let currentStreak = 0;
  for (let cursor = parseDate(glimmerStart); dateKey(cursor) <= today; cursor.setDate(cursor.getDate() + 1)) {
    if (completeDays.has(dateKey(cursor))) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const wordCounts = new Map();
  items.forEach((item) => {
    captionWords(item.note).forEach((word) => {
      if (!stopWords.has(word)) wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    });
  });
  const topWord = [...wordCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "-";

  return {
    daysTogether: daysBetweenInclusive(relationshipStart, today),
    photoCount: items.length,
    topWord,
    longestStreak,
  };
}
