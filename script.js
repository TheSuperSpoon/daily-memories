const CONFIG = {
  password: "mel720",
  birthday: "2026-07-20T00:00:00",
  glimmerStart: "2026-07-20",
};

const memories = [
  {
    date: "Memory 01",
    title: "The first photo goes here",
    image: "",
    copy: "Drop in the photo that feels like the beginning, then replace this with the tiny detail you still remember.",
    tags: ["first photo", "soft launch"],
  },
  {
    date: "Memory 02",
    title: "First date / first real hang",
    image: "",
    copy: "Add the place, what she wore, what you were nervous about, or the exact moment it felt different.",
    tags: ["first date", "purple lights"],
  },
  {
    date: "Memory 03",
    title: "Band room moment",
    image: "",
    copy: "Singer and drummer energy. This can hold a rehearsal photo, a stage clip, or a line about how her voice changes the room.",
    tags: ["rock band", "singer", "drummer"],
  },
  {
    date: "Memory 04",
    title: "Cute chat screenshot",
    image: "",
    copy: "Put one of those messages here that looks small to everyone else but means a whole world to you.",
    tags: ["chat", "inside joke"],
  },
  {
    date: "Memory 05",
    title: "Her universe",
    image: "",
    copy: "A nod to violet chaos, sharp aim, complicated heroines, and the songs that sound like her moodboard.",
    tags: ["Jinx vibe", "Iso mood", "Halsey"],
  },
  {
    date: "Memory 06",
    title: "The birthday promise",
    image: "",
    copy: "End the scroll with what you want the next year to feel like together.",
    tags: ["July 20", "next chapter"],
  },
];

const $ = (selector) => document.querySelector(selector);
const gate = $("#gate");
const site = $("#site");
const form = $("#passwordForm");
const passwordInput = $("#passwordInput");
const passwordMessage = $("#passwordMessage");
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
const navItems = [...document.querySelectorAll(".nav-item")];
const pageJumpButtons = [...document.querySelectorAll("[data-page-jump]")];
const pages = [...document.querySelectorAll(".page")];
let litLightCount = 0;
let preludeCompleteTimer;
let homecomingInterval;

function showPage(pageId) {
  pages.forEach((page) => page.classList.toggle("is-active", page.id === pageId));
  navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.page === pageId));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (pageId === "planet") {
    activatePlanetParticles();
  }
  if (pageId === "glimmer") {
    resizeGlimmerCanvas();
    renderGlimmer();
  }
}

function unlock() {
  gate.classList.add("hidden");
  localStorage.setItem("melBirthdayUnlocked", "yes");
  if (localStorage.getItem("melPreludeComplete") === "yes") {
    showMainSite(false);
  } else {
    showPrelude();
  }
}

function showPrelude() {
  site.classList.add("hidden");
  lovePrelude.classList.remove("hidden");
  ticketOverlay?.classList.add("hidden");
  ticketOverlay?.classList.remove("is-closing");
  window.scrollTo({ top: 0 });
}

function showMainSite(animate = true) {
  lovePrelude.classList.add("hidden");
  homecoming.classList.add("hidden");
  site.classList.remove("hidden");
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
  lightProgress.textContent = `0 / ${lightWords.length}`;
  lovePrelude.classList.remove("is-complete");
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
  localStorage.setItem("melPreludeComplete", "yes");
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

if (localStorage.getItem("melBirthdayUnlocked") === "yes") {
  unlock();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (passwordInput.value.trim().toLowerCase() === CONFIG.password) {
    unlock();
    return;
  }
  passwordMessage.textContent = "Almost. Try her name plus 720.";
});

lockButton.addEventListener("click", () => {
  localStorage.removeItem("melBirthdayUnlocked");
  localStorage.removeItem("melPreludeComplete");
  resetPrelude();
  lovePrelude.classList.add("hidden");
  site.classList.add("hidden");
  gate.classList.remove("hidden");
  passwordInput.value = "";
  passwordInput.focus();
});

lightWords.forEach((word) => {
  word.setAttribute("aria-pressed", "false");
  word.addEventListener("click", () => {
    if (word.dataset.lit === "yes") return;

    word.dataset.lit = "yes";
    word.setAttribute("aria-pressed", "true");
    word.classList.add("is-lit");
    word.closest(".letter-paragraph")?.classList.add("is-illuminated");
    litLightCount += 1;
    lightProgress.textContent = `${litLightCount} / ${lightWords.length}`;

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

ticketStub?.addEventListener("click", openTicket);
ticketClose?.addEventListener("click", closeTicket);
ticketBackdrop?.addEventListener("click", closeTicket);

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

const timeline = $("#timeline");

memories.forEach((memory) => {
  const item = document.createElement("article");
  item.className = "memory";
  const media = memory.image
    ? `<img class="memory-photo" src="${memory.image}" alt="${memory.title}" />`
    : "Photo / voice note / screenshot";
  item.innerHTML = `
    <div class="memory-dot" aria-hidden="true"></div>
    <div class="memory-card">
      <div class="memory-art">${media}</div>
      <div>
        <time>${memory.date}</time>
        <h3>${memory.title}</h3>
        <p>${memory.copy}</p>
        <div class="tag-row">${memory.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
      </div>
    </div>
  `;
  timeline.appendChild(item);
});

const memoryObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("is-lit");
    });
  },
  { threshold: 0.38 }
);

document.querySelectorAll(".memory").forEach((item) => memoryObserver.observe(item));

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

const panoramaFrames = [...document.querySelectorAll(".panorama-frame")];
const panoramaSequence = $(".panorama-sequence");
let activePanoramaPanel = null;
let panoramaTicking = false;

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

const glimmerCanvas = $("#glimmerStars");
const glimmerCtx = glimmerCanvas?.getContext("2d");
const calendarGrid = $("#calendarGrid");
const calendarTitle = $("#calendarTitle");
const prevMonthButton = $("#prevMonth");
const nextMonthButton = $("#nextMonth");
const uploadModal = $("#uploadModal");
const uploadForm = $("#uploadForm");
const uploadDateLabel = $("#uploadDateLabel");
const uploaderSelect = $("#uploaderSelect");
const photoInput = $("#photoInput");
const photoNote = $("#photoNote");
const streakCount = $("#streakCount");
const retroCardCount = $("#retroCardCount");
const backpackButton = $("#backpackButton");
const backpackModal = $("#backpackModal");
const useRetroCardButton = $("#useRetroCard");
const retroModeHint = $("#retroModeHint");
const glimmerGallery = $("#glimmerGallery");
const lighthouseScene = $("#lighthouseScene");
const growthTitle = $("#growthTitle");
const growthCopy = $("#growthCopy");
const growthPlant = $("#growthPlant");
const glimmerTicketStub = $("#glimmerTicketStub");
const glimmerProgressCount = $("#glimmerProgressCount");
const calendarHint = $("#calendarHint");
const dailyDatePill = $("#dailyDatePill");
const dailyTitle = $("#dailyTitle");
const dailyStatusCopy = $("#dailyStatusCopy");
const rayUploadPreview = $("#rayUploadPreview");
const melUploadPreview = $("#melUploadPreview");
const uploadLaneButtons = [...document.querySelectorAll("[data-upload-person]")];
let glimmerMonth = new Date("2026-07-01T00:00:00");
let activeGlimmerDate = todayKey() >= CONFIG.glimmerStart ? todayKey() : CONFIG.glimmerStart;
let selectedGlimmerDate = activeGlimmerDate;
let retroMode = false;

function getGlimmerData() {
  return JSON.parse(localStorage.getItem("glimmerData") || '{"days":{},"retroCards":0,"rewardedTens":0}');
}

function saveGlimmerData(data) {
  localStorage.setItem("glimmerData", JSON.stringify(data));
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return dateKey(new Date());
}

function isCompleteDay(day) {
  return Boolean(day?.ray?.photo && day?.mel?.photo);
}

function calculateStats(data) {
  const start = new Date(`${CONFIG.glimmerStart}T00:00:00`);
  const today = new Date(`${todayKey()}T00:00:00`);
  let streak = 0;
  let gold = 0;

  Object.values(data.days).forEach((day) => {
    if (isCompleteDay(day)) gold += 1;
  });

  for (let cursor = new Date(today); cursor >= start; cursor.setDate(cursor.getDate() - 1)) {
    if (isCompleteDay(data.days[dateKey(cursor)])) {
      streak += 1;
    } else {
      break;
    }
  }

  return { streak, gold };
}

function rewardRetroCards(data) {
  const { streak } = calculateStats(data);
  const earnedTens = Math.floor(streak / 10);
  if (earnedTens > data.rewardedTens) {
    data.retroCards += earnedTens - data.rewardedTens;
    data.rewardedTens = earnedTens;
  }
}

function statusForDay(day) {
  if (isCompleteDay(day)) return "complete";
  if (day?.ray?.photo && day?.mel?.photo) return "partial-both";
  if (day?.ray?.photo) return "ray-only";
  if (day?.mel?.photo) return "mel-only";
  return "";
}

function dayNumberFromStart(key) {
  const start = new Date(`${CONFIG.glimmerStart}T00:00:00`);
  const target = new Date(`${key}T00:00:00`);
  return Math.max(1, Math.floor((target - start) / 86400000) + 1);
}

function isUploadableDate(key, dayData) {
  const nowKey = todayKey();
  const unlocked = key === nowKey && key >= CONFIG.glimmerStart;
  const retroAllowed = retroMode && key < nowKey && key >= CONFIG.glimmerStart && !isCompleteDay(dayData);
  return unlocked || retroAllowed;
}

function renderUploadPreview(element, entry, emptyText) {
  if (!element) return;
  element.classList.toggle("has-photo", Boolean(entry?.photo));
  element.innerHTML = entry?.photo
    ? `<img src="${entry.photo}" alt="${emptyText}" /><small>${entry.note || "今天的微光"}</small>`
    : `<span>${emptyText}</span>`;
}

function renderDailyBoard() {
  const data = getGlimmerData();
  const dayData = data.days[activeGlimmerDate] || {};
  const dayNumber = dayNumberFromStart(activeGlimmerDate);
  const uploadable = isUploadableDate(activeGlimmerDate, dayData);
  const beforeStart = activeGlimmerDate < CONFIG.glimmerStart;
  const future = activeGlimmerDate > todayKey();

  if (dailyDatePill) dailyDatePill.textContent = `Day ${String(dayNumber).padStart(2, "0")} · ${activeGlimmerDate}`;
  if (dailyTitle) dailyTitle.textContent = isCompleteDay(dayData) ? "今天的微光已经合上了" : "今日微光上传栏";
  if (dailyStatusCopy) {
    if (beforeStart || future) {
      dailyStatusCopy.textContent = "这一天还没解锁。等时间到了，这里会变成你们当天的小相框。";
    } else if (retroMode) {
      dailyStatusCopy.textContent = "补签模式开启中。选好缺失的一天后，可以把那天没来得及留下的微光补回来。";
    } else {
      dailyStatusCopy.textContent = "每人一张截图或照片。两栏都放好以后，这一天会变成完整的紫色微光。";
    }
  }

  renderUploadPreview(rayUploadPreview, dayData.ray, "Ray 的截图 / 照片");
  renderUploadPreview(melUploadPreview, dayData.mel, "Mel 的截图 / 照片");
  uploadLaneButtons.forEach((button) => {
    button.disabled = !uploadable;
    button.textContent = uploadable
      ? `上传 ${button.dataset.uploadPerson === "ray" ? "Ray" : "Mel"} 的微光`
      : "等待解锁";
  });
}

function renderCalendar() {
  if (!calendarGrid || !calendarTitle) return;
  const data = getGlimmerData();
  const year = glimmerMonth.getFullYear();
  const month = glimmerMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const nowKey = todayKey();
  const startKey = CONFIG.glimmerStart;

  const completedInMonth = Object.entries(data.days)
    .filter(([key, day]) => key.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`) && isCompleteDay(day))
    .length;
  const totalFromStart = Array.from({ length: daysInMonth }, (_, index) => dateKey(new Date(year, month, index + 1)))
    .filter((key) => key >= startKey)
    .length;

  calendarTitle.textContent = glimmerMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (glimmerProgressCount) glimmerProgressCount.textContent = `${completedInMonth}/${totalFromStart}`;
  if (calendarHint) {
    calendarHint.textContent = retroMode
      ? "补签模式：选择一个过去缺失的日期。"
      : "7/20 起，每天会按时间解锁一个格子。";
  }
  calendarGrid.innerHTML = "";

  for (let day = 1; day <= daysInMonth; day += 1) {
    const current = new Date(year, month, day);
    const key = dateKey(current);
    const dayData = data.days[key];
    const status = statusForDay(dayData);
    const uploadable = isUploadableDate(key, dayData);
    const seen = key <= nowKey && key >= startKey;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `calendar-cell ${status} ${key === activeGlimmerDate ? "selected" : ""} ${key === nowKey ? "today" : ""} ${!uploadable ? "locked" : ""}`;
    cell.innerHTML = `<span class="day-number">${day}</span><span class="cell-icon">${status === "complete" ? "◆" : seen ? "·" : "⌁"}</span>`;
    cell.disabled = key < startKey;
    cell.addEventListener("click", () => {
      activeGlimmerDate = key;
      selectedGlimmerDate = key;
      renderGlimmer();
    });
    calendarGrid.appendChild(cell);
  }
}

function renderLighthouse() {
  if (!lighthouseScene) return;
  const data = getGlimmerData();
  const current = data.days[activeGlimmerDate] || {};
  lighthouseScene.classList.toggle("ray", Boolean(current.ray?.photo));
  lighthouseScene.classList.toggle("mel", Boolean(current.mel?.photo));
  lighthouseScene.classList.toggle("complete", isCompleteDay(current));
}

function renderGrowth(stats) {
  if (!growthTitle || !growthCopy || !growthPlant) return;
  let stage = "seed";
  let title = "Seed";
  let copy = "第一天的微光会在灯塔脚下埋下一颗种子。";
  if (stats.gold >= 365) {
    stage = "flower";
    title = "Flower";
    copy = "365 个金色灯塔开成她最喜欢的花。";
  } else if (stats.gold >= 100) {
    stage = "vine";
    title = "Vines";
    copy = "100 个金色灯塔让藤蔓绕上灯塔。";
  } else if (stats.gold >= 30) {
    stage = "sprout";
    title = "Sprout";
    copy = "30 个金色灯塔长出第一段新芽。";
  }
  growthTitle.textContent = title;
  growthCopy.textContent = copy;
  growthPlant.className = `growth-plant ${stage}`;
}

function renderGallery() {
  if (!glimmerGallery) return;
  const data = getGlimmerData();
  const items = Object.entries(data.days)
    .flatMap(([date, day]) => ["ray", "mel"].map((person) => ({ date, person, entry: day[person] })).filter((item) => item.entry?.photo))
    .sort((a, b) => b.date.localeCompare(a.date));

  glimmerGallery.innerHTML = items.length
    ? items.map((item) => `
      <article class="gallery-item">
        <img src="${item.entry.photo}" alt="${item.person} ${item.date}" />
        <div>
          <strong>${item.date} · ${item.person === "ray" ? "Ray" : "Mel"}</strong>
          <p>${item.entry.note || "No note yet."}</p>
        </div>
      </article>
    `).join("")
    : "<p>No glimmers collected yet.</p>";
}

function resizeGlimmerCanvas() {
  if (!glimmerCanvas || !glimmerCtx) return;
  const page = $("#glimmer");
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, page?.offsetWidth || window.innerWidth);
  const height = Math.max(window.innerHeight, page?.scrollHeight || window.innerHeight);
  glimmerCanvas.width = Math.floor(width * ratio);
  glimmerCanvas.height = Math.floor(height * ratio);
  glimmerCanvas.style.height = `${height}px`;
  glimmerCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function renderGlimmerStars(stats) {
  if (!glimmerCanvas || !glimmerCtx) return;
  resizeGlimmerCanvas();
  const width = glimmerCanvas.offsetWidth;
  const height = glimmerCanvas.offsetHeight;
  glimmerCtx.clearRect(0, 0, width, height);
  const count = Math.min(stats.gold, 420);
  for (let i = 0; i < count; i += 1) {
    const x = (Math.sin(i * 127.1) * 0.5 + 0.5) * width;
    const y = 90 + (Math.cos(i * 91.7) * 0.5 + 0.5) * (height - 140);
    const size = 1 + (i % 4) * 0.45;
    glimmerCtx.beginPath();
    glimmerCtx.fillStyle = i % 10 === 0 ? "rgba(247,208,112,0.9)" : "rgba(180,224,255,0.68)";
    glimmerCtx.arc(x, y, size, 0, Math.PI * 2);
    glimmerCtx.fill();
  }
}

function renderGlimmer() {
  const data = getGlimmerData();
  rewardRetroCards(data);
  saveGlimmerData(data);
  const stats = calculateStats(data);
  streakCount.textContent = stats.streak;
  retroCardCount.textContent = data.retroCards;
  renderCalendar();
  renderDailyBoard();
  renderLighthouse();
  renderGrowth(stats);
  renderGallery();
  renderGlimmerStars(stats);
}

function openUploadModal(key, person) {
  selectedGlimmerDate = key;
  uploadDateLabel.textContent = key;
  uploadForm.reset();
  if (person && uploaderSelect) uploaderSelect.value = person;
  uploadModal.classList.remove("hidden");
}

function closeGlimmerModals() {
  uploadModal?.classList.add("hidden");
  backpackModal?.classList.add("hidden");
}

function saveUpload(event) {
  event.preventDefault();
  const file = photoInput.files?.[0];
  const data = getGlimmerData();
  const person = uploaderSelect.value;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    data.days[selectedGlimmerDate] ||= {};
    data.days[selectedGlimmerDate][person] = {
      photo: reader.result,
      note: photoNote.value.trim(),
      savedAt: new Date().toISOString(),
    };
    if (retroMode && isCompleteDay(data.days[selectedGlimmerDate]) && data.retroCards > 0) {
      data.retroCards -= 1;
      retroMode = false;
      retroModeHint.textContent = "";
    }
    rewardRetroCards(data);
    saveGlimmerData(data);
    closeGlimmerModals();
    if (isCompleteDay(data.days[selectedGlimmerDate])) {
      lighthouseScene.classList.add("synergy");
      window.setTimeout(() => lighthouseScene.classList.remove("synergy"), 1700);
    }
    activeGlimmerDate = selectedGlimmerDate;
    renderGlimmer();
  };
  reader.readAsDataURL(file);
}

prevMonthButton?.addEventListener("click", () => {
  glimmerMonth.setMonth(glimmerMonth.getMonth() - 1);
  renderGlimmer();
});

nextMonthButton?.addEventListener("click", () => {
  glimmerMonth.setMonth(glimmerMonth.getMonth() + 1);
  renderGlimmer();
});

uploadForm?.addEventListener("submit", saveUpload);
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeGlimmerModals));
uploadLaneButtons.forEach((button) => {
  button.addEventListener("click", () => openUploadModal(activeGlimmerDate, button.dataset.uploadPerson));
});
backpackButton?.addEventListener("click", () => backpackModal.classList.remove("hidden"));
glimmerTicketStub?.addEventListener("click", openTicket);
useRetroCardButton?.addEventListener("click", () => {
  const data = getGlimmerData();
  if (data.retroCards <= 0) {
    retroModeHint.textContent = "背包里暂时没有补签卡。";
    return;
  }
  retroMode = true;
  retroModeHint.textContent = "补签模式已开启：选择一个过去缺失的蓝色日期。";
  backpackModal.classList.add("hidden");
  renderCalendar();
});
renderGlimmer();

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
const gameCtx = gameCanvas.getContext("2d");
const scoreEl = $("#score");
const startGame = $("#startGame");
const gameMessage = $("#gameMessage");
const secret = $("#secret");

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
        secret.classList.remove("locked");
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
  secret.classList.add("locked");
  gameMessage.textContent = "Catch 20 hearts.";
});

drawGame();
requestAnimationFrame(gameLoop);
