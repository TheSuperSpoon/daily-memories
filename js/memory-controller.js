import { appConfig, memoryRepository } from './app-services.js?v=20260720-glimmer-timezones';
import {
  beijingMonthKey, isOwnerDeletable, monthFromKey, monthKey, monthRange,
  parseMemoryTags, timePresentation, validateMemoryFile
} from './memory-model.js?v=20260720-glimmer-timezones';

const $ = (selector) => document.querySelector(selector);
const elements = {
  timeline: $('#timeline'), monthTitle: $('#memoryMonthTitle'), status: $('#memoryStatus'),
  retry: $('#memoryRetryButton'), prev: $('#memoryPrevMonth'), next: $('#memoryNextMonth'),
  add: $('#addMemoryButton'), uploadModal: $('#memoryUploadModal'), uploadForm: $('#memoryUploadForm'),
  imageButton: $('#chooseMemoryImage'), audioButton: $('#chooseMemoryAudio'),
  imageInput: $('#memoryImageInput'), audioInput: $('#memoryAudioInput'), filePreview: $('#memoryFilePreview'),
  bodyInput: $('#memoryBodyInput'), tagsInput: $('#memoryTagsInput'), selectedTags: $('#memorySelectedTags'),
  popularTags: $('#memoryPopularTags'),
  uploadStatus: $('#memoryUploadStatus'), submit: $('#memorySubmitButton'), retryFinalize: $('#memoryRetryFinalize'),
  likes: $('#melLikesSequence'), addLike: $('#addMelLikeButton'), likeModal: $('#melLikeUploadModal'),
  likeForm: $('#melLikeUploadForm'), likeChoose: $('#chooseMelLikeImage'), likeInput: $('#melLikeImageInput'),
  likePreview: $('#melLikeFilePreview'), likeLabel: $('#melLikeLabelInput'), likeStatus: $('#melLikeUploadStatus'),
  likeSubmit: $('#melLikeSubmitButton'), likeRetryFinalize: $('#melLikeRetryFinalize'),
  deleteModal: $('#memoryDeleteModal'), deleteTitle: $('#memoryDeleteTitle'), deleteCopy: $('#memoryDeleteCopy'),
  deleteStatus: $('#memoryDeleteStatus'), deleteConfirm: $('#memoryDeleteConfirm'),
};

const monthCache = new Map();
const urlCache = new Map();
let identity = null;
let activeMonth = monthFromKey(beijingMonthKey());
let initialized = false;
let initPromise = null;
let requestSequence = 0;
let selectedFile = null;
let selectedFileUrl = null;
let selectedTimezone = 'Asia/Shanghai';
let topTags = [];
let pendingFinalize = null;
let pendingLikeFinalize = null;
let pendingDelete = null;

function setText(element, value) { if (element) element.textContent = value ?? ''; }
function monthLabel(date) { return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
function roleLabel(role) { return role === 'ray' ? 'Ray' : 'Mel'; }
function bytesLabel(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function durationLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function cacheKey(asset) { return `${asset.provider}:${asset.id}`; }
async function readableUrl(asset, force = false) {
  const key = cacheKey(asset);
  const cached = urlCache.get(key);
  if (!force && cached?.url && cached.expiresAt > Date.now() + 5000) return cached.url;
  if (!force && cached?.promise) return cached.promise;
  const promise = memoryRepository.getReadableUrl(asset).then((result) => {
    urlCache.set(key, result);
    return result.url;
  }).catch((error) => { urlCache.delete(key); throw error; });
  urlCache.set(key, { promise, expiresAt: 0 });
  return promise;
}

async function hydrateImage(image, record) {
  image.classList.add('is-loading');
  try {
    image.src = await readableUrl(record.asset);
    image.onload = () => image.classList.remove('is-loading', 'is-error');
    image.onerror = async () => {
      if (image.dataset.signedRetry !== 'yes') {
        image.dataset.signedRetry = 'yes';
        try { image.src = await readableUrl(record.asset, true); return; } catch { /* show error */ }
      }
      image.classList.remove('is-loading');
      image.classList.add('is-error');
      image.alt = 'Media unavailable';
    };
  } catch {
    image.classList.remove('is-loading');
    image.classList.add('is-error');
    image.alt = 'Media unavailable';
  }
}

function makeTimeChip(record, zone, label) {
  const time = timePresentation(record.created_at, zone);
  const chip = document.createElement('div');
  chip.className = `memory-time-chip${record.preferred_timezone === zone ? ' is-preferred' : ''}`;
  if (record.preferred_timezone === zone) chip.setAttribute('aria-label', `${label}, selected upload timezone`);
  const icon = document.createElement('span'); icon.className = 'memory-time-icon'; icon.textContent = time.icon;
  const title = document.createElement('strong'); title.textContent = `${label} · ${time.time}`;
  const date = document.createElement('small'); date.textContent = time.date;
  chip.append(icon, title, date);
  return chip;
}

function makeAudioPlayer(record) {
  const shell = document.createElement('div'); shell.className = 'memory-audio-player';
  const audio = document.createElement('audio'); audio.preload = 'metadata';
  const play = document.createElement('button'); play.type = 'button'; play.className = 'memory-audio-play';
  play.textContent = '▶'; play.setAttribute('aria-label', 'Play voice note');
  const track = document.createElement('div'); track.className = 'memory-audio-track';
  const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '1000'; slider.value = '0';
  slider.setAttribute('aria-label', 'Voice note position');
  const times = document.createElement('div'); times.className = 'memory-audio-times';
  const current = document.createElement('span'); current.textContent = '0:00';
  const duration = document.createElement('span'); duration.textContent = '--:--';
  times.append(current, duration); track.append(slider, times); shell.append(play, track, audio);
  let loaded = false;
  const ensureLoaded = async () => {
    if (loaded) return;
    play.disabled = true;
    try { audio.src = await readableUrl(record.asset); loaded = true; audio.load(); }
    finally { play.disabled = false; }
  };
  play.addEventListener('click', async () => {
    try {
      await ensureLoaded();
      if (audio.paused) await audio.play(); else audio.pause();
    } catch { play.textContent = '!'; play.setAttribute('aria-label', 'Voice note unavailable'); }
  });
  audio.addEventListener('play', () => { play.textContent = 'Ⅱ'; play.setAttribute('aria-label', 'Pause voice note'); });
  audio.addEventListener('pause', () => { play.textContent = '▶'; play.setAttribute('aria-label', 'Play voice note'); });
  audio.addEventListener('loadedmetadata', () => { duration.textContent = durationLabel(audio.duration); });
  audio.addEventListener('timeupdate', () => {
    current.textContent = durationLabel(audio.currentTime);
    slider.value = audio.duration ? String(Math.round((audio.currentTime / audio.duration) * 1000)) : '0';
  });
  slider.addEventListener('input', async () => {
    await ensureLoaded();
    if (audio.duration) audio.currentTime = (Number(slider.value) / 1000) * audio.duration;
  });
  return shell;
}

function makeDeleteButton(record, type) {
  if (!isOwnerDeletable(record, identity?.user_id)) return null;
  const button = document.createElement('button'); button.type = 'button';
  button.className = type === 'memory' ? 'memory-delete-button' : 'mel-like-delete-button';
  button.textContent = 'Delete';
  button.addEventListener('click', () => openDelete(record, type));
  return button;
}

function renderMemories(items) {
  elements.timeline.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p'); empty.className = 'memory-empty-state';
    empty.textContent = 'No memories in this month yet. Add the first one below.';
    elements.timeline.appendChild(empty);
    return;
  }
  items.forEach((record) => {
    const article = document.createElement('article'); article.className = 'memory is-lit';
    const dot = document.createElement('div'); dot.className = 'memory-dot'; dot.setAttribute('aria-hidden', 'true');
    const card = document.createElement('div'); card.className = 'memory-card';
    const media = document.createElement('div'); media.className = 'memory-media';
    if (record.asset.media_kind === 'audio') media.appendChild(makeAudioPlayer(record));
    else {
      const image = document.createElement('img'); image.alt = record.body || `${roleLabel(record.role)} memory`;
      media.appendChild(image); hydrateImage(image, record);
    }
    const body = document.createElement('div'); body.className = 'memory-card-body';
    const roleRow = document.createElement('div'); roleRow.className = 'memory-role-row';
    const badge = document.createElement('span'); badge.className = 'memory-role-badge'; badge.textContent = roleLabel(record.role);
    roleRow.appendChild(badge); const deleteButton = makeDeleteButton(record, 'memory'); if (deleteButton) roleRow.appendChild(deleteButton);
    const dual = document.createElement('div'); dual.className = 'memory-dual-time';
    dual.append(makeTimeChip(record, 'Asia/Shanghai', 'Beijing'), makeTimeChip(record, 'America/Los_Angeles', 'West Coast'));
    body.append(roleRow, dual);
    if (record.body) { const copy = document.createElement('p'); copy.className = 'memory-card-copy'; copy.textContent = record.body; body.appendChild(copy); }
    if (record.tags?.length) {
      const tags = document.createElement('div'); tags.className = 'tag-row';
      record.tags.forEach((tag) => { const chip = document.createElement('span'); chip.textContent = tag; tags.appendChild(chip); });
      body.appendChild(tags);
    }
    card.append(media, body); article.append(dot, card); elements.timeline.appendChild(article);
  });
}

async function loadMonth(date, force = false) {
  const key = monthKey(date);
  if (!force && monthCache.has(key)) return monthCache.get(key);
  const range = monthRange(date);
  const items = await memoryRepository.listMemories({ spaceId: appConfig.spaceId, ...range, limit: 200 });
  monthCache.set(key, items);
  return items;
}

async function renderMonth(force = false) {
  if (!identity) return;
  const sequence = ++requestSequence;
  setText(elements.monthTitle, monthLabel(activeMonth));
  setText(elements.status, 'Loading this month...'); elements.retry.classList.add('hidden');
  try {
    const items = await loadMonth(activeMonth, force);
    if (sequence !== requestSequence) return;
    renderMemories(items);
    setText(elements.status, `${items.length} ${items.length === 1 ? 'memory' : 'memories'} in this month.`);
  } catch (error) {
    if (sequence !== requestSequence) return;
    setText(elements.status, error.message); elements.retry.classList.remove('hidden');
    if (error.code === 'SESSION_EXPIRED') window.dispatchEvent(new CustomEvent('app-session-expired'));
  }
}

function renderLikes(items) {
  elements.likes.replaceChildren();
  items.forEach((record) => {
    const figure = document.createElement('figure'); figure.className = 'panorama-frame'; figure.dataset.panel = String(record.position - 1);
    const image = document.createElement('img'); image.className = 'mel-like-image'; image.alt = `Mel likes ${record.label}`;
    const caption = document.createElement('figcaption');
    const prefix = document.createElement('span'); prefix.textContent = 'Mel likes';
    const label = document.createElement('strong'); label.textContent = record.label;
    caption.append(prefix, label); figure.append(image, caption);
    const deleteButton = makeDeleteButton(record, 'like'); if (deleteButton) figure.appendChild(deleteButton);
    elements.likes.appendChild(figure); hydrateImage(image, record);
  });
  window.dispatchEvent(new CustomEvent('memories-panorama-updated'));
}

async function loadLikes() {
  try { renderLikes(await memoryRepository.listMelLikes(appConfig.spaceId)); }
  catch (error) { elements.addLike.title = error.message; }
}

async function loadTopTags() {
  try { topTags = await memoryRepository.getTopTags(appConfig.spaceId, 5); renderTagControls(); }
  catch { topTags = []; renderTagControls(); }
}

function selectedTags() {
  try { return parseMemoryTags(elements.tagsInput.value); }
  catch (error) { setText(elements.uploadStatus, error.message); return []; }
}

function addTag(tag) {
  const tags = selectedTags();
  if (!tags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) tags.push(tag);
  elements.tagsInput.value = tags.join(' '); renderTagControls();
}

function removeTag(tag) {
  elements.tagsInput.value = selectedTags().filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase()).join(' ');
  renderTagControls();
}

function renderTagControls() {
  const selected = selectedTags();
  elements.selectedTags.replaceChildren();
  selected.forEach((tag) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'memory-tag-chip is-selected';
    button.textContent = `${tag} ×`; button.setAttribute('aria-label', `Remove tag ${tag}`); button.addEventListener('click', () => removeTag(tag));
    elements.selectedTags.appendChild(button);
  });
  elements.popularTags.replaceChildren();
  topTags.forEach((item) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'memory-tag-chip';
    button.textContent = `${item.name} · ${item.count}`; button.addEventListener('click', () => addTag(item.name));
    elements.popularTags.appendChild(button);
  });
}

function clearSelectedFile() {
  if (selectedFileUrl) URL.revokeObjectURL(selectedFileUrl);
  selectedFileUrl = null; selectedFile = null;
  elements.imageInput.value = ''; elements.audioInput.value = '';
  elements.imageButton.disabled = false; elements.audioButton.disabled = false;
  elements.filePreview.replaceChildren();
  const placeholder = document.createElement('span'); placeholder.className = 'memory-file-placeholder';
  placeholder.textContent = 'Choose one image or voice note'; elements.filePreview.appendChild(placeholder);
}

function chooseFile(file) {
  try { validateMemoryFile(file); } catch (error) { setText(elements.uploadStatus, error.message); return; }
  clearSelectedFile(); selectedFile = file; selectedFileUrl = URL.createObjectURL(file);
  elements.imageButton.disabled = !file.type.startsWith('image/'); elements.audioButton.disabled = !file.type.startsWith('audio/');
  elements.filePreview.replaceChildren();
  if (file.type.startsWith('image/')) {
    const shell = document.createElement('div'); shell.className = 'memory-preview-image-shell';
    const image = document.createElement('img'); image.src = selectedFileUrl; image.alt = 'Selected image preview';
    shell.appendChild(image); elements.filePreview.appendChild(shell);
  } else {
    const attachment = document.createElement('div'); attachment.className = 'memory-attachment';
    const icon = document.createElement('span'); icon.className = 'memory-attachment-icon'; icon.textContent = '♪';
    const copy = document.createElement('div'); copy.className = 'memory-attachment-copy';
    const name = document.createElement('strong'); name.textContent = file.name;
    const meta = document.createElement('small'); meta.textContent = `${file.type} · ${bytesLabel(file.size)}`;
    copy.append(name, meta); attachment.append(icon, copy); elements.filePreview.appendChild(attachment);
  }
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'memory-remove-file'; remove.textContent = 'Remove';
  remove.addEventListener('click', clearSelectedFile); elements.filePreview.firstElementChild?.appendChild(remove);
  setText(elements.uploadStatus, '');
}

function openMemoryModal() {
  elements.uploadForm.reset(); clearSelectedFile();
  selectedTimezone = localStorage.getItem('memory-preferred-timezone') || 'Asia/Shanghai';
  if (!['Asia/Shanghai','America/Los_Angeles'].includes(selectedTimezone)) selectedTimezone = 'Asia/Shanghai';
  pendingFinalize = null; elements.retryFinalize.classList.add('hidden'); setText(elements.uploadStatus, '');
  renderTagControls();
  elements.uploadModal.classList.remove('hidden'); elements.imageButton.focus();
}

function closeMemoryModal() {
  elements.uploadModal.classList.add('hidden'); clearSelectedFile();
}

async function submitMemory(event) {
  event.preventDefault();
  if (!selectedFile) { setText(elements.uploadStatus, 'Choose an image or audio file first.'); return; }
  elements.submit.disabled = true;
  try {
    await memoryRepository.uploadMemory({
      spaceId: appConfig.spaceId, body: elements.bodyInput.value.trim(), tags: parseMemoryTags(elements.tagsInput.value),
      preferredTimezone: selectedTimezone, file: selectedFile,
      onProgress: ({ phase }) => setText(elements.uploadStatus, phase === 'uploading' ? 'Uploading private media...' : 'Confirming memory...')
    });
    localStorage.setItem('memory-preferred-timezone', selectedTimezone);
    monthCache.delete(monthKey(activeMonth)); await Promise.all([renderMonth(true), loadTopTags()]); closeMemoryModal();
  } catch (error) {
    setText(elements.uploadStatus, error.message);
    if (error.retryable && error.recordId) { pendingFinalize = error.recordId; elements.retryFinalize.classList.remove('hidden'); }
    if (error.code === 'SESSION_EXPIRED') window.dispatchEvent(new CustomEvent('app-session-expired'));
  } finally { elements.submit.disabled = false; }
}

async function retryMemoryFinalize() {
  if (!pendingFinalize) return;
  elements.retryFinalize.disabled = true;
  try {
    await memoryRepository.retryFinalizeMemory(pendingFinalize); pendingFinalize = null;
    monthCache.delete(monthKey(activeMonth)); await Promise.all([renderMonth(true), loadTopTags()]); closeMemoryModal();
  } catch (error) { setText(elements.uploadStatus, error.message); }
  finally { elements.retryFinalize.disabled = false; }
}

function resetLikePreview(clearInput = true) {
  if (clearInput) elements.likeInput.value = '';
  elements.likePreview.replaceChildren();
  const placeholder = document.createElement('span'); placeholder.className = 'memory-file-placeholder'; placeholder.textContent = 'Choose one image';
  elements.likePreview.appendChild(placeholder);
}
function previewLike(file) {
  resetLikePreview(false); if (!file) return;
  try { validateMemoryFile(file); if (!file.type.startsWith('image/')) throw new Error('Choose an image.'); }
  catch (error) { setText(elements.likeStatus, error.message); return; }
  elements.likeInput.files; const image = document.createElement('img'); image.src = URL.createObjectURL(file); image.alt = 'Selected favorite preview';
  image.onload = () => URL.revokeObjectURL(image.src); elements.likePreview.replaceChildren(image); setText(elements.likeStatus, '');
}
function openLikeModal() {
  elements.likeForm.reset(); resetLikePreview(); pendingLikeFinalize = null; elements.likeRetryFinalize.classList.add('hidden');
  setText(elements.likeStatus, ''); elements.likeModal.classList.remove('hidden'); elements.likeChoose.focus();
}
function closeLikeModal() { elements.likeModal.classList.add('hidden'); resetLikePreview(); }

async function submitLike(event) {
  event.preventDefault(); const file = elements.likeInput.files?.[0];
  if (!file) { setText(elements.likeStatus, 'Choose an image first.'); return; }
  elements.likeSubmit.disabled = true;
  try {
    await memoryRepository.uploadMelLike({ spaceId: appConfig.spaceId, label: elements.likeLabel.value, file,
      onProgress: ({ phase }) => setText(elements.likeStatus, phase === 'uploading' ? 'Uploading private image...' : 'Confirming favorite...') });
    await loadLikes(); closeLikeModal();
  } catch (error) {
    setText(elements.likeStatus, error.message);
    if (error.retryable && error.recordId) { pendingLikeFinalize = error.recordId; elements.likeRetryFinalize.classList.remove('hidden'); }
  } finally { elements.likeSubmit.disabled = false; }
}

async function retryLikeFinalize() {
  if (!pendingLikeFinalize) return;
  elements.likeRetryFinalize.disabled = true;
  try { await memoryRepository.retryFinalizeMelLike(pendingLikeFinalize); pendingLikeFinalize = null; await loadLikes(); closeLikeModal(); }
  catch (error) { setText(elements.likeStatus, error.message); }
  finally { elements.likeRetryFinalize.disabled = false; }
}

function openDelete(record, type) {
  pendingDelete = { record, type };
  setText(elements.deleteTitle, type === 'memory' ? 'Delete this memory?' : 'Delete this favorite?');
  setText(elements.deleteCopy, 'This removes the media for both of you. This cannot be undone.');
  setText(elements.deleteStatus, ''); elements.deleteModal.classList.remove('hidden'); elements.deleteConfirm.focus();
}
function closeDelete() { elements.deleteModal.classList.add('hidden'); pendingDelete = null; }
async function confirmDelete() {
  if (!pendingDelete) return; elements.deleteConfirm.disabled = true;
  try {
    if (pendingDelete.type === 'memory') {
      await memoryRepository.deleteMemory(pendingDelete.record); monthCache.delete(monthKey(activeMonth));
      await Promise.all([renderMonth(true), loadTopTags()]);
    } else { await memoryRepository.deleteMelLike(pendingDelete.record); await loadLikes(); }
    closeDelete();
  } catch (error) { setText(elements.deleteStatus, error.message); }
  finally { elements.deleteConfirm.disabled = false; }
}

async function setMonth(offset) {
  activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + offset, 1); await renderMonth();
}

export async function initializeMemorySession(nextIdentity) {
  identity = nextIdentity;
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const latest = await memoryRepository.getLatestMonth(appConfig.spaceId);
    activeMonth = monthFromKey(latest || beijingMonthKey());
    await Promise.all([renderMonth(), loadLikes(), loadTopTags()]); initialized = true;
  })().finally(() => { initPromise = null; });
  return initPromise;
}

export async function activateMemoriesPage(nextIdentity) {
  try { await initializeMemorySession(nextIdentity); await renderMonth(); window.dispatchEvent(new CustomEvent('memories-panorama-updated')); }
  catch (error) { setText(elements.status, error.message); elements.retry.classList.remove('hidden'); }
}

export function resetMemorySession() {
  identity = null; initialized = false; initPromise = null; requestSequence += 1;
  monthCache.clear(); urlCache.clear(); topTags = []; pendingFinalize = null; pendingLikeFinalize = null; pendingDelete = null;
  closeMemoryModal(); closeLikeModal(); closeDelete();
  elements.timeline?.replaceChildren(); elements.likes?.replaceChildren();
}

elements.prev?.addEventListener('click', () => setMonth(-1));
elements.next?.addEventListener('click', () => setMonth(1));
elements.retry?.addEventListener('click', () => renderMonth(true));
elements.add?.addEventListener('click', openMemoryModal);
elements.imageButton?.addEventListener('click', () => elements.imageInput.click());
elements.audioButton?.addEventListener('click', () => elements.audioInput.click());
elements.imageInput?.addEventListener('change', () => chooseFile(elements.imageInput.files?.[0]));
elements.audioInput?.addEventListener('change', () => chooseFile(elements.audioInput.files?.[0]));
elements.tagsInput?.addEventListener('input', renderTagControls);
elements.uploadForm?.addEventListener('submit', submitMemory);
elements.retryFinalize?.addEventListener('click', retryMemoryFinalize);
document.querySelectorAll('[data-close-memory-modal]').forEach((button) => button.addEventListener('click', closeMemoryModal));
elements.addLike?.addEventListener('click', openLikeModal);
elements.likeChoose?.addEventListener('click', () => elements.likeInput.click());
elements.likeInput?.addEventListener('change', () => previewLike(elements.likeInput.files?.[0]));
elements.likeForm?.addEventListener('submit', submitLike);
elements.likeRetryFinalize?.addEventListener('click', retryLikeFinalize);
document.querySelectorAll('[data-close-like-modal]').forEach((button) => button.addEventListener('click', closeLikeModal));
elements.deleteConfirm?.addEventListener('click', confirmDelete);
document.querySelectorAll('[data-close-delete-modal]').forEach((button) => button.addEventListener('click', closeDelete));
