import { state, killFeedEl, lbListEl, lbYouEl, scoreEl, highScoreEl, lenEl, botsEl, energyEl, deadOverlay, startOverlay } from './store.js';

export const ui = {
    hideStartMenu() {
        if (startOverlay) startOverlay.style.display = "none";
    },
    // Kill Feed Display
    addKillMessage(killerName, victimName) {
        if (!killFeedEl) return;

        const div = document.createElement("div");
        div.className = "kill-msg";
        div.innerHTML = `<span>${killerName}</span> <b style="color:#aaa">öldürdü</b> <span class="victim">${victimName}</span>`;
        killFeedEl.appendChild(div);

        // Limit messages
        if (killFeedEl.children.length > 5) {
            killFeedEl.removeChild(killFeedEl.firstChild);
        }

        // Fade out
        setTimeout(() => {
            div.style.opacity = "0";
            setTimeout(() => div.remove(), 500);
        }, 4000);
    },

    // HUD Updates
    updateHUD() {
        if (!state.player) return;
        scoreEl.innerText = Math.floor(state.player.score).toLocaleString();
        lenEl.innerText = state.player.targetLen.toFixed(1);

        // High Score logic
        let savedHighScore = localStorage.getItem("snake_high_score") || 0;
        if (state.player.score > savedHighScore) {
            savedHighScore = Math.floor(state.player.score);
            localStorage.setItem("snake_high_score", savedHighScore);
        }
        if (highScoreEl) highScoreEl.innerText = savedHighScore;

        const eVal = Math.max(0, state.player.boostTimer).toFixed(1);
        energyEl.innerText = eVal + "s";

        // Visual alert for low energy
        if (state.player.boostTimer < 2.0) energyEl.style.color = "#ff3366";
        else energyEl.style.color = "#00ff88";
    },

    // Leaderboard Updates
    updateLeaderboard() {
        // Sort snakes by targetLen
        // Use a default value of 0 if targetLen is missing
        const sorted = [...state.snakes].sort((a, b) => (b.targetLen || 0) - (a.targetLen || 0));
        const top10 = sorted.slice(0, 10);

        let html = "";
        top10.forEach((s, i) => {
            // Check for isPlayer or if it corresponds to our local player
            const isMe = s.isPlayer || (state.player && s.id === state.player.id);
            const cls = isMe ? 'class="me"' : '';
            const displayName = s.name || "Adsız Yılan";
            const displayScore = Math.floor(s.targetLen || 10);

            html += `<li ${cls}>${i + 1}. ${displayName} - ${displayScore}</li>`;
        });
        lbListEl.innerHTML = html;

        // Player rank
        if (state.player) {
            const rank = sorted.findIndex(s => s.id === state.player.id) + 1;
            lbYouEl.innerHTML = `Sıralaman: <b style="color:#00ff88; font-size:1.1em;">#${rank || '?'}</b>`;
        }
    },

    showDeadScreen() {
        deadOverlay.style.display = "grid";
    },

    hideDeadScreen() {
        deadOverlay.style.display = "none";
    }
};
