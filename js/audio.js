export const audio = {
    unlocked: false,
    ctx: null,
    master: null,
    unlock() {
        try {
            this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.16;
            this.master.connect(this.ctx.destination);
            this.unlocked = true;
        } catch (_) { }
    },
    beep(freq, dur, type = "sine", gain = 0.6) {
        if (!this.unlocked || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(this.master);
        o.start(t0); o.stop(t0 + dur + 0.02);
    }
};
