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

// Bot management
function createBot(i) {
    const name = BOT_NAMES[i % BOT_NAMES.length] + " " + (i + 1);
    const persona = PERSONALITIES[(Math.random() * PERSONALITIES.length) | 0].key;
    const baseSpeed = rand(155, 180);
    const id = "bot_" + Math.random().toString(36).slice(2);
    const b = {
        id,
        name,
        isBot: true,
        x: rand(500, world.w - 500),
        y: rand(500, world.h - 500),
        vx: 0, vy: 0,
        ang: rand(-Math.PI, Math.PI),
        hue: rand(0, 360),
        score: 0,
        targetLen: rand(9, 16),
        segments: [],
        baseSpeed,
        boostSpeed: baseSpeed + 40,
        turnAssist: rand(6.0, 7.2),
        segDist: 9.5,
        baseRadius: 12,
        dead: false,
        ai: {
            targetFoodId: null,
            retargetT: 0,
            boostT: 0
        }
    };
    for (let k = 0; k < Math.floor(b.targetLen); k++) {
        b.segments.push({ x: b.x - k * b.segDist, y: b.y, r: b.baseRadius * 0.9 });
    }
    return b;
}

let bots = [];
for (let i = 0; i < BOT_COUNT; i++) {
    bots.push(createBot(i));
}

function respawnBot(b) {
    b.dead = false;
    b.x = rand(500, world.w - 500);
    b.y = rand(500, world.h - 500);
    b.score = 0;
    b.targetLen = rand(9, 16);
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

        const ai = b.ai;
        ai.retargetT -= dt;
        const head = b.segments[0];

        // AI Target selection
        if (ai.retargetT <= 0) {
            ai.retargetT = rand(0.5, 1.5);
            let bestFood = null, bestD2 = Infinity;
            const scanCount = Math.min(gameState.foods.length, 30);
            for (let k = 0; k < scanCount; k++) {
                const f = gameState.foods[(Math.random() * gameState.foods.length) | 0];
                if (!f) continue;
                const d2 = dist2(b.x, b.y, f.x, f.y);
                if (d2 < bestD2) { bestD2 = d2; bestFood = f; }
            }
            if (bestFood) ai.targetFoodId = bestFood.id;
        }

        let targetX = b.x + Math.cos(b.ang) * 100;
        let targetY = b.y + Math.sin(b.ang) * 100;

        const targetFood = gameState.foods.find(f => f.id === ai.targetFoodId);
        if (targetFood) {
            targetX = targetFood.x;
            targetY = targetFood.y;
        }

        const margin = 400;
        if (b.x < margin) targetX = b.x + 1000;
        if (b.x > world.w - margin) targetX = b.x - 1000;
        if (b.y < margin) targetY = b.y + 1000;
        if (b.y > world.h - margin) targetY = b.y - 1000;

        const desiredAng = Math.atan2(targetY - b.y, targetX - b.x);
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
            const dx = seg.x - prev.x;
            const dy = seg.y - prev.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
            if (d > b.segDist) {
                const t = (d - b.segDist) / d;
                seg.x -= dx * t;
                seg.y -= dy * t;
            }
        }

        const eatDist2 = (b.baseRadius * 1.5) * (b.baseRadius * 1.5);
        for (let i = gameState.foods.length - 1; i >= 0; i--) {
            const f = gameState.foods[i];
            if (dist2(b.x, b.y, f.x, f.y) < eatDist2) {
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

        // Server-side Collision
        if (b.x < 0 || b.x > world.w || b.y < 0 || b.y > world.h) {
            b.dead = true;
            io.emit('playerKilled', { victimId: b.id });
            return;
        }

        const allSnakes = [...Array.from(gameState.players.values()), ...bots];
        for (const other of allSnakes) {
            if (other.dead) continue;
            const isSelf = other.id === b.id;

            for (let i = 0; i < (other.segments || []).length; i++) {
                if (isSelf && i < 15) continue; // Skip own head + some body
                const seg = other.segments[i];
                if (!seg) continue;
                const otherR = seg.r || 10;
                const collDist = (b.baseRadius * 0.65 + otherR * 0.65);
                if (dist2(b.x, b.y, seg.x, seg.y) < collDist * collDist) {
                    b.dead = true;
                    io.emit('playerKilled', { victimId: b.id, killerId: other.id });
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
    } catch (e) {
        console.error("Bot update error:", e);
    }
}, 50);

spawnFood();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.emit('init', {
        id: socket.id,
        foods: gameState.foods,
        players: Array.from(gameState.players.values()),
        bots: bots
    });

    socket.on('join', (data) => {
        const player = {
            id: socket.id,
            name: data.name || "Anonim",
            x: rand(500, world.w - 500),
            y: rand(500, world.h - 500),
            hue: rand(0, 360),
            score: 0,
            targetLen: 10,
            dead: false,
            baseRadius: 12,
            segments: []
        };
        for (let k = 0; k < 10; k++) player.segments.push({ x: player.x, y: player.y, r: 10.8 });
        gameState.players.set(socket.id, player);
        io.emit('playerJoined', player);
    });

    socket.on('update', (data) => {
        const player = gameState.players.get(socket.id);
        if (player && !player.dead) {
            Object.assign(player, data);
            socket.broadcast.emit('playerUpdate', player);
        }
    });

    socket.on('eat', (foodId) => {
        const idx = gameState.foods.findIndex(f => f.id === foodId);
        if (idx !== -1) {
            const food = gameState.foods[idx];
            gameState.foods.splice(idx, 1);
            removeFoodFromGrid(food);
            io.emit('foodEaten', { foodId, playerId: socket.id });
            spawnFood(1);
            io.emit('foodSpawned', gameState.foods[gameState.foods.length - 1]);
        }
    });

    socket.on('kill', (data) => {
        const player = gameState.players.get(socket.id);
        if (player) {
            player.dead = true;
            io.emit('playerKilled', { victimId: socket.id, killerId: data?.killerId });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        gameState.players.delete(socket.id);
        io.emit('playerLeft', socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
