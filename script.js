import { appConfig, repository } from "./js/app-services.js?v=20260721-gift-audio";
import {
  activateGalleryPage,
  activateGlimmerPage,
  getGlimmerIdentity,
  initializeGlimmerSession,
  resetGlimmerSession,
} from "./js/glimmer-controller.js?v=20260720-login-timezone";
import {
  canAccessGiftPage,
  canAccessMelFeature,
  canReturnToPrelude,
  accessiblePage,
  shouldShowPrelude,
} from "./js/feature-access.js";
import {
  collectGiftForIdentity,
  loadGiftAudioForIdentity,
  loadGiftStateForIdentity,
} from "./js/gift-access-service.js?v=20260721-gift-audio";
import { clearGiftAudioCache, resolveGiftAudioSource } from "./js/gift-audio-cache.js?v=20260721-gift-audio";
import { clearLegacyMelPreludeState } from "./js/prelude-storage.js?v=20260721-launch-reset";
import { activateMemoriesPage, resetMemorySession } from "./js/memory-controller.js?v=20260720-login-timezone";
import { timePresentation } from "./js/memory-model.js?v=20260720-login-timezone";

const CONFIG = {
  birthday: "2026-07-20T00:00:00",
  glimmerStart: "2026-07-20",
};

const GIFT_ICON_CONFIG = [
  { id: "home", selector: '[data-gift-id="home"]' },
  { id: "lighthouse", selector: '[data-gift-id="lighthouse"]' },
  { id: "gallery", selector: '[data-gift-id="gallery"]' },
  { id: "playlist", selector: '[data-gift-id="playlist"]' },
  { id: "ticket", selector: '[data-gift-id="ticket"]' },
];

const GIFT_ICON_IDS = GIFT_ICON_CONFIG.map((gift) => gift.id);

const $ = (selector) => document.querySelector(selector);
const gate = $("#gate");
const site = $("#site");
const authForm = $("#authForm");
const authEmail = $("#authEmail");
const authDisplayName = $("#authDisplayName");
const authPassword = $("#authPassword");
const authConfirmPassword = $("#authConfirmPassword");
const displayNameLabel = $("#displayNameLabel");
const confirmPasswordLabel = $("#confirmPasswordLabel");
const authSubmitButton = $("#authSubmitButton");
const authMessage = $("#authMessage");
const authGateCopy = $("#authGateCopy");
const showLoginModeButton = $("#showLoginMode");
const showRegisterModeButton = $("#showRegisterMode");
const forgotPasswordButton = $("#forgotPasswordButton");
const lockButton = $("#lockButton");
const lovePrelude = $("#lovePrelude");
const lightWords = [...document.querySelectorAll(".light-word")];
const lightProgress = $("#lightProgress");
const homecoming = $("#homecoming");
const homecomingCount = $("#homecomingCount");
const ticketStub = $("#ticketStub");
const ticketOverlay = $("#ticketOverlay");
const ticketClose = $("#ticketClose");
const ticketBackdrop = document.querySelector(".ticket-backdrop");
const preludeLetterWrap = document.querySelector(".prelude-letter-wrap");
const returnLetterButton = $("#returnLetterButton");
const returnHomeFromLetter = $("#returnHomeFromLetter");
const navItems = [...document.querySelectorAll(".nav-item")];
const pageJumpButtons = [...document.querySelectorAll("[data-page-jump]")];
const pages = [...document.querySelectorAll(".page")];
const giftButtons = GIFT_ICON_CONFIG.flatMap((gift) => [...document.querySelectorAll(gift.selector)]);
const giftToast = $("#giftToast");
const secretGiftNav = $("#secretGiftNav");
const giftAudioExperience = $("#giftAudioExperience");
const giftAudioUnlockTitle = $("#giftAudioUnlockTitle");
const giftAudioUnlockCopy = $("#giftAudioUnlockCopy");
const giftAudio = $("#giftAudio");
const giftAudioPlay = $("#giftAudioPlay");
const giftAudioProgress = $("#giftAudioProgress");
const giftAudioCurrent = $("#giftAudioCurrent");
const giftAudioDuration = $("#giftAudioDuration");
const giftAudioStatus = $("#giftAudioStatus");
const giftAudioRetry = $("#giftAudioRetry");
const galleryTodayDate = $("#galleryTodayDate");
const loginTimezoneButtons = [...document.querySelectorAll("[data-login-timezone]")];
const TIMEZONE_PREFERENCE_KEY = "memory-preferred-timezone";
const SUPPORTED_TIMEZONES = ["Asia/Shanghai", "America/Los_Angeles"];

clearLegacyMelPreludeState();

// The ticket is opened from both the prelude and the main site. Keep its fixed
// overlay outside either visibility container so both entry points can show it.
if (ticketOverlay) document.body.append(ticketOverlay);

let litLightCount = 0;
let preludeCompleteTimer;
let homecomingInterval;
let authMode = "login";
let authenticatedSession = null;
let currentIdentity = null;
let giftIconsFound = Object.fromEntries(GIFT_ICON_IDS.map((id) => [id, false]));
let giftStateReady = false;
let giftToastTimer;
let giftAudioCachePromise = null;
let giftAudioSource = null;
let giftAudioObjectUrl = null;
let giftAudioLoadStartedAt = 0;
let giftAudioSlowTimer;
let giftAudioGeneration = 0;
let selectedLoginTimezone = localStorage.getItem(TIMEZONE_PREFERENCE_KEY) || "Asia/Shanghai";
let loginTimezoneTimer;

if (!SUPPORTED_TIMEZONES.includes(selectedLoginTimezone)) selectedLoginTimezone = "Asia/Shanghai";

function timezoneName(timezone) {
  return timezone === "Asia/Shanghai" ? "Beijing" : "US West Coast";
}

function updateLoginTimezoneButtons() {
  const now = new Date();
  loginTimezoneButtons.forEach((button) => {
    const timezone = button.dataset.loginTimezone;
    const presentation = timePresentation(now, timezone);
    const selected = timezone === selectedLoginTimezone;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", `${timezoneName(timezone)}, ${presentation.time}${selected ? ", selected" : ""}`);
    button.replaceChildren();
    const icon = document.createElement("span");
    icon.className = "auth-timezone-icon";
    icon.textContent = presentation.icon;
    const time = document.createElement("time");
    time.textContent = presentation.time;
    button.append(icon, time);
  });
  if (galleryTodayDate) galleryTodayDate.textContent = timePresentation(now, selectedLoginTimezone).date.replaceAll(".", ".");
}

function preludeStorageKey() {
  return authenticatedSession?.user?.id
    ? `melPreludeComplete:${authenticatedSession.user.id}`
    : "melPreludeComplete";
}

function hasCompletedPrelude() {
  return canAccessMelFeature(currentIdentity) && localStorage.getItem(preludeStorageKey()) === "yes";
}

function syncCompletedControls() {
  const canUsePrelude = canAccessMelFeature(currentIdentity);
  const completed = canUsePrelude && hasCompletedPrelude();
  document.body.classList.toggle("prelude-complete", completed);
  returnLetterButton?.classList.toggle("hidden", !completed);
}

function setTicketPeek(open) {
  lovePrelude.classList.toggle("ticket-peeked", open);
  ticketStub?.setAttribute("aria-expanded", open ? "true" : "false");
}

function markPreludeLit() {
  litLightCount = lightWords.length;
  if (lightProgress) lightProgress.textContent = `${lightWords.length} / ${lightWords.length}`;
  lovePrelude.classList.add("is-complete", "is-revisit");
  lightWords.forEach((word) => {
    word.dataset.lit = "yes";
    word.setAttribute("aria-pressed", "true");
    word.classList.add("is-lit");
    word.closest(".letter-paragraph")?.classList.add("is-illuminated");
  });
}

function normalizeGiftState(state = {}) {
  return Object.fromEntries(GIFT_ICON_IDS.map((id) => [id, state[id] === true]));
}

function foundGiftCount() {
  return GIFT_ICON_IDS.filter((id) => giftIconsFound[id]).length;
}

function hasFoundAllGifts() {
  return foundGiftCount() === GIFT_ICON_IDS.length;
}

function applyGiftState() {
  const allowed = canAccessMelFeature(currentIdentity) && giftStateReady;
  giftButtons.forEach((button) => {
    button.classList.toggle("hidden", !allowed || giftIconsFound[button.dataset.giftId] === true);
  });
  secretGiftNav?.classList.toggle("hidden", !canAccessGiftPage(currentIdentity, hasFoundAllGifts()));
}

function showGiftToast(message) {
  if (!giftToast) return;
  window.clearTimeout(giftToastTimer);
  giftToast.textContent = message;
  giftToast.classList.remove("hidden");
  giftToastTimer = window.setTimeout(() => giftToast.classList.add("hidden"), 2200);
}

async function loadGiftState() {
  const sessionUserId = authenticatedSession?.user?.id;
  resetGiftState();
  if (!sessionUserId || !canAccessMelFeature(currentIdentity)) return;
  try {
    const nextGiftState = await loadGiftStateForIdentity({
      identity: currentIdentity,
      spaceId: appConfig.spaceId,
      repository,
    });
    if (authenticatedSession?.user?.id !== sessionUserId) return;
    giftIconsFound = normalizeGiftState(nextGiftState);
    giftStateReady = true;
    applyGiftState();
    if (foundGiftCount() > 0) {
      void startGiftAudioCache().catch((error) => console.warn("Gift audio pre-cache paused", error));
    } else {
      void clearGiftAudioCache().then(() => {
        if (foundGiftCount() === 0 && giftAudioExperience) giftAudioExperience.dataset.cacheState = "empty";
      });
    }
  } catch (error) {
    if (authenticatedSession?.user?.id !== sessionUserId) return;
    console.error("Gift state failed to load", error);
    resetGiftState();
  }
}

async function collectGiftIcon(giftId) {
  if (!canAccessMelFeature(currentIdentity) || !giftStateReady || !GIFT_ICON_IDS.includes(giftId) || giftIconsFound[giftId]) return;
  try {
    giftIconsFound = normalizeGiftState(await collectGiftForIdentity({
      identity: currentIdentity,
      spaceId: appConfig.spaceId,
      giftId,
      repository,
    }));
    applyGiftState();
    const count = foundGiftCount();
    showGiftToast(hasFoundAllGifts() ? "🎁 secret unlocked" : `🎁 found! (${count}/5)`);
    if (count > 0) void startGiftAudioCache().catch((error) => console.warn("Gift audio pre-cache paused", error));
  } catch (error) {
    console.error("Gift collection failed", error);
    showGiftToast("Could not save this gift yet.");
  }
}

function resetGiftState() {
  giftIconsFound = Object.fromEntries(GIFT_ICON_IDS.map((id) => [id, false]));
  giftStateReady = false;
  giftToast?.classList.add("hidden");
  applyGiftState();
  resetGiftAudio();
}

function formatAudioTime(value) {
  if (!Number.isFinite(value) || value < 0) return "--:--";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function setGiftAudioState(state, message) {
  if (!giftAudioExperience) return;
  giftAudioExperience.classList.toggle("is-loading", state === "loading");
  giftAudioExperience.classList.toggle("is-ready", state === "ready");
  giftAudioExperience.classList.toggle("is-error", state === "error");
  giftAudioRetry?.classList.toggle("hidden", state !== "error");
  if (giftAudioStatus && message) giftAudioStatus.textContent = message;
}

function resetGiftAudio() {
  giftAudioGeneration += 1;
  window.clearTimeout(giftAudioSlowTimer);
  if (giftAudio) {
    giftAudio.pause();
    giftAudio.removeAttribute("src");
    giftAudio.load();
  }
  if (giftAudioObjectUrl) URL.revokeObjectURL(giftAudioObjectUrl);
  giftAudioObjectUrl = null;
  giftAudioSource = null;
  giftAudioCachePromise = null;
  giftAudioLoadStartedAt = 0;
  if (giftAudioPlay) {
    giftAudioPlay.disabled = true;
    giftAudioPlay.classList.remove("is-playing");
    giftAudioPlay.setAttribute("aria-label", "Play In Loving Memory");
    giftAudioPlay.querySelector("span").textContent = "▶";
  }
  if (giftAudioProgress) {
    giftAudioProgress.disabled = true;
    giftAudioProgress.max = "0";
    giftAudioProgress.value = "0";
    giftAudioProgress.style.setProperty("--gift-audio-progress", "0%");
  }
  if (giftAudioCurrent) giftAudioCurrent.textContent = "0:00";
  if (giftAudioDuration) giftAudioDuration.textContent = "5:40";
  if (giftAudioUnlockTitle) giftAudioUnlockTitle.textContent = "正在打开这份礼物";
  if (giftAudioUnlockCopy) giftAudioUnlockCopy.textContent = "把藏在云端的声音，轻轻带到你身边…";
  setGiftAudioState("loading", "Preparing your gift…");
  giftAudioExperience?.removeAttribute("data-load-ms");
  giftAudioExperience?.removeAttribute("data-audio-source");
  giftAudioExperience?.removeAttribute("data-cache-state");
}

async function startGiftAudioCache() {
  const userId = authenticatedSession?.user?.id;
  if (!userId || !canAccessMelFeature(currentIdentity) || foundGiftCount() < 1) return null;
  if (giftAudioSource) return giftAudioSource;
  if (giftAudioCachePromise) return giftAudioCachePromise;
  const generation = giftAudioGeneration;
  if (giftAudioExperience) giftAudioExperience.dataset.cacheState = "loading";
  giftAudioCachePromise = (async () => {
    const media = await loadGiftAudioForIdentity({
      identity: currentIdentity,
      foundAnyGift: true,
      spaceId: appConfig.spaceId,
      repository,
    });
    if (!media?.url) return null;
    const localSource = await resolveGiftAudioSource(media);
    if (authenticatedSession?.user?.id !== userId || generation !== giftAudioGeneration) {
      URL.revokeObjectURL(localSource.url);
      return null;
    }
    giftAudioObjectUrl = localSource.url;
    giftAudioSource = { ...media, ...localSource };
    if (giftAudioExperience) {
      giftAudioExperience.dataset.cacheState = "ready";
      giftAudioExperience.dataset.audioSource = localSource.source;
    }
    return giftAudioSource;
  })().catch((error) => {
    if (generation === giftAudioGeneration) giftAudioCachePromise = null;
    if (generation === giftAudioGeneration && giftAudioExperience) giftAudioExperience.dataset.cacheState = "error";
    throw error;
  });
  return giftAudioCachePromise;
}

async function loadGiftAudio() {
  const userId = authenticatedSession?.user?.id;
  if (!userId || !hasFoundAllGifts() || giftAudioExperience?.classList.contains("is-ready")) return;
  const generation = giftAudioGeneration;
  giftAudioLoadStartedAt = performance.now();
  setGiftAudioState("loading", "Preparing your gift…");
  if (giftAudioUnlockTitle) giftAudioUnlockTitle.textContent = "正在打开这份礼物";
  if (giftAudioUnlockCopy) giftAudioUnlockCopy.textContent = "把藏在云端的声音，轻轻带到你身边…";
  window.clearTimeout(giftAudioSlowTimer);
  giftAudioSlowTimer = window.setTimeout(() => {
    if (giftAudioUnlockTitle) giftAudioUnlockTitle.textContent = "礼物正在向你走来";
    if (giftAudioUnlockCopy) giftAudioUnlockCopy.textContent = "第一次会多等一会儿，以后这台设备会直接从本地打开。";
  }, 1600);
  try {
    const media = await startGiftAudioCache();
    if (authenticatedSession?.user?.id !== userId || generation !== giftAudioGeneration || !media?.url) return;
    if (giftAudio.src === media.url) return;
    giftAudio.src = media.url;
    giftAudio.load();
  } catch (error) {
    if (authenticatedSession?.user?.id !== userId || generation !== giftAudioGeneration) return;
    window.clearTimeout(giftAudioSlowTimer);
    console.error("Gift audio failed to load", error);
    if (giftAudioUnlockTitle) giftAudioUnlockTitle.textContent = "这份声音暂时没有打开";
    if (giftAudioUnlockCopy) giftAudioUnlockCopy.textContent = "它仍安全地留在云端，稍后再试一次。";
    setGiftAudioState("error", "Unable to open the private audio.");
  }
}

function showPage(pageId) {
  const targetPageId = accessiblePage(pageId, currentIdentity, hasFoundAllGifts());
  pages.forEach((page) => page.classList.toggle("is-active", page.id === targetPageId));
  navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.page === targetPageId));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (targetPageId === "planet") {
    activatePlanetParticles();
  }
  if (targetPageId === "glimmer") {
    activateGlimmerPage();
  }
  if (targetPageId === "gallery") {
    activateGalleryPage();
  }
  if (targetPageId === "memories") {
    activateMemoriesPage(currentIdentity);
    window.setTimeout(queuePanoramaUpdate, 0);
  }
  if (targetPageId === "gift-secret") loadGiftAudio();
}

async function unlock() {
  await initializeGlimmerSession();
  currentIdentity = getGlimmerIdentity();
  if (!currentIdentity) throw new Error("Could not load your member role.");
  gate.classList.add("hidden");
  syncCompletedControls();
  applyGiftState();
  await loadGiftState();
  if (!shouldShowPrelude(currentIdentity, hasCompletedPrelude())) {
    showMainSite(false);
  } else {
    showPrelude();
  }
}

function showPrelude() {
  if (!canAccessMelFeature(currentIdentity)) {
    showMainSite(false);
    return;
  }
  site.classList.add("hidden");
  lovePrelude.classList.remove("hidden");
  setTicketPeek(false);
  ticketOverlay?.classList.add("hidden");
  ticketOverlay?.classList.remove("is-closing");
  if (hasCompletedPrelude()) {
    window.clearTimeout(preludeCompleteTimer);
    window.clearInterval(homecomingInterval);
    homecoming.classList.add("hidden");
    markPreludeLit();
  }
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
}

function showMainSite(animate = true) {
  lovePrelude.classList.add("hidden");
  homecoming.classList.add("hidden");
  site.classList.remove("hidden");
  syncCompletedControls();
  site.classList.remove("site-entering");
  if (animate) {
    void site.offsetWidth;
    site.classList.add("site-entering");
    window.setTimeout(() => site.classList.remove("site-entering"), 2500);
  }
  window.scrollTo({ top: 0 });
  window.setTimeout(queuePanoramaUpdate, 0);
}

function resetPrelude() {
  window.clearTimeout(preludeCompleteTimer);
  window.clearInterval(homecomingInterval);
  litLightCount = 0;
  if (lightProgress) lightProgress.textContent = `0 / ${lightWords.length}`;
  lovePrelude.classList.remove("is-complete", "is-revisit");
  homecoming.classList.add("hidden");
  homecomingCount.textContent = "3";
  lightWords.forEach((word) => {
    word.classList.remove("is-lit");
    word.removeAttribute("data-lit");
    word.setAttribute("aria-pressed", "false");
    word.closest(".letter-paragraph")?.classList.remove("is-illuminated");
  });
}

function completePrelude() {
  if (!canAccessMelFeature(currentIdentity)) return;
  localStorage.setItem(preludeStorageKey(), "yes");
  syncCompletedControls();
  lovePrelude.classList.add("is-complete");

  preludeCompleteTimer = window.setTimeout(() => {
    let count = 3;
    homecomingCount.textContent = String(count);
    homecoming.classList.remove("hidden");

    homecomingInterval = window.setInterval(() => {
      count -= 1;
      if (count <= 0) {
        window.clearInterval(homecomingInterval);
        showMainSite(true);
        return;
      }
      homecomingCount.textContent = String(count);
    }, 1000);
  }, 1700);
}

syncCompletedControls();
updateLoginTimezoneButtons();
loginTimezoneTimer = window.setInterval(updateLoginTimezoneButtons, 30000);

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  if (registering) {
    authEmail.value = "";
    authPassword.value = "";
    authConfirmPassword.value = "";
  }
  showLoginModeButton.classList.toggle("is-active", !registering);
  showRegisterModeButton.classList.toggle("is-active", registering);
  showLoginModeButton.setAttribute("aria-selected", String(!registering));
  showRegisterModeButton.setAttribute("aria-selected", String(registering));
  [displayNameLabel, authDisplayName, confirmPasswordLabel, authConfirmPassword]
    .forEach((element) => element.classList.toggle("hidden", !registering));
  authDisplayName.required = registering;
  authConfirmPassword.required = registering;
  authPassword.autocomplete = registering ? "new-password" : "current-password";
  authSubmitButton.textContent = registering ? "Create account" : "Sign in";
  forgotPasswordButton.classList.toggle("hidden", registering);
  authGateCopy.textContent = registering
    ? "Two accounts, one shared world. The first two registrations claim Ray and Mel."
    : "Sign in to the private world shared by Ray and Mel.";
  authMessage.textContent = "";
}

function setAuthBusy(busy, message = "") {
  [...authForm.elements].forEach((element) => { element.disabled = busy; });
  showLoginModeButton.disabled = busy;
  showRegisterModeButton.disabled = busy;
  if (message) authMessage.textContent = message;
}

function showSignedOut(message = "") {
  authenticatedSession = null;
  currentIdentity = null;
  resetGlimmerSession();
  resetMemorySession();
  resetGiftState();
  resetPrelude();
  showPage("home");
  setTicketPeek(false);
  ticketOverlay?.classList.add("hidden");
  ticketOverlay?.classList.remove("is-closing");
  lovePrelude.classList.add("hidden");
  site.classList.add("hidden");
  gate.classList.remove("hidden");
  authPassword.value = "";
  authConfirmPassword.value = "";
  authMessage.textContent = message;
  selectedLoginTimezone = localStorage.getItem(TIMEZONE_PREFERENCE_KEY) || "Asia/Shanghai";
  if (!SUPPORTED_TIMEZONES.includes(selectedLoginTimezone)) selectedLoginTimezone = "Asia/Shanghai";
  updateLoginTimezoneButtons();
  authEmail.focus();
  syncCompletedControls();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;
  setAuthBusy(true, authMode === "register" ? "Creating your account..." : "Signing in...");
  try {
    if (authMode === "register") {
      if (password !== authConfirmPassword.value) throw new Error("Passwords do not match.");
      const data = await repository.signUp({ email, password, displayName: authDisplayName.value });
      if (!data.session) throw new Error("Account created, but no session was returned. Please sign in.");
      authenticatedSession = data.session;
    } else {
      const data = await repository.signIn(email, password);
      authenticatedSession = data.session;
    }
    authMessage.textContent = "";
    await unlock();
  } catch (error) {
    authMessage.textContent = error.code === "REGISTRATION_LIMIT_REACHED"
      ? "Both member accounts have already been claimed."
      : error.message;
  } finally {
    setAuthBusy(false);
  }
}

showLoginModeButton.addEventListener("click", () => setAuthMode("login"));
showRegisterModeButton.addEventListener("click", () => setAuthMode("register"));
loginTimezoneButtons.forEach((button) => button.addEventListener("click", () => {
  selectedLoginTimezone = button.dataset.loginTimezone;
  localStorage.setItem(TIMEZONE_PREFERENCE_KEY, selectedLoginTimezone);
  updateLoginTimezoneButtons();
}));
authForm.addEventListener("submit", handleAuthSubmit);
forgotPasswordButton.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  if (!email) {
    authMessage.textContent = "Enter your email first.";
    authEmail.focus();
    return;
  }
  setAuthBusy(true, "Requesting a recovery email...");
  try {
    await repository.resetPassword(email, new URL("./update-password.html", window.location.href).href);
    authMessage.textContent = "If the account exists, a recovery email will arrive shortly.";
  } catch (error) {
    authMessage.textContent = error.code === "NETWORK_ERROR"
      ? error.message
      : "If the account exists, a recovery email will arrive shortly.";
  } finally {
    setAuthBusy(false);
  }
});

lockButton.textContent = "Sign out";
lockButton.addEventListener("click", async () => {
  try { await repository.signOut(); } catch (error) { console.error("Sign out failed", error); }
  showSignedOut();
});

repository.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") showSignedOut("You have signed out.");
  if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) authenticatedSession = session;
});

window.addEventListener("app-session-expired", async () => {
  try { await repository.signOut(); } catch (error) { console.error("Expired session cleanup failed", error); }
  showSignedOut("Your session has expired. Sign in again.");
});

setAuthMode("login");
async function initializeAuth() {
  setAuthBusy(true, "Restoring session...");
  try {
    const urlSession = await repository.consumeSessionFromUrl();
    if (urlSession && window.location.hash) {
      window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
    }
    authenticatedSession = urlSession || await repository.getSession();
    if (authenticatedSession) await unlock();
    else showSignedOut();
  } catch (error) {
    if (authenticatedSession) {
      try { await repository.clearLocalSession(); } catch (cleanupError) { console.error("Invalid local session cleanup failed", cleanupError); }
    }
    showSignedOut(error.message === "NOT_SPACE_MEMBER" ? "" : error.message);
  } finally {
    setAuthBusy(false);
  }
}
initializeAuth();

lightWords.forEach((word) => {
  word.setAttribute("aria-pressed", "false");
  word.addEventListener("click", () => {
    if (word.dataset.lit === "yes") return;

    word.dataset.lit = "yes";
    word.setAttribute("aria-pressed", "true");
    word.classList.add("is-lit");
    word.closest(".letter-paragraph")?.classList.add("is-illuminated");
    litLightCount += 1;
    if (lightProgress) lightProgress.textContent = `${litLightCount} / ${lightWords.length}`;

    if (litLightCount === lightWords.length) {
      completePrelude();
    }
  });
});

function openTicket() {
  ticketOverlay.classList.remove("hidden", "is-closing");
}

function closeTicket() {
  ticketOverlay.classList.add("is-closing");
  window.setTimeout(() => {
    ticketOverlay.classList.add("hidden");
    ticketOverlay.classList.remove("is-closing");
  }, 340);
}

ticketStub?.addEventListener("click", (event) => {
  event.stopPropagation();
  setTicketPeek(false);
  openTicket();
});
$("#glimmerTicketStub")?.addEventListener("click", openTicket);
ticketClose?.addEventListener("click", closeTicket);
ticketBackdrop?.addEventListener("click", closeTicket);

lovePrelude?.addEventListener("click", (event) => {
  if (!lovePrelude.classList.contains("ticket-peeked")) return;
  if (event.target.closest(".prelude-letter-wrap")) return;
  setTicketPeek(false);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !ticketOverlay?.classList.contains("hidden")) {
    closeTicket();
  }
});

navItems.forEach((item) => {
  item.addEventListener("click", () => showPage(item.dataset.page));
});

pageJumpButtons.forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.pageJump));
});

giftButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    collectGiftIcon(button.dataset.giftId);
  });
});

returnLetterButton?.addEventListener("click", () => {
  if (!canReturnToPrelude(currentIdentity, hasCompletedPrelude())) return;
  showPrelude();
});

returnHomeFromLetter?.addEventListener("click", () => {
  if (!canReturnToPrelude(currentIdentity, hasCompletedPrelude())) return;
  showMainSite(false);
});

giftAudioPlay?.addEventListener("click", async () => {
  if (!giftAudio?.src) return;
  if (giftAudio.paused) {
    try {
      await giftAudio.play();
    } catch {
      setGiftAudioState("error", "Playback could not start. Please try again.");
    }
  } else {
    giftAudio.pause();
  }
});

giftAudioRetry?.addEventListener("click", () => {
  setGiftAudioState("loading", "Preparing your gift…");
  loadGiftAudio();
});

giftAudioProgress?.addEventListener("input", () => {
  if (!giftAudio || !Number.isFinite(giftAudio.duration)) return;
  giftAudio.currentTime = Number(giftAudioProgress.value);
});

giftAudio?.addEventListener("loadedmetadata", () => {
  const duration = Number.isFinite(giftAudio.duration) ? giftAudio.duration : 0;
  giftAudioProgress.max = String(duration);
  giftAudioProgress.disabled = duration <= 0;
  giftAudioPlay.disabled = false;
  giftAudioDuration.textContent = formatAudioTime(duration);
});

giftAudio?.addEventListener("canplay", () => {
  window.clearTimeout(giftAudioSlowTimer);
  const elapsed = giftAudioLoadStartedAt ? Math.round(performance.now() - giftAudioLoadStartedAt) : 0;
  giftAudioExperience.dataset.loadMs = String(elapsed);
  giftAudioExperience.dataset.audioSource = giftAudioSource?.source ?? "unknown";
  if (giftAudioUnlockTitle) giftAudioUnlockTitle.textContent = "这份声音已经来到你身边";
  if (giftAudioUnlockCopy) giftAudioUnlockCopy.textContent = "准备好时，按下播放。";
  const revealDelay = Math.max(0, 900 - elapsed);
  window.setTimeout(() => {
    if (!giftAudio?.getAttribute("src")) return;
    setGiftAudioState("ready", giftAudioSource?.source === "cache" ? "Ready from this device" : "Saved on this device");
  }, revealDelay);
});

giftAudio?.addEventListener("timeupdate", () => {
  const duration = Number.isFinite(giftAudio.duration) ? giftAudio.duration : 0;
  const current = Number.isFinite(giftAudio.currentTime) ? giftAudio.currentTime : 0;
  giftAudioCurrent.textContent = formatAudioTime(current);
  giftAudioProgress.value = String(current);
  giftAudioProgress.style.setProperty("--gift-audio-progress", `${duration ? (current / duration) * 100 : 0}%`);
});

giftAudio?.addEventListener("play", () => {
  giftAudioExperience?.classList.add("is-playing");
  giftAudioPlay.classList.add("is-playing");
  giftAudioPlay.querySelector("span").textContent = "Ⅱ";
  giftAudioPlay.setAttribute("aria-label", "Pause In Loving Memory");
  giftAudioStatus.textContent = "Playing softly…";
});

giftAudio?.addEventListener("pause", () => {
  giftAudioExperience?.classList.remove("is-playing");
  giftAudioPlay.classList.remove("is-playing");
  giftAudioPlay.querySelector("span").textContent = "▶";
  giftAudioPlay.setAttribute("aria-label", "Play In Loving Memory");
  if (giftAudio.currentTime > 0 && !giftAudio.ended) giftAudioStatus.textContent = "Paused · this moment will wait.";
});

giftAudio?.addEventListener("ended", () => {
  giftAudioStatus.textContent = "Always here when you want to listen again.";
});

giftAudio?.addEventListener("error", () => {
  if (!giftAudio.getAttribute("src")) return;
  if (giftAudioUnlockTitle) giftAudioUnlockTitle.textContent = "这份声音暂时没有打开";
  if (giftAudioUnlockCopy) giftAudioUnlockCopy.textContent = "它仍安全地留在云端，稍后再试一次。";
  setGiftAudioState("error", "Unable to play the private audio.");
});

const planetPage = $("#planet");
const planetCanvas = $("#planetParticles");
const planetCtx = planetCanvas?.getContext("2d");
let planetParticles = [];
let planetAnimationStarted = false;
let planetBurstUntil = 0;

function resizePlanetCanvas() {
  if (!planetCanvas || !planetCtx || !planetPage) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = planetPage.getBoundingClientRect();
  const width = Math.max(1, planetPage.offsetWidth);
  const height = Math.max(window.innerHeight, planetPage.scrollHeight, rect.height);
  planetCanvas.width = Math.floor(width * ratio);
  planetCanvas.height = Math.floor(height * ratio);
  planetCanvas.style.height = `${height}px`;
  planetCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function seedPlanetParticles(count = 140) {
  if (!planetCanvas || !planetPage) return;
  const width = planetPage.offsetWidth;
  const height = Math.max(window.innerHeight, planetPage.scrollHeight);
  planetParticles = Array.from({ length: count }, (_, index) => {
    const angle = index * 0.42;
    return {
      x: width * 0.5 + Math.cos(angle) * (20 + (index % 22) * 7),
      y: 260 + Math.sin(angle) * (20 + (index % 22) * 5),
      vx: (Math.random() - 0.5) * 0.35,
      vy: 0.18 + Math.random() * 0.55,
      size: 1.2 + Math.random() * 2.8,
      alpha: 0.2 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
      drift: 0.18 + Math.random() * 0.5,
      color: Math.random() > 0.24 ? "122, 92, 255" : "216, 200, 255",
    };
  });
}

function activatePlanetParticles() {
  if (!planetCanvas || !planetCtx || !planetPage) return;
  resizePlanetCanvas();
  seedPlanetParticles();
  planetBurstUntil = performance.now() + 1200;

  if (!planetAnimationStarted) {
    planetAnimationStarted = true;
    requestAnimationFrame(drawPlanetParticles);
  }
}

function drawPlanetParticles(now) {
  if (!planetCanvas || !planetCtx || !planetPage) return;
  const width = planetPage.offsetWidth;
  const height = Math.max(window.innerHeight, planetPage.scrollHeight);
  const isPlanetVisible = planetPage.classList.contains("is-active");

  planetCtx.clearRect(0, 0, width, height);

  if (isPlanetVisible) {
    const burst = Math.max(0, (planetBurstUntil - now) / 1200);
    planetParticles.forEach((particle) => {
      particle.phase += 0.015;
      particle.x += particle.vx + Math.sin(particle.phase) * particle.drift + burst * (particle.x - width * 0.5) * 0.012;
      particle.y += particle.vy + burst * 1.8;

      if (particle.y > height + 20 || particle.x < -40 || particle.x > width + 40) {
        particle.x = Math.random() * width;
        particle.y = -20;
        particle.vx = (Math.random() - 0.5) * 0.35;
        particle.vy = 0.18 + Math.random() * 0.55;
      }

      planetCtx.beginPath();
      planetCtx.fillStyle = `rgba(${particle.color}, ${Math.min(0.88, particle.alpha + burst * 0.4)})`;
      planetCtx.arc(particle.x, particle.y, particle.size + burst * 1.8, 0, Math.PI * 2);
      planetCtx.fill();
    });
  }

  requestAnimationFrame(drawPlanetParticles);
}

window.addEventListener("resize", () => {
  resizePlanetCanvas();
  if (planetPage?.classList.contains("is-active")) seedPlanetParticles(planetParticles.length || 140);
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");

      entry.target.querySelectorAll("[data-count-target]").forEach((counter) => {
        if (counter.dataset.counted === "yes") return;
        counter.dataset.counted = "yes";
        const target = Number(counter.dataset.countTarget);
        const duration = 900;
        const start = performance.now();

        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          counter.textContent = Math.floor(target * progress).toLocaleString();
          if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
      });
    });
  },
  { threshold: 0.18 }
);

document.querySelectorAll(".reveal-card").forEach((item) => revealObserver.observe(item));

let panoramaFrames = [...document.querySelectorAll(".panorama-frame")];
const panoramaSequence = $(".panorama-sequence");
let activePanoramaPanel = null;
let panoramaTicking = false;

window.addEventListener("memories-panorama-updated", () => {
  panoramaFrames = [...document.querySelectorAll(".panorama-frame")];
  activePanoramaPanel = null;
  queuePanoramaUpdate();
});

function setPanoramaPanel(panel) {
  if (panel === activePanoramaPanel) return;
  activePanoramaPanel = panel;
  panoramaFrames.forEach((frame) => frame.classList.toggle("is-active", frame.dataset.panel === panel));
}

function updatePanoramaFromScroll() {
  panoramaTicking = false;
  if (!panoramaFrames.length || !panoramaSequence) return;

  const viewportCenter = window.innerHeight * 0.5;
  let closestFrame = panoramaFrames[0];
  let closestDistance = Infinity;

  panoramaFrames.forEach((frame) => {
    const rect = frame.getBoundingClientRect();
    const frameCenter = rect.top + rect.height * 0.5;
    const distance = frameCenter - viewportCenter;
    const normalizedDistance = Math.max(-1, Math.min(1, distance / window.innerHeight));
    const parallax = normalizedDistance * -46;

    frame.style.setProperty("--parallax-y", `${parallax - rect.height * 0.07}px`);

    if (Math.abs(distance) < closestDistance) {
      closestDistance = Math.abs(distance);
      closestFrame = frame;
    }
  });

  setPanoramaPanel(closestFrame.dataset.panel);
}

function queuePanoramaUpdate() {
  if (panoramaTicking) return;
  panoramaTicking = true;
  requestAnimationFrame(updatePanoramaFromScroll);
}

window.addEventListener("scroll", queuePanoramaUpdate, { passive: true });
window.addEventListener("resize", queuePanoramaUpdate);
updatePanoramaFromScroll();

const sky = $("#sky");
const skyCtx = sky.getContext("2d");
let skyStars = [];

function resizeSky() {
  const ratio = window.devicePixelRatio || 1;
  sky.width = Math.floor(window.innerWidth * ratio);
  sky.height = Math.floor(window.innerHeight * ratio);
  skyCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  skyStars = Array.from({ length: Math.min(140, Math.floor(window.innerWidth / 9)) }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 1.7 + 0.3,
    a: Math.random() * 0.7 + 0.2,
    s: Math.random() * 0.35 + 0.05,
  }));
}

function drawSky() {
  skyCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  skyStars.forEach((star) => {
    star.y += star.s;
    if (star.y > window.innerHeight) star.y = -4;
    skyCtx.beginPath();
    skyCtx.fillStyle = `rgba(123, 63, 242, ${star.a * 0.34})`;
    skyCtx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    skyCtx.fill();
  });
  requestAnimationFrame(drawSky);
}

window.addEventListener("resize", resizeSky);
resizeSky();
drawSky();

const gameCanvas = $("#heartGame");
const gameCtx = gameCanvas?.getContext("2d");
const scoreEl = $("#score");
const startGame = $("#startGame");
const gameMessage = $("#gameMessage");
const secret = $("#secret");

if (gameCanvas && gameCtx && scoreEl && startGame && gameMessage) {
let player = { x: gameCanvas.width / 2, y: gameCanvas.height - 50, w: 140, h: 24 };
let hearts = [];
let score = 0;
let playing = false;
let lastSpawn = 0;
let lastTime = 0;

function drawHeart(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 32);
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.bezierCurveTo(-28, -10, -12, -30, 0, -15);
  ctx.bezierCurveTo(12, -30, 28, -10, 0, 10);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawGame() {
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  gameCtx.fillStyle = "rgba(123, 63, 242, 0.08)";
  for (let x = 0; x < gameCanvas.width; x += 38) {
    gameCtx.fillRect(x, 0, 1, gameCanvas.height);
  }
  for (let y = 0; y < gameCanvas.height; y += 38) {
    gameCtx.fillRect(0, y, gameCanvas.width, 1);
  }

  hearts.forEach((heart) => drawHeart(gameCtx, heart.x, heart.y, heart.size, heart.color));

  gameCtx.fillStyle = "#4b35a4";
  gameCtx.beginPath();
  gameCtx.roundRect(player.x - player.w / 2, player.y, player.w, player.h, 12);
  gameCtx.fill();

  gameCtx.fillStyle = "rgba(255, 255, 255, 0.85)";
  gameCtx.font = "700 16px Inter, sans-serif";
  gameCtx.textAlign = "center";
  gameCtx.fillText("drum pad", player.x, player.y - 10);
}

function spawnHeart() {
  hearts.push({
    x: 30 + Math.random() * (gameCanvas.width - 60),
    y: -30,
    size: 24 + Math.random() * 16,
    speed: 120 + Math.random() * 120,
    color: Math.random() > 0.5 ? "#7a5cff" : "#151219",
  });
}

function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  if (playing && timestamp - lastSpawn > 620) {
    spawnHeart();
    lastSpawn = timestamp;
  }

  hearts = hearts.filter((heart) => {
    heart.y += heart.speed * delta;
    const caught =
      heart.y + heart.size * 0.4 >= player.y &&
      heart.y <= player.y + player.h &&
      heart.x >= player.x - player.w / 2 &&
      heart.x <= player.x + player.w / 2;

    if (caught) {
      score += 1;
      scoreEl.textContent = score;
      if (score >= 20) {
        playing = false;
        secret?.classList.remove("locked");
        gameMessage.textContent = "Surprise page unlocked. Open the Surprise tab.";
      }
      return false;
    }
    return heart.y < gameCanvas.height + 50;
  });

  drawGame();
  requestAnimationFrame(gameLoop);
}

function setPlayerFromEvent(event) {
  const rect = gameCanvas.getBoundingClientRect();
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const x = ((clientX - rect.left) / rect.width) * gameCanvas.width;
  player.x = Math.max(player.w / 2, Math.min(gameCanvas.width - player.w / 2, x));
}

gameCanvas.addEventListener("mousemove", setPlayerFromEvent);
gameCanvas.addEventListener("touchmove", (event) => {
  event.preventDefault();
  setPlayerFromEvent(event);
}, { passive: false });

startGame.addEventListener("click", () => {
  score = 0;
  hearts = [];
  playing = true;
  lastSpawn = 0;
  scoreEl.textContent = "0";
  secret?.classList.add("locked");
  gameMessage.textContent = "Catch 20 hearts.";
});

drawGame();
requestAnimationFrame(gameLoop);
}
