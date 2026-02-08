import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { world, MAX_FOODS, FOOD_CELL, BOT_COUNT, BOT_NAMES, PERSONALITIES } from './js/constants.js';
import { rand, clamp, dist2, hypot, norm, wrapAngle } from './js/utils.js';

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
    const list = gameState.foodGrid.get(f._cellKey);
    if (list) {
        const idx = list.indexOf(f);
        if (idx !== -1) list.splice(idx, 1);
    }
}

function spawnFood(n = MAX_FOODS) {
    for (let i = 0; i < n; i++) {
        const sizeT = Math.random();
        const f = {
            id: Math.random().toString(16).slice(2),
            x: Math.random() * world.w,
            y: Math.random() * world.h,
            r: 4 + sizeT * 4,
            hue: rand(0, 360),
            val: (1 + sizeT * 1) * 0.40,
            ownerId: null,
            lockT: 0,
            isDrop: false
        };
        addFoodToGrid(f);
        gameState.foods.push(f);
    }
}

function createBot(i) {
    const name = BOT_NAMES[i % BOT_NAMES.length];
    const baseSpeed = rand(155, 180);
    const id = "bot_" + Math.random().toString(36).slice(2);
    const b = {
        id,
        name,
        isBot: true,
        x: rand(800, world.w - 800),
        y: rand(800, world.h - 800),
        vx: 0, vy: 0,
        ang: rand(-Math.PI, Math.PI),
        hue: rand(0, 360),
        score: 0,
        targetLen: rand(9, 15),
        segments: [],
        baseSpeed,
        boostSpeed: baseSpeed + 40,
        turnAssist: rand(5.5, 6.8),
        segDist: 9.5,
        baseRadius: 12,
        dead: false,
        spawnGrace: 2.0, // 2 seconds invincibility
        ai: {
            targetFoodId: null,
            retargetT: 0
        }
    };
    for (let k = 0; k < Math.floor(b.targetLen); k++) {
        b.segments.push({ x: b.x, y: b.y, r: b.baseRadius * 0.9 });
    }
    return b;
}

let bots = [];
for (let i = 0; i < BOT_COUNT; i++) {
    bots.push(createBot(i));
}

function respawnBot(b) {
    b.dead = false;
    b.x = rand(800, world.w - 800);
    b.y = rand(800, world.h - 800);
    b.score = 0;
    b.targetLen = rand(9, 15);
    b.spawnGrace = 2.0;
    b.segments = [];
    for (let k = 0; k < Math.floor(b.targetLen); k++) {
        b.segments.push({ x: b.x, y: b.y, r: b.baseRadius * 0.9 });
    }
}

function updateBots(dt) {
    bots.forEach(b => {
        if (b.dead) {
            respawnBot(b);
            return;
        }

        if (b.spawnGrace > 0) b.spawnGrace -= dt;

        const ai = b.ai;
        ai.retargetT -= dt;
        const head = b.segments[0];

        if (ai.retargetT <= 0) {
            ai.retargetT = rand(0.3, 1.2);
            let bestFood = null, bestD2 = Infinity;
            const scan = Math.min(gameState.foods.length, 25);
            for (let k = 0; k < scan; k++) {
                const f = gameState.foods[(Math.random() * gameState.foods.length) | 0];
                if (!f) continue;
                const d2 = dist2(b.x, b.y, f.x, f.y);
                if (d2 < bestD2) { bestD2 = d2; bestFood = f; }
            }
            if (bestFood) ai.targetFoodId = bestFood.id;
        }

        let tx = b.x + Math.cos(b.ang) * 100;
        let ty = b.y + Math.sin(b.ang) * 100;

        const targetFood = gameState.foods.find(f => f.id === ai.targetFoodId);
        if (targetFood) { tx = targetFood.x; ty = targetFood.y; }

        // Stronger wall avoidance
        const m = 500;
        if (b.x < m) tx = b.x + 1000;
        else if (b.x > world.w - m) tx = b.x - 1000;
        if (b.y < m) ty = b.y + 1000;
        else if (b.y > world.h - m) ty = b.y - 1000;

        const desiredAng = Math.atan2(ty - b.y, tx - b.x);
        let da = wrapAngle(desiredAng - b.ang);
        b.ang += clamp(da, -b.turnAssist * dt, b.turnAssist * dt);

        b.vx = Math.cos(b.ang) * b.baseSpeed;
        b.vy = Math.sin(b.ang) * b.baseSpeed;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        head.x = b.x;
        head.y = b.y;

        for (let i = 1; i < b.segments.length; i++) {
            const prev = b.segments[i - 1];
            const seg = b.segments[i];
            const dx = seg.x - prev.x, dy = seg.y - prev.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
            if (d > b.segDist) {
                const t = (d - b.segDist) / d;
                seg.x -= dx * t;
                seg.y -= dy * t;
            }
        }

        // Eat Food
        const rr = b.baseRadius * 1.6;
        const rr2 = rr * rr;
        for (let i = gameState.foods.length - 1; i >= 0; i--) {
            const f = gameState.foods[i];
            if (dist2(b.x, b.y, f.x, f.y) < rr2) {
                gameState.foods.splice(i, 1);
                removeFoodFromGrid(f);
                io.emit('foodEaten', { foodId: f.id, playerId: b.id });
                b.score += 5;
                b.targetLen += 0.25;
                if (b.segments.length < Math.floor(b.targetLen)) {
                    const last = b.segments[b.segments.length - 1];
                    b.segments.push({ x: last.x, y: last.y, r: b.baseRadius * 0.9 });
                }
                spawnFood(1);
                io.emit('foodSpawned', gameState.foods[gameState.foods.length - 1]);
                break;
            }
        }

        // Collision
        if (b.spawnGrace > 0) return;

        if (b.x < 0 || b.x > world.w || b.y < 0 || b.y > world.h) {
            b.dead = true;
            io.emit('playerKilled', { victimId: b.id });
            return;
        }

        const all = [...Array.from(gameState.players.values()), ...bots];
        for (const o of all) {
            if (o.dead || o.id === b.id) continue;
            const segs = o.segments || [];
            for (let i = 0; i < segs.length; i++) {
                const s = segs[i];
                if (!s) continue;
                const rSum = (b.baseRadius * 0.75 + (s.r || 10) * 0.75);
                if (dist2(b.x, b.y, s.x, s.y) < rSum * rSum) {
                    b.dead = true;
                    io.emit('playerKilled', { victimId: b.id, killerId: o.id });
                    return;
                }
            }
        }
    });
}

setInterval(() => {
    try {
        updateBots(0.05);
        io.emit('botUpdates', bots.map(b => ({
            id: b.id, name: b.name, x: b.x, y: b.y, ang: b.ang, hue: b.hue,
            score: b.score, segments: b.segments, targetLen: b.targetLen,
            dead: b.dead, baseRadius: b.baseRadius
        })));
    } catch (e) { console.error(e); }
}, 50);

spawnFood();

io.on('connection', (socket) => {
    socket.emit('init', {
        id: socket.id,
        foods: gameState.foods,
        players: Array.from(gameState.players.values()),
        bots: bots
    });

    socket.on('join', (data) => {
        const p = {
            id: socket.id,
            name: data.name || "Anonim",
            x: rand(800, world.w - 800),
            y: rand(800, world.h - 800),
            hue: rand(0, 360),
            score: 0,
            targetLen: 10,
            dead: false,
            baseRadius: 12,
            segments: []
        };
        for (let k = 0; k < 10; k++) p.segments.push({ x: p.x, y: p.y, r: 10.8 });
        gameState.players.set(socket.id, p);
        io.emit('playerJoined', p);
    });

    socket.on('update', (data) => {
        const p = gameState.players.get(socket.id);
        if (p && !p.dead) {
            Object.assign(p, data);
            socket.broadcast.emit('playerUpdate', p);
        }
    });

    socket.on('eat', (id) => {
        const i = gameState.foods.findIndex(f => f.id === id);
        if (i !== -1) {
            const f = gameState.foods[i];
            gameState.foods.splice(i, 1);
            removeFoodFromGrid(f);
            io.emit('foodEaten', { foodId: id, playerId: socket.id });
            spawnFood(1);
            io.emit('foodSpawned', gameState.foods[gameState.foods.length - 1]);
        }
    });

    socket.on('kill', (data) => {
        const p = gameState.players.get(socket.id);
        if (p) {
            p.dead = true;
            io.emit('playerKilled', { victimId: socket.id, killerId: data?.killerId });
        }
    });

    socket.on('disconnect', () => {
        gameState.players.delete(socket.id);
        io.emit('playerLeft', socket.id);
    });
});

httpServer.listen(PORT, () => console.log(`Server on ${PORT}`));
