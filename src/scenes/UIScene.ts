import Phaser from 'phaser';
import { BUILDING_DEFS, BuildingKind, Team, TILE, UNIT_DEFS, UnitKind, VIEWPORT_H, VIEWPORT_W, WORLD_H, WORLD_W } from '../config';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/Resource';
import { T, unitName, buildingName } from '../i18n';

type VolumeKind = 'music' | 'effects' | 'voice';

export class UIScene extends Phaser.Scene {
  private resourceText!: Phaser.GameObjects.Text;
  private selectionText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private buttonsLayer!: Phaser.GameObjects.Container;
  private minimap!: Phaser.GameObjects.Graphics;
  private minimapBg!: Phaser.GameObjects.Rectangle;
  private trainProgress!: Phaser.GameObjects.Graphics;
  private gameTimerText!: Phaser.GameObjects.Text;
  private modeIndicator!: Phaser.GameObjects.Text;
  private idleText!: Phaser.GameObjects.Text;
  private selectionPortrait!: Phaser.GameObjects.Image;
  private tooltipText!: Phaser.GameObjects.Text;
  private tooltipBg!: Phaser.GameObjects.Rectangle;
  private settingsOverlay: Phaser.GameObjects.Container | null = null;
  private settingsFullscreenText: Phaser.GameObjects.Text | null = null;
  private settingsValueTexts: Partial<Record<VolumeKind, Phaser.GameObjects.Text>> = {};
  private settingsBars: Partial<Record<VolumeKind, { fill: Phaser.GameObjects.Rectangle; width: number }>> = {};
  private settingsVolumes: Record<VolumeKind, number> = { music: 0.75, effects: 0.85, voice: 0.85 };

  private pauseOverlay: Phaser.GameObjects.Rectangle | null = null;
  private pauseLabel: Phaser.GameObjects.Text | null = null;

  private selected: Entity[] = [];
  private attackMoveMode = false;
  private patrolMode = false;
  private patrolPointA: { x: number; y: number } | null = null;
  private repairMode = false;
  private readonly compactUi = VIEWPORT_W / VIEWPORT_H >= 1.7;
  private readonly bottomPanelH = 154;
  private readonly bottomBarH = this.compactUi ? 138 : 154;
  private readonly actionButtonW = this.compactUi ? 154 : 175;
  private readonly actionButtonH = this.compactUi ? 28 : 32;
  private readonly actionButtonGap = this.compactUi ? 6 : 8;
  private readonly actionButtonFont = this.compactUi ? '10px' : '12px';
  private readonly buttonsOriginX = VIEWPORT_W - ((this.compactUi ? 154 : 175) * 2 + (this.compactUi ? 6 : 8) + 16);
  private readonly buttonsOriginY = VIEWPORT_H - (this.compactUi ? 126 : 140);
  private readonly minimapW = this.compactUi ? 178 : 200;
  private readonly minimapH = this.compactUi ? 112 : 130;
  private lastAffordHash: string | null = null;
  private gameScene: Phaser.Scene | null = null;
  private readonly onSelectionChanged = (ents: Entity[]) => {
    this.selected = ents;
    this.redrawButtons();
    this.updateSelectionText();
    this.updatePortrait();
  };

  constructor() { super('UI'); }

  create() {
    const game = this.scene.get('Game') as Phaser.Scene;
    this.gameScene = game;

    // NB: no setDepth — chrome is added first so it renders under later
    // children (text, buttons, portrait). Previously chrome was at depth 9990
    // which hid every UI control underneath it.
    const chrome = this.add.graphics();
    // Top bar
    chrome.fillStyle(0x0d1420, 0.92).fillRect(0, 0, VIEWPORT_W, 44);
    chrome.fillStyle(0x60a5fa, 0.3).fillRect(0, 42, VIEWPORT_W, 2);
    // Bottom bar (single flat panel)
    chrome.fillStyle(0x0d1420, 0.94).fillRect(0, VIEWPORT_H - this.bottomPanelH, VIEWPORT_W, this.bottomPanelH);
    chrome.fillStyle(0x60a5fa, 0.25).fillRect(0, VIEWPORT_H - this.bottomPanelH, VIEWPORT_W, 2);
    // Subtle vertical dividers between portrait / minimap / buttons areas
    chrome.fillStyle(0xffffff, 0.05).fillRect(VIEWPORT_W / 2 - 106, VIEWPORT_H - this.bottomBarH + 10, 1, this.bottomBarH - 20);
    chrome.fillStyle(0xffffff, 0.05).fillRect(VIEWPORT_W / 2 + 106, VIEWPORT_H - this.bottomBarH + 10, 1, this.bottomBarH - 20);

    this.resourceText = this.add.text(16, 10, '', {
      fontFamily: 'Trebuchet MS, monospace', fontSize: this.compactUi ? '16px' : '18px', color: '#ffe066', fontStyle: 'bold',
    });
    this.resourceText.setShadow(0, 2, '#000000', 5, true, true);

    this.gameTimerText = this.add.text(VIEWPORT_W - 56, 10, '0:00', {
      fontFamily: 'Trebuchet MS, monospace', fontSize: this.compactUi ? '14px' : '16px', color: '#cbd5e1',
    }).setOrigin(1, 0);
    this.gameTimerText.setShadow(0, 2, '#000000', 4, true, true);

    this.idleText = this.add.text(VIEWPORT_W - 142, 10, '', {
      fontFamily: 'Trebuchet MS, monospace', fontSize: this.compactUi ? '12px' : '14px', color: '#fbbf24', fontStyle: 'bold',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.idleText.setShadow(0, 2, '#000000', 4, true, true);
    this.idleText.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      game.events.emit('ui:cycle-idle');
    });

    this.makeSettingsButton();

    const portraitSize = this.compactUi ? 76 : 88;
    const portraitFrame = this.compactUi ? 86 : 98;
    const portraitX = this.compactUi ? 50 : 58;
    const portraitY = VIEWPORT_H - this.bottomBarH / 2 - 4;
    this.selectionPortrait = this.add.image(portraitX, portraitY, 'pixel').setOrigin(0.5).setVisible(false).setScale(1);
    this.add.rectangle(portraitX, portraitY, portraitSize, portraitSize, 0x000000, 0.22).setStrokeStyle(2, 0x5f7b95);
    this.add.rectangle(portraitX, portraitY, portraitFrame, portraitFrame, 0xffffff, 0.02).setStrokeStyle(1, 0xffffff, 0.08);

    this.selectionText = this.add.text(this.compactUi ? 102 : 116, VIEWPORT_H - this.bottomBarH + 18, '', {
      fontFamily: 'Trebuchet MS, monospace', fontSize: this.compactUi ? '11px' : '13px', color: '#e2e8f0',
      wordWrap: { width: this.compactUi ? 330 : 430 },
    }).setLineSpacing(this.compactUi ? 0 : 2);
    this.selectionText.setShadow(0, 2, '#000000', 4, true, true);

    this.helpText = this.add.text(14, VIEWPORT_H - 4, '', {
      fontFamily: 'Trebuchet MS, monospace', fontSize: this.compactUi ? '9px' : '10px', color: '#7f95ab',
      wordWrap: { width: this.compactUi ? 560 : 720 },
    }).setOrigin(0, 1).setLineSpacing(this.compactUi ? 0 : 2).setText(T.helpText);

    this.modeIndicator = this.add.text(VIEWPORT_W / 2, 54, '', {
      fontFamily: 'Trebuchet MS, monospace', fontSize: this.compactUi ? '14px' : '16px', color: '#ef4444', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10002);
    this.modeIndicator.setBackgroundColor('rgba(9, 17, 26, 0.8)');
    this.modeIndicator.setPadding(12, 6, 12, 6);

    this.tooltipBg = this.add.rectangle(0, 0, 10, 10, 0x09111a, 0.96).setOrigin(0, 1).setStrokeStyle(1, 0x5f7b95).setDepth(10005).setVisible(false);
    this.tooltipText = this.add.text(0, 0, '', {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '11px', color: '#e2e8f0',
    }).setOrigin(0, 1).setDepth(10006).setVisible(false);
    this.tooltipText.setShadow(0, 2, '#000000', 4, true, true);

    this.buttonsLayer = this.add.container(this.buttonsOriginX, this.buttonsOriginY);

    this.trainProgress = this.add.graphics();

    const mmW = this.minimapW, mmH = this.minimapH;
    const mmX = VIEWPORT_W / 2 - mmW / 2;
    const mmY = VIEWPORT_H - mmH - (this.compactUi ? 12 : 10);
    this.minimapBg = this.add.rectangle(mmX, mmY, mmW, mmH, 0x071018, 0.92).setOrigin(0, 0).setStrokeStyle(2, 0x617990).setInteractive({ useHandCursor: true });
    this.add.rectangle(mmX + mmW / 2, mmY + mmH / 2, mmW + 18, mmH + 18, 0xffffff, 0.02).setStrokeStyle(1, 0xffffff, 0.08);

    this.minimap = this.add.graphics();
    this.minimapBg.on('pointerdown', (pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.jumpCamera(pointer, mmX, mmY, mmW, mmH, game);
    });
    this.minimapBg.on('pointermove', (pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      if (pointer.isDown) {
        event.stopPropagation();
        this.jumpCamera(pointer, mmX, mmY, mmW, mmH, game);
      }
    });

    game.events.on('selection:changed', this.onSelectionChanged);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    const kb = this.input.keyboard;
    kb?.on('keydown-A', () => {
      this.attackMoveMode = !this.attackMoveMode;
      this.modeIndicator.setText(this.attackMoveMode ? T.attackMove : '');
    });
    kb?.on('keydown-P', () => this.setPatrolMode());
    kb?.on('keydown-T', () => this.requestBuild('townhall'));
    kb?.on('keydown-B', () => this.requestBuild('barracks'));
    kb?.on('keydown-F', () => this.requestBuild('farm'));
    kb?.on('keydown-W', () => this.requestBuild('tower'));
    kb?.on('keydown-H', () => {
      this.scene.get('Game').events.emit('ui:hold');
    });
    kb?.on('keydown-R', () => {
      const sel = this.selected;
      const hasPeasant = sel.some((e) => e instanceof Unit && e.team === 'player' && e.kind === 'peasant');
      if (hasPeasant) this.setRepairMode();
    });

    kb?.on('keydown-SPACE', () => this.togglePause());
  }

  update() {
    this.updateResourceBar();
    this.updateMinimap();
    this.updateSelectionText();
    this.updateTrainProgress();
    this.updateGameTimer();
    this.updateIdleWorkers();
    this.refreshButtonsIfAffordChanged();
  }

  private computeAffordHash(): string | null {
    if (this.selected.length === 0) return null;
    const first = this.selected[0];
    const team = (first as any).team as Team | undefined;
    if (team !== 'player') return null;
    const gs: any = this.scene.get('Game');
    const eco = gs?.economy;
    if (!eco) return null;
    if (first instanceof Building) {
      const def = BUILDING_DEFS[first.kind];
      return (def.trains ?? []).map((k) => (eco.canTrain('player', k) ? '1' : '0')).join('');
    }
    if (first instanceof Unit && first.kind === 'peasant') {
      const kinds: BuildingKind[] = ['townhall', 'barracks', 'farm', 'tower'];
      return kinds.map((k) => (eco.canBuild('player', k) ? '1' : '0')).join('');
    }
    return null;
  }

  private refreshButtonsIfAffordChanged() {
    const hash = this.computeAffordHash();
    if (hash !== null && hash !== this.lastAffordHash) {
      this.redrawButtons();
    }
  }

  private jumpCamera(pointer: Phaser.Input.Pointer, mmX: number, mmY: number, mmW: number, mmH: number, game: Phaser.Scene) {
    const lx = pointer.x - mmX;
    const ly = pointer.y - mmY;
    const wx = (lx / mmW) * WORLD_W;
    const wy = (ly / mmH) * WORLD_H;
    (game as any).cameras.main.centerOn(wx, wy);
  }

  private updateGameTimer() {
    const gs = this.scene.get('Game') as any;
    if (!gs) return;
    const time = gs.gameTime ?? gs.time?.now ?? 0;
    const totalSec = Math.floor(time / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    this.gameTimerText.setText(`${min}:${sec.toString().padStart(2, '0')}`);
  }

  private onShutdown() {
    this.gameScene?.events.off('selection:changed', this.onSelectionChanged);
    this.gameScene = null;
    this.closeSettingsMenu();
    this.input.removeAllListeners();
    this.input.keyboard?.removeAllListeners();
    this.selected = [];
    this.attackMoveMode = false;
    this.patrolMode = false;
    this.patrolPointA = null;
    this.repairMode = false;
  }

  private updateIdleWorkers() {
    const gs = this.scene.get('Game') as any;
    if (!gs || !gs.entities) return;
    let count = 0;
    for (const e of gs.entities as Entity[]) {
      if (e instanceof Unit && e.team === 'player' && !e.dead && e.kind === 'peasant' && e.isIdle()) {
        count++;
      }
    }
    this.idleText.setText(count > 0 ? `[${'`'}] ${T.idleWorkers}: ${count}` : '');
  }

  private updateResourceBar() {
    const gs = this.scene.get('Game');
    const r = gs.registry.get('res:player') ?? { gold: 0, wood: 0 };
    const eco = (gs as any).economy;
    const used = eco ? Math.ceil(eco.foodUsed('player')) : 0;
    const cap = eco ? Math.floor(eco.foodCap('player')) : 5;
    const foodColor = used >= cap ? '#ef4444' : used >= cap - 2 ? '#f59e0b' : '#ffe066';
    this.resourceText.setText(`${T.gold}: ${Math.floor(r.gold)}   ${T.wood}: ${Math.floor(r.wood)}   ${T.food}: ${used}/${cap}`);
    this.resourceText.setColor(foodColor === '#ffe066' ? '#ffe066' : foodColor);
  }

  private updateMinimap() {
    const gs = this.scene.get('Game') as any;
    if (!gs || !gs.entities) return;
    const mmX = this.minimapBg.x;
    const mmY = this.minimapBg.y;
    const mmW = this.minimapBg.width;
    const mmH = this.minimapBg.height;
    const fog = gs.fog;

    this.minimap.clear();
    this.minimap.fillStyle(0x0f2117, 1);
    this.minimap.fillRect(mmX, mmY, mmW, mmH);
    this.minimap.fillStyle(0x1d3a27, 0.5);
    this.minimap.fillEllipse(mmX + mmW * 0.28, mmY + mmH * 0.25, mmW * 0.5, mmH * 0.35);
    this.minimap.fillStyle(0x12354e, 0.18);
    this.minimap.fillEllipse(mmX + mmW * 0.7, mmY + mmH * 0.55, mmW * 0.42, mmH * 0.25);

    if (gs.map) {
      const mw = gs.map.w;
      const mh = gs.map.h;
      const pw = mmW / mw;
      const ph = mmH / mh;
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const explored = !fog || !fog.isEnabled?.() ? true : fog.isExplored(x, y);
          if (!explored) {
            const px = mmX + (x / mw) * mmW;
            const py = mmY + (y / mh) * mmH;
            this.minimap.fillStyle(0x000000, 1);
            this.minimap.fillRect(px, py, Math.max(1, pw), Math.max(1, ph));
          } else if (gs.map.isBlocked(x, y)) {
            const px = mmX + (x / mw) * mmW;
            const py = mmY + (y / mh) * mmH;
            this.minimap.fillStyle(0x2a4a2a, 1);
            this.minimap.fillRect(px, py, Math.max(1, pw), Math.max(1, ph));
          }
        }
      }
    }

    for (const e of gs.entities as Entity[]) {
      if ((e as any).dead) continue;
      const tx = Math.floor((e.x ?? 0) / TILE);
      const ty = Math.floor((e.y ?? 0) / TILE);
      const team = (e as any).team;
      if (team && team !== 'player' && fog && fog.isEnabled?.() && !fog.isExplored(tx, ty)) continue;
      const ex = mmX + ((e.x ?? 0) / WORLD_W) * mmW;
      const ey = mmY + ((e.y ?? 0) / WORLD_H) * mmH;
      let color = 0xaaaaaa;
      if (team === 'player') color = 0x3b82f6;
      else if (team === 'enemy') color = 0xef4444;
      else if ((e as any).kind === 'tree') color = 0x22c55e;
      else if ((e as any).kind === 'goldmine') color = 0xfacc15;
      const size = e instanceof Building ? 4 : 2;
      this.minimap.fillStyle(color, 1);
      this.minimap.fillRect(ex - size / 2, ey - size / 2, size, size);
    }

    // Attack pulse
    const lastAttack = gs.registry.get('lastAttack:player');
    if (lastAttack) {
      const age = (gs.time?.now ?? 0) - lastAttack.at;
      if (age >= 0 && age < 3000) {
        const phase = (age % 600) / 600;
        const alpha = 1 - phase;
        const r = 3 + phase * 8;
        const px = mmX + (lastAttack.x / WORLD_W) * mmW;
        const py = mmY + (lastAttack.y / WORLD_H) * mmH;
        this.minimap.lineStyle(2, 0xff4444, alpha);
        this.minimap.strokeCircle(px, py, r);
      }
    }

    const cam = gs.cameras.main as Phaser.Cameras.Scene2D.Camera;
    const vx = mmX + (cam.worldView.x / WORLD_W) * mmW;
    const vy = mmY + (cam.worldView.y / WORLD_H) * mmH;
    const vw = (cam.worldView.width / WORLD_W) * mmW;
    const vh = (cam.worldView.height / WORLD_H) * mmH;
    this.minimap.lineStyle(1.5, 0xffffff, 0.8);
    this.minimap.strokeRect(vx, vy, vw, vh);
  }

  private updateSelectionText() {
    if (this.selected.length === 0) {
      this.selectionText.setText(T.nothingSelected);
      return;
    }
    if (this.selected.length === 1) {
      const e = this.selected[0];
      if (e instanceof Unit) {
        const stateStr = this.fsmToString(e.fsm.kind);
        this.selectionText.setText(
          `${unitName(e.kind)}\n` +
          `${T.hp}: ${Math.ceil(e.hp)}/${e.maxHp}  ${T.atk}: ${e.attack}  ${T.arm}: ${e.armor}  ${T.rng}: ${Math.round(e.range / 32)}\n` +
          `${stateStr}`
        );
      } else if (e instanceof Building) {
        const progress = e.isBuilt() ? T.ready : `${T.building_progress} ${Math.floor((e.buildProgress / e.buildTime) * 100)}%`;
        const q = e.trainQueue.length ? `\n${T.queue}: ${e.trainQueue.map((o) => unitName(o.kind)).join(', ')}` : '';
        const atk = e.attack > 0 ? `  ${T.atk}: ${e.attack}` : '';
        this.selectionText.setText(`${buildingName(e.kind)}\n${T.hp}: ${Math.ceil(e.hp)}/${e.maxHp}${atk}\n${progress}${q}`);
      } else if (e instanceof ResourceNode) {
        this.selectionText.setText(`${(e as any).kind === 'tree' ? T.tree : T.goldmine}\n${T.stock}: ${(e as any).stock}/${(e as any).maxStock}`);
      } else {
        this.selectionText.setText('???');
      }
    } else {
      const counts: Record<string, number> = {};
      for (const e of this.selected) {
        if (e instanceof Unit) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      }
      this.selectionText.setText(`${T.selected} ${this.selected.length}:\n` + Object.entries(counts).map(([k, v]) => `${unitName(k)} x${v}`).join('  '));
    }
  }

  private updatePortrait() {
    if (this.selected.length === 1) {
      const e = this.selected[0];
      if (e instanceof Unit) {
        this.selectionPortrait.setTexture(`unit-${e.kind}-${e.team}-d`).setVisible(true).setScale(2.2);
      } else if (e instanceof Building) {
        this.selectionPortrait.setTexture(`bld-${e.kind}-${e.team}-d`).setVisible(true).setScale(e.size === 3 ? 0.8 : 1.2);
      } else if (e instanceof ResourceNode) {
        this.selectionPortrait.setTexture(e.kind === 'goldmine' ? 'res-goldmine-d' : 'res-tree-d').setVisible(true).setScale(2);
      } else {
        this.selectionPortrait.setVisible(false);
      }
    } else if (this.selected.length > 1) {
      const first = this.selected[0];
      if (first instanceof Unit) {
        this.selectionPortrait.setTexture(`unit-${first.kind}-${first.team}-d`).setVisible(true).setScale(2.2);
      } else {
        this.selectionPortrait.setVisible(false);
      }
    } else {
      this.selectionPortrait.setVisible(false);
    }
  }

  private fsmToString(kind: string): string {
    const map: Record<string, string> = {
      idle: T.idle, moving: T.moving, attackMoving: T.attackMoving,
      attacking: T.attacking, gathering: T.gathering, returning: T.returning,
      building: T.building_state, patrol: T.patrol, hold: T.hold, repair: T.repair, dead: T.dead,
    };
    return map[kind] ?? kind;
  }

  private updateTrainProgress() {
    this.trainProgress.clear();
    const gs = this.scene.get('Game') as any;
    if (!gs) return;
    const cam = gs.cameras.main as Phaser.Cameras.Scene2D.Camera;
    for (const e of gs.entities as Entity[]) {
      if (!(e instanceof Building)) continue;
      if (e.dead) continue;
      // Construction progress
      if (!e.isBuilt()) {
        const sx = (e.x - cam.worldView.x) * cam.zoom;
        const sy = (e.y + (e as any).radius + 4 - cam.worldView.y) * cam.zoom;
        const w = 44;
        this.trainProgress.fillStyle(0x000000, 0.7);
        this.trainProgress.fillRect(sx - w / 2, sy, w, 7);
        this.trainProgress.fillStyle(0xfacc15, 1);
        this.trainProgress.fillRect(sx - w / 2, sy, w * e.buildRatio(), 7);
        this.trainProgress.lineStyle(1, 0xe2e8f0, 0.2);
        this.trainProgress.strokeRect(sx - w / 2, sy, w, 7);
        continue;
      }
      if (e.trainQueue.length === 0) continue;
      const progress = e.currentProgress();
      if (progress <= 0) continue;
      const sx = (e.x - cam.worldView.x) * cam.zoom;
      const sy = (e.y + (e as any).radius + 4 - cam.worldView.y) * cam.zoom;
      const w = 44;
      this.trainProgress.fillStyle(0x000000, 0.7);
      this.trainProgress.fillRect(sx - w / 2, sy, w, 7);
      this.trainProgress.fillStyle(0x3b82f6, 1);
      this.trainProgress.fillRect(sx - w / 2, sy, w * progress, 7);
      this.trainProgress.lineStyle(1, 0xe2e8f0, 0.2);
      this.trainProgress.strokeRect(sx - w / 2, sy, w, 7);
    }
  }

  private redrawButtons() {
    this.buttonsLayer.removeAll(true);
    this.hideTooltip();
    const gs = this.scene.get('Game');
    this.lastAffordHash = this.computeAffordHash();
    if (this.selected.length === 0) return;

    const first = this.selected[0];
    const team = (first as any).team as Team | undefined;
    if (team !== 'player') return;

    if (first instanceof Building) {
      const def = BUILDING_DEFS[first.kind];
      (def.trains ?? []).forEach((k, i) => {
        const udef = UNIT_DEFS[k];
        const canAfford = (gs as any).economy?.canTrain('player', k);
        const label = `${unitName(k)} ${udef.cost.gold}з/${udef.cost.wood}д`;
        const tip = `${unitName(k)}\nHP: ${udef.maxHp}  Атк: ${udef.attack}  Брон: ${udef.armor}\nЦена: ${udef.cost.gold}з ${udef.cost.wood}д ${udef.cost.food}е\nОбуч.: ${Math.round(udef.trainTime / 1000)}с`;
        this.makeButton(i, label, () => gs.events.emit('ui:train', first, k), canAfford, tip);
      });
      return;
    }
    if (first instanceof Unit && first.kind === 'peasant') {
      const kinds: BuildingKind[] = ['townhall', 'barracks', 'farm', 'tower'];
      const hotkeys: Record<BuildingKind, string> = { townhall: 'T', barracks: 'B', farm: 'F', tower: 'W' };
      kinds.forEach((k, i) => {
        const bdef = BUILDING_DEFS[k];
        const canAfford = (gs as any).economy?.canBuild('player', k);
        const extra = bdef.provides?.food ? ` (+${bdef.provides.food}е)` : bdef.attack ? ` (атк ${bdef.attack})` : '';
        const tip = `${buildingName(k)}${extra}\nHP: ${bdef.maxHp}\nЦена: ${bdef.cost.gold}з ${bdef.cost.wood}д`;
        this.makeButton(i, `[${hotkeys[k]}] ${buildingName(k)}  ${bdef.cost.gold}з/${bdef.cost.wood}д`, () => this.requestBuild(k), canAfford, tip);
      });
      this.makeButton(4, `[R] ${T.repairCmd}`, () => this.setRepairMode(), true, 'Восстановить здание');
      this.makeButton(5, `[S] ${T.stop}`, () => gs.events.emit('ui:stop'), true);
      return;
    }
    if (first instanceof Unit) {
      this.makeButton(0, `[S] ${T.stop}`, () => gs.events.emit('ui:stop'), true);
      this.makeButton(1, `[A] ${T.attackMoveShort}`, () => {
        this.attackMoveMode = true;
        this.modeIndicator.setText(T.attackMove);
      }, true);
      this.makeButton(2, `[P] ${T.patrolShort}`, () => this.setPatrolMode(), true);
      this.makeButton(3, `[H] ${T.holdShort}`, () => gs.events.emit('ui:hold'), true);
    }
  }

  private makeButton(i: number, label: string, onClick: () => void, enabled = true, tooltip?: string) {
    const w = this.actionButtonW, h = this.actionButtonH;
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col * (w + this.actionButtonGap);
    const y = row * (h + this.actionButtonGap);
    const bgColor = enabled ? 0x152432 : 0x101418;
    const borderColor = enabled ? 0x617990 : 0x2f3942;
    const accentColor = enabled ? 0x60a5fa : 0x374151;
    const textColor = enabled ? '#f8fafc' : '#64748b';
    const shadow = this.add.rectangle(x + 2, y + 3, w, h, 0x000000, 0.18).setOrigin(0, 0);
    const bg = this.add.rectangle(x, y, w, h, bgColor, 0.96).setOrigin(0, 0).setStrokeStyle(1, borderColor).setInteractive({ useHandCursor: enabled });
    const accent = this.add.rectangle(x + 6, y + h / 2, 4, h - 10, accentColor, enabled ? 0.95 : 0.35).setOrigin(0, 0.5);
    const shine = this.add.rectangle(x + w / 2, y + 4, w - 12, 5, 0xffffff, 0.04).setOrigin(0.5, 0);
    const txt = this.add.text(x + 14, y + (this.compactUi ? 7 : 8), label, {
      fontFamily: 'Trebuchet MS, monospace', fontSize: this.actionButtonFont, color: textColor, fontStyle: 'bold',
      fixedWidth: w - 20,
    });
    txt.setShadow(0, 1, '#000000', 3, true, true);
    if (enabled) {
      bg.on('pointerover', () => {
        bg.setFillStyle(0x1d3347, 1);
        accent.setFillStyle(0x93c5fd, 1);
        if (tooltip) this.showTooltip(this.buttonsLayer.x + x, this.buttonsLayer.y + y - 6, tooltip);
      });
      bg.on('pointerout', () => {
        bg.setFillStyle(bgColor, 0.96);
        accent.setFillStyle(accentColor, 0.95);
        this.hideTooltip();
      });
    }
    bg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (enabled) onClick();
    });
    this.buttonsLayer.add([shadow, bg, accent, shine, txt]);
  }

  private makeSettingsButton() {
    const x = VIEWPORT_W - 28;
    const y = 22;
    const bg = this.add.rectangle(x, y, 32, 28, 0x152432, 0.96)
      .setStrokeStyle(1, 0x617990)
      .setInteractive({ useHandCursor: true });
    const icon = this.add.text(x, y - 1, '⚙', {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '18px', color: '#e2e8f0', fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x1d3347, 1));
    bg.on('pointerout', () => bg.setFillStyle(0x152432, 0.96));
    bg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.toggleSettingsMenu();
    });
    icon.setDepth(10001);
    bg.setDepth(10000);
  }

  private toggleSettingsMenu() {
    if (this.settingsOverlay) this.closeSettingsMenu();
    else this.openSettingsMenu();
  }

  private openSettingsMenu() {
    this.closeSettingsMenu();
    this.settingsVolumes = this.readSoundSettings();
    this.settingsValueTexts = {};
    this.settingsBars = {};

    const panelW = 430;
    const panelH = 292;
    const panelX = VIEWPORT_W - panelW - 18;
    const panelY = 54;
    const children: Phaser.GameObjects.GameObject[] = [];

    const dim = this.add.rectangle(0, 0, VIEWPORT_W, VIEWPORT_H, 0x000000, 0.28)
      .setOrigin(0, 0)
      .setInteractive();
    dim.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.closeSettingsMenu();
    });
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x09111a, 0.98)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x617990)
      .setInteractive();
    panel.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
    const title = this.add.text(panelX + 18, panelY + 14, T.settings, {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '18px', color: '#f8fafc', fontStyle: 'bold',
    });
    children.push(dim, panel, title);

    this.makeVolumeRow(children, 'music', T.musicVolume, panelX + 18, panelY + 58);
    this.makeVolumeRow(children, 'effects', T.effectsVolume, panelX + 18, panelY + 112);
    this.makeVolumeRow(children, 'voice', T.voiceVolume, panelX + 18, panelY + 166);

    children.push(...this.makeModalButton(panelX + 18, panelY + 226, 188, 38, T.fullscreen, () => this.toggleFullscreen()));
    this.settingsFullscreenText = this.add.text(panelX + 220, panelY + 236, '', {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '13px', color: '#cbd5e1', fontStyle: 'bold',
    });
    children.push(this.settingsFullscreenText);
    children.push(...this.makeModalButton(panelX + panelW - 128, panelY + 226, 110, 38, T.close, () => this.closeSettingsMenu()));

    this.settingsOverlay = this.add.container(0, 0, children).setDepth(10020);
    this.refreshSettingsValues();
  }

  private makeVolumeRow(children: Phaser.GameObjects.GameObject[], kind: VolumeKind, label: string, x: number, y: number) {
    const text = this.add.text(x, y, label, {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '13px', color: '#cbd5e1', fontStyle: 'bold',
    });
    const value = this.add.text(x + 92, y, '', {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '13px', color: '#f8fafc',
    }).setOrigin(1, 0);
    const barW = 154;
    const barBg = this.add.rectangle(x + 108, y + 10, barW, 8, 0x0f172a, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x334155);
    const barFill = this.add.rectangle(x + 108, y + 10, barW, 8, 0x60a5fa, 0.95).setOrigin(0, 0.5);
    children.push(text, value, barBg, barFill);
    children.push(...this.makeModalButton(x + 276, y - 6, 42, 30, '-', () => this.adjustVolume(kind, -0.1)));
    children.push(...this.makeModalButton(x + 326, y - 6, 42, 30, '+', () => this.adjustVolume(kind, 0.1)));
    this.settingsValueTexts[kind] = value;
    this.settingsBars[kind] = { fill: barFill, width: barW };
  }

  private makeModalButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void): Phaser.GameObjects.GameObject[] {
    const bg = this.add.rectangle(x, y, w, h, 0x152432, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x617990)
      .setInteractive({ useHandCursor: true });
    const txt = this.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '13px', color: '#f8fafc', fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x1d3347, 1));
    bg.on('pointerout', () => bg.setFillStyle(0x152432, 0.96));
    bg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      onClick();
    });
    return [bg, txt];
  }

  private closeSettingsMenu() {
    this.settingsOverlay?.destroy(true);
    this.settingsOverlay = null;
    this.settingsFullscreenText = null;
    this.settingsValueTexts = {};
    this.settingsBars = {};
  }

  private readSoundSettings(): Record<VolumeKind, number> {
    const snd = this.getSoundSystem();
    const raw = typeof snd?.getSettings === 'function' ? snd.getSettings() : {};
    const pick = (keys: string[], fallback: number) => {
      for (const key of keys) {
        const value = raw[key];
        if (typeof value === 'number' && Number.isFinite(value)) return this.clampVolume(value);
      }
      return fallback;
    };
    return {
      music: pick(['musicVolume', 'music'], this.settingsVolumes.music),
      effects: pick(['effectsVolume', 'sfxVolume', 'effects'], this.settingsVolumes.effects),
      voice: pick(['voiceVolume', 'voicesVolume', 'voice'], this.settingsVolumes.voice),
    };
  }

  private getSoundSystem(): any {
    return (this.scene.get('Game') as any)?.sound2;
  }

  private adjustVolume(kind: VolumeKind, delta: number) {
    this.settingsVolumes[kind] = this.clampVolume(this.settingsVolumes[kind] + delta);
    const snd = this.getSoundSystem();
    const method: Record<VolumeKind, string> = {
      music: 'setMusicVolume',
      effects: 'setEffectsVolume',
      voice: 'setVoiceVolume',
    };
    const setter = snd?.[method[kind]];
    if (typeof setter === 'function') setter.call(snd, this.settingsVolumes[kind]);
    this.refreshSettingsValues();
  }

  private refreshSettingsValues() {
    (Object.keys(this.settingsVolumes) as VolumeKind[]).forEach((kind) => {
      const value = this.settingsVolumes[kind];
      this.settingsValueTexts[kind]?.setText(`${Math.round(value * 100)}%`);
      const bar = this.settingsBars[kind];
      bar?.fill.setDisplaySize(Math.max(2, bar.width * value), 8);
    });
    this.settingsFullscreenText?.setText((this.scale as any).isFullscreen ? T.fullscreenOn : T.fullscreenOff);
  }

  private toggleFullscreen() {
    const scale = this.scale as any;
    try {
      if (scale.isFullscreen) scale.stopFullscreen();
      else scale.startFullscreen();
    } catch {
      // Browsers can deny fullscreen outside a trusted gesture.
    }
    this.time.delayedCall(80, () => this.refreshSettingsValues());
  }

  private clampVolume(value: number) {
    return Phaser.Math.Clamp(Math.round(value * 10) / 10, 0, 1);
  }

  private showTooltip(ax: number, ay: number, text: string) {
    this.tooltipText.setText(text).setPosition(ax + 6, ay).setVisible(true);
    const b = this.tooltipText.getBounds();
    this.tooltipBg.setSize(b.width + 12, b.height + 8).setPosition(ax, ay + 4).setVisible(true);
  }

  private hideTooltip() {
    this.tooltipText.setVisible(false);
    this.tooltipBg.setVisible(false);
  }

  private requestBuild(kind: BuildingKind) {
    const sel = this.selected;
    const hasPeasant = sel.some((e) => e instanceof Unit && e.team === 'player' && e.kind === 'peasant');
    if (!hasPeasant) return;
    this.scene.get('Game').events.emit('ui:build-start', kind);
  }

  private togglePause() {
    const gs = this.scene.get('Game') as any;
    if (!gs) return;
    if (this.pauseOverlay) {
      this.pauseOverlay.destroy();
      this.pauseOverlay = null;
      this.pauseLabel?.destroy();
      this.pauseLabel = null;
      gs.scene.resume();
      return;
    }
    gs.scene.pause();
    this.pauseOverlay = this.add.rectangle(VIEWPORT_W / 2, VIEWPORT_H / 2, VIEWPORT_W, VIEWPORT_H, 0x000000, 0.5).setDepth(10003);
    this.pauseLabel = this.add.text(VIEWPORT_W / 2, VIEWPORT_H / 2, `${T.pause}\n${T.pressSpaceToResume}`, {
      fontFamily: 'Trebuchet MS, monospace', fontSize: '32px', color: '#ffffff', align: 'center',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10004);
    this.pauseLabel.setBackgroundColor('rgba(9, 17, 26, 0.8)');
    this.pauseLabel.setPadding(18, 12, 18, 12);
  }

  isAttackMoveMode(): boolean { return this.attackMoveMode; }
  clearAttackMoveMode() { this.attackMoveMode = false; this.modeIndicator.setText(''); }

  setPatrolMode() {
    this.patrolMode = true;
    this.patrolPointA = null;
    this.attackMoveMode = false;
    this.modeIndicator.setText(T.patrolMode);
  }
  isPatrolMode(): boolean { return this.patrolMode; }
  setPatrolPointA(p: { x: number; y: number }) {
    this.patrolPointA = p;
    this.modeIndicator.setText(T.patrolSecondPoint);
  }
  getPatrolPointA() { return this.patrolPointA; }
  clearPatrolMode() {
    this.patrolMode = false;
    this.patrolPointA = null;
    this.modeIndicator.setText('');
  }

  setRepairMode() {
    this.repairMode = true;
    this.modeIndicator.setText('РЕМОНТ: Кликните ЛКМ по повреждённому зданию');
    this.modeIndicator.setColor('#22c55e');
  }
  isRepairMode(): boolean { return this.repairMode; }
  clearRepairMode() {
    this.repairMode = false;
    this.modeIndicator.setText('');
    this.modeIndicator.setColor('#ef4444');
  }
}
