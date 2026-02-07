import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { world, MAX_FOODS, FOOD_CELL } from './js/constants.js';
import { rand, clamp } from './js/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

app.use(express.static('.'));

const gameState = {
    players: new Map(),
    foods: []
};

// Initialize foods
function addFoodToGrid(f) {
    const cx = Math.floor(f.x / FOOD_CELL);
    const cy = Math.floor(f.y / FOOD_CELL);
    f._cellKey = `${cx},${cy}`;
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

spawnFood();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send initial state
    socket.emit('init', {
        id: socket.id,
        foods: gameState.foods,
        players: Array.from(gameState.players.values())
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
            segments: [] // Will be managed by client for now, server just relays
        };
        gameState.players.set(socket.id, player);
        io.emit('playerJoined', player);
    });

    socket.on('update', (data) => {
        const player = gameState.players.get(socket.id);
        if (player && !player.dead) {
            Object.assign(player, data); // x, y, ang, segments, score, targetLen etc.
            socket.broadcast.emit('playerUpdate', player);
        }
    });

    socket.on('eat', (foodId) => {
        const idx = gameState.foods.findIndex(f => f.id === foodId);
        if (idx !== -1) {
            const food = gameState.foods[idx];
            gameState.foods.splice(idx, 1);
            io.emit('foodEaten', { foodId, playerId: socket.id });

            // Respawn one food
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
            io.emit('foodSpawned', f);
        }
    });

    socket.on('kill', (data) => {
        // data: { killerId }
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
