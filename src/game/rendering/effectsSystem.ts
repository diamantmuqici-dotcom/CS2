import * as THREE from 'three';
import { MaterialSurface, Vector3D } from '../../shared/types';

/**
 * GPU-friendly pooled effects system.
 * All decals, tracers, impact sparks, muzzle flashes and shells are pre-allocated
 * and recycled to guarantee zero runtime GC pressure during firefights.
 */

export class ImpactDecalPool {
  private readonly maxDecals = 96;
  private pool: THREE.Mesh[] = [];
  private cursor = 0;
  private geometry: THREE.PlaneGeometry;

  constructor(private scene: THREE.Scene) {
    this.geometry = new THREE.PlaneGeometry(1, 1);
  }

  public spawn(point: Vector3D, normal: Vector3D, surface: MaterialSurface, size = 0.22): void {
    let mesh = this.pool.find((m) => !m.visible);
    if (!mesh && this.pool.length < this.maxDecals) {
      const color =
        surface === 'metal'
          ? 0x1a1a1d
          : surface === 'wood'
          ? 0x2b1c0e
          : surface === 'glass'
          ? 0x0d1b21
          : 0x121214;
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      });
      mesh = new THREE.Mesh(this.geometry, material);
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.pool.push(mesh);
    } else if (!mesh) {
      mesh = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.maxDecals;
    }

    mesh.visible = true;
    mesh.position.set(point.x, point.y, point.z);
    const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
    const lookTarget = new THREE.Vector3(point.x + n.x, point.y + n.y, point.z + n.z);
    mesh.lookAt(lookTarget);
    const scale = size * (0.8 + Math.random() * 0.5);
    mesh.scale.set(scale, scale, scale);
    mesh.rotateZ(Math.random() * Math.PI * 2);
  }

  public clear(): void {
    for (const m of this.pool) m.visible = false;
  }
}

interface TracerEntry {
  line: THREE.Line;
  life: number;
  maxLife: number;
}

export class TracerPool {
  private entries: TracerEntry[] = [];
  private readonly maxTracers = 48;

  constructor(private scene: THREE.Scene) {}

  public spawn(from: Vector3D, to: Vector3D, color = 0xfff2b0, thickness = 0.018, life = 0.06): void {
    let entry = this.entries.find((e) => e.life <= 0);
    if (!entry && this.entries.length < this.maxTracers) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        linewidth: thickness
      });
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.renderOrder = 3;
      this.scene.add(line);
      entry = { line, life: 0, maxLife: life };
      this.entries.push(entry);
    }
    if (!entry) {
      entry = this.entries[0];
    }

    const positions = entry.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    entry.line.geometry.computeBoundingSphere();
    entry.line.visible = true;
    (entry.line.material as THREE.LineBasicMaterial).opacity = 0.9;
    entry.life = life;
    entry.maxLife = life;
  }

  public update(dt: number): void {
    for (const e of this.entries) {
      if (e.life > 0) {
        e.life -= dt;
        const alpha = Math.max(0, e.life / e.maxLife);
        (e.line.material as THREE.LineBasicMaterial).opacity = alpha * 0.9;
        if (e.life <= 0) e.line.visible = false;
      }
    }
  }

  public clear(): void {
    for (const e of this.entries) {
      e.life = 0;
      e.line.visible = false;
    }
  }
}

interface ParticleEntry {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  drag: number;
}

export class ParticlePool {
  private entries: ParticleEntry[] = [];
  private freeList: number[] = [];
  private readonly defaultMax = 260;

  constructor(private scene: THREE.Scene, maxParticles = 260) {
    const geometry = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    const material = new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.9 });
    for (let i = 0; i < Math.min(maxParticles, 420); i++) {
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.visible = false;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      this.entries.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        gravity: -12,
        drag: 0.9
      });
      this.freeList.push(i);
    }
  }

  public spawnBurst(
    point: Vector3D,
    normal: Vector3D,
    count: number,
    color: number,
    surface: MaterialSurface,
    spreadVel = 3.2,
    gravity = -12
  ): void {
    const isSoft = surface === 'wood' || surface === 'sand';
    for (let i = 0; i < count; i++) {
      const idx = this.freeList.pop();
      if (idx === undefined) return;
      const entry = this.entries[idx];
      entry.mesh.visible = true;
      entry.mesh.position.set(point.x, point.y, point.z);
      const mat = entry.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity = 0.95;
      const size = isSoft ? 0.04 + Math.random() * 0.03 : 0.03 + Math.random() * 0.025;
      entry.mesh.scale.setScalar(size / 0.055);
      entry.velocity.set(
        normal.x * spreadVel * (0.4 + Math.random()) + (Math.random() - 0.5) * spreadVel,
        normal.y * spreadVel * (0.5 + Math.random()) + Math.random() * spreadVel * 0.6,
        normal.z * spreadVel * (0.4 + Math.random()) + (Math.random() - 0.5) * spreadVel
      );
      entry.life = 0.28 + Math.random() * 0.4;
      entry.maxLife = entry.life;
      entry.gravity = gravity;
      entry.drag = 0.93;
    }
  }

  public spawnSmokePuff(point: Vector3D, count = 6, radius = 0.6): void {
    for (let i = 0; i < count; i++) {
      const idx = this.freeList.pop();
      if (idx === undefined) return;
      const entry = this.entries[idx];
      entry.mesh.visible = true;
      entry.mesh.position.set(
        point.x + (Math.random() - 0.5) * radius,
        point.y + Math.random() * 1.2,
        point.z + (Math.random() - 0.5) * radius
      );
      const mat = entry.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(0x64748b);
      mat.opacity = 0.42;
      entry.mesh.scale.setScalar(4 + Math.random() * 4);
      entry.velocity.set((Math.random() - 0.5) * 0.5, 0.9 + Math.random() * 0.7, (Math.random() - 0.5) * 0.5);
      entry.life = 1.6 + Math.random() * 2.5;
      entry.maxLife = entry.life;
      entry.gravity = 0.6;
      entry.drag = 0.96;
    }
  }

  public spawnFireEmber(point: Vector3D): void {
    const idx = this.freeList.pop();
    if (idx === undefined) return;
    const entry = this.entries[idx];
    entry.mesh.visible = true;
    entry.mesh.position.set(point.x + (Math.random() - 0.5) * 3.5, point.y + 0.15, point.z + (Math.random() - 0.5) * 3.5);
    const mat = entry.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(Math.random() > 0.5 ? 0xf97316 : 0xfacc15);
    mat.opacity = 0.85;
    entry.mesh.scale.setScalar(3);
    entry.velocity.set((Math.random() - 0.5) * 0.9, 1.6 + Math.random() * 1.5, (Math.random() - 0.5) * 0.9);
    entry.life = 0.45 + Math.random() * 0.5;
    entry.maxLife = entry.life;
    entry.gravity = 2.2;
    entry.drag = 0.95;
  }

  public update(dt: number, enabled: boolean): void {
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (e.life <= 0) continue;
      if (!enabled) {
        e.life = 0;
        e.mesh.visible = false;
        this.freeList.push(i);
        continue;
      }
      e.life -= dt;
      if (e.life <= 0) {
        e.mesh.visible = false;
        this.freeList.push(i);
        continue;
      }
      e.velocity.y += e.gravity * dt;
      e.velocity.multiplyScalar(Math.pow(e.drag, dt * 60));
      e.mesh.position.addScaledVector(e.velocity, dt);
      const mat = e.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (e.life / e.maxLife) * 0.9);
      if (e.mesh.position.y < 0.02) {
        e.mesh.position.y = 0.02;
        e.velocity.y *= -0.28;
        e.velocity.x *= 0.6;
        e.velocity.z *= 0.6;
      }
    }
  }

  public clear(): void {
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].life = 0;
      this.entries[i].mesh.visible = false;
    }
    this.freeList = this.entries.map((_, i) => i);
  }
}

export class MuzzleFlashSystem {
  private light: THREE.PointLight;
  private sprite: THREE.Mesh;
  private flashTime = 0;

  constructor(private scene: THREE.Scene) {
    this.light = new THREE.PointLight(0xffdd88, 0, 9, 2);
    this.scene.add(this.light);
    const geo = new THREE.SphereGeometry(0.09, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0.9 });
    this.sprite = new THREE.Mesh(geo, mat);
    this.sprite.visible = false;
    this.scene.add(this.sprite);
  }

  public trigger(position: THREE.Vector3, intensity = 4.5): void {
    this.light.position.copy(position);
    this.light.intensity = intensity;
    this.light.distance = 10 + intensity;
    this.sprite.position.copy(position);
    this.sprite.scale.setScalar(0.75 + Math.random() * 0.6);
    this.sprite.visible = true;
    this.sprite.rotation.z = Math.random() * Math.PI * 2;
    this.flashTime = 0.045;
  }

  public update(dt: number): void {
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) {
        this.light.intensity = 0;
        this.sprite.visible = false;
      } else {
        this.light.intensity *= 0.72;
      }
    }
  }
}

export class SmokeVolumeSystem {
  public activeSmokes: Array<{ position: Vector3D; mesh: THREE.Mesh; remainingSec: number; totalSec: number }> = [];

  constructor(private scene: THREE.Scene) {}

  public deploy(position: Vector3D, durationSec = 18): void {
    // Layered low-poly puff cluster = convincing volume at a fraction of the cost of true volumetrics
    const group = new THREE.Group();
    const puffs = 9;
    for (let i = 0; i < puffs; i++) {
      const radius = 1.4 + Math.random() * 1.5;
      const geo = new THREE.IcosahedronGeometry(radius, 1);
      const mat = new THREE.MeshLambertMaterial({
        color: 0xbcc6d4,
        transparent: true,
        opacity: 0.62,
        depthWrite: false
      });
      const puff = new THREE.Mesh(geo, mat);
      const angle = (i / puffs) * Math.PI * 2;
      puff.position.set(
        Math.cos(angle) * (0.7 + Math.random() * 1.5),
        0.9 + Math.random() * 2.1,
        Math.sin(angle) * (0.7 + Math.random() * 1.5)
      );
      group.add(puff);
    }
    group.position.set(position.x, position.y, position.z);
    this.scene.add(group);
    this.activeSmokes.push({ position: { ...position }, mesh: group as unknown as THREE.Mesh, remainingSec: durationSec, totalSec: durationSec });
  }

  public update(dt: number): void {
    for (let i = this.activeSmokes.length - 1; i >= 0; i--) {
      const smoke = this.activeSmokes[i];
      smoke.remainingSec -= dt;
      const grow = Math.min(1, (smoke.totalSec - smoke.remainingSec) / 1.6);
      const fadeOut = Math.min(1, smoke.remainingSec / 2.5);
      smoke.mesh.scale.setScalar(0.25 + grow * 0.85);
      smoke.mesh.children.forEach((child) => {
        const mat = (child as THREE.Mesh).material as THREE.MeshLambertMaterial;
        mat.opacity = 0.62 * grow * fadeOut;
      });
      if (smoke.remainingSec <= 0) {
        this.scene.remove(smoke.mesh);
        smoke.mesh.children.forEach((c) => {
          const m = c as THREE.Mesh;
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        });
        this.activeSmokes.splice(i, 1);
      }
    }
  }

  public getWorldPositions(): Vector3D[] {
    return this.activeSmokes.map((s) => s.position);
  }

  public clear(): void {
    for (const s of this.activeSmokes) this.scene.remove(s.mesh);
    this.activeSmokes = [];
  }
}

export class FireAreaSystem {
  private active: Array<{ mesh: THREE.Mesh; remainingSec: number }> = [];

  constructor(private scene: THREE.Scene) {}

  public ignite(position: Vector3D, durationSec = 7): void {
    const geo = new THREE.CircleGeometry(4.5, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, Math.max(0.06, position.y), position.z);
    this.scene.add(mesh);
    this.active.push({ mesh, remainingSec: durationSec });
  }

  public update(dt: number): number {
    // Returns number of fire pools active for damage application
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fire = this.active[i];
      fire.remainingSec -= dt;
      const mat = fire.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.42 + Math.sin(performance.now() * 0.008 + i) * 0.12;
      if (fire.remainingSec <= 0) {
        this.scene.remove(fire.mesh);
        fire.mesh.geometry.dispose();
        mat.dispose();
        this.active.splice(i, 1);
      }
    }
    return this.active.length;
  }

  public getActiveAreas(): Array<{ position: Vector3D; radius: number }> {
    return this.active.map((a) => ({
      position: { x: a.mesh.position.x, y: a.mesh.position.y, z: a.mesh.position.z },
      radius: 4.5
    }));
  }

  public clear(): void {
    for (const f of this.active) this.scene.remove(f.mesh);
    this.active = [];
  }
}

export class ShellEjectionSystem {
  private shells: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3; spin: THREE.Vector3; life: number }> = [];
  private freeList: number[] = [];

  constructor(private scene: THREE.Scene, maxShells = 32) {
    const geo = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 5);
    for (let i = 0; i < maxShells; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.35 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shells.push({
        mesh,
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0
      });
      this.freeList.push(i);
    }
  }

  public eject(cameraPos: THREE.Vector3, rightDir: THREE.Vector3, upDir: THREE.Vector3): void {
    const idx = this.freeList.pop();
    if (idx === undefined) return;
    const s = this.shells[idx];
    s.mesh.visible = true;
    s.mesh.position.copy(cameraPos).addScaledVector(rightDir, 0.32).addScaledVector(upDir, -0.18);
    s.velocity
      .copy(rightDir)
      .multiplyScalar(2.4 + Math.random())
      .addScaledVector(upDir, 1.6 + Math.random() * 0.7);
    s.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
    s.life = 1.4;
  }

  public update(dt: number): void {
    for (let i = 0; i < this.shells.length; i++) {
      const s = this.shells[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        this.freeList.push(i);
        continue;
      }
      s.velocity.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      if (s.mesh.position.y < 0.02) {
        s.mesh.position.y = 0.02;
        s.velocity.y *= -0.32;
        s.velocity.x *= 0.55;
        s.velocity.z *= 0.55;
      }
    }
  }

  public clear(): void {
    for (let i = 0; i < this.shells.length; i++) {
      this.shells[i].life = 0;
      this.shells[i].mesh.visible = false;
    }
    this.freeList = this.shells.map((_, i) => i);
  }
}

export class FlashEffectSystem {
  public flashIntensity = 0;
  public flashDuration = 0;

  public trigger(intensity = 1.0, duration = 3.2): void {
    this.flashIntensity = Math.max(this.flashIntensity, intensity);
    this.flashDuration = Math.max(this.flashDuration, duration);
  }

  public update(dt: number): void {
    if (this.flashDuration > 0) {
      this.flashDuration -= dt;
      this.flashIntensity *= Math.max(0, 1 - dt * 0.65);
      if (this.flashDuration <= 0) {
        this.flashIntensity = 0;
      }
    }
  }
}
