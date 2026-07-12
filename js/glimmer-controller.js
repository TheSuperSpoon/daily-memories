import { appConfig, repository } from "./app-services.js";
import { canDeleteAt, indexMonth, LatestRequest, monthKey, monthRange } from "./glimmer-model.js";

export { monthKey, monthRange } from "./glimmer-model.js";

const $ = (selector) => document.querySelector(selector);
const CONFIG = { glimmerStart: "2026-07-20" };
const monthCache = new Map();
const monthRequests = new Map();
const urlCache = new Map();
const lazyImages = new WeakMap();

const elements = {
  canvas: $("#glimmerStars"),
  calendarGrid: $("#calendarGrid"),
  calendarTitle: $("#calendarTitle"),
  calendarHint: $("#calendarHint"),
  progress: $("#glimmerProgressCount"),
  prevMonth: $("#prevMonth"),
  nextMonth: $("#nextMonth"),
  dailyDate: $("#dailyDatePill"),
  dailyTitle: $("#dailyTitle"),
  dailyCopy: $("#dailyStatusCopy"),
  rayPreview: $("#rayUploadPreview"),
  melPreview: $("#melUploadPreview"),
  lanes: [...document.querySelectorAll("[data-upload-person]")],
  lighthouse: $("#lighthouseScene"),
  growthTitle: $("#growthTitle"),
  growthCopy: $("#growthCopy"),
  growthPlant: $("#growthPlant"),
  streak: $("#streakCount"),
  cardCount: $("#retroCardCount"),
  backpackButton: $("#backpackButton"),
  backpackModal: $("#backpackModal"),
  useRetroCard: $("#useRetroCard"),
  retroHint: $("#retroModeHint"),
  uploadModal: $("#uploadModal"),
  uploadForm: $("#uploadForm"),
  uploadDate: $("#uploadDateLabel"),
  photoInput: $("#photoInput"),
  photoNote: $("#photoNote"),
  uploadSubmit: $("#uploadSubmitButton"),
  uploadStatus: $("#uploadStatus"),
  retryFinalize: $("#retryFinalizeButton"),
  actionModal: $("#glimmerActionModal"),
  actionTitle: $("#glimmerActionTitle"),
  actionCopy: $("#glimmerActionCopy"),
  actionConfirm: $("#glimmerActionConfirm"),
  gallery: $("#glimmerGallery"),
  galleryTitle: $("#galleryMonthTitle"),
  galleryStatus: $("#galleryStatus"),
  galleryRetry: $("#galleryRetryButton"),
  galleryPrev: $("#galleryPrevMonth"),
  galleryNext: $("#galleryNextMonth"),
};

const ctx = elements.canvas?.getContext("2d");
let dashboard = null;
let calendarMonth = new Date(2026, 6, 1);
let galleryMonth = new Date();
let activeDate = CONFIG.glimmerStart;
let selectedUploadDate = activeDate;
let retroMode = false;
let initialized = false;
let initializing = null;
let pendingFinalizeId = null;
let pendingAction = null;
let dashboardClockOffset = 0;
const galleryRequests = new LatestRequest();

const imageObserver = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      imageObserver.unobserve(entry.target);
      const glimmer = lazyImages.get(entry.target);
      if (glimmer) hydrateImage(entry.target, glimmer);
    });
  }, { rootMargin: "240px" })
  : null;

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function monthFromDateKey(key) {
  const date = parseDate(key);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function toMonthData(items) {
  return indexMonth(items);
}

async function loadMonth(date, { force = false } = {}) {
  const key = monthKey(date);
  if (!force && monthCache.has(key)) return monthCache.get(key);
  const requestId = (monthRequests.get(key) ?? 0) + 1;
  monthRequests.set(key, requestId);
  const { from, to } = monthRange(date);
  const items = await repository.listGlimmers({ spaceId: appConfig.spaceId, from, to, limit: 100 });
  if (monthRequests.get(key) !== requestId) return monthCache.get(key) ?? toMonthData([]);
  const data = toMonthData(items);
  monthCache.set(key, data);
  return data;
}

function currentMonthData(date = calendarMonth) {
  return monthCache.get(monthKey(date)) ?? toMonthData([]);
}

function clearUrlCache() {
  urlCache.clear();
}

async function readableUrl(glimmer, force = false) {
  const key = glimmer.asset.id;
  const cached = urlCache.get(key);
  if (!force && cached?.url && cached.expiresAt > Date.now() + 5000) return cached.url;
  if (!force && cached?.promise) return cached.promise;
  const promise = repository.getImageUrl(glimmer.asset).then((result) => {
    urlCache.set(key, result);
    return result.url;
  }).catch((error) => {
    urlCache.delete(key);
    throw error;
  });
  urlCache.set(key, { promise, expiresAt: 0 });
  return promise;
}

async function hydrateImage(image, glimmer) {
  image.classList.add("is-loading");
  try {
    const setSource = async (force = false) => {
      image.src = await readableUrl(glimmer, force);
    };
    image.onload = () => image.classList.remove("is-loading", "is-error");
    image.onerror = async () => {
      if (image.dataset.signedUrlRetried !== "yes") {
        image.dataset.signedUrlRetried = "yes";
        urlCache.delete(glimmer.asset.id);
        try { await setSource(true); return; } catch { /* show retry state below */ }
      }
      image.classList.remove("is-loading");
      image.classList.add("is-error");
      image.alt = "Image unavailable. Activate to retry.";
      image.tabIndex = 0;
    };
    await setSource();
  } catch {
    image.classList.remove("is-loading");
    image.classList.add("is-error");
    image.alt = "Image unavailable. Activate to retry.";
    image.tabIndex = 0;
    image.addEventListener("click", () => hydrateImage(image, glimmer), { once: true });
  }
}

function createLazyImage(glimmer, alt, immediate = false) {
  const image = document.createElement("img");
  image.alt = alt;
  image.loading = "lazy";
  lazyImages.set(image, glimmer);
  if (immediate || !imageObserver) hydrateImage(image, glimmer);
  else imageObserver.observe(image);
  return image;
}

function isCompleteDay(day) {
  return Boolean(day?.ray && day?.mel);
}

function canDelete(glimmer) {
  const serverNow = Date.now() + dashboardClockOffset;
  return canDeleteAt(glimmer, dashboard, serverNow);
}

function isUploadableDate(key, day) {
  if (!dashboard || key < CONFIG.glimmerStart) return false;
  if (key === dashboard.local_today) return !day?.[dashboard.role];
  return retroMode && key < dashboard.local_today && dashboard.reward_balance > 0 && !day?.[dashboard.role];
}

function dayNumberFromStart(key) {
  return Math.max(1, Math.floor((parseDate(key) - parseDate(CONFIG.glimmerStart)) / 86400000) + 1);
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function appendDeleteButton(container, glimmer) {
  if (!canDelete(glimmer)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "glimmer-delete-button";
  button.textContent = "Delete";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    confirmAction("Delete this glimmer?", "The private image and its timeline entry will be removed.", async () => {
      await deleteGlimmer(glimmer);
    });
  });
  container.appendChild(button);
}

function renderUploadPreview(container, glimmer, emptyText) {
  if (!container) return;
  container.replaceChildren();
  container.classList.toggle("has-photo", Boolean(glimmer));
  if (!glimmer) {
    const empty = document.createElement("span");
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  container.appendChild(createLazyImage(glimmer, emptyText, true));
  const note = document.createElement("small");
  note.textContent = glimmer.note || "今天的微光";
  container.appendChild(note);
  appendDeleteButton(container, glimmer);
}

function renderDailyBoard() {
  const data = currentMonthData(monthFromDateKey(activeDate));
  const day = data.days[activeDate] ?? {};
  const beforeStart = activeDate < CONFIG.glimmerStart;
  const future = dashboard && activeDate > dashboard.local_today;
  setText(elements.dailyDate, `Day ${String(dayNumberFromStart(activeDate)).padStart(2, "0")} · ${activeDate}`);
  setText(elements.dailyTitle, isCompleteDay(day) ? "今天的微光已经合上了" : "今日微光上传栏");
  setText(elements.dailyCopy, beforeStart || future
    ? "这一天还没解锁。等时间到了，这里会变成你们当天的小相框。"
    : retroMode
      ? "补签模式开启中。选择过去缺失的一天，上传你自己的微光。"
      : "每人一张截图或照片。两栏都放好以后，这一天会变成完整的紫色微光。");
  renderUploadPreview(elements.rayPreview, day.ray, "Ray 的截图 / 照片");
  renderUploadPreview(elements.melPreview, day.mel, "Mel 的截图 / 照片");

  elements.lanes.forEach((button) => {
    const role = button.dataset.uploadPerson;
    const ownRole = role === dashboard?.role;
    const existing = day[role];
    const replaceable = ownRole && existing && canDelete(existing) && activeDate === dashboard.local_today;
    button.hidden = !ownRole;
    button.disabled = !ownRole || (!replaceable && !isUploadableDate(activeDate, day));
    button.textContent = replaceable
      ? `Replace ${role === "ray" ? "Ray" : "Mel"}'s glimmer`
      : isUploadableDate(activeDate, day)
        ? `上传 ${role === "ray" ? "Ray" : "Mel"} 的微光`
        : "等待解锁";
    button.onclick = () => {
      if (replaceable) {
        confirmAction("Replace this glimmer?", "The current image will be deleted before the new upload begins.", async () => {
          await deleteGlimmer(existing, false);
          openUploadModal(activeDate);
        });
      } else if (isUploadableDate(activeDate, day)) openUploadModal(activeDate);
    };
  });
}

function statusForDay(day) {
  if (isCompleteDay(day)) return "complete";
  if (day?.ray) return "ray-only";
  if (day?.mel) return "mel-only";
  return "";
}

function renderCalendar() {
  if (!elements.calendarGrid || !dashboard) return;
  const data = currentMonthData(calendarMonth);
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  setText(elements.calendarTitle, monthLabel(calendarMonth));
  const completed = Object.values(data.days).filter(isCompleteDay).length;
  const eligible = Array.from({ length: daysInMonth }, (_, i) => dateKey(new Date(year, month, i + 1)))
    .filter((key) => key >= CONFIG.glimmerStart && key <= dashboard.local_today).length;
  setText(elements.progress, `${completed}/${eligible}`);
  setText(elements.calendarHint, retroMode
    ? "补签模式：选择一个过去缺失的日期。"
    : "7/20 起，每天按 Asia/Shanghai 时间解锁一个格子。");
  elements.calendarGrid.replaceChildren();

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const key = dateKey(new Date(year, month, dayNumber));
    const day = data.days[key];
    const status = statusForDay(day);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `calendar-cell ${status} ${key === activeDate ? "selected" : ""} ${key === dashboard.local_today ? "today" : ""} ${!isUploadableDate(key, day) ? "locked" : ""}`;
    const number = document.createElement("span");
    number.className = "day-number";
    number.textContent = String(dayNumber);
    const icon = document.createElement("span");
    icon.className = "cell-icon";
    icon.textContent = status === "complete" ? "◆" : key <= dashboard.local_today && key >= CONFIG.glimmerStart ? "·" : "⌁";
    cell.append(number, icon);
    cell.disabled = key < CONFIG.glimmerStart;
    cell.addEventListener("click", () => { activeDate = key; renderGlimmer(); });
    elements.calendarGrid.appendChild(cell);
  }
}

function renderLighthouse() {
  const day = currentMonthData(monthFromDateKey(activeDate)).days[activeDate] ?? {};
  elements.lighthouse?.classList.toggle("ray", Boolean(day.ray));
  elements.lighthouse?.classList.toggle("mel", Boolean(day.mel));
  elements.lighthouse?.classList.toggle("complete", isCompleteDay(day));
}

function renderGrowth() {
  const gold = Number(dashboard?.complete_days_total ?? 0);
  let stage = "seed";
  let title = "Seed";
  let copy = "第一天的微光会在灯塔脚下埋下一颗种子。";
  if (gold >= 365) { stage = "flower"; title = "Flower"; copy = "365 个金色灯塔开成她最喜欢的花。"; }
  else if (gold >= 100) { stage = "vine"; title = "Vines"; copy = "100 个金色灯塔让藤蔓绕上灯塔。"; }
  else if (gold >= 30) { stage = "sprout"; title = "Sprout"; copy = "30 个金色灯塔长出第一段新芽。"; }
  setText(elements.growthTitle, title);
  setText(elements.growthCopy, copy);
  if (elements.growthPlant) elements.growthPlant.className = `growth-plant ${stage}`;
}

export function resizeGlimmerCanvas() {
  if (!elements.canvas || !ctx) return;
  const page = $("#glimmer");
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, page?.offsetWidth || window.innerWidth);
  const height = Math.max(window.innerHeight, page?.scrollHeight || window.innerHeight);
  elements.canvas.width = Math.floor(width * ratio);
  elements.canvas.height = Math.floor(height * ratio);
  elements.canvas.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function renderStars() {
  if (!elements.canvas || !ctx) return;
  resizeGlimmerCanvas();
  const width = elements.canvas.offsetWidth;
  const height = elements.canvas.offsetHeight;
  ctx.clearRect(0, 0, width, height);
  const count = Math.min(Number(dashboard?.complete_days_total ?? 0), 420);
  for (let i = 0; i < count; i += 1) {
    const x = (Math.sin(i * 127.1) * 0.5 + 0.5) * width;
    const y = 90 + (Math.cos(i * 91.7) * 0.5 + 0.5) * (height - 140);
    ctx.beginPath();
    ctx.fillStyle = i % 10 === 0 ? "rgba(247,208,112,0.9)" : "rgba(180,224,255,0.68)";
    ctx.arc(x, y, 1 + (i % 4) * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderGlimmer() {
  if (!dashboard) return;
  setText(elements.streak, dashboard.current_streak);
  setText(elements.cardCount, dashboard.reward_balance);
  renderCalendar();
  renderDailyBoard();
  renderLighthouse();
  renderGrowth();
  renderStars();
}

function openUploadModal(key) {
  selectedUploadDate = key;
  elements.uploadForm.reset();
  setText(elements.uploadDate, key);
  setText(elements.uploadStatus, "");
  elements.retryFinalize.classList.add("hidden");
  pendingFinalizeId = null;
  elements.uploadModal.classList.remove("hidden");
}

function closeModals() {
  elements.uploadModal?.classList.add("hidden");
  elements.backpackModal?.classList.add("hidden");
  elements.actionModal?.classList.add("hidden");
}

async function refreshDashboard() {
  dashboard = await repository.getDashboard(appConfig.spaceId);
  dashboardClockOffset = new Date(dashboard.server_now).getTime() - Date.now();
}

async function refreshMonth(date) {
  await loadMonth(date, { force: true });
}

async function afterMutation(date) {
  await refreshMonth(monthFromDateKey(date));
  const day = currentMonthData(monthFromDateKey(date)).days[date] ?? {};
  if (date < dashboard.local_today && isCompleteDay(day)) {
    await repository.completeRetroGlimmer(appConfig.spaceId, date);
    retroMode = false;
    setText(elements.retroHint, "");
  }
  await repository.grantStreakRewards(appConfig.spaceId);
  await refreshDashboard();
  renderGlimmer();
  if (monthKey(galleryMonth) === monthKey(monthFromDateKey(date))) await renderGallery(true);
}

async function handleUpload(event) {
  event.preventDefault();
  const file = elements.photoInput.files?.[0];
  if (!dashboard) return;
  if (!file) {
    setText(elements.uploadStatus, "Choose an image first.");
    return;
  }
  elements.uploadSubmit.disabled = true;
  setText(elements.uploadStatus, "Validating image...");
  try {
    await repository.uploadGlimmer({
      spaceId: appConfig.spaceId,
      date: selectedUploadDate,
      note: elements.photoNote.value.trim(),
      file,
      onProgress: ({ phase }) => setText(elements.uploadStatus, phase === "uploading" ? "Uploading private image..." : "Confirming upload..."),
    });
    setText(elements.uploadStatus, "Saved.");
    await afterMutation(selectedUploadDate);
    closeModals();
    if (isCompleteDay(currentMonthData(monthFromDateKey(selectedUploadDate)).days[selectedUploadDate])) {
      elements.lighthouse?.classList.add("synergy");
      window.setTimeout(() => elements.lighthouse?.classList.remove("synergy"), 1700);
    }
  } catch (error) {
    setText(elements.uploadStatus, error.message);
    if (error.retryable && error.glimmerId) {
      pendingFinalizeId = error.glimmerId;
      elements.retryFinalize.classList.remove("hidden");
    }
    if (error.code === "SESSION_EXPIRED") window.dispatchEvent(new CustomEvent("app-session-expired"));
  } finally {
    elements.uploadSubmit.disabled = false;
  }
}

async function retryFinalize() {
  if (!pendingFinalizeId) return;
  elements.retryFinalize.disabled = true;
  setText(elements.uploadStatus, "Retrying confirmation...");
  try {
    await repository.retryFinalize(pendingFinalizeId);
    await afterMutation(selectedUploadDate);
    pendingFinalizeId = null;
    closeModals();
  } catch (error) {
    setText(elements.uploadStatus, error.message);
  } finally {
    elements.retryFinalize.disabled = false;
  }
}

async function deleteGlimmer(glimmer, refresh = true) {
  await repository.deleteGlimmer(glimmer);
  urlCache.delete(glimmer.asset.id);
  await refreshMonth(monthFromDateKey(glimmer.glimmer_date));
  await refreshDashboard();
  if (refresh) {
    renderGlimmer();
    if (monthKey(galleryMonth) === glimmer.glimmer_date.slice(0, 7)) await renderGallery(true);
  }
}

function confirmAction(title, copy, action) {
  setText(elements.actionTitle, title);
  setText(elements.actionCopy, copy);
  pendingAction = action;
  elements.actionConfirm.disabled = false;
  elements.actionModal.classList.remove("hidden");
}

async function runConfirmedAction() {
  if (!pendingAction) return;
  elements.actionConfirm.disabled = true;
  try {
    await pendingAction();
    pendingAction = null;
    elements.actionModal.classList.add("hidden");
  } catch (error) {
    setText(elements.actionCopy, error.message);
    elements.actionConfirm.disabled = false;
  }
}

async function setCalendarMonth(offset) {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1);
  activeDate = monthRange(calendarMonth).from;
  setText(elements.calendarHint, "Loading month...");
  try { await loadMonth(calendarMonth); } catch (error) { setText(elements.calendarHint, error.message); }
  renderGlimmer();
}

async function renderGallery(force = false) {
  if (!elements.gallery || !dashboard) return;
  const sequence = galleryRequests.next();
  const requestedMonth = new Date(galleryMonth);
  setText(elements.galleryTitle, monthLabel(galleryMonth));
  setText(elements.galleryStatus, "Loading this month...");
  elements.galleryRetry?.classList.add("hidden");
  try {
    const data = await loadMonth(requestedMonth, { force });
    if (!galleryRequests.isCurrent(sequence)) return;
    elements.gallery.replaceChildren();
    const items = [...data.items].sort((a, b) => b.glimmer_date.localeCompare(a.glimmer_date)
      || b.created_at.localeCompare(a.created_at));
    if (!items.length) {
      const empty = document.createElement("p");
      empty.textContent = "No glimmers collected in this month.";
      elements.gallery.appendChild(empty);
    }
    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "gallery-item";
      card.appendChild(createLazyImage(item, `${item.role} ${item.glimmer_date}`));
      const body = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${item.glimmer_date} · ${item.role === "ray" ? "Ray" : "Mel"}`;
      const note = document.createElement("p");
      note.textContent = item.note || "No note yet.";
      body.append(title, note);
      appendDeleteButton(body, item);
      card.appendChild(body);
      elements.gallery.appendChild(card);
    });
    setText(elements.galleryStatus, `${items.length} glimmer${items.length === 1 ? "" : "s"} in this month.`);
  } catch (error) {
    if (!galleryRequests.isCurrent(sequence)) return;
    setText(elements.galleryStatus, error.message);
    elements.galleryRetry?.classList.remove("hidden");
  }
}

async function setGalleryMonth(offset) {
  galleryMonth = new Date(galleryMonth.getFullYear(), galleryMonth.getMonth() + offset, 1);
  await renderGallery();
}

export async function initializeGlimmerSession() {
  if (initialized) return;
  if (initializing) return initializing;
  initializing = (async () => {
    dashboard = await repository.getDashboard(appConfig.spaceId);
    dashboardClockOffset = new Date(dashboard.server_now).getTime() - Date.now();
    activeDate = dashboard.local_today >= CONFIG.glimmerStart ? dashboard.local_today : CONFIG.glimmerStart;
    calendarMonth = monthFromDateKey(activeDate);
    galleryMonth = monthFromDateKey(dashboard.local_today);
    await loadMonth(calendarMonth);
    initialized = true;
    renderGlimmer();
  })().catch((error) => {
    setText(elements.dailyCopy, error.message);
    if (error.code === "SESSION_EXPIRED") window.dispatchEvent(new CustomEvent("app-session-expired"));
    throw error;
  }).finally(() => { initializing = null; });
  return initializing;
}

export async function activateGlimmerPage() {
  await initializeGlimmerSession().catch(() => {});
  resizeGlimmerCanvas();
  renderGlimmer();
}

export async function activateGalleryPage() {
  await initializeGlimmerSession().catch(() => {});
  await renderGallery();
}

export function resetGlimmerSession() {
  initialized = false;
  initializing = null;
  dashboard = null;
  retroMode = false;
  pendingFinalizeId = null;
  pendingAction = null;
  dashboardClockOffset = 0;
  galleryRequests.invalidate();
  monthCache.clear();
  monthRequests.clear();
  clearUrlCache();
  imageObserver?.disconnect();
  elements.gallery?.replaceChildren();
}

elements.prevMonth?.addEventListener("click", () => setCalendarMonth(-1));
elements.nextMonth?.addEventListener("click", () => setCalendarMonth(1));
elements.galleryPrev?.addEventListener("click", () => setGalleryMonth(-1));
elements.galleryNext?.addEventListener("click", () => setGalleryMonth(1));
elements.galleryRetry?.addEventListener("click", () => renderGallery(true));
elements.uploadForm?.addEventListener("submit", handleUpload);
elements.retryFinalize?.addEventListener("click", retryFinalize);
elements.actionConfirm?.addEventListener("click", runConfirmedAction);
elements.backpackButton?.addEventListener("click", () => elements.backpackModal.classList.remove("hidden"));
elements.useRetroCard?.addEventListener("click", () => {
  if (!dashboard || dashboard.reward_balance <= 0) {
    setText(elements.retroHint, "背包里暂时没有补签卡。");
    return;
  }
  retroMode = true;
  setText(elements.retroHint, "补签模式已开启：选择一个过去缺失的日期。");
  elements.backpackModal.classList.add("hidden");
  renderCalendar();
});
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModals));
