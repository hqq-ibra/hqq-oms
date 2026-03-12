class SoundManager {
  private ctx: AudioContext | null = null;
  private _enabled = true;
  private ready = false;

  setEnabled(v: boolean) {
    this._enabled = v;
  }

  unlock() {
    if (!this.ctx) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.ready = true;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol = 0.06,
  ) {
    if (!this._enabled || !this.ready || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + dur,
      );
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    } catch {
      /* swallow */
    }
  }

  woosh() {
    if (!this._enabled || !this.ready || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        200,
        this.ctx.currentTime + 0.15,
      );
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + 0.15,
      );
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch {
      /* swallow */
    }
  }

  plop() {
    this.tone(300, 0.12, 'sine', 0.08);
    setTimeout(() => this.tone(250, 0.08, 'sine', 0.06), 40);
  }

  chime() {
    this.tone(880, 0.3, 'sine', 0.06);
    setTimeout(() => this.tone(1100, 0.2, 'sine', 0.04), 100);
    setTimeout(() => this.tone(1320, 0.25, 'sine', 0.03), 200);
  }

  sparkle() {
    [0, 50, 100, 150].forEach((d, i) =>
      setTimeout(() => this.tone(800 + i * 200, 0.12, 'sine', 0.04), d),
    );
  }

  focus() {
    this.tone(220, 0.4, 'sine', 0.08);
    setTimeout(() => this.tone(165, 0.45, 'sine', 0.06), 100);
  }

  pop() {
    this.tone(500, 0.08, 'sine', 0.06);
  }
}

export const soundManager = new SoundManager();
