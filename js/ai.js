import { rand, dist2, norm, hypot, wrapAngle, clamp } from './utils.js';
import { state } from './store.js';
import { world } from './constants.js';

export function botThink(b, dt) {
    const ai = b.ai;
    if (!ai) return;
    ai.retargetT -= dt;
    ai.boostT -= dt;
    ai.pokeCooldown -= dt;
    if (ai.pokeT > 0) ai.pokeT -= dt;
    const head = b.segments[0];
    let threat = null;
    let threatD2 = Infinity;

    // Snakes and Foods from state
    const snakes = state.snakes;
    const foods = state.foods;
    const player = state.player;

    for (const s of snakes) {
        if (s === b || s.dead) continue;
        const sh = s.segments[0];
        const d2 = dist2(head.x, head.y, sh.x, sh.y);
        const bigger = (s.segments.length > b.segments.length + 6);
        if (bigger && d2 < (360 * 360) && d2 < threatD2) {
            threat = s; threatD2 = d2;
        }
    }

    // getFoodsNear helper local or imported. 
    // Since getFoodsNear needs the grid which is in state... 
    // We should probably move getFoodsNear to utils or physics or pass it in.
    // For now, let's assume we can access it via a module or recreate it.
    // Recreating logic for now to avoid circular deps with physics.

    // Wait, getFoodsNear logic:
    const getFoodsNear = (x, y, radius) => {
        const FOOD_CELL = 120;
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
    };

    if (ai.retargetT <= 0 || ai.targetFoodIndex < 0 || ai.targetFoodIndex >= foods.length) {
        ai.retargetT = rand(0.20, 0.45);
        let bestFood = null, bestScore = Infinity;
        const nearby = getFoodsNear(head.x, head.y, 420);
        const pool = nearby.length >= 5 ? nearby : foods;
        const scan = Math.min(80, pool.length);
        for (let k = 0; k < scan; k++) {
            const f = pool[(Math.random() * pool.length) | 0];
            const d2 = dist2(head.x, head.y, f.x, f.y);
            const sc = d2 - (f.val * 120);
            if (sc < bestScore) { bestScore = sc; bestFood = f; }
        }
        ai.targetFoodIndex = bestFood ? foods.indexOf(bestFood) : -1;
    }
    let tx = head.x, ty = head.y;
    const persona = b.personality;
    if (threat) {
        const th = threat.segments[0];
        const away = norm(head.x - th.x, head.y - th.y);
        tx = head.x + away.x * (persona === "Korkak" ? 650 : 520);
        ty = head.y + away.y * (persona === "Korkak" ? 650 : 520);
        const prob = persona === "Korkak" ? 0.75 : 0.45;
        if (threatD2 < (210 * 210) && ai.boostT <= 0 && Math.random() < prob) {
            ai.boostT = rand(0.20, 0.38);
        }
    } else {
        if (persona === "Katil" && player && !player.dead && b.segments.length > 12) {
            const ph = player.segments[0];
            const d2p = dist2(head.x, head.y, ph.x, ph.y);
            if (d2p < (520 * 520) && ai.pokeCooldown <= 0 && Math.random() < 0.55) {
                const pv = hypot(player.vx, player.vy);
                const pang = pv > 8 ? Math.atan2(player.vy, player.vx) : player.ang;
                const fwd = { x: Math.cos(pang), y: Math.sin(pang) };
                const side = (Math.random() < 0.5 ? -1 : 1);
                const sideVec = { x: -fwd.y * side, y: fwd.x * side };
                tx = ph.x + fwd.x * rand(220, 330) + sideVec.x * rand(80, 150);
                ty = ph.y + fwd.y * rand(220, 330) + sideVec.y * rand(80, 150);
                ai.pokeT = rand(0.45, 0.75);
                ai.pokeCooldown = rand(2.6, 5.2);
                if (ai.boostT <= 0 && Math.random() < 0.18) {
                    ai.boostT = rand(0.14, 0.24);
                }
            }
        }
        if (ai.pokeT <= 0) {
            const f = foods[ai.targetFoodIndex];
            if (f) {
                tx = f.x; ty = f.y;
                if (persona === "Toplayıcı") {
                    const d2 = dist2(head.x, head.y, tx, ty);
                    if (d2 > (1200 * 1200) && ai.boostT <= 0 && Math.random() < 0.012) {
                        ai.boostT = rand(0.12, 0.20);
                    }
                }
                if (persona === "Korkak" && player && !player.dead) {
                    const ph = player.segments[0];
                    const dp = dist2(head.x, head.y, ph.x, ph.y);
                    if (dp < (420 * 420)) {
                        const away = norm(head.x - ph.x, head.y - ph.y);
                        tx = head.x + away.x * 520;
                        ty = head.y + away.y * 520;
                    }
                }
            }
        }
    }
    const margin = 210;
    if (head.x < margin) tx = head.x + 520;
    if (head.x > world.w - margin) tx = head.x - 520;
    if (head.y < margin) ty = head.y + 520;
    if (head.y > world.h - margin) ty = head.y - 520;
    const desiredAng = Math.atan2(ty - head.y, tx - head.x);
    let da = wrapAngle(desiredAng - b.ang);
    const dClose = hypot(tx - head.x, ty - head.y);
    const turnScale = dClose < 220 ? 1.7 : (dClose < 420 ? 1.3 : 1.0);
    b.ang += clamp(da, -b.turnAssist * turnScale * dt, b.turnAssist * turnScale * dt);
    b._wantsBoost = ai.boostT > 0;
}
