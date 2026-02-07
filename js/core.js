import { state, deadOverlay } from './store.js';
import { world, FOOD_CELL, MAX_FOODS, MAX_PARTICLES, BOT_NAMES, PERSONALITIES, BOT_COUNT } from './constants.js';
import { rand, clamp, dist2, hypot, norm } from './utils.js';
import { audio } from './audio.js';
import { ui } from './ui.js';

// Grid helpers
export function addFoodToGrid(f) {
    const cx = Math.floor(f.x / FOOD_CELL);
    const cy = Math.floor(f.y / FOOD_CELL);
    f._cellKey = `${cx},${cy}`;
    if (!state.foodGrid.has(f._cellKey)) state.foodGrid.set(f._cellKey, []);
    state.foodGrid.get(f._cellKey).push(f);
}
export function removeFoodFromGrid(f) {
    const list = state.foodGrid.get(f._cellKey);
    if (!list) return;
    const idx = list.indexOf(f);
    if (idx !== -1) list.splice(idx, 1);
}
function getFoodsNear(x, y, radius) {
    const cellRadius = Math.ceil(radius / FOOD_CELL);
    const cx0 = Math.floor(x / FOOD_CELL);
    const cy0 = Math.floor(y / FOOD_CELL);
    const out = [];
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        for (let dy = -cellRadius; dy <= cellRadius; dy++) {
            const list = state.foodGrid.get(`${cx0 + dx},${cy0 + dy}`);
            if (list) for (const f of list) out.push(f);
        }
    }
    return out;
}

export function spawnFood(n = MAX_FOODS) {
    for (let i = 0; i < n; i++) {
        const sizeT = Math.random();
        const f = {
            x: Math.random() * world.w,
            y: Math.random() * world.h,
            r: 4 + sizeT * 4, // 4 to 8
            hue: rand(0, 360),
            val: (1 + sizeT * 1) * 0.40, // Reduced by 60% to prevent instant growth
            ownerId: null,
            lockT: 0,
            isDrop: false
        };
        state.foods.push(f);
        addFoodToGrid(f);
    }
}

export function spawnParticles(x, y, count, hue) {
    for (let i = 0; i < count; i++) {
        if (state.particles.length >= MAX_PARTICLES) break;
        const a = rand(0, Math.PI * 2);
        const sp = rand(40, 240);
        state.particles.push({
            x, y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: rand(0.35, 0.9),
            r: rand(1.5, 3.5),
            hue: hue + rand(-12, 12)
        });
    }
}

function pickPersonality() {
    const r = Math.random();
    let acc = 0;
    for (const p of PERSONALITIES) {
        acc += p.w;
        if (r <= acc) return p.key;
    }
    return "Toplayıcı";
}

export function makeSnake(opts) {
    const s = {
        id: opts.id ?? Math.random().toString(16).slice(2),
        name: opts.name ?? "Sen",
        personality: opts.personality ?? "Player",
        isPlayer: !!opts.isPlayer,
        dead: false,
        respawnTimer: 0,
        x: opts.x ?? world.w / 2,
        y: opts.y ?? world.h / 2,
        vx: 0, vy: 0,
        ang: rand(-Math.PI, Math.PI),
        baseSpeed: opts.baseSpeed ?? 190,
        boostSpeed: opts.boostSpeed ?? 350,
        accel: opts.accel ?? 1500,
        turnAssist: opts.turnAssist ?? 6.8,
        friction: opts.friction ?? 0.03,
        segDist: opts.segDist ?? 9.5,
        baseRadius: opts.baseRadius ?? 12,
        hue: opts.hue ?? rand(0, 360),
        score: 0,
        targetLen: opts.targetLen ?? 10,
        segments: [],
        boostDrainLenPerSec: opts.boostDrainLenPerSec ?? 0.55,
        boostDropInterval: opts.boostDropInterval ?? 0.12,
        _boostDropT: 0,
        ai: opts.ai ?? null,
        _wantsBoost: false,
        boostTimer: opts.boostTimer ?? 10,
        maxBoostTimer: opts.maxBoostTimer ?? 10
    };
    s.segments.length = 0;
    for (let i = 0; i < Math.floor(s.targetLen); i++) {
        s.segments.push({ x: s.x - i * s.segDist, y: s.y, r: s.baseRadius * 0.9 });
    }
    const iv = s.baseSpeed * 0.7;
    s.vx = Math.cos(s.ang) * iv;
    s.vy = Math.sin(s.ang) * iv;
    return s;
}

export function makeBot(i) {
    const name = BOT_NAMES[i % BOT_NAMES.length] + " " + (i + 1);
    const personality = pickPersonality();
    const base = rand(155, 180);
    const b = makeSnake({
        isPlayer: false,
        name,
        personality,
        x: rand(250, world.w - 250),
        y: rand(250, world.h - 250),
        hue: rand(0, 360),
        baseSpeed: base,
        boostSpeed: base + rand(25, 45),
        accel: rand(1200, 1450),
        turnAssist: rand(6.0, 7.2),
        friction: rand(0.03, 0.045),
        targetLen: rand(9, 16),
        boostDrainLenPerSec: rand(0.85, 1.10),
        boostDropInterval: rand(0.14, 0.20),
        ai: {
            targetFoodIndex: -1,
            retargetT: 0,
            boostT: 0,
            pokeCooldown: rand(2.4, 5.0),
            pokeT: 0,
        }
    });
    return b;
}

export function respawnSnake(s) {
    s.dead = false;
    s.respawnTimer = 0;
    s.x = rand(350, world.w - 350);
    s.y = rand(350, world.h - 350);
    s.ang = rand(-Math.PI, Math.PI);
    s.score = 0;
    s.targetLen = s.isPlayer ? 10 : rand(9, 16);
    s._boostDropT = 0;
    s.segments.length = 0;
    for (let i = 0; i < Math.floor(s.targetLen); i++) {
        s.segments.push({ x: s.x - i * s.segDist, y: s.y, r: s.baseRadius * 0.9 });
    }
    const iv = s.baseSpeed * 0.7;
    s.vx = Math.cos(s.ang) * iv;
    s.vy = Math.sin(s.ang) * iv;
}

export function respawnPlayer() {
    respawnSnake(state.player);
    deadOverlay.style.display = "none";
}

function followSegments(s) {
    for (let i = 1; i < s.segments.length; i++) {
        const prev = s.segments[i - 1];
        const seg = s.segments[i];
        const dx = seg.x - prev.x, dy = seg.y - prev.y;
        const d = hypot(dx, dy);
        const need = s.segDist;
        if (d > need) {
            const t = (d - need) / d;
            seg.x -= dx * t;
            seg.y -= dy * t;
        }
        // Animate segment radius
        if (seg.r < s.baseRadius * 0.9) {
            seg.r += (s.baseRadius * 0.9 - seg.r) * 3 * 0.016; // Approx dt
            if (seg.r > s.baseRadius * 0.9) seg.r = s.baseRadius * 0.9;
        }
    }
}

export function grow(s) {
    const desired = Math.floor(s.targetLen);
    while (s.segments.length < desired) {
        const last = s.segments[s.segments.length - 1];
        // Start very small for animation
        s.segments.push({ x: last.x, y: last.y, r: 0.1 });
    }
    while (s.segments.length > desired && s.segments.length > 3) {
        s.segments.pop();
    }
}

function boostEconomy(s, dt, isBoosting) {
    if (!isBoosting) { s._boostDropT = 0; return; }
    s.targetLen -= s.boostDrainLenPerSec * dt;
    if (s.targetLen < 4.2) s.targetLen = 4.2;
    s._boostDropT += dt;
    if (s._boostDropT >= s.boostDropInterval) {
        s._boostDropT = 0;
        const tail = s.segments[s.segments.length - 1];
        if (tail) {
            const nf = {
                x: clamp(tail.x + rand(-6, 6), 0, world.w),
                y: clamp(tail.y + rand(-6, 6), 0, world.h),
                r: rand(3.0, 4.6),
                hue: s.hue + rand(-8, 8),
                val: rand(0.25, 0.45),
                ownerId: s.id,
                lockT: 1.8,
                isDrop: true
            };
            state.foods.push(nf);
            addFoodToGrid(nf);
        }
    }
}

export function eatFood(s) {
    const head = s.segments[0];
    const nearby = getFoodsNear(head.x, head.y, 80);
    for (const f of nearby) {
        const rr = (s.baseRadius * 0.9 + f.r);
        if (dist2(head.x, head.y, f.x, f.y) < rr * rr) {
            if (f.ownerId === s.id && f.lockT > 0) continue;

            // Notify server
            if (s.isPlayer) state.socket.emit('eat', f.id);

            removeFoodFromGrid(f);
            const i = state.foods.indexOf(f);
            if (i !== -1) state.foods.splice(i, 1);
            const points = Math.round(f.val * 5); // 1.0 -> 5 pts, 2.0 -> 10 pts
            s.score += points;
            const oldLen = s.targetLen;
            s.targetLen += points / 20; // 20 points = 1 segment
            if (s.isPlayer) console.log(`Yem: ${points} puan. Eski Uzunluk: ${oldLen.toFixed(2)} -> Yeni: ${s.targetLen.toFixed(2)}`);

            // New food will be spawned by server and received via socket 'foodSpawned'
            if (s.isPlayer) audio.beep(620, 0.06, "triangle", 0.22);
            break;
        }
    }
}

export function killSnake(s, killer = null) {
    if (s.dead) return;
    s.dead = true;

    // Kill Message
    if (killer) {
        ui.addKillMessage(killer.name, s.name);
    } else {
        // Self death or wall
        ui.addKillMessage("Duvar", s.name);
    }

    if (s.isPlayer) {
        state.socket.emit('kill', { killerId: killer ? killer.id : null });
    }

    for (let i = 0; i < s.segments.length; i++) {
        const seg = s.segments[i];
        if (i % 2 === 0) {
            const nf = {
                x: clamp(seg.x + rand(-10, 10), 0, world.w),
                y: clamp(seg.y + rand(-10, 10), 0, world.h),
                r: rand(4.2, 7.8),
                hue: s.hue + rand(-10, 10),
                val: rand(1.2, 2.8),
                ownerId: null,
                lockT: 0,
                isDrop: false
            };
            state.foods.push(nf);
            addFoodToGrid(nf);
        }
        if (i % 3 === 0) spawnParticles(seg.x, seg.y, 3, s.hue);
    }
    spawnParticles(s.x, s.y, 30, s.hue);
    state.cam.shakeX += rand(-6, 6);
    state.cam.shakeY += rand(-6, 6);
    if (s.isPlayer) {
        ui.showDeadScreen();
        audio.beep(140, 0.18, "sawtooth", 0.35);
        audio.beep(90, 0.22, "sine", 0.25);
    } else {
        s.respawnTimer = rand(1.2, 2.8);
        audio.beep(180, 0.10, "square", 0.18);
    }
}


export function checkCollision(s) {
    if (s.dead) return;
    const head = s.segments[0];
    if (head.x <= 0 || head.x >= world.w || head.y <= 0 || head.y >= world.h) {
        killSnake(s); return;
    }
    for (let i = 10; i < s.segments.length; i++) {
        const seg = s.segments[i];
        const rr = (s.baseRadius * 0.75 + seg.r * 0.65);
        if (dist2(head.x, head.y, seg.x, seg.y) < rr * rr) {
            killSnake(s); return;
        }
    }
    for (const o of state.snakes) {
        if (o === s || o.dead) continue;
        const oh = o.segments[0];
        const hh = (s.baseRadius * 0.92 + o.baseRadius * 0.92);
        if (dist2(head.x, head.y, oh.x, oh.y) < hh * hh) {
            if (s.segments.length > o.segments.length) killSnake(o, s);
            else if (s.segments.length < o.segments.length) killSnake(s, o);
            else { killSnake(s, o); killSnake(o, s); }
            return;
        }
        for (let i = 4; i < o.segments.length; i++) {
            const seg = o.segments[i];
            const rr = (s.baseRadius * 0.78 + seg.r * 0.70);
            if (dist2(head.x, head.y, seg.x, seg.y) < rr * rr) {
                killSnake(s, o); return;
            }
        }
    }
}

export function moveSnake(s, dt, wantsBoost) {
    const head = s.segments[0];
    const dx = Math.cos(s.ang);
    const dy = Math.sin(s.ang);
    const canBoost = s.targetLen > 5.2 && s.boostTimer > 0;
    const useBoost = wantsBoost && canBoost;

    // Boost Stamina Logic
    if (useBoost) {
        s.boostTimer -= dt;
        if (s.boostTimer < 0) s.boostTimer = 0;
    } else {
        s.boostTimer += dt * 0.5; // Recharge at half speed
        if (s.boostTimer > s.maxBoostTimer) s.boostTimer = s.maxBoostTimer;
    }

    const targetSpeed = useBoost ? s.boostSpeed : s.baseSpeed;
    const desiredVx = dx * targetSpeed;
    const desiredVy = dy * targetSpeed;
    let ax = (desiredVx - s.vx) * s.turnAssist;
    let ay = (desiredVy - s.vy) * s.turnAssist;
    const aMag = hypot(ax, ay);
    const maxA = s.accel;
    const k = Math.min(1, maxA / aMag);
    ax *= k; ay *= k;
    s.vx += ax * dt;
    s.vy += ay * dt;
    s.vx *= (1 - s.friction);
    s.vy *= (1 - s.friction);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    head.x = s.x;
    head.y = s.y;
    followSegments(s);
    boostEconomy(s, dt, useBoost);
    if (s.isPlayer && useBoost) {
        state.cam.shakeX += rand(-0.6, 0.6);
        state.cam.shakeY += rand(-0.6, 0.6);
    }
}

export function updateParticles(dt) {
    const particles = state.particles;
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.vx *= (1 - 0.10);
        p.vy *= (1 - 0.10);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
    }
}

export function initPhysics() {
    spawnFood(MAX_FOODS);

    state.player = makeSnake({
        isPlayer: true,
        name: state.playerName,
        personality: "Player",
        x: world.w / 2,
        y: world.h / 2,
        hue: 210,
        baseSpeed: 190,
        boostSpeed: 350,
        accel: 1500,
        turnAssist: 6.8,
        friction: 0.03,
        targetLen: 10,
        boostDrainLenPerSec: 0.85,
        boostDropInterval: 0.16
    });
    state.snakes.push(state.player);

    // for (let i = 0; i < BOT_COUNT; i++) state.snakes.push(makeBot(i));


}
