import { BindableAction, useSettingsStore, DEFAULT_KEYBINDS } from '../settings/settingsStore';

export interface RawMouseDelta {
  dx: number;
  dy: number;
}

export class InputManager {
  private keysDown = new Set<string>();
  private mouseButtonsDown = new Set<number>();
  private mouseDeltas: RawMouseDelta[] = [];
  private accumulatedDx = 0;
  private accumulatedDy = 0;
  private wheelAccum = 0;
  private pointerLocked = false;
  private canvas: HTMLElement | null = null;
  private boundActions: Map<string, BindableAction[]> = new Map();
  private justPressedKeys = new Set<string>();

  public onEscapeRequested: (() => void) | null = null;
  public onPointerLockChange: ((locked: boolean) => void) | null = null;

  constructor() {
    this.rebuildBindings();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', this.handleKeyDown, { passive: false });
      window.addEventListener('keyup', this.handleKeyUp);
      window.addEventListener('mousedown', this.handleMouseDown);
      window.addEventListener('mouseup', this.handleMouseUp);
      window.addEventListener('wheel', this.handleWheel, { passive: false });
      window.addEventListener('blur', this.handleBlur);
      document.addEventListener('pointerlockchange', this.handlePointerLockChange);
      document.addEventListener('mousemove', this.handleMouseMove);
      window.addEventListener('contextmenu', this.preventContextMenu);
    }
    useSettingsStore.subscribe(() => this.rebuildBindings());
  }

  public dispose(): void {
    if (typeof window === 'undefined' || typeof window.removeEventListener !== 'function') return;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('contextmenu', this.preventContextMenu);
  }

  public attachCanvas(canvas: HTMLElement): void {
    this.canvas = canvas;
  }

  public rebuildBindings(): void {
    const { keybinds } = useSettingsStore.getState();
    this.boundActions.clear();
    const entries = Object.entries(keybinds) as Array<[BindableAction, string]>;
    for (const [action, code] of entries) {
      const existing = this.boundActions.get(code) || [];
      existing.push(action);
      this.boundActions.set(code, existing);
    }
    // Ensure defaults present
    for (const [action, code] of Object.entries(DEFAULT_KEYBINDS) as Array<[BindableAction, string]>) {
      const list = this.boundActions.get(code) || [];
      if (!list.includes(action)) {
        list.push(action);
        this.boundActions.set(code, list);
      }
    }
  }

  private preventContextMenu = (e: Event) => {
    if (this.pointerLocked) e.preventDefault();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      this.onEscapeRequested?.();
      return;
    }
    if (this.pointerLocked) {
      e.preventDefault();
    }
    if (!this.keysDown.has(e.code)) {
      this.justPressedKeys.add(e.code);
    }
    this.keysDown.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code);
  };

  private handleMouseDown = (e: MouseEvent) => {
    this.mouseButtonsDown.add(e.button);
    const code = `Mouse${e.button}`;
    if (!this.justPressedKeys.has(code)) {
      this.justPressedKeys.add(code);
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    this.mouseButtonsDown.delete(e.button);
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.pointerLocked) e.preventDefault();
    if (e.deltaY > 0) {
      this.wheelAccum++;
      this.justPressedKeys.add('WheelDown');
    } else if (e.deltaY < 0) {
      this.wheelAccum--;
      this.justPressedKeys.add('WheelUp');
    }
  };

  private handleBlur = () => {
    this.keysDown.clear();
    this.mouseButtonsDown.clear();
    this.justPressedKeys.clear();
  };

  private handlePointerLockChange = () => {
    const locked = document.pointerLockElement === this.canvas;
    this.pointerLocked = locked;
    this.onPointerLockChange?.(locked);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    const { rawInput, mouseAcceleration, accelerationAmount } = useSettingsStore.getState().mouse;
    let dx = e.movementX;
    let dy = e.movementY;

    if (!rawInput) {
      dx = Math.round(dx * 0.85);
      dy = Math.round(dy * 0.85);
    }
    if (mouseAcceleration) {
      const speed = Math.hypot(dx, dy);
      const factor = 1 + (speed / 100) * accelerationAmount * 0.35;
      dx *= factor;
      dy *= factor;
    }
    this.accumulatedDx += dx;
    this.accumulatedDy += dy;
  };

  public requestPointerLock(): void {
    if (!this.canvas) return;
    const el = this.canvas as HTMLElement & { requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void };
    try {
      const res = el.requestPointerLock({ unadjustedMovement: true });
      if (res && typeof (res as Promise<void>).catch === 'function') {
        (res as Promise<void>).catch(() => {
          try {
            this.canvas?.requestPointerLock();
          } catch {
            // Pointer lock unsupported
          }
        });
      }
    } catch {
      try {
        this.canvas?.requestPointerLock();
      } catch {
        // Pointer lock unsupported
      }
    }
  }

  public exitPointerLock(): void {
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  public isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  public isActionDown(action: BindableAction): boolean {
    const { keybinds } = useSettingsStore.getState();
    const code = keybinds[action];
    if (!code) return false;
    if (code.startsWith('Mouse')) return this.mouseButtonsDown.has(Number(code.replace('Mouse', '')));
    return this.keysDown.has(code);
  }

  public wasActionJustPressed(action: BindableAction): boolean {
    const { keybinds } = useSettingsStore.getState();
    const code = keybinds[action];
    if (!code) return false;
    return this.justPressedKeys.has(code);
  }

  public isCodeDown(code: string): boolean {
    if (code.startsWith('Mouse')) return this.mouseButtonsDown.has(Number(code.replace('Mouse', '')));
    return this.keysDown.has(code);
  }

  /**
   * Consumes accumulated raw mouse movement. Must be called exactly once per
   * rendered frame right before applying look rotation to minimize input latency.
   */
  public consumeMouseDelta(): RawMouseDelta {
    const delta = { dx: this.accumulatedDx, dy: this.accumulatedDy };
    this.accumulatedDx = 0;
    this.accumulatedDy = 0;
    return delta;
  }

  public getWheelAccumulator(): number {
    return this.wheelAccum;
  }

  public consumeJustPressed(): Set<string> {
    const copy = new Set(this.justPressedKeys);
    this.justPressedKeys.clear();
    return copy;
  }

  public clearTransient(): void {
    this.justPressedKeys.clear();
    this.accumulatedDx = 0;
    this.accumulatedDy = 0;
  }
}

export const inputManager = new InputManager();
