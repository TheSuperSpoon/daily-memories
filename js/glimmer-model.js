export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    from: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    to: `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`,
  };
}

export function indexMonth(items) {
  const days = {};
  items.forEach((item) => {
    days[item.glimmer_date] ||= {};
    days[item.glimmer_date][item.role] = item;
  });
  return { items, days };
}

export function moodDraftValue(drafts, key, savedMood = null) {
  return drafts.has(key) ? drafts.get(key) : (savedMood ?? null);
}

export function canDeleteAt(glimmer, dashboard, serverNowMs) {
  return Boolean(dashboard && glimmer.owner_id === dashboard.user_id
    && new Date(glimmer.created_at).getTime() > serverNowMs - 86400000);
}

export class LatestRequest {
  #sequence = 0;

  next() {
    this.#sequence += 1;
    return this.#sequence;
  }

  isCurrent(sequence) {
    return sequence === this.#sequence;
  }

  invalidate() {
    this.#sequence += 1;
  }
}
