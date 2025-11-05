let size = 4;
const boardEl = document.getElementById('board');
const movesEl = document.getElementById('moves');
const timeEl = document.getElementById('time');
const messageEl = document.getElementById('message');
const shuffleBtn = document.getElementById('shuffle');
const resetBtn = document.getElementById('reset');
const menuOverlay = document.getElementById('menuOverlay');
const btnNewGame = document.getElementById('btnNewGame');
const btnLoadGame = document.getElementById('btnLoadGame');

let tiles = [];
let moves = 0;
let timer = 0;
let intervalId = null;
let isOver = false;
const STORAGE_KEY = 'tw15puzzle';
let limitSeconds = 300; // default 5 minutes, configurable

// Audio (Web Audio API)
let audioCtx = null;
let masterGain = null;
let isMuted = false;
let volume = 0.6; // 0..1
function initAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = isMuted ? 0 : volume;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}

function playTone({ freq = 600, duration = 0.08, type = 'sine', gain = 0.06 }) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(g).connect(masterGain || audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playClickSound() {
  initAudio();
  if (!audioCtx) return;
  const base = 520 + Math.random() * 120;
  playTone({ freq: base, duration: 0.07, type: 'triangle', gain: 0.05 });
}

function playWinJingle() {
  initAudio();
  if (!audioCtx) return;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  let t = 0;
  for (const f of notes) {
    setTimeout(() => playTone({ freq: f, duration: 0.12, type: 'sine', gain: 0.07 }), t);
    t += 120;
  }
}

function solvedArray() {
  return Array.from({ length: size * size }, (_, i) => (i + 1) % (size * size));
}

function isSolved(arr) {
  for (let i = 0; i < arr.length - 1; i++) if (arr[i] !== i + 1) return false;
  return arr[arr.length - 1] === 0;
}

function countInversions(arr) {
  const a = arr.filter(n => n !== 0);
  let inv = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) inv++;
  return inv;
}

function blankRowFromBottom(arr) {
  const idx = arr.indexOf(0);
  const row = Math.floor(idx / size);
  return size - row;
}

function isSolvable(arr) {
  const inv = countInversions(arr);
  if (size % 2 === 1) return inv % 2 === 0;
  const blankFromBottom = blankRowFromBottom(arr);
  return (blankFromBottom % 2 === 0) !== (inv % 2 === 0);
}

function randomSolvable() {
  let arr;
  do {
    arr = solvedArray().slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  } while (!isSolvable(arr) || isSolved(arr));
  return arr;
}

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function updateBoardCSS() {
  if (boardEl) boardEl.style.setProperty('--n', String(size));
}

function setOptionsFromUI() {
  const selSize = document.getElementById('optSize');
  const selTime = document.getElementById('optTime');
  if (selSize && selSize.value) size = Math.max(3, Math.min(5, parseInt(selSize.value, 10) || 4));
  if (selTime && selTime.value) limitSeconds = Math.max(60, parseInt(selTime.value, 10) || 300);
  updateBoardCSS();
  try { localStorage.setItem(STORAGE_KEY + ':opts', JSON.stringify({ size, limitSeconds })); } catch {}
}

function loadOptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY + ':opts');
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o && (o.size === 3 || o.size === 4 || o.size === 5)) size = o.size;
    if (o && typeof o.limitSeconds === 'number') limitSeconds = o.limitSeconds;
    const selSize = document.getElementById('optSize');
    const selTime = document.getElementById('optTime');
    if (selSize) selSize.value = String(size);
    if (selTime) selTime.value = String(limitSeconds);
  } catch {}
  updateBoardCSS();
}

function startTimer() {
  clearInterval(intervalId);
  intervalId = setInterval(() => {
    timer += 1;
    timeEl.textContent = formatTime(timer);
    if (timer >= limitSeconds) {
      onTimeUp();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(intervalId);
  intervalId = null;
}

function resetStats() {
  moves = 0;
  timer = 0;
  isOver = false;
  movesEl.textContent = '0';
  timeEl.textContent = '00:00';
  messageEl.textContent = '';
}

function render() {
  boardEl.innerHTML = '';
  updateBoardCSS();
  tiles.forEach((n, idx) => {
    const div = document.createElement('div');
    div.className = 'tile' + (n === 0 ? ' empty' : '');
    if (n !== 0) div.textContent = String(n);
    const [r, c] = [Math.floor(idx / size), idx % size];
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', n === 0 ? 'Empty' : `Tile ${n}`);
    div.dataset.index = String(idx);
    boardEl.appendChild(div);
  });
  const movables = movableIndices();
  Array.from(boardEl.children).forEach((el, i) => {
    if (movables.has(i) && !el.classList.contains('empty')) el.classList.add('movable');
    else el.classList.remove('movable');
  });
}

function movableIndices() {
  const set = new Set();
  const empty = tiles.indexOf(0);
  const er = Math.floor(empty / size);
  const ec = empty % size;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dr, dc] of dirs) {
    const r = er + dr, c = ec + dc;
    if (r >= 0 && r < size && c >= 0 && c < size) set.add(r * size + c);
  }
  return set;
}

function tryMove(index) {
  if (isOver) return false;
  const empty = tiles.indexOf(0);
  const mov = movableIndices();
  if (!mov.has(index)) return false;
  [tiles[empty], tiles[index]] = [tiles[index], tiles[empty]];
  moves += 1;
  movesEl.textContent = String(moves);
  render();
  playClickSound();
  if (isSolved(tiles)) onWin();
  else saveGame();
  return true;
}

function onTileClick(e) {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.dataset.index) return;
  initAudio();
  tryMove(Number(target.dataset.index));
}

function onKey(e) {
  const empty = tiles.indexOf(0);
  const r = Math.floor(empty / size);
  const c = empty % size;
  let target = -1;
  if (e.key === 'ArrowUp' && r < size - 1) target = empty + size;
  else if (e.key === 'ArrowDown' && r > 0) target = empty - size;
  else if (e.key === 'ArrowLeft' && c < size - 1) target = empty + 1;
  else if (e.key === 'ArrowRight' && c > 0) target = empty - 1;
  if (target !== -1) {
    e.preventDefault();
    initAudio();
    tryMove(target);
  }
}

function moveByDirection(dir) {
  const empty = tiles.indexOf(0);
  const r = Math.floor(empty / size);
  const c = empty % size;
  let target = -1;
  if (dir === 'up' && r < size - 1) target = empty + size;
  else if (dir === 'down' && r > 0) target = empty - size;
  else if (dir === 'left' && c < size - 1) target = empty + 1;
  else if (dir === 'right' && c > 0) target = empty - 1;
  if (target !== -1) tryMove(target);
}

let touchStartX = 0, touchStartY = 0;
function onTouchStart(ev) {
  const t = ev.touches && ev.touches[0];
  if (!t) return;
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}

function onTouchEnd(ev) {
  const t = ev.changedTouches && ev.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const absX = Math.abs(dx), absY = Math.abs(dy);
  const TH = 24; // threshold px
  if (absX < TH && absY < TH) return;
  initAudio();
  if (absX > absY) {
    moveByDirection(dx > 0 ? 'right' : 'left');
  } else {
    moveByDirection(dy > 0 ? 'down' : 'up');
  }
}

function onShuffle() {
  // Read options if available (from start menu)
  setOptionsFromUI();
  tiles = randomSolvable();
  resetStats();
  render();
  startTimer();
  resetBtn.disabled = false;
  saveGame();
}

function onReset() {
  tiles = solvedArray();
  stopTimer();
  resetStats();
  render();
  resetBtn.disabled = true;
  clearSaved();
}

function onWin() {
  stopTimer();
  isOver = true;
  const isRecord = updateBest({ seconds: timer, moves });
  const timeMsg = formatTime(timer);
  messageEl.textContent = isRecord
    ? `Tabriklayman! Yangi rekord: ${timeMsg}, yurishlar: ${moves}.`
    : `Tabriklayman! Natija: ${timeMsg}, yurishlar: ${moves}.`;
  playWinJingle();
  clearSaved();
}

function onTimeUp() {
  if (isOver) return;
  stopTimer();
  isOver = true;
  messageEl.textContent = 'Vaqt tugadi! O\'yin tugadi.';
  clearSaved();
}

function updateBest({ seconds, moves }) {
  try {
    const key = STORAGE_KEY + ':best';
    const raw = localStorage.getItem(key);
    const best = raw ? JSON.parse(raw) : null;
    const better = !best || seconds < best.seconds || (seconds === best.seconds && moves < best.moves);
    if (better) {
      localStorage.setItem(key, JSON.stringify({ seconds, moves, ts: Date.now() }));
      return true;
    }
    return false;
  } catch { return false; }
}

function saveGame() {
  try {
    const data = { tiles, moves, timer, size, limitSeconds, ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (btnLoadGame) btnLoadGame.disabled = false;
  } catch {}
}

function hasSaved() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch { return false; }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tiles)) return false;
    tiles = data.tiles;
    if (data.size) size = data.size;
    if (data.limitSeconds) limitSeconds = data.limitSeconds;
    moves = Number(data.moves) || 0;
    timer = Number(data.timer) || 0;
    movesEl.textContent = String(moves);
    timeEl.textContent = formatTime(timer);
    messageEl.textContent = '';
    updateBoardCSS();
    render();
    startTimer();
    resetBtn.disabled = false;
    return true;
  } catch { return false; }
}

function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    if (btnLoadGame) btnLoadGame.disabled = !hasSaved();
  } catch {}
}

function init() {
  loadOptions();
  tiles = solvedArray();
  render();
  boardEl.addEventListener('click', onTileClick);
  document.addEventListener('keydown', onKey);
  shuffleBtn.addEventListener('click', onShuffle);
  resetBtn.addEventListener('click', onReset);
  // Touch support
  boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
  boardEl.addEventListener('touchend', onTouchEnd, { passive: true });
  // Sound controls
  const muteBtn = document.getElementById('muteBtn');
  const volumeRange = document.getElementById('volumeRange');
  try {
    const sraw = localStorage.getItem(STORAGE_KEY + ':sound');
    if (sraw) {
      const s = JSON.parse(sraw);
      if (typeof s.volume === 'number') volume = Math.min(1, Math.max(0, s.volume));
      if (typeof s.isMuted === 'boolean') isMuted = s.isMuted;
      if (volumeRange) volumeRange.value = String(Math.round(volume * 100));
      if (muteBtn) muteBtn.textContent = isMuted ? '🔇' : '🔊';
    }
  } catch {}
  function persistSound() {
    try { localStorage.setItem(STORAGE_KEY + ':sound', JSON.stringify({ volume, isMuted })); } catch {}
  }
  if (muteBtn) muteBtn.addEventListener('click', () => {
    initAudio();
    isMuted = !isMuted;
    if (masterGain) masterGain.gain.value = isMuted ? 0 : volume;
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
    persistSound();
  });
  if (volumeRange) volumeRange.addEventListener('input', () => {
    initAudio();
    const v = Number(volumeRange.value) / 100;
    volume = Math.min(1, Math.max(0, v));
    if (!isMuted && masterGain) masterGain.gain.value = volume;
    persistSound();
  });
  if (menuOverlay) {
    menuOverlay.classList.add('show');
    if (btnLoadGame) btnLoadGame.disabled = !hasSaved();
    if (btnNewGame) btnNewGame.addEventListener('click', () => {
      setOptionsFromUI();
      onShuffle();
      menuOverlay.classList.remove('show');
    });
    if (btnLoadGame) btnLoadGame.addEventListener('click', () => {
      if (loadGame()) menuOverlay.classList.remove('show');
    });
  }
}

init();
