import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  AlertTriangle,
  Box,
  Square,
  Layers,
  DoorOpen,
  Cylinder,
  TrendingUp,
  ListOrdered,
  Lightbulb,
  Target,
  CircleDot,
  Bomb,
  Crosshair,
  Move3d,
  RotateCw,
  Maximize2,
  Copy,
  Trash2,
  Grid3x3,
  Undo2,
  Redo2,
  Save,
  UploadCloud,
  Play,
  ArrowLeft,
  MousePointer2
} from 'lucide-react';
import {
  GameMapDefinition,
  MapObjectDef,
  MapObjectType,
  MaterialSurface,
  GameModeId
} from '../../shared/types';
import { useGamePlatformStore } from '../../game/core/gameStateStore';
import { Panel, Button, StatChip, Tabs } from '../ui/primitives';
import { validateWorkshopPackage } from '../../shared/security';
import { soundEngine } from '../../game/audio/soundEngine';
import { buildWorld } from '../../game/rendering/worldRenderer';
import { rendererManager } from '../../game/rendering/renderer-manager';

interface EditorObject extends MapObjectDef {
  layer: string;
  groupId?: string;
}

const TOOL_PALETTE: Array<{ type: MapObjectType; label: string; icon: React.ReactNode; defaultSize: [number, number, number] }> = [
  { type: 'floor', label: 'Floor', icon: <Square className="h-4 w-4" />, defaultSize: [8, 0.5, 8] },
  { type: 'wall', label: 'Wall', icon: <Box className="h-4 w-4" />, defaultSize: [8, 5, 0.6] },
  { type: 'cube', label: 'Block', icon: <Box className="h-4 w-4" />, defaultSize: [3, 3, 3] },
  { type: 'ramp', label: 'Ramp', icon: <TrendingUp className="h-4 w-4" />, defaultSize: [4, 2.5, 6] },
  { type: 'stairs', label: 'Stairs', icon: <ListOrdered className="h-4 w-4" />, defaultSize: [4, 2.5, 6] },
  { type: 'cylinder', label: 'Cylinder', icon: <Cylinder className="h-4 w-4" />, defaultSize: [3, 4, 3] },
  { type: 'doorway', label: 'Doorway', icon: <DoorOpen className="h-4 w-4" />, defaultSize: [3.2, 4.2, 0.6] },
  { type: 'window', label: 'Window', icon: <Layers className="h-4 w-4" />, defaultSize: [3, 1.6, 0.4] },
  { type: 'prop', label: 'Prop', icon: <Box className="h-4 w-4" />, defaultSize: [1.6, 1.6, 1.6] },
  { type: 'cover', label: 'Cover', icon: <Box className="h-4 w-4" />, defaultSize: [2.5, 1.7, 2.5] },
  { type: 'ladder', label: 'Ladder', icon: <ArrowLeft className="h-4 w-4 rotate-90" />, defaultSize: [1, 3.2, 1] },
  { type: 'water', label: 'Water Volume', icon: <CircleDot className="h-4 w-4" />, defaultSize: [10, 0.2, 10] },
  { type: 'light', label: 'Light', icon: <Lightbulb className="h-4 w-4" />, defaultSize: [1, 1, 1] },
  { type: 'spawn_sentinel', label: 'Sentinel Spawn', icon: <Target className="h-4 w-4" />, defaultSize: [10, 0.2, 6] },
  { type: 'spawn_vortex', label: 'Vortex Spawn', icon: <Target className="h-4 w-4" />, defaultSize: [10, 0.2, 6] },
  { type: 'buy_zone', label: 'Buy Zone', icon: <CircleDot className="h-4 w-4" />, defaultSize: [14, 3, 10] },
  { type: 'bomb_site_a', label: 'Bomb Site A', icon: <Bomb className="h-4 w-4" />, defaultSize: [12, 0.3, 12] },
  { type: 'bomb_site_b', label: 'Bomb Site B', icon: <Bomb className="h-4 w-4" />, defaultSize: [12, 0.3, 12] },
  { type: 'objective_zone', label: 'Objective Zone', icon: <Crosshair className="h-4 w-4" />, defaultSize: [10, 0.3, 10] },
  { type: 'sound_zone', label: 'Sound Zone', icon: <CircleDot className="h-4 w-4" />, defaultSize: [14, 6, 14] },
  { type: 'occlusion_zone', label: 'Occlusion Zone', icon: <Layers className="h-4 w-4" />, defaultSize: [14, 6, 14] },
  { type: 'visibility_portal', label: 'Visibility Portal', icon: <DoorOpen className="h-4 w-4" />, defaultSize: [3, 4, 0.4] }
];

const MATERIALS: MaterialSurface[] = ['concrete', 'metal', 'wood', 'tile', 'sand', 'glass', 'water', 'energy'];

const COLOR_SWATCHES = ['#64748b', '#334155', '#1e293b', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#a855f7', '#d97706', '#0ea5e9'];

export const MapEditorPanel: React.FC<{ onTestMap: (mapId: string) => void }> = ({ onTestMap }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    grid: THREE.GridHelper;
    selectionBox: THREE.BoxHelper;
    objectMeshes: Map<string, THREE.Object3D>;
    dispose: () => void;
  } | null>(null);

  const { customMaps, publishWorkshopMap, appendConsoleLog } = useGamePlatformStore();

  const [mapName, setMapName] = useState('Untitled Sector');
  const [mapId, setMapId] = useState('ws_new_sector');
  const [description, setDescription] = useState('Original tactical map built in Vanguard Map Studio.');
  const [supportedModes, setSupportedModes] = useState<GameModeId[]>(['Deathmatch', 'Practice', 'Custom']);
  const [viewportError, setViewportError] = useState<string | null>(null);
  const [objects, setObjects] = useState<EditorObject[]>(() => buildStarterGeometry());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<MapObjectType | null>('wall');
  const [material, setMaterial] = useState<MaterialSurface>('concrete');
  const [color, setColor] = useState('#334155');
  const [gridSnap, setGridSnap] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [undoStack, setUndoStack] = useState<EditorObject[][]>([]);
  const [redoStack, setRedoStack] = useState<EditorObject[][]>([]);
  const [editorTab, setEditorTab] = useState<'TOOLS' | 'PROPERTIES' | 'LAYERS' | 'LIGHTING' | 'ZONES'>('TOOLS');
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'TOP' | 'ISOMETRIC' | 'PERSPECTIVE'>('ISOMETRIC');

  const selected = objects.find((o) => o.id === selectedId) || null;

  // ---------------------------------------------------------------------------
  // Three.js editor viewport
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    // The editor viewport is 3D-only. Without WebGL2 the tool chain (object
    // list, properties, layers, save/test) still works — only the viewport is
    // unavailable, and it says so.
    const selection = rendererManager.getSelection();
    if (!selection.supports3D) {
      setViewportError(
        selection.domOnly
          ? 'This browser provides no rendering context at all.'
          : `The editor viewport needs a WebGL2 context. ${selection.rationale}`
      );
      return;
    }
    setViewportError(null);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    } catch (err) {
      setViewportError(
        `The 3D editor viewport could not start: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#080b11');

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);
    camera.position.set(38, 34, 38);
    camera.lookAt(0, 0, 0);

    const grid = new THREE.GridHelper(120, 120, 0x1e293b, 0x131c28);
    (grid.material as THREE.Material).opacity = 0.6;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const hemi = new THREE.HemisphereLight(0x8899bb, 0x111820, 1.0);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(40, 70, 30);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -70;
    dir.shadow.camera.right = 70;
    dir.shadow.camera.top = 70;
    dir.shadow.camera.bottom = -70;
    scene.add(dir);

    const selectionBox = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01)), 0x06b6d4);
    selectionBox.visible = false;
    scene.add(selectionBox);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      grid,
      selectionBox,
      objectMeshes: new Map(),
      dispose: () => {
        scene.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          if (m.material) {
            if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
            else m.material.dispose();
          }
        });
        renderer.dispose();
      }
    };

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.clearInterval(undefined as never);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Sync objects into the editor scene
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;
    const { scene, objectMeshes } = ref;

    for (const [id, mesh] of objectMeshes.entries()) {
      scene.remove(mesh);
      const m = mesh as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
        else m.material.dispose();
      }
    }
    objectMeshes.clear();

    for (const obj of objects) {
      const [w, h, d] = obj.size;
      let geo: THREE.BufferGeometry;
      if (obj.type === 'cylinder') {
        geo = new THREE.CylinderGeometry(Math.min(w, d) / 2, Math.min(w, d) / 2, h, 14);
      } else if (obj.type === 'ramp') {
        geo = new THREE.BoxGeometry(w, h, d);
      } else if (obj.type === 'stairs') {
        geo = new THREE.BoxGeometry(w, h, d);
      } else if (obj.type === 'spawn_sentinel' || obj.type === 'spawn_vortex' || obj.type === 'buy_zone' || obj.type === 'bomb_site_a' || obj.type === 'bomb_site_b' || obj.type === 'objective_zone') {
        geo = new THREE.BoxGeometry(w, Math.max(0.15, h), d);
      } else {
        geo = new THREE.BoxGeometry(w, h, d);
      }

      const isZone =
        obj.type.startsWith('spawn_') ||
        obj.type.includes('zone') ||
        obj.type === 'sound_zone' ||
        obj.type === 'occlusion_zone' ||
        obj.type === 'visibility_portal';

      const mat = isZone
        ? new THREE.MeshBasicMaterial({
            color: new THREE.Color(obj.color),
            transparent: true,
            opacity: 0.32,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        : new THREE.MeshStandardMaterial({
            color: new THREE.Color(obj.color),
            roughness: obj.material === 'metal' ? 0.35 : obj.material === 'glass' ? 0.1 : 0.85,
            metalness: obj.material === 'metal' ? 0.8 : 0.08
          });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
      const rot = obj.rotation || [0, 0, 0];
      mesh.rotation.set((rot[0] * Math.PI) / 180, (rot[1] * Math.PI) / 180, (rot[2] * Math.PI) / 180);
      mesh.userData.editorId = obj.id;
      mesh.castShadow = !isZone;
      mesh.receiveShadow = !isZone;
      scene.add(mesh);
      objectMeshes.set(obj.id, mesh);
    }
  }, [objects]);

  // Selection outline
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;
    if (!selectedId) {
      ref.selectionBox.visible = false;
      return;
    }
    const mesh = ref.objectMeshes.get(selectedId);
    if (mesh) {
      ref.selectionBox.setFromObject(mesh);
      ref.selectionBox.visible = true;
    } else {
      ref.selectionBox.visible = false;
    }
  }, [selectedId, objects]);

  // Camera mode
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;
    if (cameraMode === 'TOP') {
      ref.camera.position.set(0, 90, 0.01);
      ref.camera.lookAt(0, 0, 0);
    } else if (cameraMode === 'ISOMETRIC') {
      ref.camera.position.set(46, 40, 46);
      ref.camera.lookAt(0, 0, 0);
    } else {
      ref.camera.position.set(6, 6, 26);
      ref.camera.lookAt(0, 2, 0);
    }
  }, [cameraMode]);

  // ---------------------------------------------------------------------------
  // Editing operations
  // ---------------------------------------------------------------------------
  const pushUndo = useCallback(() => {
    setUndoStack((stack) => [...stack.slice(-39), objects.map((o) => ({ ...o }))]);
    setRedoStack([]);
  }, [objects]);

  const snap = (v: number) => (snapEnabled ? Math.round(v / gridSnap) * gridSnap : v);

  const addObject = (type: MapObjectType, position: [number, number, number]) => {
    const tool = TOOL_PALETTE.find((t) => t.type === type);
    const size = tool?.defaultSize || [2, 2, 2];
    const newObj: EditorObject = {
      id: `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      name: `${tool?.label || type} ${objects.filter((o) => o.type === type).length + 1}`,
      type,
      position: [snap(position[0]), snap(position[1]) + size[1] / 2, snap(position[2])],
      size,
      rotation: [0, 0, 0],
      color: type.startsWith('spawn_sentinel')
        ? '#06b6d4'
        : type.startsWith('spawn_vortex')
        ? '#f59e0b'
        : type.startsWith('bomb_site')
        ? '#ef4444'
        : type === 'buy_zone'
        ? '#10b981'
        : color,
      material: type.startsWith('spawn') || type.includes('zone') || type.startsWith('bomb') ? 'energy' : material,
      collidable: !type.startsWith('spawn') && type !== 'buy_zone' && type !== 'sound_zone' && type !== 'occlusion_zone' && type !== 'visibility_portal' && type !== 'light',
      occluder: type === 'wall' || type === 'cube',
      lodTier: 'always',
      roomId: 'main',
      layer: 'Default',
      penetrationResistance: type === 'wall' || type === 'cube' ? 0.85 : type === 'cover' ? 0.3 : 0.5
    };
    pushUndo();
    setObjects((prev) => [...prev, newObj]);
    setSelectedId(newObj.id);
    soundEngine.playUiSound('click');
  };

  const updateSelected = (patch: Partial<EditorObject>) => {
    if (!selectedId) return;
    setObjects((prev) => prev.map((o) => (o.id === selectedId ? { ...o, ...patch } : o)));
  };

  const duplicateSelected = () => {
    if (!selected) return;
    pushUndo();
    const copy: EditorObject = {
      ...selected,
      id: `obj_${Date.now().toString(36)}`,
      name: `${selected.name} (copy)`,
      position: [selected.position[0] + 2, selected.position[1], selected.position[2] + 2]
    };
    setObjects((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    pushUndo();
    setObjects((prev) => prev.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  };

  const undo = () => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setRedoStack((r) => [...r, objects.map((o) => ({ ...o }))]);
      setObjects(prev);
      return stack.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setUndoStack((u) => [...u, objects.map((o) => ({ ...o }))]);
      setObjects(next);
      return stack.slice(0, -1);
    });
  };

  const buildMapDefinition = useCallback((): GameMapDefinition => {
    const hasSentinel = objects.some((o) => o.type === 'spawn_sentinel');
    const hasVortex = objects.some((o) => o.type === 'spawn_vortex');
    const finalObjects = [...objects];
    if (!hasSentinel) {
      finalObjects.push({
        id: 'auto_spawn_s',
        name: 'Auto Sentinel Spawn',
        type: 'spawn_sentinel',
        position: [0, 0.1, -20],
        size: [10, 0.2, 6],
        color: '#06b6d4',
        material: 'energy',
        collidable: false,
        occluder: false,
        lodTier: 'always',
        roomId: 'main',
        layer: 'Default'
      });
    }
    if (!hasVortex) {
      finalObjects.push({
        id: 'auto_spawn_v',
        name: 'Auto Vortex Spawn',
        type: 'spawn_vortex',
        position: [0, 0.1, 20],
        size: [10, 0.2, 6],
        color: '#f59e0b',
        material: 'energy',
        collidable: false,
        occluder: false,
        lodTier: 'always',
        roomId: 'main',
        layer: 'Default'
      });
    }

    return {
      id: mapId,
      name: mapName,
      subtitle: 'Community Map Studio Project',
      author: 'Operative_Zero',
      version: '1.0.0',
      description,
      supportedModes,
      ambientColor: '#64748b',
      skyColor: '#0b1322',
      fogColor: '#131f33',
      sunDirection: [45, 80, 35],
      bounds: { min: [-120, -10, -120], max: [120, 60, 120] },
      objects: finalObjects as MapObjectDef[],
      portals: [],
      waypoints: [
        { id: 'wp_s', position: [0, 0, -20], connections: ['wp_c'], tag: 'sentinelSpawn' },
        { id: 'wp_v', position: [0, 0, 20], connections: ['wp_c'], tag: 'vortexSpawn' },
        { id: 'wp_c', position: [0, 0, 0], connections: ['wp_s', 'wp_v'], tag: 'mid' }
      ],
      callouts: [{ name: 'Center', position: [0, 0, 0], radius: 16 }]
    };
  }, [objects, mapId, mapName, description, supportedModes]);

  const handleSave = () => {
    const def = buildMapDefinition();
    const validation = validateWorkshopPackage(def);
    if (!validation.valid) {
      setPublishMessage(`Save rejected: ${validation.errors.join('; ')}`);
      soundEngine.playUiSound('error');
      return;
    }
    const key = `vanguard_map_${mapId}`;
    try {
      localStorage.setItem(key, JSON.stringify(def));
      setPublishMessage(`Saved "${mapName}" locally (${objects.length} objects, ${validation.packageSizeBytes} bytes).`);
      soundEngine.playUiSound('buy');
    } catch {
      setPublishMessage('Local save failed — browser storage quota exceeded.');
    }
  };

  const handlePublish = () => {
    const def = buildMapDefinition();
    const validation = validateWorkshopPackage(def);
    if (!validation.valid || !validation.sanitizedMap) {
      setPublishMessage(`Publish blocked: ${validation.errors.join('; ')}`);
      soundEngine.playUiSound('error');
      return;
    }
    const res = publishWorkshopMap(validation.sanitizedMap, 'Published from Vanguard Map Studio');
    appendConsoleLog(`[MAP EDITOR] ${res.message}`);
    setPublishMessage(res.message);
    soundEngine.playUiSound('buy');
  };

  const handleTestMap = () => {
    const def = buildMapDefinition();
    const validation = validateWorkshopPackage(def);
    if (!validation.valid || !validation.sanitizedMap) {
      setPublishMessage(`Cannot test: ${validation.errors.join('; ')}`);
      soundEngine.playUiSound('error');
      return;
    }
    publishWorkshopMap(validation.sanitizedMap, 'Editor test session');
    onTestMap(validation.sanitizedMap.id);
  };

  const loadExistingMap = (id: string) => {
    const map = customMaps[id];
    if (!map) return;
    setMapId(map.id);
    setMapName(map.name);
    setDescription(map.description);
    setSupportedModes(map.supportedModes);
    setObjects(
      map.objects.map((o) => ({
        ...o,
        layer: o.layer || 'Default'
      }))
    );
    setPublishMessage(`Loaded "${map.name}" from workshop.`);
  };

  const objectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of objects) counts[o.type] = (counts[o.type] || 0) + 1;
    return counts;
  }, [objects]);

  const totalTriangles = useMemo(() => {
    // Tiles-based estimate mirroring the world builder
    return objects.reduce((sum, o) => sum + (o.type === 'stairs' ? 12 : o.type === 'ramp' ? 8 : 12), 0);
  }, [objects]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
      {/* Viewport */}
      <div className="space-y-3">
        <Panel
          title="VANGUARD MAP STUDIO"
          subtitle={`${objects.length} objects · ~${totalTriangles} triangles · ${mapName}`}
          actions={
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setCameraMode('TOP')} className={cameraMode === 'TOP' ? 'ring-1 ring-cyan-500' : ''}>
                TOP
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCameraMode('ISOMETRIC')} className={cameraMode === 'ISOMETRIC' ? 'ring-1 ring-cyan-500' : ''}>
                ISO
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCameraMode('PERSPECTIVE')} className={cameraMode === 'PERSPECTIVE' ? 'ring-1 ring-cyan-500' : ''}>
                FPS
              </Button>
              <Button variant="secondary" size="sm" onClick={undo} disabled={undoStack.length === 0}>
                <Undo2 className="h-3 w-3" />
              </Button>
              <Button variant="secondary" size="sm" onClick={redo} disabled={redoStack.length === 0}>
                <Redo2 className="h-3 w-3" />
              </Button>
            </div>
          }
        >
          <div
            ref={containerRef}
            className="relative h-[460px] w-full overflow-hidden rounded border border-tac-border bg-slate-950"
          >
            <canvas ref={canvasRef} className="block h-full w-full" />

            {/* Viewport unavailable — the rest of the editor keeps working. */}
            {viewportError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/92 p-6 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-400" />
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
                  3D viewport unavailable
                </div>
                <p className="max-w-md text-[11px] leading-relaxed text-slate-400">{viewportError}</p>
                <p className="max-w-md text-[10px] leading-relaxed text-slate-600">
                  The object list, properties, layers, grid snap, undo/redo and save/publish tools all
                  remain fully available. Only the 3D preview is disabled.
                </p>
              </div>
            )}
            <div className="pointer-events-none absolute left-3 top-3 font-mono text-[10px] text-slate-500">
              GRID SNAP {snapEnabled ? `${gridSnap}m` : 'OFF'} · {cameraMode} VIEW
            </div>
            {objects.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                Select a tool from the palette and click the grid to place geometry.
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={handleSave}>
              <Save className="h-3 w-3" /> SAVE
            </Button>
            <Button variant="success" size="sm" onClick={handlePublish}>
              <UploadCloud className="h-3 w-3" /> PUBLISH
            </Button>
            <Button variant="secondary" size="sm" onClick={handleTestMap}>
              <Play className="h-3 w-3" /> TEST MAP (FIRST-PERSON)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                pushUndo();
                setObjects(buildStarterGeometry());
              }}
            >
              RESET TO STARTER
            </Button>
          </div>

          {publishMessage && (
            <div className="mt-2 rounded border border-cyan-800/60 bg-cyan-950/25 px-3 py-2 text-[11px] text-cyan-200">
              {publishMessage}
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
            <StatChip label="OBJECTS" value={objects.length} accent="text-cyan-400" />
            <StatChip label="WALLS" value={objectCounts.wall || 0} accent="text-white" />
            <StatChip label="COVER" value={objectCounts.cover || 0} accent="text-white" />
            <StatChip label="SPAWNS" value={(objectCounts.spawn_sentinel || 0) + (objectCounts.spawn_vortex || 0)} accent="text-emerald-400" />
            <StatChip label="BOMB SITES" value={(objectCounts.bomb_site_a || 0) + (objectCounts.bomb_site_b || 0)} accent="text-red-400" />
            <StatChip label="LIGHTS" value={objectCounts.light || 0} accent="text-amber-400" />
          </div>
        </Panel>
      </div>

      {/* Right rail */}
      <div className="space-y-3">
        <Panel
          title="EDITOR"
          actions={
            <Tabs
              tabs={[
                { id: 'TOOLS', label: 'Tools' },
                { id: 'PROPERTIES', label: 'Props' },
                { id: 'LAYERS', label: 'Layers' },
                { id: 'ZONES', label: 'Load' }
              ]}
              active={editorTab}
              onChange={(id) => setEditorTab(id as typeof editorTab)}
            />
          }
        >
          {editorTab === 'TOOLS' && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {TOOL_PALETTE.map((tool) => (
                  <button
                    key={tool.type}
                    onClick={() => {
                      if (activeTool === tool.type) {
                        // Clicking the active tool in the palette places it at the origin plane
                        addObject(tool.type, [0, 0, 0]);
                      } else {
                        setActiveTool(tool.type);
                        soundEngine.playUiSound('hover');
                      }
                    }}
                    className={`flex flex-col items-center gap-1 rounded border px-1.5 py-2 text-[9px] font-bold uppercase transition ${
                      activeTool === tool.type
                        ? 'border-cyan-500/70 bg-cyan-950/40 text-cyan-300'
                        : 'border-tac-border bg-tac-panel2/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                    title={`${tool.label} — click to select, click again to place at origin`}
                  >
                    {tool.icon}
                    <span className="text-center leading-tight">{tool.label}</span>
                  </button>
                ))}
              </div>

              <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <Grid3x3 className="h-3 w-3" /> GRID SNAP
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSnapEnabled(!snapEnabled)}
                    className={`rounded border px-2.5 py-1 text-[10px] font-bold ${
                      snapEnabled ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300' : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    {snapEnabled ? 'ON' : 'OFF'}
                  </button>
                  {[0.5, 1, 2, 4].map((g) => (
                    <button
                      key={g}
                      onClick={() => setGridSnap(g)}
                      className={`rounded border px-2 py-1 font-mono text-[10px] font-bold ${
                        gridSnap === g ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300' : 'border-slate-700 text-slate-400'
                      }`}
                    >
                      {g}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  DEFAULT MATERIAL
                </div>
                <select
                  value={material}
                  onChange={(e) => setMaterial(e.target.value as MaterialSurface)}
                  className="w-full rounded border border-tac-border bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                >
                  {MATERIALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {COLOR_SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      style={{ backgroundColor: c }}
                      className={`h-5 w-5 rounded border ${color === c ? 'border-white' : 'border-slate-600'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  MAP METADATA
                </div>
                <input
                  value={mapName}
                  onChange={(e) => setMapName(e.target.value)}
                  placeholder="Map name"
                  className="mb-1.5 w-full rounded border border-tac-border bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                />
                <input
                  value={mapId}
                  onChange={(e) => setMapId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  placeholder="map_id"
                  className="mb-1.5 w-full rounded border border-tac-border bg-slate-950 px-2 py-1.5 font-mono text-[11px] text-slate-100"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description"
                  className="h-16 w-full rounded border border-tac-border bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100"
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {(['Competitive', 'Premier', 'Wingman', 'Rush', 'Casual', 'Deathmatch', 'Retakes', 'Practice', 'Custom'] as GameModeId[]).map((m) => (
                    <button
                      key={m}
                      onClick={() =>
                        setSupportedModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
                      }
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        supportedModes.includes(m)
                          ? 'bg-cyan-600/25 text-cyan-300'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {editorTab === 'PROPERTIES' && (
            <div className="space-y-2">
              {!selected ? (
                <div className="rounded border border-tac-border bg-tac-panel2/60 p-4 text-center text-[11px] text-slate-500">
                  Select an object in the list below to edit its properties.
                </div>
              ) : (
                <>
                  <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-cyan-400">
                      <MousePointer2 className="h-3 w-3" /> {selected.name}
                    </div>
                    <input
                      value={selected.name}
                      onChange={(e) => updateSelected({ name: e.target.value })}
                      className="w-full rounded border border-tac-border bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                    />
                  </div>

                  <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
                      <Move3d className="h-3 w-3" /> POSITION
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                        <div key={axis}>
                          <label className="mb-0.5 block font-mono text-[9px] text-slate-500">{axis}</label>
                          <input
                            type="number"
                            step={0.5}
                            value={selected.position[idx]}
                            onChange={(e) => {
                              const next = [...selected.position] as [number, number, number];
                              next[idx] = Number(e.target.value);
                              updateSelected({ position: next });
                            }}
                            className="w-full rounded border border-tac-border bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-slate-100"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
                      <Maximize2 className="h-3 w-3" /> SIZE
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['W', 'H', 'D'] as const).map((axis, idx) => (
                        <div key={axis}>
                          <label className="mb-0.5 block font-mono text-[9px] text-slate-500">{axis}</label>
                          <input
                            type="number"
                            step={0.5}
                            min={0.1}
                            value={selected.size[idx]}
                            onChange={(e) => {
                              const next = [...selected.size] as [number, number, number];
                              next[idx] = Math.max(0.1, Number(e.target.value));
                              updateSelected({ size: next });
                            }}
                            className="w-full rounded border border-tac-border bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-slate-100"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
                      <RotateCw className="h-3 w-3" /> ROTATION (DEGREES)
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                        <div key={axis}>
                          <label className="mb-0.5 block font-mono text-[9px] text-slate-500">{axis}</label>
                          <input
                            type="number"
                            step={15}
                            value={selected.rotation?.[idx] ?? 0}
                            onChange={(e) => {
                              const rot = [...(selected.rotation || [0, 0, 0])] as [number, number, number];
                              rot[idx] = Number(e.target.value);
                              updateSelected({ rotation: rot });
                            }}
                            className="w-full rounded border border-tac-border bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-slate-100"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border border-tac-border bg-tac-panel2/60 p-3">
                    <div className="mb-2 text-[10px] font-bold uppercase text-slate-400">MATERIAL / FLAGS</div>
                    <select
                      value={selected.material}
                      onChange={(e) => updateSelected({ material: e.target.value as MaterialSurface })}
                      className="mb-2 w-full rounded border border-tac-border bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                    >
                      {MATERIALS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selected.lodTier}
                      onChange={(e) => updateSelected({ lodTier: e.target.value as EditorObject['lodTier'] })}
                      className="mb-2 w-full rounded border border-tac-border bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                    >
                      <option value="always">LOD: Always Visible</option>
                      <option value="near">LOD: Near Tier (35m)</option>
                      <option value="medium">LOD: Medium Tier (65m)</option>
                      <option value="far">LOD: Far Tier (110m)</option>
                    </select>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => updateSelected({ collidable: !selected.collidable })}
                        className={`rounded border px-2 py-1 text-[10px] font-bold ${
                          selected.collidable ? 'border-emerald-600/60 bg-emerald-950/40 text-emerald-300' : 'border-slate-700 text-slate-500'
                        }`}
                      >
                        COLLIDABLE
                      </button>
                      <button
                        onClick={() => updateSelected({ occluder: !selected.occluder })}
                        className={`rounded border px-2 py-1 text-[10px] font-bold ${
                          selected.occluder ? 'border-purple-600/60 bg-purple-950/40 text-purple-300' : 'border-slate-700 text-slate-500'
                        }`}
                      >
                        OCCLUDER
                      </button>
                    </div>
                    <div className="mt-2">
                      <label className="mb-1 block text-[9px] font-bold uppercase text-slate-500">
                        Penetration Resistance {(selected.penetrationResistance ?? 0.5).toFixed(2)}
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selected.penetrationResistance ?? 0.5}
                        onChange={(e) => updateSelected({ penetrationResistance: Number(e.target.value) })}
                        className="h-1.5 w-full rounded-full bg-slate-700 accent-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" onClick={duplicateSelected} className="flex-1">
                      <Copy className="h-3 w-3" /> DUPLICATE
                    </Button>
                    <Button variant="danger" size="sm" onClick={deleteSelected} className="flex-1">
                      <Trash2 className="h-3 w-3" /> DELETE
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {editorTab === 'LAYERS' && (
            <div className="space-y-2">
              <div className="rounded border border-tac-border bg-tac-panel2/60 p-3 text-[10px] leading-relaxed text-slate-400">
                Layers group related geometry. Objects listed below can be selected directly. Occlusion zones and
                visibility portals authored here feed the Smart Occlusion portal graph at runtime.
              </div>
              <div className="max-h-[420px] space-y-1 overflow-y-auto">
                {objects.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setSelectedId(o.id);
                      setEditorTab('PROPERTIES');
                    }}
                    className={`flex w-full items-center justify-between rounded border px-2.5 py-1.5 text-left text-[10px] transition ${
                      selectedId === o.id
                        ? 'border-cyan-500/70 bg-cyan-950/30 text-cyan-200'
                        : 'border-tac-border bg-tac-panel2/60 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span className="truncate font-semibold">{o.name}</span>
                    <span className="ml-2 shrink-0 font-mono text-[9px] text-slate-500">{o.type}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {editorTab === 'ZONES' && (
            <div className="space-y-2">
              <div className="rounded border border-tac-border bg-tac-panel2/60 p-3 text-[10px] uppercase text-slate-400">
                Load an Existing Workshop Map
              </div>
              {Object.values(customMaps).map((m) => (
                <button
                  key={m.id}
                  onClick={() => loadExistingMap(m.id)}
                  className="w-full rounded border border-tac-border bg-tac-panel2/60 px-3 py-2 text-left text-[11px] text-slate-200 hover:border-cyan-600/60"
                >
                  <div className="font-bold">{m.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {m.objects.length} objects · {m.author}
                  </div>
                </button>
              ))}
              {Object.keys(customMaps).length === 0 && (
                <div className="text-[11px] text-slate-500">No saved maps available yet.</div>
              )}

              <div className="mt-3 rounded border border-tac-border bg-tac-panel2/60 p-3 text-[10px] leading-relaxed text-slate-400">
                <strong className="text-slate-300">Test mode:</strong> Press “TEST MAP (FIRST-PERSON)” to validate,
                compile, and immediately launch a first-person sandbox on the current editor contents.
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};

function buildStarterGeometry(): EditorObject[] {
  const base: Array<Omit<EditorObject, 'layer'>> = [
    {
      id: 'start_floor',
      name: 'Ground Slab',
      type: 'floor',
      position: [0, -0.5, 0],
      size: [56, 1, 56],
      color: '#1e2530',
      material: 'concrete',
      collidable: true,
      occluder: false,
      lodTier: 'always',
      roomId: 'main'
    },
    {
      id: 'start_wall_n',
      name: 'North Wall',
      type: 'wall',
      position: [0, 3.5, -28],
      size: [56, 7, 1.2],
      color: '#273244',
      material: 'concrete',
      collidable: true,
      occluder: true,
      lodTier: 'always',
      roomId: 'main',
      penetrationResistance: 1
    },
    {
      id: 'start_wall_s',
      name: 'South Wall',
      type: 'wall',
      position: [0, 3.5, 28],
      size: [56, 7, 1.2],
      color: '#273244',
      material: 'concrete',
      collidable: true,
      occluder: true,
      lodTier: 'always',
      roomId: 'main',
      penetrationResistance: 1
    },
    {
      id: 'start_wall_w',
      name: 'West Wall',
      type: 'wall',
      position: [-28, 3.5, 0],
      size: [1.2, 7, 56],
      color: '#273244',
      material: 'concrete',
      collidable: true,
      occluder: true,
      lodTier: 'always',
      roomId: 'main',
      penetrationResistance: 1
    },
    {
      id: 'start_wall_e',
      name: 'East Wall',
      type: 'wall',
      position: [28, 3.5, 0],
      size: [1.2, 7, 56],
      color: '#273244',
      material: 'concrete',
      collidable: true,
      occluder: true,
      lodTier: 'always',
      roomId: 'main',
      penetrationResistance: 1
    },
    {
      id: 'start_divider',
      name: 'Mid Divider',
      type: 'wall',
      position: [0, 3, 0],
      size: [1, 6, 16],
      color: '#334155',
      material: 'concrete',
      collidable: true,
      occluder: true,
      lodTier: 'always',
      roomId: 'main',
      penetrationResistance: 0.85
    },
    {
      id: 'start_cover_1',
      name: 'Cover Box West',
      type: 'cover',
      position: [-10, 0.85, -8],
      size: [2.6, 1.7, 2.6],
      color: '#d97706',
      material: 'wood',
      collidable: true,
      occluder: false,
      lodTier: 'near',
      roomId: 'main',
      penetrationResistance: 0.25
    },
    {
      id: 'start_cover_2',
      name: 'Cover Box East',
      type: 'cover',
      position: [10, 0.85, 8],
      size: [2.6, 1.7, 2.6],
      color: '#d97706',
      material: 'wood',
      collidable: true,
      occluder: false,
      lodTier: 'near',
      roomId: 'main',
      penetrationResistance: 0.25
    },
    {
      id: 'start_ramp',
      name: 'Elevation Ramp',
      type: 'ramp',
      position: [-18, 1.2, 14],
      size: [4, 2.4, 6],
      color: '#64748b',
      material: 'metal',
      collidable: true,
      occluder: false,
      lodTier: 'always',
      roomId: 'main'
    },
    {
      id: 'start_platform',
      name: 'Elevated Platform',
      type: 'floor',
      position: [-18, 2.4, 6],
      size: [5, 0.4, 8],
      color: '#475569',
      material: 'metal',
      collidable: true,
      occluder: false,
      lodTier: 'always',
      roomId: 'main'
    },
    {
      id: 'start_spawn_s',
      name: 'Sentinel Spawn',
      type: 'spawn_sentinel',
      position: [0, 0.1, -22],
      size: [12, 0.2, 7],
      color: '#06b6d4',
      material: 'energy',
      collidable: false,
      occluder: false,
      lodTier: 'always',
      roomId: 'main'
    },
    {
      id: 'start_spawn_v',
      name: 'Vortex Spawn',
      type: 'spawn_vortex',
      position: [0, 0.1, 22],
      size: [12, 0.2, 7],
      color: '#f59e0b',
      material: 'energy',
      collidable: false,
      occluder: false,
      lodTier: 'always',
      roomId: 'main'
    },
    {
      id: 'start_buy_s',
      name: 'Sentinel Buy Zone',
      type: 'buy_zone',
      position: [0, 1.5, -22],
      size: [14, 3, 9],
      color: '#06b6d4',
      material: 'energy',
      collidable: false,
      occluder: false,
      lodTier: 'always',
      roomId: 'main'
    },
    {
      id: 'start_buy_v',
      name: 'Vortex Buy Zone',
      type: 'buy_zone',
      position: [0, 1.5, 22],
      size: [14, 3, 9],
      color: '#f59e0b',
      material: 'energy',
      collidable: false,
      occluder: false,
      lodTier: 'always',
      roomId: 'main'
    },
    {
      id: 'start_site_a',
      name: 'Bomb Site A',
      type: 'bomb_site_a',
      position: [-12, 0.15, 0],
      size: [12, 0.3, 12],
      color: '#ef4444',
      material: 'energy',
      collidable: false,
      occluder: false,
      lodTier: 'always',
      roomId: 'main'
    },
    {
      id: 'start_site_b',
      name: 'Bomb Site B',
      type: 'bomb_site_b',
      position: [12, 0.15, 0],
      size: [12, 0.3, 12],
      color: '#f97316',
      material: 'energy',
      collidable: false,
      occluder: false,
      lodTier: 'always',
      roomId: 'main'
    }
  ];
  return base.map((b) => ({ ...b, layer: 'Default' }));
}
