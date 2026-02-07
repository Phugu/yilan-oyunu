// --- Canvas & context ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Oyun sabitleri ---
const GRID_SIZE = 24;
const COLS = Math.floor(canvas.width / GRID_SIZE);
const ROWS = Math.floor(canvas.height / GRID_SIZE);
const FPS = 11;
const SEGMENT_RADIUS = GRID_SIZE * 0.48;

// --- Oyun state ---
let snake = [];
let food = { x: 0, y: 0 };
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let score = 0;
let highScore = parseInt(localStorage.getItem('snakeHighScore') || '0', 10);
let gameLoop = null;
let gameRunning = false;

// --- DOM ---
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const finalScoreEl = document.getElementById('finalScore');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

// --- Yardımcılar ---
function randomGridPos() {
  return {
    x: Math.floor(Math.random() * COLS),
    y: Math.floor(Math.random() * ROWS)
  };
}

function spawnFood() {
  let pos;
  do {
    pos = randomGridPos();
  } while (snake.some(seg => seg.x === pos.x && seg.y === pos.y));
  food = pos;
}

function initGame() {
  const startX = Math.floor(COLS / 2);
  const startY = Math.floor(ROWS / 2);
  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY }
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  spawnFood();
  scoreEl.textContent = score;
  highScoreEl.textContent = highScore;
}

// --- 3D görünümlü çizim (Snake.io tarzı) ---

function drawShadow(cx, cy, radius, blur = 8) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.4, radius * 1.1, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.filter = `blur(${blur}px)`;
  ctx.fill();
  ctx.filter = 'none';
  ctx.restore();
}

function drawSegment3D(gx, gy, color, isHead, dir) {
  const cx = gx * GRID_SIZE + GRID_SIZE / 2;
  const cy = gy * GRID_SIZE + GRID_SIZE / 2;
  const r = SEGMENT_RADIUS;

  drawShadow(cx, cy, r, 6);

  const gradient = ctx.createRadialGradient(
    cx - r * 0.35, cy - r * 0.35, 0,
    cx, cy, r * 1.2
  );
  gradient.addColorStop(0, lighten(color, 0.5));
  gradient.addColorStop(0.4, color);
  gradient.addColorStop(0.85, darken(color, 0.25));
  gradient.addColorStop(1, darken(color, 0.45));

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  if (isHead) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
    ctx.stroke();
    const eyeOffset = 4;
    const eyeR = 3;
    const leftEyeX = dir.x !== 1 ? cx - eyeOffset : cx + eyeOffset;
    const leftEyeY = cy - (dir.y === -1 ? eyeOffset : dir.y === 1 ? -eyeOffset : 0);
    const rightEyeX = dir.x !== -1 ? cx + eyeOffset : cx - eyeOffset;
    const rightEyeY = cy - (dir.y === -1 ? eyeOffset : dir.y === 1 ? -eyeOffset : 0);
    ctx.fillStyle = '#0a0a12';
    ctx.beginPath();
    ctx.arc(leftEyeX, leftEyeY, eyeR, 0, Math.PI * 2);
    ctx.arc(rightEyeX, rightEyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(leftEyeX - 1, leftEyeY - 1, 1, 0, Math.PI * 2);
    ctx.arc(rightEyeX - 1, rightEyeY - 1, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function lighten(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + 255 * amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + 255 * amount);
  const b = Math.min(255, (num & 0xff) + 255 * amount);
  return `rgb(${r},${g},${b})`;
}

function darken(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) * (1 - amount));
  const g = Math.max(0, ((num >> 8) & 0xff) * (1 - amount));
  const b = Math.max(0, (num & 0xff) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

function drawSnake() {
  const headColor = '#00cc66';
  const bodyColor = '#00aa55';
  snake.forEach((seg, i) => {
    const isHead = i === 0;
    const t = 1 - i / Math.max(snake.length, 1);
    const color = isHead ? headColor : bodyColor;
    drawSegment3D(seg.x, seg.y, color, isHead, direction);
  });
}

function drawFood() {
  const cx = food.x * GRID_SIZE + GRID_SIZE / 2;
  const cy = food.y * GRID_SIZE + GRID_SIZE / 2;
  const r = SEGMENT_RADIUS * 0.85;

  drawShadow(cx, cy, r, 10);

  const gradient = ctx.createRadialGradient(
    cx - r * 0.4, cy - r * 0.4, 0,
    cx, cy, r * 1.3
  );
  gradient.addColorStop(0, '#ffeb99');
  gradient.addColorStop(0.25, '#ffcc44');
  gradient.addColorStop(0.6, '#ff9900');
  gradient.addColorStop(1, '#cc6600');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,200,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
  ctx.stroke();
}

function drawArena() {
  const x = 0, y = 0, w = canvas.width, h = canvas.height;
  const radius = 32;

  const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGradient.addColorStop(0, '#1a2744');
  bgGradient.addColorStop(0.5, '#16213e');
  bgGradient.addColorStop(1, '#0f0f1a');
  ctx.fillStyle = bgGradient;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function update() {
  direction = { ...nextDirection };

  const head = { ...snake[0] };
  head.x += direction.x;
  head.y += direction.y;

  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
    gameOver();
    return;
  }

  if (snake.some(seg => seg.x === head.x && seg.y === head.y)) {
    gameOver();
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += 10;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('snakeHighScore', highScore);
      highScoreEl.textContent = highScore;
    }
    scoreEl.textContent = score;
    spawnFood();
  } else {
    snake.pop();
  }
}

function draw() {
  ctx.fillStyle = '#0f0f1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawArena();
  drawFood();
  drawSnake();
}

function gameOver() {
  gameRunning = false;
  if (gameLoop) clearInterval(gameLoop);
  finalScoreEl.textContent = score;
  gameOverScreen.classList.remove('hidden');
}

function run() {
  if (!gameRunning) return;
  update();
  if (gameRunning) draw();
}

function startGame() {
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  initGame();
  gameRunning = true;
  if (gameLoop) clearInterval(gameLoop);
  gameLoop = setInterval(run, 1000 / FPS);
}

// --- Kontroller ---
const keyToDir = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  W: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  S: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  A: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
  D: { x: 1, y: 0 }
};

document.addEventListener('keydown', (e) => {
  const d = keyToDir[e.key];
  if (!d) return;
  e.preventDefault();
  if (!gameRunning) return;
  if (d.x === -direction.x && d.y === -direction.y) return;
  nextDirection = d;
});

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
highScoreEl.textContent = highScore;
