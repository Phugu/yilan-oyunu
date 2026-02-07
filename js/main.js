import { state, canvas, ctx, scoreEl, lenEl, botsEl, energyEl, lbListEl, lbYouEl, startButton, playerNameInput } from './store.js';
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
}, { passive: true });

window.addEventListener("keyup", (e) => {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.boosting = false;
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
        if (p.id !== state.myId) state.otherPlayers.set(p.id, p);
    });
});

state.socket.on('playerJoined', (p) => {
    if (p.id !== state.myId) state.otherPlayers.set(p.id, p);
});

state.socket.on('playerUpdate', (p) => {
    if (p.id !== state.myId) {
        state.otherPlayers.set(p.id, p);
        // Sync local snakes array for rendering/collision
        const idx = state.snakes.findIndex(s => s.id === p.id);
        if (idx === -1) {
            state.snakes.push(p);
        } else {
            state.snakes[idx] = p;
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
            const cx = innerWidth / 2;
            const cy = innerHeight / 2;
            const targetAng = Math.atan2(state.mouse.y - cy, state.mouse.x - cx);
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
        } else if (s.ai) {
            // Bots
            botThink(s, dt);
            wantsBoost = s._wantsBoost;
            moveSnake(s, dt, wantsBoost);
            grow(s);
            eatFood(s);
            checkCollision(s);
        } else {
            // Other real players
            // Position and segments are updated by socket 'playerUpdate'
            // We might want to interpolation/lerp here for smoothness, 
            // but for now let's just keep it simple.
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
function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.06, (now - lastTime) / 1000);
    lastTime = now;
    frameCounter++;

    update(dt);
    draw();
    if (frameCounter % 15 === 0) {
        ui.updateHUD();
        ui.updateLeaderboard();
    }
}

initPhysics();
resize();
loop();
