import { ctx, canvas, state } from './store.js';
import { world, FOOD_CELL } from './constants.js';
import { hypot } from './utils.js';

let bgGradientCache = null;

// Helper to bridge worldToScreen from utils/state if needed, 
// but since utils is pure math, we need to pass cam/camScale or import state.
// Let's redefine a simpler worldToScreen here that uses the state directly.
function toScreen(wx, wy) {
    const { cam, camScale } = state;
    return {
        x: (wx - cam.x) * camScale + innerWidth / 2 + cam.shakeX,
        y: (wy - cam.y) * camScale + innerHeight / 2 + cam.shakeY
    };
}

export function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bgGradientCache = null;
}

export function drawSegment(wx, wy, r, hue, t, isGhost = false) {
    if (!Number.isFinite(wx) || !Number.isFinite(wy) || !Number.isFinite(r) || r < 0.1) return;
    const p = toScreen(wx, wy);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;

    const prevAlpha = ctx.globalAlpha;
    if (isGhost) ctx.globalAlpha = 0.45;

    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.arc(p.x + r * 0.22, p.y + r * 0.28, r * 1.02, 0, Math.PI * 2);
    ctx.fill();

    try {
        const grad = ctx.createRadialGradient(
            p.x - r * 0.35, p.y - r * 0.35, r * 0.2,
            p.x, p.y, r * 1.15
        );
        const sat = 88;
        const light = 68 - t * 12;
        grad.addColorStop(0, `hsla(${hue}, ${sat}%, ${light + 22}%, 0.98)`);
        grad.addColorStop(0.55, `hsla(${hue}, ${sat}%, ${light}%, 0.98)`);
        grad.addColorStop(1, `hsla(${hue}, ${sat}%, ${light - 14}%, 0.98)`);
        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    } catch (e) {
        ctx.beginPath();
        ctx.fillStyle = `hsla(${hue}, 88%, 60%, 0.98)`;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.beginPath();
    ctx.strokeStyle = `hsla(${hue}, 92%, ${78 - t * 10}%, 0.38)`;
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.arc(p.x, p.y, r * 0.98, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = prevAlpha;
}

export function drawEyes(s) {
    const head = s.segments[0];
    const p = toScreen(head.x, head.y);
    const sp = hypot(s.vx, s.vy);
    const ang = sp > 8 ? Math.atan2(s.vy, s.vx) : s.ang;
    const ex = Math.cos(ang), ey = Math.sin(ang);
    const lx = -ey, ly = ex;
    const R = s.baseRadius;
    const eyeOff = R * 0.35;
    const eyeFwd = R * 0.28;
    const eyeR = R * 0.18;
    const e1 = { x: p.x + lx * eyeOff + ex * eyeFwd, y: p.y + ly * eyeOff + ey * eyeFwd };
    const e2 = { x: p.x - lx * eyeOff + ex * eyeFwd, y: p.y - ly * eyeOff + ey * eyeFwd };
    ctx.beginPath(); ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.arc(e1.x, e1.y, eyeR, 0, Math.PI * 2);
    ctx.arc(e2.x, e2.y, eyeR, 0, Math.PI * 2);
    ctx.fill();
    const pr = eyeR * 0.45;
    ctx.beginPath(); ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.arc(e1.x + ex * pr * 0.8, e1.y + ey * pr * 0.8, pr, 0, Math.PI * 2);
    ctx.arc(e2.x + ex * pr * 0.8, e2.y + ey * pr * 0.8, pr, 0, Math.PI * 2);
    ctx.fill();
}

export function drawFood(f) {
    const p = toScreen(f.x, f.y);
    ctx.beginPath();
    ctx.fillStyle = `hsla(${f.hue}, 95%, 72%, 0.95)`;
    ctx.arc(p.x, p.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.arc(p.x - f.r * 0.35, p.y - f.r * 0.35, f.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
}

export function drawGrid() {
    const { cam, camScale } = state;
    const spacing = 120;
    const left = cam.x - (innerWidth / 2) / camScale;
    const top = cam.y - (innerHeight / 2) / camScale;
    const startX = Math.floor(left / spacing) * spacing;
    const startY = Math.floor(top / spacing) * spacing;
    ctx.lineWidth = 1;
    for (let x = startX; x < left + (innerWidth / camScale); x += spacing) {
        const sx = (x - cam.x) * camScale + innerWidth / 2 + cam.shakeX;
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.045)";
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, innerHeight);
        ctx.stroke();
    }
    for (let y = startY; y < top + (innerHeight / camScale); y += spacing) {
        const sy = (y - cam.y) * camScale + innerHeight / 2 + cam.shakeY;
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.045)";
        ctx.moveTo(0, sy);
        ctx.lineTo(innerWidth, sy);
        ctx.stroke();
    }
}

export function drawWorldBoundary() {
    const tl = toScreen(0, 0);
    const br = toScreen(world.w, world.h);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, innerWidth, Math.max(0, tl.y));
    ctx.fillRect(0, Math.min(innerHeight, br.y), innerWidth, Math.max(0, innerHeight - br.y));
    ctx.fillRect(0, Math.max(0, tl.y), Math.max(0, tl.x), Math.max(0, br.y - tl.y));
    ctx.fillRect(Math.min(innerWidth, br.x), Math.max(0, tl.y), Math.max(0, innerWidth - br.x), Math.max(0, br.y - tl.y));
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 3;
    ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.stroke();
}

const MINIMAP_SIZE = 170;
const MINIMAP_PAD = 14;
const MINIMAP_INSET = 10;
const MINIMAP_MS = MINIMAP_SIZE - MINIMAP_INSET * 2;

let minimapCanvas = document.createElement("canvas");
let minimapCtx = minimapCanvas.getContext("2d");

function drawMiniMapToBuffer() {
    if (minimapCanvas.width !== MINIMAP_MS || minimapCanvas.height !== MINIMAP_MS) {
        minimapCanvas.width = MINIMAP_MS;
        minimapCanvas.height = MINIMAP_MS;
    }
    const m = minimapCtx;
    m.fillStyle = "rgba(10,14,24,0.85)";
    m.fillRect(0, 0, MINIMAP_MS, MINIMAP_MS);
    m.strokeStyle = "rgba(255,255,255,0.12)";
    m.lineWidth = 2;
    m.strokeRect(0, 0, MINIMAP_MS, MINIMAP_MS);
    const toMini = (wx, wy) => ({
        x: (wx / world.w) * MINIMAP_MS,
        y: (wy / world.h) * MINIMAP_MS
    });
    for (let i = 0; i < state.foods.length; i += 22) {
        const f = state.foods[i];
        const p = toMini(f.x, f.y);
        m.fillStyle = "rgba(255,255,255,0.18)";
        m.fillRect(p.x, p.y, 2, 2);
    }
    for (const s of state.snakes) {
        if (s.dead) continue;
        const p = toMini(s.x, s.y);
        m.beginPath();
        m.fillStyle = s.isPlayer ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)";
        m.arc(p.x, p.y, s.isPlayer ? 4 : 3, 0, Math.PI * 2);
        m.fill();
    }
}

export function drawMiniMap(frameCounter) {
    const x0 = innerWidth - MINIMAP_SIZE - MINIMAP_PAD;
    const y0 = innerHeight - MINIMAP_SIZE - MINIMAP_PAD;
    if ((frameCounter & 1) === 0) {
        drawMiniMapToBuffer();
    }
    ctx.fillStyle = "rgba(10,14,24,0.55)";
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    if (ctx.roundRect) ctx.roundRect(x0, y0, MINIMAP_SIZE, MINIMAP_SIZE, 14);
    else ctx.rect(x0, y0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.fill(); ctx.stroke();
    ctx.drawImage(minimapCanvas, x0 + MINIMAP_INSET, y0 + MINIMAP_INSET, MINIMAP_MS, MINIMAP_MS);
}
