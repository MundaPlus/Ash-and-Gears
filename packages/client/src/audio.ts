/**
 * Procedural audio with the Web Audio API (spec 09). No files: everything is synthesized.
 * Music adapts to the situation (calm, tense, combat, night) and to the tech tier
 * (tier 0-1: dusty western / folk; tier 2+: folk with dark ambient synth pads).
 * Audio starts only after the first click or key press (browser autoplay rules).
 */

export type Mood = "calm" | "night" | "tense" | "combat";

/** A-minor pentatonic over two octaves (Hz). Fits western, folk and dark ambient alike. */
const SCALE = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25];
/** Chord roots for the calm progression: Am - G - F - E (as scale-ish frequencies). */
const PROGRESSION = [110, 98, 87.31, 82.41];
const BEAT = 0.42; // seconds per beat (about 140 bpm in eighths)

export class Audio {
  private ctx: AudioContext | null = null;
  private music!: GainNode;
  private sfx!: GainNode;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private nextBeat = 0;
  private beat = 0;
  private droneNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  mood: Mood = "calm";
  tier = 0;
  /** In-game day, to alternate calm tracks. */
  day = 1;
  /** Generated music tracks (YuE2 via ComfyUI), by id. Missing ones fall back to the synthesizer. */
  private tracks = new Map<string, AudioBuffer>();
  private playing: { id: string; src: AudioBufferSourceNode; gain: GainNode; started: number } | null = null;
  volume = { music: 0.6, sfx: 0.7 };
  private lastSfx = new Map<string, number>();

  /** Call from a user gesture. Safe to call many times. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.applyVolume();
    // One second of white noise for drums, wind and Geiger clicks.
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextBeat = this.ctx.currentTime + 0.2;
    void this.loadTracks();
  }

  /** Load the generated tracks that exist on the server. */
  private async loadTracks() {
    const ids = ["calm_western", "calm_folk", "calm_tech", "night_ambient", "tense", "combat"];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`music/${id}.mp3`);
          if (!r.ok) return;
          this.tracks.set(id, await this.ctx!.decodeAudioData(await r.arrayBuffer()));
        } catch {
          // No file or no decoder: the synthesizer covers this mood.
        }
      }),
    );
  }

  /** Which generated track fits the moment, or null to use the synthesizer. */
  private pickTrack(): string | null {
    const want =
      this.mood === "combat" ? "combat" : this.mood === "tense" ? "tense" : this.mood === "night" ? "night_ambient" : this.tier >= 2 ? "calm_tech" : this.day % 2 ? "calm_western" : "calm_folk";
    if (this.tracks.has(want)) return want;
    // Calm moods can borrow the other calm track.
    for (const alt of ["calm_western", "calm_folk", "calm_tech"]) if (this.mood === "calm" && this.tracks.has(alt)) return alt;
    return null;
  }

  /** Crossfade to a generated track (or stop it with null). Tracks loop by crossfading into themselves. */
  private crossfade(id: string | null) {
    const c = this.ctx!;
    const p = this.playing;
    const nearEnd = p && c.currentTime > p.started + p.src.buffer!.duration - 3.5;
    if (p?.id === id && !nearEnd) return;
    if (this.playing) {
      const old = this.playing;
      old.gain.gain.setTargetAtTime(0.0001, c.currentTime, 1);
      old.src.stop(c.currentTime + 4);
      this.playing = null;
    }
    if (!id) return;
    const src = c.createBufferSource();
    src.buffer = this.tracks.get(id)!;
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.8, c.currentTime, 1);
    src.connect(gain).connect(this.music);
    src.start();
    this.playing = { id, src, gain, started: c.currentTime };
  }

  setVolume(kind: "music" | "sfx", v: number): void {
    this.volume[kind] = v;
    this.applyVolume();
  }

  private applyVolume() {
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(this.volume.music * 0.5, this.ctx.currentTime, 0.1);
    this.sfx.gain.setTargetAtTime(this.volume.sfx, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- instruments

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** Plucked string: a bright triangle with a fast decay through a closing filter. */
  private pluck(freq: number, t: number, vol = 0.18, slide = 0) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + 0.25);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.6);
    const g = c.createGain();
    this.env(g, t, vol, 0.005, 0.9);
    o.connect(f).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 1);
  }

  /** Harmonica-ish reed: square wave with vibrato, soft attack. */
  private reed(freq: number, t: number, dur: number, vol = 0.05) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = c.createGain();
    lg.gain.value = freq * 0.012;
    lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.12);
    g.gain.setValueAtTime(vol, t + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.music);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  private kick(t: number, vol = 0.5) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = c.createGain();
    this.env(g, t, vol, 0.002, 0.25);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.3);
  }

  private hat(t: number, vol = 0.08, dur = 0.05, dest?: AudioNode) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6000;
    const g = c.createGain();
    this.env(g, t, vol, 0.001, dur);
    s.connect(f).connect(g).connect(dest ?? this.music);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private snare(t: number, vol = 0.18) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1800;
    const g = c.createGain();
    this.env(g, t, vol, 0.002, 0.16);
    s.connect(f).connect(g).connect(this.music);
    s.start(t, Math.random() * 0.5, 0.2);
  }

  /** A dark synth drone: two detuned saws through a slow filter. Fades between moods. */
  private setDrone(on: boolean, root = 55) {
    const c = this.ctx!;
    if (on && !this.droneNodes) {
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 420;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.07;
      const lg = c.createGain();
      lg.gain.value = 220;
      lfo.connect(lg).connect(f.frequency);
      const osc = [root, root * 1.006, root * 1.5].map((fr) => {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = fr;
        o.connect(f);
        o.start();
        return o;
      });
      lfo.start();
      osc.push(lfo);
      f.connect(gain).connect(this.music);
      gain.gain.exponentialRampToValueAtTime(0.09, c.currentTime + 3);
      this.droneNodes = { osc, gain };
    } else if (!on && this.droneNodes) {
      const d = this.droneNodes;
      d.gain.gain.cancelScheduledValues(c.currentTime);
      d.gain.gain.setTargetAtTime(0.0001, c.currentTime, 1);
      for (const o of d.osc) o.stop(c.currentTime + 4);
      this.droneNodes = null;
    }
  }

  // ---------------------------------------------------------------- music scheduler

  /** Call every frame. Schedules notes a little ahead of time. */
  update(): void {
    const c = this.ctx;
    if (!c || c.state !== "running") return;
    const track = this.pickTrack();
    this.crossfade(track);
    if (track) {
      // A generated track is playing: keep the synthesizer quiet.
      this.setDrone(false);
      this.nextBeat = c.currentTime + 0.25;
      return;
    }
    const dark = this.mood === "tense" || this.mood === "combat" || this.mood === "night" || this.tier >= 2;
    this.setDrone(dark);
    while (this.nextBeat < c.currentTime + 0.25) {
      this.playBeat(this.beat, this.nextBeat);
      this.beat++;
      this.nextBeat += BEAT;
    }
  }

  private playBeat(b: number, t: number) {
    const bar = Math.floor(b / 8);
    const root = PROGRESSION[bar % PROGRESSION.length];
    const step = b % 8;
    const r = Math.random();
    switch (this.mood) {
      case "calm":
      case "night": {
        // Western/folk picking: bass on 0 and 4, arpeggio in between, a slide now and then.
        const vol = this.mood === "night" ? 0.1 : 0.16;
        if (step === 0 || step === 4) this.pluck(root, t, vol * 1.2);
        else if (r < 0.7) this.pluck(SCALE[(step * 2 + bar) % 8 + 3], t, vol, r < 0.08 ? 1.06 : 0);
        // A harmonica phrase every few bars in the day; synth pads take that role from tier 2.
        if (this.mood === "calm" && step === 0 && bar % 4 === 2 && this.tier < 3) this.reed(SCALE[7 + (bar % 3)], t, BEAT * 3);
        break;
      }
      case "tense":
        if (step === 0) this.pluck(55, t, 0.2);
        if (step % 2 === 0) this.hat(t, 0.04);
        if (step === 6 && r < 0.5) this.pluck(SCALE[4], t, 0.08, 0.94);
        break;
      case "combat":
        if (step % 4 === 0) this.kick(t);
        if (step % 4 === 2) this.snare(t);
        this.hat(t, 0.06);
        if (step === 0 || step === 3 || step === 6) this.pluck(root / 2, t, 0.22);
        break;
    }
  }

  // ---------------------------------------------------------------- sound effects

  /** Play a sound effect; `pan` -1..1, `vol` 0..1 (distance falloff is done by the caller). */
  play(name: "shot" | "turret" | "hit" | "melee" | "hammer" | "pick" | "click" | "alert" | "bad" | "geiger" | "done", vol = 1, pan = 0): void {
    const c = this.ctx;
    if (!c || c.state !== "running" || vol <= 0.02) return;
    // Do not stack the same sound many times in one moment.
    const last = this.lastSfx.get(name) ?? 0;
    if (c.currentTime - last < (name === "geiger" ? 0.03 : 0.06)) return;
    this.lastSfx.set(name, c.currentTime);
    const t = c.currentTime;
    const out = c.createStereoPanner();
    out.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(this.sfx);
    const g = c.createGain();
    g.connect(out);
    const noise = (filter: BiquadFilterType, freq: number, dur: number, peak: number) => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = filter;
      f.frequency.value = freq;
      const ng = c.createGain();
      this.env(ng, t, peak * vol, 0.001, dur);
      s.connect(f).connect(ng).connect(out);
      s.start(t, Math.random() * 0.5, dur + 0.05);
    };
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, peak: number, at = 0) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dur);
      const og = c.createGain();
      og.gain.setValueAtTime(0.0001, t + at);
      og.gain.exponentialRampToValueAtTime(peak * vol, t + at + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(og).connect(out);
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    };
    switch (name) {
      case "shot":
        noise("lowpass", 2400, 0.18, 0.5);
        tone("square", 220, 60, 0.12, 0.15);
        break;
      case "turret":
        noise("bandpass", 1500, 0.1, 0.4);
        tone("square", 330, 90, 0.08, 0.12);
        break;
      case "hit":
        tone("sine", 160, 60, 0.12, 0.4);
        noise("lowpass", 800, 0.08, 0.25);
        break;
      case "melee":
        noise("bandpass", 900, 0.09, 0.4);
        break;
      case "hammer":
        tone("triangle", 900, 400, 0.06, 0.18);
        noise("highpass", 3000, 0.04, 0.12);
        break;
      case "pick":
        tone("square", 1300, 1100, 0.05, 0.1);
        noise("bandpass", 2500, 0.05, 0.2);
        break;
      case "click":
        tone("sine", 1200, 900, 0.04, 0.12);
        break;
      case "alert":
        tone("triangle", 660, 660, 0.14, 0.25);
        tone("triangle", 880, 880, 0.18, 0.25, 0.15);
        break;
      case "bad":
        tone("sawtooth", 330, 300, 0.25, 0.15);
        tone("sawtooth", 247, 220, 0.4, 0.15, 0.22);
        break;
      case "geiger":
        noise("highpass", 4000, 0.008, 0.35);
        break;
      case "done":
        tone("triangle", 523, 523, 0.12, 0.2);
        tone("triangle", 659, 659, 0.12, 0.2, 0.1);
        tone("triangle", 784, 784, 0.25, 0.2, 0.2);
        break;
    }
  }
}
