import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { world, MAX_FOODS, FOOD_CELL, BOT_COUNT, BOT_NAMES } from './js/constants.js';
import { rand, clamp, dist2, hypot, wrapAngle } from './js/utils.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

app.use(express.static('.'));

const gameState = {
    players: new Map(),
    foods: [],
    foodGrid: new Map()
};

function addFoodToGrid(f) {
    const cx = Math.floor(f.x / FOOD_CELL);
    const cy = Math.floor(f.y / FOOD_CELL);
    f._cellKey = `${cx},${cy}`;
    if (!gameState.foodGrid.has(f._cellKey)) gameState.foodGrid.set(f._cellKey, []);
    gameState.foodGrid.get(f._cellKey).push(f);
}

function removeFoodFromGrid(f) {
    if (!f || !f._cellKey) return;
    const list = gameState.foodGrid.get(f._cellKey);
    if (list) { const idx = list.indexOf(f); if (idx !== -1) list.splice(idx, 1); }
}

function spawnFood(n = MAX_FOODS) {
    for (let i = 0; i < n; i++) {
        const sizeT = Math.random();
        const f = {
            id: Math.random().toString(16).slice(2),
            x: Math.random() * world.w, y: Math.random() * world.h,
            r: 4 + sizeT * 4, hue: rand(0, 360), val: (1 + sizeT * 1) * 0.40,
            ownerId: null, lockT: 0, isDrop: false
        };
        addFoodToGrid(f); gameState.foods.push(f);
    }
}

function dropFoodOnDeath(s) {
    const segments = s.segments || [];
    segments.forEach((seg, i) => {
        if (i % 2 === 0) {
            const f = {
                id: "death_" + Math.random().toString(16).slice(2),
                x: clamp(seg.x + rand(-10, 10), 0, world.w),
                y: clamp(seg.y + rand(-10, 10), 0, world.h),
                r: rand(4.5, 7.5), hue: s.hue + rand(-10, 10),
                val: rand(1.5, 3.0), ownerId: null, lockT: 0, isDrop: false
            };
            addFoodToGrid(f);
            gameState.foods.push(f);
            io.emit('foodSpawned', f);
        }
    });
}

function createBot(i) {
    const name = BOT_NAMES[i % BOT_NAMES.length];
    const baseSpeed = rand(155, 180);
    const b = {
        id: "bot_" + Math.random().toString(36).slice(2),
        name, isBot: true, x: rand(1500, world.w - 1500), y: rand(1500, world.h - 1500),
        ang: rand(-Math.PI, Math.PI), hue: rand(0, 360), score: 0, targetLen: 6,
        segments: [], baseSpeed, boostSpeed: baseSpeed + 40, turnAssist: rand(5.5, 6.8),
        segDist: 9.5, baseRadius: 10, dead: false, spawnGrace: 2.5, respawnTimer: 0,
        ai: { targetFoodId: null, retargetT: 0 }
    };
    for (let k = 0; k < 6; k++) b.segments.push({ x: b.x, y: b.y, r: b.baseRadius * 0.9 });
    return b;
}

let bots = [];
for (let i = 0; i < BOT_COUNT; i++) bots.push(createBot(i));

function respawnBot(b) {
    b.dead = false; b.x = rand(1500, world.w - 1500); b.y = rand(1500, world.h - 1500);
    b.score = 0; b.targetLen = 6; b.spawnGrace = 2.5; b.respawnTimer = 0;
    b.segments = []; for (let k = 0; k < 6; k++) b.segments.push({ x: b.x, y: b.y, r: b.baseRadius * 0.9 });
}

function moveEntity(e, dt) {
    if (e.dead) return;
    const speed = e.wantsBoost ? 350 : (e.baseSpeed || 190);
    if (e.targetAng !== undefined) {
        const da = wrapAngle(e.targetAng - e.ang);
        const turnSpeed = e.turnAssist || 6.8;
        e.ang += clamp(da, -turnSpeed * dt, turnSpeed * dt);
    }
    e.x += Math.cos(e.ang) * speed * dt;
    e.y += Math.sin(e.ang) * speed * dt;
    e.x = clamp(e.x, 0, world.w);
    e.y = clamp(e.y, 0, world.h);

    if (e.segments.length > 0) {
        const head = e.segments[0]; head.x = e.x; head.y = e.y;
        const dist = e.segDist || 9.5;
        for (let i = 1; i < e.segments.length; i++) {
            const prev = e.segments[i - 1], seg = e.segments[i];
            const dx = seg.x - prev.x, dy = seg.y - prev.y;
            const d = hypot(dx, dy) || 0.001;
            if (d > dist) { const t = (d - dist) / d; seg.x -= dx * t; seg.y -= dy * t; }
        }
    }
}

function checkCollision(p, all, deaths) {
    if (p.dead || p.spawnGrace > 0) return;

    // Boundary
    if (p.x <= 0 || p.x >= world.w || p.y <= 0 || p.y >= world.h) {
        deaths.add(p.id); return;
    }

    // Food
    const rr2 = (p.baseRadius * 1.8) ** 2;
    for (let i = gameState.foods.length - 1; i >= 0; i--) {
        const f = gameState.foods[i];
        if (dist2(p.x, p.y, f.x, f.y) < rr2) {
            removeFoodFromGrid(f); gameState.foods.splice(i, 1);
            io.emit('foodEaten', { foodId: f.id, playerId: p.id });
            p.score += 5; p.targetLen += 0.25;
            if (p.segments.length < Math.floor(p.targetLen)) {
                const tail = p.segments[p.segments.length - 1];
                p.segments.push({ x: tail.x, y: tail.y, r: p.baseRadius * 0.9 });
            }
            spawnFood(1); io.emit('foodSpawned', gameState.foods[gameState.foods.length - 1]);
            break;
        }
    }

    // Others
    for (const o of all) {
        if (o.dead || o.id === p.id || o.spawnGrace > 0) continue;

        // Head-to-Head
        const headDist2 = dist2(p.x, p.y, o.x, o.y);
        const minHeadDist = (p.baseRadius + o.baseRadius) * 0.85; // Slightly more forgiving head-to-head
        if (headDist2 < minHeadDist * minHeadDist) {
            // Smaller one dies. If equal, check who is checking whom
            if (p.targetLen < o.targetLen) { deaths.add(p.id); return; }
            else if (o.targetLen < p.targetLen) { deaths.add(o.id); continue; }
            else { deaths.add(p.id); deaths.add(o.id); return; }
        }

        // Head-to-Segments
        for (let i = 1; i < o.segments.length; i++) {
            const s = o.segments[i];
            const rSum = (p.baseRadius * 0.85 + (s.r || 10) * 0.80); // Tighter collision
            if (dist2(p.x, p.y, s.x, s.y) < rSum * rSum) {
                deaths.add(p.id); return;
            }
        }
    }
}

function updatePhysics() {
    const dt = 0.033;
    const all = [...Array.from(gameState.players.values()), ...bots];

    // 1. Move
    all.forEach(e => {
        if (e.dead) {
            e.respawnTimer -= dt;
            if (e.isBot && e.respawnTimer <= 0) respawnBot(e);
            return;
        }
        if (e.spawnGrace > 0) e.spawnGrace -= dt;

        if (e.isBot) {
            const ai = e.ai; ai.retargetT -= dt;
            if (ai.retargetT <= 0) {
                ai.retargetT = rand(0.3, 1.2);
                let bestFood = null, bestD2 = Infinity;
                for (let k = 0; k < 20; k++) {
                    const f = gameState.foods[(Math.random() * gameState.foods.length) | 0];
                    if (f) { const d2 = dist2(e.x, e.y, f.x, f.y); if (d2 < bestD2) { bestD2 = d2; bestFood = f; } }
                }
                if (bestFood) ai.targetFoodId = bestFood.id;
            }
            let tx = e.x + Math.cos(e.ang) * 100, ty = e.y + Math.sin(e.ang) * 100;
            const targetFood = gameState.foods.find(f => f.id === ai.targetFoodId);
            if (targetFood) { tx = targetFood.x; ty = targetFood.y; }
            const m = 650;
            if (e.x < m) tx = e.x + 1000; else if (e.x > world.w - m) tx = e.x - 1000;
            if (e.y < m) ty = e.y + 1000; else if (e.y > world.h - m) ty = e.y - 1000;
            e.targetAng = Math.atan2(ty - e.y, tx - e.x);
        }
        moveEntity(e, dt);
    });

    // 2. Collisions (Authoritative)
    const deaths = new Set();
    all.forEach(e => checkCollision(e, all, deaths));

    // 3. Process Deaths
    deaths.forEach(id => {
        const p = all.find(x => x.id === id);
        if (p && !p.dead) {
            p.dead = true;
            p.respawnTimer = p.isPlayer ? 3.0 : 2.0;
            dropFoodOnDeath(p);
            io.emit('playerKilled', { victimId: p.id });
        }
    });
}

setInterval(updatePhysics, 33);

setInterval(() => {
    const playersArr = Array.from(gameState.players.values()).map(p => ({
        id: p.id, name: p.name, x: p.x, y: p.y, ang: p.ang, hue: p.hue, isPlayer: true,
        score: p.score, segments: p.segments, targetLen: p.targetLen, dead: p.dead, baseRadius: p.baseRadius, spawnGrace: p.spawnGrace > 0
    }));
    io.emit('playerUpdates', playersArr);
    io.emit('botUpdates', bots.map(b => ({
        id: b.id, name: b.name, x: b.x, y: b.y, ang: b.ang, hue: b.hue, score: b.score, segments: b.segments, targetLen: b.targetLen, dead: b.dead, baseRadius: b.baseRadius, spawnGrace: b.spawnGrace > 0
    })));
}, 45);

spawnFood();

io.on('connection', (socket) => {
    socket.emit('init', { id: socket.id, foods: gameState.foods, players: Array.from(gameState.players.values()), bots: bots });
    socket.on('join', (data) => {
        const p = {
            id: socket.id, name: data.name || "Anonim", x: rand(1500, world.w - 1500), y: rand(1500, world.h - 1500),
            ang: rand(-Math.PI, Math.PI), targetAng: 0, hue: rand(0, 360), score: 0, targetLen: 6, dead: false, baseRadius: 10, segments: [], isPlayer: true, spawnGrace: 2.5, respawnTimer: 0
        };
        for (let k = 0; k < 6; k++) p.segments.push({ x: p.x, y: p.y, r: p.baseRadius * 0.9 });
        gameState.players.set(socket.id, p);
        io.emit('playerJoined', p);
    });
    socket.on('input', (data) => {
        const p = gameState.players.get(socket.id);
        if (p && !p.dead) { if (data.ang !== undefined) p.targetAng = data.ang; if (data.boost !== undefined) p.wantsBoost = data.boost; }
    });
    socket.on('requestFullState', () => {
        socket.emit('fullState', { players: Array.from(gameState.players.values()), bots, foods: gameState.foods });
    });
    socket.on('disconnect', () => {
        gameState.players.delete(socket.id); io.emit('playerLeft', socket.id);
    });
});

httpServer.listen(PORT, () => console.log(`Server started on port ${PORT}`));
