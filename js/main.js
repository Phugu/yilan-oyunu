import { state, canvas, ctx, scoreEl, lenEl, botsEl, energyEl, lbListEl, lbYouEl, startButton, playerNameInput, controlBtns, toggleControlBtn } from './store.js';
import { ui } from './ui.js';
import { world } from './constants.js';
import { resize, drawWorldBoundary, drawGrid, drawFood, drawSegment, drawEyes, drawMiniMap } from './graphics.js';
import { spawnFood, spawnParticles, initPhysics, respawnPlayer, moveSnake, checkCollision, eatFood, grow, killSnake, respawnSnake, updateParticles, addFoodToGrid, removeFoodFromGrid } from './core.js';
import { botThink } from './ai.js';
import { audio } from './audio.js';
import { rand, clamp } from './utils.js';

window.addEventListener("resize", resize);
resize();

// Input handling
window.addEventListener("mousemove", e => { state.mouse.x = e.clientX; state.mouse.y = e.clientY; });

window.addEventListener("keydown", (e) => {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.boosting = true;
    if (e.code === "KeyR") { if (state.player && state.player.dead) respawnPlayer(); }
    if (!audio.unlocked) audio.unlock();

    // WASD / Arrows
    if (e.code === "KeyW" || e.code === "ArrowUp") state.keys.w = true;
    if (e.code === "KeyA" || e.code === "ArrowLeft") state.keys.a = true;
    if (e.code === "KeyS" || e.code === "ArrowDown") state.keys.s = true;
    if (e.code === "KeyD" || e.code === "ArrowRight") state.keys.d = true;
}, { passive: true });

window.addEventListener("keyup", (e) => {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.boosting = false;

    if (e.code === "KeyW" || e.code === "ArrowUp") state.keys.w = false;
    if (e.code === "KeyA" || e.code === "ArrowLeft") state.keys.a = false;
    if (e.code === "KeyS" || e.code === "ArrowDown") state.keys.s = false;
    if (e.code === "KeyD" || e.code === "ArrowRight") state.keys.d = false;
}, { passive: true });

// Start Button logic
startButton.addEventListener("click", () => {
    const val = playerNameInput.value.trim();
    if (val) state.playerName = val;
    state.gameStarted = true;
    ui.hideStartMenu();

    state.socket.emit('join', { name: state.playerName });

    // Re-init player name if already made
    if (state.player) state.player.name = state.playerName;
});

playerNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startButton.click();
});

// Control Selection Logic
controlBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        controlBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.controlMode = btn.dataset.mode;
        updateControlHUDText();
    });
});

function updateControlHUDText() {
    if (!toggleControlBtn) return;
    const modeMap = { auto: "Oto", mouse: "Fare", keyboard: "Klavye" };
    toggleControlBtn.innerText = `🎮 Kontrol: ${modeMap[state.controlMode]}`;
}

toggleControlBtn.addEventListener("click", () => {
    const modes = ["auto", "mouse", "keyboard"];
    let nextIdx = (modes.indexOf(state.controlMode) + 1) % modes.length;
    state.controlMode = modes[nextIdx];
    updateControlHUDText();

    // Also update menu buttons to stay in sync if visible
    controlBtns.forEach(b => {
        b.classList.toggle("active", b.dataset.mode === state.controlMode);
    });
});

initPhysics(); // Move up to prevent wiping socket state later

// Socket Init
state.socket = io();

state.socket.on('init', (data) => {
    state.myId = data.id;
    // Server handles initial food now
    state.foods = data.foods;
    state.foodGrid.clear();
    state.foods.forEach(f => addFoodToGrid(f));

    // Add existing players
    data.players.forEach(p => {
        if (p.id !== state.myId) {
            state.otherPlayers.set(p.id, p);
            // Check if already in snakes
            let existing = state.snakes.find(s => s.id === p.id);
            if (!existing) {
                p.targetX = p.x;
                p.targetY = p.y;
                p.targetAng = p.ang;
                p.targetSegments = p.segments;
                p.baseRadius = p.baseRadius || 12;
                state.snakes.push(p);
            }
        }
    });
    // Add bots
    data.bots.forEach(b => {
        let existing = state.snakes.find(s => s.id === b.id);
        if (!existing) {
            b.targetX = b.x;
            b.targetY = b.y;
            b.targetAng = b.ang;
            b.targetSegments = b.segments;
            b.baseRadius = b.baseRadius || 12;
            state.snakes.push(b);
        }
    });
});

state.socket.on('playerJoined', (p) => {
    if (p.id !== state.myId) {
        state.otherPlayers.set(p.id, p);
        let s = state.snakes.find(s => s.id === p.id);
        if (!s) {
            s = p;
            s.targetX = p.x;
            s.targetY = p.y;
            s.targetAng = p.ang;
            s.targetSegments = p.segments;
            s.baseRadius = p.baseRadius || 12;
            state.snakes.push(s);
        } else {
            // Update existing record
            Object.assign(s, p);
            s.targetX = p.x;
            s.targetY = p.y;
            s.targetAng = p.ang;
            s.dead = false;
        }
    }
});

state.socket.on('playerUpdate', (p) => {
    if (p.id !== state.myId) {
        // Sync local snakes array for rendering/collision
        let s = state.snakes.find(s => s.id === p.id);
        if (!s) {
            s = p;
            s.targetX = p.x;
            s.targetY = p.y;
            s.targetAng = p.ang;
            s.targetSegments = p.segments;
            state.snakes.push(s);
        } else {
            // Set targets for lerping
            s.targetX = p.x;
            s.targetY = p.y;
            s.targetAng = p.ang;
            s.targetSegments = p.segments;
            s.score = p.score;
            s.targetLen = p.targetLen;
            s.name = p.name;
            s.baseRadius = p.baseRadius || 12;
            s.dead = p.dead; // CRITICAL: Update dead state to allow drawing after respawn
        }
    }
});

state.socket.on('playerLeft', (id) => {
    state.otherPlayers.delete(id);
    const idx = state.snakes.findIndex(s => s.id === id);
    if (idx !== -1) state.snakes.splice(idx, 1);
});

state.socket.on('foodEaten', (data) => {
    const idx = state.foods.findIndex(f => f.id === data.foodId);
    if (idx !== -1) {
        const f = state.foods[idx];
        removeFoodFromGrid(f);
        state.foods.splice(idx, 1);
        // If someone else ate it, maybe show effect?
    }
});

state.socket.on('foodSpawned', (f) => {
    state.foods.push(f);
    addFoodToGrid(f);
});

state.socket.on('playerKilled', (data) => {
    const s = state.snakes.find(snake => snake.id === data.victimId);
    if (s) {
        killSnake(s, state.snakes.find(k => k.id === data.killerId));
    }
});

state.socket.on('botUpdates', (botList) => {
    botList.forEach(b => {
        let s = state.snakes.find(s => s.id === b.id);
        if (!s) {
            s = b;
            s.targetX = b.x;
            s.targetY = b.y;
            s.targetAng = b.ang;
            s.targetSegments = b.segments;
            state.snakes.push(s);
        } else {
            // Set targets for lerping/smoothing
            s.targetX = b.x;
            s.targetY = b.y;
            s.targetAng = b.ang;
            s.targetSegments = b.segments;
            s.score = b.score;
            s.targetLen = b.targetLen;
            s.dead = b.dead;
            s.baseRadius = b.baseRadius || 12;
        }
    });
});

function update(dt) {
    if (!state.gameStarted) return;
    // Update foods lock
    for (const f of state.foods) {
        if (f.lockT > 0) f.lockT -= dt;
    }

    // Update snakes
    for (const s of state.snakes) {
        if (s.dead) {
            if (!s.isPlayer) {
                s.respawnTimer -= dt;
                if (s.respawnTimer <= 0) respawnSnake(s);
            }
            continue;
        }

        // AI or Input
        let wantsBoost = false;
        if (s.isPlayer) {
            let targetAng = s.ang;
            const keys = state.keys;
            const kx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
            const ky = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);

            const hasKey = (kx !== 0 || ky !== 0);

            if (state.controlMode === "keyboard" || (state.controlMode === "auto" && hasKey)) {
                // Keyboard: used if explicitly set OR auto-detected when keys are pressed
                if (hasKey) targetAng = Math.atan2(ky, kx);
                else targetAng = s.ang; // hold direction if no keys
            } else {
                // Mouse: default or explicitly set
                const cx = innerWidth / 2;
                const cy = innerHeight / 2;
                targetAng = Math.atan2(state.mouse.y - cy, state.mouse.x - cx);
            }

            let da = targetAng - s.ang;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            s.ang += clamp(da, -s.turnAssist * dt, s.turnAssist * dt);

            wantsBoost = state.boosting;

            // local player does everything
            moveSnake(s, dt, wantsBoost);
            grow(s);
            eatFood(s);
            checkCollision(s);

            // Send update to server
            if (frameCounter % 2 === 0) {
                state.socket.emit('update', {
                    x: s.x, y: s.y, ang: s.ang, score: s.score,
                    targetLen: s.targetLen, segments: s.segments,
                    hue: s.hue, name: s.name
                });
            }
        } else {
            // Other players and Bots: Smoothing/Interpolation
            if (s.targetX !== undefined) {
                const k = 15 * dt; // Smoothing factor
                s.x += (s.targetX - s.x) * k;
                s.y += (s.targetY - s.y) * k;

                // Smooth angle
                let da = s.targetAng - s.ang;
                while (da > Math.PI) da -= Math.PI * 2;
                while (da < -Math.PI) da += Math.PI * 2;
                s.ang += da * k;

                // Sync segments visually
                if (s.targetSegments) {
                    // Sync length
                    while (s.segments.length < s.targetSegments.length) {
                        const last = s.segments[s.segments.length - 1] || s;
                        s.segments.push({ x: last.x, y: last.y, r: 0.1 });
                    }
                    while (s.segments.length > s.targetSegments.length) {
                        s.segments.pop();
                    }

                    for (let i = 0; i < s.segments.length; i++) {
                        const ts = s.targetSegments[i];
                        const seg = s.segments[i];
                        if (!ts || !seg) continue;
                        seg.x += (ts.x - seg.x) * k;
                        seg.y += (ts.y - seg.y) * k;
                        // Also lerp radius for growth animation
                        if (ts.r !== undefined && !isNaN(ts.r)) {
                            seg.r += (ts.r - seg.r) * k;
                        } else {
                            const targetR = s.baseRadius * 0.9;
                            seg.r += (targetR - seg.r) * k;
                        }
                    }
                }
            }
        }
    }

    updateParticles(dt);

    // Camera update
    if (state.player && !state.player.dead) {
        const head = state.player.segments[0];
        // Smooth cam
        const k = 5 * dt;
        state.cam.x += (head.x - state.cam.x) * k;
        state.cam.y += (head.y - state.cam.y) * k;
    }
    // Shake decay
    state.cam.shakeX *= (1 - 15 * dt);
    state.cam.shakeY *= (1 - 15 * dt);
}

function draw() {
    ctx.fillStyle = "#0b0f18";
    ctx.fillRect(0, 0, innerWidth, innerHeight); // clear

    // Draw Grid
    drawGrid();

    // Boundary
    drawWorldBoundary();

    // Foods
    // Optimization: only draw visible?
    // For now draw all
    for (const f of state.foods) {
        drawFood(f);
    }

    // Particles
    for (const p of state.particles) {
        const px = (p.x - state.cam.x) * state.camScale + innerWidth / 2 + state.cam.shakeX;
        const py = (p.y - state.cam.y) * state.camScale + innerHeight / 2 + state.cam.shakeY;
        ctx.fillStyle = `hsla(${p.hue}, 90%, 60%, ${p.life})`;
        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Snakes
    // Sort by y? or simple
    for (const s of state.snakes) {
        if (s.dead) continue;
        const head = s.segments[0];
        const t = (s.isPlayer && s._wantsBoost) ? 1.0 : 0.0; // rudimentary visual feedback
        for (let i = s.segments.length - 1; i >= 0; i--) {
            const seg = s.segments[i];
            // draw
            drawSegment(seg.x, seg.y, seg.r, s.hue, i == 0 ? 0 : 0); // simplify
        }
        drawEyes(s);

        // Name
        const p = {
            x: (head.x - state.cam.x) * state.camScale + innerWidth / 2 + state.cam.shakeX,
            y: (head.y - state.cam.y) * state.camScale + innerHeight / 2 + state.cam.shakeY
        };
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(s.name, p.x, p.y - 30);
    }

    drawMiniMap(frameCounter);
}

let lastTime = performance.now();
let frameCounter = 0;

// Separate physics/logical loop from rendering to maintain sync in background tabs
const tickRate = 60;
const tickInterval = 1000 / tickRate;

setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.06, (now - lastTime) / 1000);
    lastTime = now;
    frameCounter++;

    update(dt);

    // HUD and LB occasional updates
    if (frameCounter % 15 === 0) {
        ui.updateHUD();
        ui.updateLeaderboard();
    }
}, tickInterval);

function loop() {
    requestAnimationFrame(loop);
    draw();
}

loop();

// Heartbeat to keep socket alive in background
setInterval(() => {
    if (document.visibilityState === 'hidden' && state.socket && state.gameStarted) {
        state.socket.emit('heartbeat'); // Minimal keep-alive
    }
}, 1000);
