import { MaterialSurface, Vector3D } from '../../shared/types';
import { useSettingsStore } from '../settings/settingsStore';

class TacticalSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    const { audio } = useSettingsStore.getState();
    if (this.masterGain) {
      const muted = audio.muteWhenUnfocused && typeof document !== 'undefined' && document.hidden;
      const target = muted ? 0 : audio.masterVolume;
      if (Math.abs(this.masterGain.gain.value - target) > 0.001) {
        this.masterGain.gain.value = target;
      }
    }
    return this.ctx;
  }

  public updateListener(pos: Vector3D, yaw: number, pitch: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !ctx.listener) return;
    const fx = -Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * Math.cos(pitch);
    const listener = ctx.listener as unknown as AudioListener & {
      positionX?: AudioParam;
      positionY?: AudioParam;
      positionZ?: AudioParam;
      forwardX?: AudioParam;
      forwardY?: AudioParam;
      forwardZ?: AudioParam;
      upX?: AudioParam;
      upY?: AudioParam;
      upZ?: AudioParam;
      setPosition?: (x: number, y: number, z: number) => void;
      setOrientation?: (x: number, y: number, z: number, ux: number, uy: number, uz: number) => void;
    };
    try {
      if (listener.positionX) {
        listener.positionX.value = pos.x;
        listener.positionY!.value = pos.y;
        listener.positionZ!.value = pos.z;
        listener.forwardX!.value = fx;
        listener.forwardY!.value = fy;
        listener.forwardZ!.value = fz;
        listener.upX!.value = 0;
        listener.upY!.value = 1;
        listener.upZ!.value = 0;
      } else if (listener.setPosition) {
        listener.setPosition(pos.x, pos.y, pos.z);
        listener.setOrientation?.(fx, fy, fz, 0, 1, 0);
      }
    } catch {
      // Fallback for environments without full 3D listener params
    }
  }

  private createSpatialChain(
    sourcePos?: Vector3D,
    occluded = false,
    categoryGain = 1.0
  ): { input: AudioNode; ctx: AudioContext } | null {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return null;
    const { audio } = useSettingsStore.getState();

    const gain = ctx.createGain();
    gain.gain.value = categoryGain * audio.sfxVolume;

    let currentLast: AudioNode = gain;

    if (occluded && audio.soundOcclusion) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 950;
      currentLast.connect(filter);
      currentLast = filter;
    }

    if (sourcePos) {
      const panner = ctx.createPanner();
      panner.panningModel = audio.spatialHrtf ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 3.5;
      panner.maxDistance = 95;
      panner.rolloffFactor = 1.25;
      panner.positionX.value = sourcePos.x;
      panner.positionY.value = sourcePos.y;
      panner.positionZ.value = sourcePos.z;
      currentLast.connect(panner);
      currentLast = panner;
    }

    currentLast.connect(this.masterGain);
    return { input: gain, ctx };
  }

  public playUiSound(type: 'click' | 'hover' | 'buy' | 'error' | 'matchFound'): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const { audio } = useSettingsStore.getState();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);

    const vol = audio.uiVolume * 0.22;
    if (type === 'hover') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.03);
      gain.gain.setValueAtTime(vol * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.055);
      gain.gain.setValueAtTime(vol * 0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.065);
    } else if (type === 'buy') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(660, now + 0.05);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(vol * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.19);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.setValueAtTime(145, now + 0.08);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.19);
    } else if (type === 'matchFound') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.12);
      osc.frequency.setValueAtTime(1046.5, now + 0.24);
      gain.gain.setValueAtTime(vol * 1.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.56);
    }
  }

  public playWeaponFire(
    weaponCategory: string,
    suppressed = false,
    sourcePos?: Vector3D,
    occluded = false
  ): void {
    const { audio } = useSettingsStore.getState();
    const chain = this.createSpatialChain(sourcePos, occluded, audio.weaponVolume);
    if (!chain) return;
    const { ctx, input } = chain;
    const now = ctx.currentTime;

    // Noise burst for transient gunshot crack
    const duration = weaponCategory === 'Snipers' ? 0.38 : suppressed ? 0.09 : 0.18;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.pow(1 - i / bufferSize, suppressed ? 2.6 : 1.6);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = suppressed ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(
      suppressed ? 1400 : weaponCategory === 'Snipers' ? 2400 : weaponCategory === 'Shotguns' ? 1600 : 2800,
      now
    );

    const punchOsc = ctx.createOscillator();
    punchOsc.type = weaponCategory === 'Snipers' ? 'sawtooth' : 'triangle';
    const baseFreq =
      weaponCategory === 'Snipers'
        ? 95
        : weaponCategory === 'Shotguns'
        ? 110
        : weaponCategory === 'Rifles'
        ? 145
        : 185;
    punchOsc.frequency.setValueAtTime(suppressed ? baseFreq * 1.4 : baseFreq, now);
    punchOsc.frequency.exponentialRampToValueAtTime(35, now + duration);

    const shotGain = ctx.createGain();
    shotGain.gain.setValueAtTime(suppressed ? 0.28 : 0.55, now);
    shotGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(shotGain);
    punchOsc.connect(shotGain);
    shotGain.connect(input);

    noise.start(now);
    punchOsc.start(now);
    punchOsc.stop(now + duration);
  }

  public playReload(): void {
    const chain = this.createSpatialChain(undefined, false, 0.45);
    if (!chain) return;
    const { ctx, input } = chain;
    const now = ctx.currentTime;

    // Two-stage metallic magazine click
    [0, 0.32].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(idx === 0 ? 340 : 520, now + offset);
      osc.frequency.exponentialRampToValueAtTime(idx === 0 ? 190 : 780, now + offset + 0.06);
      gain.gain.setValueAtTime(0.25, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
      osc.connect(gain);
      gain.connect(input);
      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
    });
  }

  public playFootstep(surface: MaterialSurface = 'concrete', sourcePos?: Vector3D, occluded = false): void {
    const { audio } = useSettingsStore.getState();
    const chain = this.createSpatialChain(sourcePos, occluded, 0.22 * audio.footstepBoost);
    if (!chain) return;
    const { ctx, input } = chain;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = surface === 'metal' ? 'triangle' : surface === 'wood' ? 'sawtooth' : 'sine';
    const freq =
      surface === 'metal' ? 240 : surface === 'wood' ? 140 : surface === 'water' ? 320 : 115;
    osc.frequency.setValueAtTime(freq + (Math.random() * 24 - 12), now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.065);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(input);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playHitFeedback(isHeadshot: boolean): void {
    const chain = this.createSpatialChain(undefined, false, 0.65);
    if (!chain) return;
    const { ctx, input } = chain;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isHeadshot ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isHeadshot ? 1480 : 420, now);
    osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 2150 : 220, now + (isHeadshot ? 0.09 : 0.05));

    gain.gain.setValueAtTime(isHeadshot ? 0.5 : 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isHeadshot ? 0.1 : 0.06));

    osc.connect(gain);
    gain.connect(input);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playGrenadeEffect(
    type: 'smoke' | 'flash' | 'he' | 'incendiary' | 'decoy' | 'bounce',
    sourcePos?: Vector3D
  ): void {
    const chain = this.createSpatialChain(sourcePos, false, 0.6);
    if (!chain) return;
    const { ctx, input } = chain;
    const now = ctx.currentTime;

    if (type === 'bounce') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(290, now + 0.045);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(input);
      osc.start(now);
      osc.stop(now + 0.055);
      return;
    }

    const duration = type === 'he' ? 0.55 : type === 'smoke' ? 0.45 : 0.3;
    const bufSize = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, type === 'smoke' ? 0.8 : 1.5);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = type === 'smoke' ? 'bandpass' : 'lowpass';
    filter.frequency.value = type === 'he' ? 520 : type === 'smoke' ? 1800 : 2400;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(type === 'he' ? 0.8 : 0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(input);
    src.start(now);
  }

  public playBombBeep(urgencyFactor = 1.0, sourcePos?: Vector3D): void {
    const chain = this.createSpatialChain(sourcePos, false, 0.5);
    if (!chain) return;
    const { ctx, input } = chain;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880 + urgencyFactor * 320, now);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(input);
    osc.start(now);
    osc.stop(now + 0.08);
  }
}

export const soundEngine = new TacticalSoundEngine();
