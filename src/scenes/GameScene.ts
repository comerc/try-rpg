import Phaser from 'phaser';
import { BUILDING_DEFS, BuildingKind, MAP_H, MAP_W, Team, TILE, UI_BOTTOM_H, UI_TOP_H, UNIT_DEFS, UnitKind, VIEWPORT_H, VIEWPORT_W, WORLD_H, WORLD_W } from '../config';
import { GameMap } from '../world/GameMap';
import { Pathfinding } from '../world/Pathfinding';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/Resource';
import { Entity } from '../entities/Entity';
import { SelectionSystem } from '../systems/SelectionSystem';
import { CommandSystem } from '../systems/CommandSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { AIController } from '../systems/AIController';
import { VFXSystem } from '../systems/VFXSystem';
import { NotificationSystem } from '../systems/NotificationSystem';
import { SoundSystem } from '../systems/SoundSystem';
import { ControlGroups } from '../systems/ControlGroups';
import { FogOfWar } from '../systems/FogOfWar';
import { T, buildingName } from '../i18n';
import { Logger } from '../systems/Logger';

const CAMERA_MIN_ZOOM = 0.5;
const CAMERA_MAX_ZOOM = 2;
const TOUCH_LONG_PRESS_MS = 520;
const TOUCH_MOVE_CANCEL_PX = 14;
const TOUCH_GESTURE_MOVE_PX = 3;
const WHEEL_ZOOM_SPEED = 0.0015;

type TouchPoint = {
  startX: number;
  startY: number;
  x: number;
  y: number;
};

type TouchGesture = {
  lastCenterX: number;
  lastCenterY: number;
  lastDistance: number;
  moved: boolean;
};

export class GameScene extends Phaser.Scene {
  map!: GameMap;
  path!: Pathfinding;
  selection!: SelectionSystem;
  command!: CommandSystem;
  combat!: CombatSystem;
  economy!: EconomySystem;
  ai!: AIController;
  vfx!: VFXSystem;
  notifications!: NotificationSystem;
  sound2!: SoundSystem;
  groups!: ControlGroups;
  fog!: FogOfWar;

  entities: Entity[] = [];
  resources: ResourceNode[] = [];

  pendingBuild: BuildingKind | null = null;
  ghost: Phaser.GameObjects.Image | null = null;

  private gameTime = 0;
  kills: Record<Team, number> = { player: 0, enemy: 0 };
  buildingsBuilt: Record<Team, number> = { player: 0, enemy: 0 };
  lastAttackWarnAt = 0;
  lastClickTime = 0;
  lastClickedEntity: Entity | null = null;
  private isEndingGame = false;
  private touchPointers = new Map<number, TouchPoint>();
  private touchGesture: TouchGesture | null = null;
  private suppressSelectionPointerIds = new Set<number>();
  private longPressTimer: Phaser.Time.TimerEvent | null = null;
  private longPressFiredPointerId: number | null = null;

  private readonly onAiTrain = (bld: Building, kind: UnitKind) => this.requestTrain(bld, kind);
  private readonly onUiTrain = (bld: Building, kind: UnitKind) => {
    const queued = this.requestTrain(bld, kind);
    this.sound2.play('click');
    if (queued) this.sound2.voice('ready');
  };
  private readonly onUiBuildStart = (kind: BuildingKind) => {
    this.beginBuildPlacement(kind);
  };
  private readonly onUiStop = () => {
    this.command.stop(this.playerSelectedUnits());
    this.sound2.play('order');
    this.sound2.voice('cancel');
  };
  private readonly onUiHold = () => {
    this.command.hold(this.playerSelectedUnits());
    this.sound2.play('order');
    this.sound2.voice('order');
  };
  private readonly onUiRepair = () => {
    this.beginRepairMode();
    this.sound2.voice('work');
  };
  private readonly onUiCycleIdle = () => this.groups.cycleIdleWorker();

  constructor() { super('Game'); }

  create() {
    this.entities = [];
    this.resources = [];
    this.gameTime = 0;
    this.kills = { player: 0, enemy: 0 };
    this.buildingsBuilt = { player: 0, enemy: 0 };
    this.lastAttackWarnAt = 0;
    this.lastClickTime = 0;
    this.lastClickedEntity = null;
    this.isEndingGame = false;
    this.touchPointers.clear();
    this.touchGesture = null;
    this.suppressSelectionPointerIds.clear();
    this.cancelLongPress();
    this.longPressFiredPointerId = null;
    this.pendingBuild = null;
    this.ghost?.destroy();
    this.ghost = null;

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor('#08110f');
    this.cameras.main.roundPixels = true;
    // Inset the world camera to the play area so the UI bars don't overlap
    // the map. Pointer coordinates (canvas-wide) are still mapped correctly
    // by camera.getWorldPoint thanks to this viewport.
    this.cameras.main.setViewport(0, UI_TOP_H, VIEWPORT_W, VIEWPORT_H - UI_TOP_H - UI_BOTTOM_H);
    this.physics?.world?.setBounds?.(0, 0, WORLD_W, WORLD_H);

    this.map = new GameMap(this);
    this.map.render();
    this.createWorldAtmosphere();
    this.path = new Pathfinding(this.map);

    this.sound2 = new SoundSystem(this);
    this.sound2.startMusic();
    this.vfx = new VFXSystem(this);
    this.notifications = new NotificationSystem(this);

    this.economy = new EconomySystem(this, () => this.entities);
    this.selection = new SelectionSystem(this, () => this.entities);
    this.command = new CommandSystem(this, this.map, this.path, () => this.entities, this.economy);
    this.combat = new CombatSystem(() => this.entities);
    this.groups = new ControlGroups(this, this.selection);
    this.fog = new FogOfWar(this, () => this.entities);

    this.spawnStartingArea('player', 4, 4);
    this.spawnStartingArea('enemy', MAP_W - 9, MAP_H - 9);
    this.registerAmbientBattlefieldZones();
    this.sprinkleResources();

    this.ai = new AIController(
      this, this.map, this.economy, this.command,
      () => this.entities,
      (tx, ty, kind, team, built) => this.spawnBuilding(tx, ty, kind, team, built),
    );

    this.events.on('train:completed', this.onTrainCompleted, this);
    this.events.on('ai:train', this.onAiTrain);
    this.events.on('ui:train', this.onUiTrain);
    this.events.on('ui:build-start', this.onUiBuildStart);
    this.events.on('ui:stop', this.onUiStop);
    this.events.on('ui:hold', this.onUiHold);
    this.events.on('ui:repair', this.onUiRepair);
    this.events.on('ui:cycle-idle', this.onUiCycleIdle);

    this.events.on('entity:damaged', this.onEntityDamaged, this);
    this.events.on('entity:died', this.onEntityDied, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.setupInput();
    this.setupCamera();

    this.cameras.main.centerOn(4 * TILE + 64, 4 * TILE + 64);
    this.cameras.main.fadeIn(500, 6, 10, 16);

    this.notifications.add(T.gameStarted, '#60a5fa');
  }

  update(time: number, delta: number) {
    this.gameTime += delta;
    this.map.update(time);
    for (const e of this.entities) {
      if (e.dead) continue;
      (e as any).update?.(time, delta);
    }
    this.combat.update(time, delta);
    this.ai.update(time, delta);
    this.vfx.update(delta);
    this.notifications.update(delta);
    this.fog.update(delta);

    this.entities = this.entities.filter((e) => !e.dead);
    this.resources = this.resources.filter((r) => !r.dead);
    this.selection.pruneDead();

    const playerTH = this.entities.some((e) => e instanceof Building && e.team === 'player' && e.kind === 'townhall');
    const enemyTH = this.entities.some((e) => e instanceof Building && e.team === 'enemy' && e.kind === 'townhall');
    if ((!playerTH || !enemyTH) && !this.isEndingGame) {
      this.isEndingGame = true;
      this.sound2.play(!enemyTH ? 'victory' : 'defeat');
      this.sound2.voice(!enemyTH ? 'victory' : 'defeat');
      this.scene.stop('UI');
      this.scene.start('GameOver', { win: !enemyTH, time: this.gameTime, kills: this.kills, buildingsBuilt: this.buildingsBuilt });
    }
  }

  private onShutdown() {
    this.events.off('train:completed', this.onTrainCompleted, this);
    this.events.off('ai:train', this.onAiTrain);
    this.events.off('ui:train', this.onUiTrain);
    this.events.off('ui:build-start', this.onUiBuildStart);
    this.events.off('ui:stop', this.onUiStop);
    this.events.off('ui:hold', this.onUiHold);
    this.events.off('ui:repair', this.onUiRepair);
    this.events.off('ui:cycle-idle', this.onUiCycleIdle);
    this.events.off('entity:damaged', this.onEntityDamaged, this);
    this.events.off('entity:died', this.onEntityDied, this);
    this.command?.destroy?.();
    this.groups?.destroy?.();
    this.sound2?.destroy?.();
    this.cancelLongPress();
    this.touchPointers.clear();
    this.touchGesture = null;
    this.suppressSelectionPointerIds.clear();
    this.input.removeAllListeners();
    this.input.keyboard?.removeAllListeners();
    this.cancelBuildPlacement();
  }

  private spawnStartingArea(team: Team, baseTx: number, baseTy: number) {
    this.spawnBuilding(baseTx, baseTy, 'townhall', team, true);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const x = (baseTx + 1.5) * TILE + Math.cos(angle) * TILE * 2.5;
      const y = (baseTy + 1.5) * TILE + Math.sin(angle) * TILE * 2.5;
      this.spawnUnit(x, y, 'peasant', team);
    }
  }

  private createWorldAtmosphere() {
    // Subtle colored glow under player and enemy bases so their location reads
    // faster on the minimap/map. Kept below units (depth -85) and no
    // screen-space vignette (it was darkening clickable regions for no gain).
    const worldGlow = this.add.graphics().setDepth(-85);
    worldGlow.fillStyle(0x60a5fa, 0.07).fillEllipse(6 * TILE, 6 * TILE, TILE * 9, TILE * 7);
    worldGlow.fillStyle(0xef4444, 0.06).fillEllipse((MAP_W - 6) * TILE, (MAP_H - 6) * TILE, TILE * 9, TILE * 7);
  }

  private registerAmbientBattlefieldZones() {
    this.vfx.registerAmbientZone(6 * TILE, 6 * TILE, TILE * 4.6, 0x93c5fd, 1.4, 'motes', 10);
    this.vfx.registerAmbientZone(6 * TILE, 6 * TILE, TILE * 2.2, 0xfacc15, 0.8, 'embers', 8);
    this.vfx.registerAmbientZone((MAP_W - 6) * TILE, (MAP_H - 6) * TILE, TILE * 4.6, 0xfca5a5, 1.4, 'motes', 10);
    this.vfx.registerAmbientZone((MAP_W - 6) * TILE, (MAP_H - 6) * TILE, TILE * 2.2, 0xfb7185, 0.8, 'embers', 8);
  }

  private sprinkleResources() {
    const rng = new Phaser.Math.RandomDataGenerator([String(Date.now())]);
    this.spawnResource(8, 4, 'goldmine');
    this.spawnResource(MAP_W - 12, MAP_H - 6, 'goldmine');
    // Extra contested mine in the middle
    this.spawnResource(Math.floor(MAP_W / 2) - 1, Math.floor(MAP_H / 2) - 1, 'goldmine');

    for (let i = 0; i < 110; i++) {
      const tx = Math.floor(rng.frac() * MAP_W);
      const ty = Math.floor(rng.frac() * MAP_H);
      if (!this.map.isRectFree(tx, ty, 1)) continue;
      if (Math.abs(tx - 5) + Math.abs(ty - 5) < 5) continue;
      if (Math.abs(tx - (MAP_W - 7)) + Math.abs(ty - (MAP_H - 7)) < 5) continue;
      this.spawnResource(tx, ty, 'tree');
    }
  }

  spawnUnit(x: number, y: number, kind: UnitKind, team: Team): Unit {
    const u = new Unit(this, x, y, team, kind);
    this.entities.push(u);
    return u;
  }

  spawnBuilding(tx: number, ty: number, kind: BuildingKind, team: Team, built: boolean): Building | null {
    const def = BUILDING_DEFS[kind];
    if (!this.map.isRectFree(tx, ty, def.size)) return null;
    this.map.setBlockedRect(tx, ty, def.size, true);
    this.path.markDirty();
    const b = new Building(this, tx, ty, team, kind, built);
    this.entities.push(b);
    this.buildingsBuilt[team] = (this.buildingsBuilt[team] ?? 0) + 1;
    return b;
  }

  spawnResource(tx: number, ty: number, kind: 'tree' | 'goldmine'): ResourceNode {
    const r = new ResourceNode(this, tx, ty, kind);
    const size = kind === 'goldmine' ? 2 : 1;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) this.map.setBlocked(tx + dx, ty + dy, true);
    }
    this.path.markDirty();
    this.entities.push(r as unknown as Entity);
    this.resources.push(r);
    return r;
  }

  private requestTrain(b: Building, kind: UnitKind): boolean {
    if (!b.isBuilt()) return false;
    const def = UNIT_DEFS[kind];
    if (!this.economy.canTrain(b.team, kind)) {
      if (b.team === 'player') this.notifications.add(T.notEnoughResources, '#f59e0b');
      return false;
    }
    if (!this.economy.spend(b.team, def.cost.gold, def.cost.wood)) return false;
    if (!b.enqueue(kind)) {
      this.economy.refund(b.team, def.cost.gold, def.cost.wood);
      if (b.team === 'player') this.notifications.add(T.queueFull, '#f59e0b');
      return false;
    }
    b.applyTrainTime(kind, def.trainTime);
    return true;
  }

  private onTrainCompleted = (b: Building, kind: UnitKind) => {
    const spawn = this.findSpawnPoint(b);
    const u = this.spawnUnit(spawn.x, spawn.y, kind, b.team);
    const rp = b.rallyPoint;
    if (rp) this.command.moveTo([u], rp.x, rp.y);
    if (b.team === 'player') {
      this.sound2.play('notify');
      this.sound2.voice('ready');
    }
  };

  private onEntityDamaged = (victim: Entity, attacker?: Entity) => {
    if (victim.team !== 'player') return;
    const now = this.time.now;
    if (now - this.lastAttackWarnAt < 4000) return;
    this.lastAttackWarnAt = now;
    const msg = victim instanceof Building ? T.baseUnderAttack : T.underAttack;
    this.notifications.add(msg, '#ef4444');
    this.sound2.play('notify');
    this.sound2.voice('underAttack');
    // Camera-pulse via minimap (handled in UI via registry)
    const r = this.registry.get('lastAttack:player') ?? {};
    this.registry.set('lastAttack:player', { x: victim.x, y: victim.y, at: now });
  };

  private onEntityDied = (e: Entity) => {
    const team = (e as any).team as Team | undefined;
    if (team === 'enemy') this.kills.player = (this.kills.player ?? 0) + 1;
    else if (team === 'player') this.kills.enemy = (this.kills.enemy ?? 0) + 1;
    if (e instanceof Building) {
      this.vfx.shake(8, 300);
      const color = team === 'player' ? 0x3b82f6 : 0xef4444;
      this.vfx.spawnRingWave(e.x, e.y, 5, e.radius + 20, 0.7, color, 3);
    }
  };

  private findSpawnPoint(b: Building): { x: number; y: number } {
    for (let r = 1; r < 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = b.tx + Math.floor(b.size / 2) + dx;
          const ty = b.ty + Math.floor(b.size / 2) + dy;
          if (this.map.inBounds(tx, ty) && !this.map.isBlocked(tx, ty)) {
            return this.map.tileCenter(tx, ty);
          }
        }
      }
    }
    return { x: b.x, y: b.y + TILE * 2 };
  }

  private setupInput() {
    this.input.mouse?.disableContextMenu();
    const pointerTotal = (this.input as any).manager?.pointersTotal;
    const missingPointers = typeof pointerTotal === 'number' ? Math.max(0, 3 - pointerTotal) : 2;
    if (missingPointers > 0) this.input.addPointer(missingPointers);

    // Attach pointer handlers directly to the GameScene input plugin.
    // Earlier refactor routed pointer events via UIScene, which silently
    // dropped them when an interactive UIScene object called stopPropagation
    // earlier in the frame, breaking unit selection.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    this.input.on('wheel', (
      pointer: Phaser.Input.Pointer,
      _objects: Phaser.GameObjects.GameObject[],
      deltaX: number,
      deltaY: number,
      deltaZ: number,
      event: any,
    ) => this.handleWheel(pointer, deltaX, deltaY, deltaZ, event));

    // Only cancel a stuck drag when the window loses focus or goes hidden.
    // (Avoid hooking window 'pointerup' — it fires before Phaser's queued
    // pointerup and would clear dragStart, making the legitimate pointerup
    // think there was nothing to do. Phaser's own 'pointerupoutside' covers
    // the release-outside-canvas case.)
    const onBlur = () => { if (!this.pendingBuild) this.selection.cancelDrag(); };
    const onVis = () => { if (document.hidden && !this.pendingBuild) this.selection.cancelDrag(); };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
    });

    const kb = this.input.keyboard;
    kb?.on('keydown-S', () => { this.command.stop(this.playerSelectedUnits()); this.sound2.play('order'); });
    kb?.on('keydown-ESC', () => {
      this.cancelBuildPlacement();
      this.selection.clear();
      const ui = this.scene.get('UI') as any;
      if (ui?.clearAttackMoveMode) ui.clearAttackMoveMode();
      if (ui?.clearPatrolMode) ui.clearPatrolMode();
      if (ui?.clearRepairMode) ui.clearRepairMode();
      this.sound2.play('cancel');
    });
    kb?.on('keydown-BACKTICK', () => this.groups.cycleIdleWorker());
  }

  handlePointerDown(pointer: Phaser.Input.Pointer) {
    Logger.diag(`game pointerdown screen=(${pointer.x.toFixed(0)},${pointer.y.toFixed(0)}) btns=${pointer.buttons} L=${pointer.leftButtonDown()} R=${pointer.rightButtonDown()} pending=${this.pendingBuild}`);
    const ui = this.scene.get('UI') as any;
    const isTouch = this.trackTouchPointer(pointer);
    const commandClick = this.isCommandPointer(pointer);

    if (this.pendingBuild) {
      if (pointer.rightButtonDown() || commandClick) {
        this.cancelBuildPlacement();
        this.sound2.play('cancel');
        return;
      }
      this.tryPlaceBuilding(pointer);
      return;
    }

    if (isTouch && this.handleTouchPointerDown(pointer, ui)) return;

    if (commandClick) {
      this.handleRightClick(pointer, ui);
      return;
    }

    if (pointer.leftButtonDown() || isTouch) {
      if (ui?.isRepairMode?.()) {
        this.handleRepairClick(pointer);
        return;
      }
      this.selection.onPointerDown(pointer);
    }
  }

  handlePointerMove(pointer: Phaser.Input.Pointer) {
    const isTouch = this.trackTouchPointer(pointer);
    if (isTouch) {
      if (this.handleTouchPointerMove(pointer)) return;
    }
    if (this.pendingBuild && this.ghost) {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tx = Math.floor(world.x / TILE);
      const ty = Math.floor(world.y / TILE);
      const size = BUILDING_DEFS[this.pendingBuild].size;
      this.ghost.x = tx * TILE + (size * TILE) / 2;
      this.ghost.y = ty * TILE + (size * TILE) / 2;
      const ok = this.map.isRectFree(tx, ty, size);
      this.ghost.setTint(ok ? 0x66ff66 : 0xff6666);
    }
    this.selection.onPointerMove(pointer);
  }

  handlePointerUp(pointer: Phaser.Input.Pointer) {
    Logger.diag(`game pointerup screen=(${pointer.x.toFixed(0)},${pointer.y.toFixed(0)}) pending=${this.pendingBuild}`);
    const wasTouch = this.isTrackedTouchPointer(pointer) || this.isTouchPointer(pointer);
    if (wasTouch && this.handleTouchPointerUp(pointer)) return;
    if (!this.pendingBuild) {
      const sel = this.selection.onPointerUp(pointer);
      if (sel && sel.length === 1) {
        const now = this.time.now;
        const single = sel[0];
        if (single instanceof Unit && single.team === 'player') this.sound2.voice('select');
        if (this.lastClickedEntity === single && now - this.lastClickTime < 320) {
          this.selectSameTypeOnScreen(single);
        }
        this.lastClickTime = now;
        this.lastClickedEntity = single;
      }
    }
  }

  private pointerKey(pointer: Phaser.Input.Pointer): number {
    const raw = pointer as any;
    const event = this.pointerEvent(pointer);
    return event?.pointerId ?? raw.pointerId ?? raw.id ?? event?.identifier ?? raw.identifier ?? 0;
  }

  private pointerEvent(pointer: Phaser.Input.Pointer): any {
    return (pointer as any).event;
  }

  private isTouchPointer(pointer: Phaser.Input.Pointer): boolean {
    const event = this.pointerEvent(pointer);
    return event?.pointerType === 'touch' || event?.type?.startsWith?.('touch') || (pointer as any).wasTouch === true;
  }

  private isTrackedTouchPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.touchPointers.has(this.pointerKey(pointer));
  }

  private isCommandPointer(pointer: Phaser.Input.Pointer): boolean {
    const event = this.pointerEvent(pointer);
    return pointer.rightButtonDown() || (pointer.leftButtonDown() && event?.altKey === true);
  }

  private trackTouchPointer(pointer: Phaser.Input.Pointer): boolean {
    if (!this.isTouchPointer(pointer)) return false;
    const id = this.pointerKey(pointer);
    const existing = this.touchPointers.get(id);
    if (existing) {
      existing.x = pointer.x;
      existing.y = pointer.y;
    } else {
      this.touchPointers.set(id, { startX: pointer.x, startY: pointer.y, x: pointer.x, y: pointer.y });
    }
    return true;
  }

  private handleTouchPointerDown(pointer: Phaser.Input.Pointer, ui: any): boolean {
    const id = this.pointerKey(pointer);
    this.longPressFiredPointerId = null;
    if (this.touchPointers.size >= 2) {
      this.cancelLongPress();
      this.selection.cancelDrag();
      for (const pointerId of this.touchPointers.keys()) this.suppressSelectionPointerIds.add(pointerId);
      this.startTouchGesture();
      return true;
    }
    this.scheduleLongPress(pointer, ui);
    return false;
  }

  private handleTouchPointerMove(pointer: Phaser.Input.Pointer): boolean {
    const id = this.pointerKey(pointer);
    const point = this.touchPointers.get(id);
    if (point && Math.hypot(point.x - point.startX, point.y - point.startY) > TOUCH_MOVE_CANCEL_PX) {
      this.cancelLongPress();
    }
    if (this.touchPointers.size >= 2) {
      this.updateTouchGesture();
      return true;
    }
    return this.suppressSelectionPointerIds.has(id);
  }

  private handleTouchPointerUp(pointer: Phaser.Input.Pointer): boolean {
    const id = this.pointerKey(pointer);
    const point = this.touchPointers.get(id);
    const countBefore = this.touchPointers.size;
    const moved = point ? Math.hypot(point.x - point.startX, point.y - point.startY) > TOUCH_MOVE_CANCEL_PX : false;
    const gestureMoved = this.touchGesture?.moved === true;
    const suppressed = this.suppressSelectionPointerIds.has(id);
    const firedLongPress = this.longPressFiredPointerId === id;
    const twoFingerCommand = countBefore >= 2 && !gestureMoved && !moved && this.playerSelectedUnits().length > 0;

    this.touchPointers.delete(id);
    this.suppressSelectionPointerIds.delete(id);
    if (this.touchPointers.size < 2) this.touchGesture = null;
    if (this.touchPointers.size === 0) {
      this.cancelLongPress();
      this.suppressSelectionPointerIds.clear();
      this.longPressFiredPointerId = null;
    }

    if (twoFingerCommand && !this.pendingBuild) {
      this.selection.cancelDrag();
      this.handleRightClick(pointer, this.scene.get('UI') as any);
      return true;
    }

    return suppressed || firedLongPress || countBefore >= 2;
  }

  private scheduleLongPress(pointer: Phaser.Input.Pointer, ui: any) {
    this.cancelLongPress();
    const id = this.pointerKey(pointer);
    this.longPressTimer = this.time.delayedCall(TOUCH_LONG_PRESS_MS, () => {
      const point = this.touchPointers.get(id);
      if (!point || this.touchPointers.size !== 1 || this.pendingBuild) return;
      if (Math.hypot(point.x - point.startX, point.y - point.startY) > TOUCH_MOVE_CANCEL_PX) return;
      if (this.playerSelectedUnits().length === 0) return;

      // Long-press is treated as right-click on touch, so pointer-up must not clear selection.
      this.longPressFiredPointerId = id;
      this.suppressSelectionPointerIds.add(id);
      this.selection.cancelDrag();
      this.handleRightClick(pointer, ui);
    });
  }

  private cancelLongPress() {
    this.longPressTimer?.remove(false);
    this.longPressTimer = null;
  }

  private startTouchGesture() {
    const measure = this.measureTouchGesture();
    if (!measure) return;
    this.touchGesture = {
      lastCenterX: measure.centerX,
      lastCenterY: measure.centerY,
      lastDistance: measure.distance,
      moved: false,
    };
  }

  private updateTouchGesture() {
    const measure = this.measureTouchGesture();
    if (!measure) return;
    if (!this.touchGesture) {
      this.startTouchGesture();
      return;
    }

    const cam = this.cameras.main;
    const dx = measure.centerX - this.touchGesture.lastCenterX;
    const dy = measure.centerY - this.touchGesture.lastCenterY;
    const distanceFactor = this.touchGesture.lastDistance > 0 ? measure.distance / this.touchGesture.lastDistance : 1;

    if (Math.hypot(dx, dy) > TOUCH_GESTURE_MOVE_PX || Math.abs(measure.distance - this.touchGesture.lastDistance) > TOUCH_GESTURE_MOVE_PX) {
      this.touchGesture.moved = true;
      for (const pointerId of this.touchPointers.keys()) this.suppressSelectionPointerIds.add(pointerId);
    }

    cam.scrollX -= dx / cam.zoom;
    cam.scrollY -= dy / cam.zoom;
    if (Number.isFinite(distanceFactor) && Math.abs(distanceFactor - 1) > 0.01) {
      this.zoomCameraAt(measure.centerX, measure.centerY, cam.zoom * distanceFactor);
    }

    this.touchGesture.lastCenterX = measure.centerX;
    this.touchGesture.lastCenterY = measure.centerY;
    this.touchGesture.lastDistance = measure.distance;
  }

  private measureTouchGesture(): { centerX: number; centerY: number; distance: number } | null {
    const points = Array.from(this.touchPointers.values());
    if (points.length < 2) return null;
    const a = points[0];
    const b = points[1];
    return {
      centerX: (a.x + b.x) / 2,
      centerY: (a.y + b.y) / 2,
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  private handleWheel(
    pointer: Phaser.Input.Pointer,
    deltaX: number,
    deltaY: number,
    deltaZ: number,
    event?: any,
  ) {
    event?.preventDefault?.();
    const nativeEvent = event?.event ?? this.pointerEvent(pointer) ?? event;
    const zoomWheel = nativeEvent?.ctrlKey === true || nativeEvent?.metaKey === true || Math.abs(deltaZ) > 0;
    if (zoomWheel) {
      this.zoomCameraAt(pointer.x, pointer.y, this.cameras.main.zoom * Math.exp(-deltaY * WHEEL_ZOOM_SPEED));
      return;
    }

    const cam = this.cameras.main;
    const panX = (nativeEvent?.shiftKey ? deltaY + deltaX : deltaX) / cam.zoom;
    const panY = (nativeEvent?.shiftKey ? 0 : deltaY) / cam.zoom;
    cam.scrollX += panX;
    cam.scrollY += panY;
  }

  private zoomCameraAt(screenX: number, screenY: number, zoom: number) {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(screenX, screenY);
    cam.setZoom(Phaser.Math.Clamp(zoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM));
    const after = cam.getWorldPoint(screenX, screenY);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  private selectSameTypeOnScreen(e: Entity) {
    if (!(e instanceof Unit)) return;
    if (e.team !== 'player') return;
    const cam = this.cameras.main;
    const v = cam.worldView;
    const same = this.entities.filter((o): o is Unit =>
      o instanceof Unit && !o.dead && o.team === 'player' && o.kind === e.kind &&
      o.x >= v.x && o.x <= v.x + v.width && o.y >= v.y && o.y <= v.y + v.height
    );
    if (same.length > 0) {
      this.selection.setSelection(same);
      this.sound2.play('select');
    }
  }

  private beginRepairMode() {
    const ui = this.scene.get('UI') as any;
    if (ui?.setRepairMode) ui.setRepairMode();
  }

  private handleRepairClick(pointer: Phaser.Input.Pointer) {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    let best: Building | null = null;
    let bestD = Infinity;
    for (const e of this.entities) {
      if (!(e instanceof Building) || e.dead) continue;
      if (e.team !== 'player') continue;
      if (e.hp >= e.maxHp) continue;
      const d = Math.hypot(world.x - e.x, world.y - e.y) - e.radius;
      if (d < bestD) { bestD = d; best = e; }
    }
    const ui = this.scene.get('UI') as any;
    if (best) {
      const peasants = this.playerSelectedUnits().filter(u => u.kind === 'peasant');
      if (peasants.length > 0) {
        this.command.repair(peasants, best);
        this.sound2.play('order');
      }
    }
    ui?.clearRepairMode?.();
  }

  private handleRightClick(pointer: Phaser.Input.Pointer, ui: any) {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const units = this.playerSelectedUnits();
    if (units.length === 0) return;

    if (ui?.isAttackMoveMode?.()) {
      ui.clearAttackMoveMode();
      this.command.attackMove(units, world.x, world.y);
      this.vfx.spawnSparks(world.x, world.y, 0xff4444, 8);
      this.notifications.add(T.attackMoveNotif, '#ef4444');
      this.sound2.play('order');
      this.sound2.voice('attack');
      return;
    }

    if (ui?.isPatrolMode?.()) {
      const pointA = ui.getPatrolPointA?.();
      if (!pointA) {
        ui.setPatrolPointA({ x: world.x, y: world.y });
        return;
      }
      ui.clearPatrolMode();
      this.command.patrol(units, pointA, { x: world.x, y: world.y });
      this.notifications.add(T.patrolSetNotif, '#22c55e');
      this.sound2.play('order');
      this.sound2.voice('order');
      return;
    }

    let target: Entity | null = null;
    let bestD = Infinity;
    for (const e of this.entities) {
      if (e.dead) continue;
      if ((e as any).visible === false) continue; // Hidden by fog.
      const team = (e as any).team;
      if (team && team !== 'player') {
        const tx = Math.floor(e.x / TILE);
        const ty = Math.floor(e.y / TILE);
        if (!this.fog.isVisible(tx, ty)) continue;
      }
      const r = (e as any).radius ?? 14;
      const d = Math.hypot(world.x - e.x, world.y - e.y);
      if (d <= r + 6 && d < bestD) { bestD = d; target = e; }
    }

    if (target) {
      if (target instanceof ResourceNode) {
        const peasants = units.filter((u) => u.kind === 'peasant');
        if (peasants.length > 0) this.command.gather(peasants, target);
        const fighters = units.filter((u) => u.kind !== 'peasant');
        if (fighters.length > 0) this.command.moveTo(fighters, world.x, world.y);
        this.sound2.play('order');
        this.sound2.voice(peasants.length > 0 ? 'work' : 'order');
        return;
      }
      if (target instanceof Building && (target as any).team === 'player') {
        if (units.some(u => u.kind === 'peasant') && !target.isBuilt()) {
          const peasant = units.find(u => u.kind === 'peasant');
          if (peasant) this.command.buildWith(peasant, target);
          this.sound2.play('order');
          this.sound2.voice('build');
          return;
        }
        if (target.isBuilt() && target.hp < target.maxHp && units.some(u => u.kind === 'peasant')) {
          const peasants = units.filter(u => u.kind === 'peasant');
          this.command.repair(peasants, target);
          this.sound2.play('order');
          this.sound2.voice('work');
          return;
        }
        target.setRallyPoint(world.x, world.y);
        this.notifications.add(T.rallyPointSet, '#22c55e');
        this.sound2.play('click');
        return;
      }
      if ((target as any).team !== undefined && (target as any).team !== 'player') {
        this.command.attackTarget(units, target as Entity);
        this.vfx.spawnSparks(world.x, world.y, 0xff4444, 4);
        this.sound2.play('order');
        this.sound2.voice('attack');
        return;
      }
    }
    this.command.moveTo(units, world.x, world.y);
    this.vfx.spawnSparks(world.x, world.y, 0x3b82f6, 4);
    this.sound2.play('order');
    this.sound2.voice('order');
  }

  private setupCamera() {
    const cam = this.cameras.main;
    cam.setZoom(1);

    let dragging = false;
    let lastX = 0, lastY = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.middleButtonDown()) { dragging = true; lastX = p.x; lastY = p.y; }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (dragging) {
        cam.scrollX -= (p.x - lastX) / cam.zoom;
        cam.scrollY -= (p.y - lastY) / cam.zoom;
        lastX = p.x; lastY = p.y;
      }
    });
    this.input.on('pointerup', () => { dragging = false; });

    const handleZoomKey = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey)) return;
      if (ev.key === '=' || ev.key === '+') {
        ev.preventDefault();
        this.zoomCameraAt(cam.x + cam.width / 2, cam.y + cam.height / 2, cam.zoom + 0.1);
      } else if (ev.key === '-' || ev.key === '_') {
        ev.preventDefault();
        this.zoomCameraAt(cam.x + cam.width / 2, cam.y + cam.height / 2, cam.zoom - 0.1);
      } else if (ev.key === '0') {
        ev.preventDefault();
        this.zoomCameraAt(cam.x + cam.width / 2, cam.y + cam.height / 2, 1);
      }
    };
    window.addEventListener('keydown', handleZoomKey);
    this.events.once('shutdown', () => window.removeEventListener('keydown', handleZoomKey));
    this.events.once('destroy', () => window.removeEventListener('keydown', handleZoomKey));

    const keys = this.input.keyboard?.createCursorKeys();
    const speed = 600;
    this.events.on('update', (_t: number, delta: number) => {
      const d = (speed * delta) / 1000;
      if (keys) {
        if (keys.left?.isDown) cam.scrollX -= d;
        if (keys.right?.isDown) cam.scrollX += d;
        if (keys.up?.isDown) cam.scrollY -= d;
        if (keys.down?.isDown) cam.scrollY += d;
      }
    });
  }

  playerSelectedUnits(): Unit[] {
    return this.selection.selected.filter((e): e is Unit =>
      e instanceof Unit && e.team === 'player' && !e.dead);
  }

  private beginBuildPlacement(kind: BuildingKind) {
    this.cancelBuildPlacement();
    if (!this.economy.canBuild('player', kind)) {
      this.notifications.add(T.notEnoughResources, '#f59e0b');
      this.sound2.play('cancel');
      return;
    }
    this.pendingBuild = kind;
    this.ghost = this.add.image(0, 0, `bld-${kind}-player-d`).setAlpha(0.6).setDepth(5000);
    this.sound2.voice('build');
  }

  private cancelBuildPlacement() {
    this.pendingBuild = null;
    this.ghost?.destroy();
    this.ghost = null;
  }

  private tryPlaceBuilding(pointer: Phaser.Input.Pointer) {
    if (!this.pendingBuild) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tx = Math.floor(world.x / TILE);
    const ty = Math.floor(world.y / TILE);
    const kind = this.pendingBuild;
    const def = BUILDING_DEFS[kind];
    if (!this.map.isRectFree(tx, ty, def.size)) {
      this.sound2.play('cancel');
      return;
    }
    if (!this.economy.spend('player', def.cost.gold, def.cost.wood)) {
      this.cancelBuildPlacement();
      this.sound2.play('cancel');
      return;
    }
    const b = this.spawnBuilding(tx, ty, kind, 'player', false);
    if (!b) {
      this.economy.refund('player', def.cost.gold, def.cost.wood);
      this.cancelBuildPlacement();
      return;
    }
    const peasants = this.entities.filter((e): e is Unit =>
      e instanceof Unit && e.team === 'player' && e.kind === 'peasant' && !e.dead);
    if (peasants.length > 0) {
      peasants.sort((a, b2) => Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) - Phaser.Math.Distance.Between(b2.x, b2.y, b.x, b.y));
      this.command.buildWith(peasants[0], b);
    }
    this.cancelBuildPlacement();
    this.notifications.add(`${T.buildingNotif} ${buildingName(kind)}...`, '#facc15');
    this.sound2.play('order');
    this.sound2.voice('build');
  }
}
