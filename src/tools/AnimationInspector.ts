import { ANIMATION_IMAGE_ASSETS } from '../assets/AssetManifest';
import type { Team } from '../config';
import { buildingName, T, unitName } from '../i18n';

type AnimationCategory = 'unit' | 'building' | 'resource' | 'terrain' | 'other';
type FrameLoadState = 'pending' | 'loaded' | 'missing';
type BackgroundMode = 'grid' | 'grass' | 'water' | 'dark';

interface AnimationFrameAsset {
  key: string;
  path: string;
  index: number;
}

interface AnimationSequence {
  id: string;
  category: AnimationCategory;
  title: string;
  subtitle: string;
  state: string;
  team?: Team;
  tags: string[];
  frames: AnimationFrameAsset[];
  defaultFps: number;
}

interface MutableSequence extends Omit<AnimationSequence, 'frames'> {
  frames: AnimationFrameAsset[];
}

const CATEGORY_LABELS: Record<AnimationCategory | 'all', string> = {
  all: 'Все',
  unit: 'Юниты',
  building: 'Здания',
  resource: 'Ресурсы',
  terrain: 'Карта',
  other: 'Прочее',
};

const TEAM_LABELS: Record<Team | 'all', string> = {
  all: 'Все фракции',
  player: 'Игрок',
  enemy: 'Враг',
};

const BUILDING_STAGE_LABELS: Record<string, string> = {
  foundation: 'Фундамент',
  scaffold: 'Леса',
  shell: 'Коробка',
  ready: 'Готово',
  damaged: 'Повреждено',
  ruins: 'Руины',
  build: 'Стройка',
  destroy: 'Разрушение',
  'level2-ready': 'Ур. 2 готово',
  'level2-damaged': 'Ур. 2 повреждено',
};

const UNIT_STATE_LABELS: Record<string, string> = {
  idle: 'Ожидание',
  'walk-down': 'Ходьба вниз',
  'walk-right': 'Ходьба вправо',
  'walk-up': 'Ходьба вверх',
  attack: 'Атака',
  gather: 'Добыча',
  build: 'Стройка',
  hit: 'Получение удара',
  death: 'Смерть',
};

const RESOURCE_LABELS: Record<string, string> = {
  tree: T.tree,
  goldmine: T.goldmine,
};

const TERRAIN_LABELS: Record<string, string> = {
  grass: 'Трава',
  'grass-rich': 'Густая трава',
  dirt: 'Земля',
  water: 'Вода',
};

const SORT_WEIGHT: Record<AnimationCategory, number> = {
  unit: 1,
  building: 2,
  resource: 3,
  terrain: 4,
  other: 5,
};

export function shouldOpenAnimationInspector(): boolean {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.replace(/\/+$/, '');
  return params.get('tool') === 'animations'
    || params.has('animations')
    || window.location.hash === '#animations'
    || path.endsWith('/animations');
}

export function mountAnimationInspector(host: HTMLElement | null): void {
  if (!host) throw new Error('Animation inspector host was not found');

  const catalog = buildAnimationCatalog();
  if (catalog.length === 0) throw new Error('Animation catalog is empty');

  const frameStatus = new Map<string, FrameLoadState>();
  const frameSizes = new Map<string, { width: number; height: number }>();
  const allFrames = uniqueFrames(catalog);

  const savedSelectedId = window.localStorage.getItem('rts:animation-inspector:selected') ?? '';
  const savedFps = Number(window.localStorage.getItem('rts:animation-inspector:fps') ?? '10');
  const savedScale = Number(window.localStorage.getItem('rts:animation-inspector:scale') ?? '3');

  const state = {
    category: 'all' as AnimationCategory | 'all',
    team: 'all' as Team | 'all',
    query: '',
    selectedId: catalog.some((sequence) => sequence.id === savedSelectedId) ? savedSelectedId : catalog[0].id,
    frame: 0,
    playing: true,
    fps: Number.isFinite(savedFps) ? clamp(savedFps, 1, 30) : 10,
    scale: Number.isFinite(savedScale) ? clamp(savedScale, 1, 8) : 3,
    background: 'grid' as BackgroundMode,
  };

  let visibleSequences: AnimationSequence[] = [];
  let animationFrameHandle = 0;
  let lastAdvanceAt = performance.now();

  document.title = 'Контроль анимаций — RTS';
  document.body.classList.add('animation-inspector-active');
  ensureInspectorStyle();

  host.classList.add('animation-inspector-host');
  host.innerHTML = `
    <div class="anim-app">
      <aside class="anim-sidebar">
        <div class="anim-brand">
          <a class="anim-brand__title" href="/" aria-label="Открыть игру">RTS</a>
          <span class="anim-brand__meta">Контроль анимаций</span>
        </div>

        <label class="anim-search">
          <span>Поиск</span>
          <input type="search" data-role="search" placeholder="Юнит, здание, состояние, ключ" autocomplete="off" />
        </label>

        <div class="anim-filter-group" data-role="category-filters" aria-label="Фильтр по типу"></div>

        <label class="anim-field">
          <span>Фракция</span>
          <select data-role="team-filter">
            <option value="all">Все фракции</option>
            <option value="player">Игрок</option>
            <option value="enemy">Враг</option>
          </select>
        </label>

        <div class="anim-sidebar__summary" data-role="sidebar-summary"></div>
        <div class="anim-sequence-list" data-role="sequence-list"></div>
      </aside>

      <main class="anim-workspace">
        <header class="anim-topbar">
          <div>
            <div class="anim-kicker">Визуальная проверка</div>
            <h1>Все игровые анимации</h1>
          </div>
          <div class="anim-audit" data-role="audit-status"></div>
        </header>

        <section class="anim-preview-layout">
          <div class="anim-preview-panel">
            <div class="anim-stage" data-role="stage" data-bg="grid">
              <img class="anim-preview" data-role="preview" alt="" draggable="false" />
              <div class="anim-missing" data-role="missing-overlay">Кадр не найден</div>
            </div>

            <div class="anim-transport">
              <button type="button" class="anim-icon-button" data-role="prev-frame" aria-label="Предыдущий кадр">⏮</button>
              <button type="button" class="anim-icon-button anim-play-button" data-role="play-toggle" aria-label="Пауза">⏸</button>
              <button type="button" class="anim-icon-button" data-role="next-frame" aria-label="Следующий кадр">⏭</button>
              <label class="anim-range anim-frame-range">
                <span data-role="frame-label">1 / 1</span>
                <input type="range" data-role="frame-range" min="0" max="0" value="0" />
              </label>
            </div>
          </div>

          <aside class="anim-inspector">
            <div class="anim-selected-head">
              <span class="anim-category-pill" data-role="selected-category">Юниты</span>
              <span class="anim-team-pill" data-role="selected-team">Игрок</span>
            </div>
            <h2 data-role="selected-title"></h2>
            <p data-role="selected-subtitle"></p>

            <dl class="anim-meta-grid">
              <div><dt>Кадров</dt><dd data-role="selected-count"></dd></div>
              <div><dt>FPS</dt><dd data-role="selected-fps"></dd></div>
              <div><dt>Размер</dt><dd data-role="selected-size"></dd></div>
              <div><dt>Статус</dt><dd data-role="selected-status"></dd></div>
            </dl>

            <label class="anim-range">
              <span>Скорость</span>
              <input type="range" data-role="fps-range" min="1" max="30" value="10" />
            </label>

            <label class="anim-range">
              <span>Масштаб</span>
              <input type="range" data-role="scale-range" min="1" max="8" step="0.25" value="3" />
            </label>

            <label class="anim-field">
              <span>Фон</span>
              <select data-role="background-select">
                <option value="grid">Сетка</option>
                <option value="grass">Трава</option>
                <option value="water">Вода</option>
                <option value="dark">Тёмный</option>
              </select>
            </label>

            <div class="anim-key-box">
              <span data-role="frame-key"></span>
              <button type="button" data-role="copy-key">Ключ</button>
            </div>
            <a class="anim-path-link" data-role="frame-path" href="#" target="_blank" rel="noreferrer"></a>
          </aside>
        </section>

        <section class="anim-filmstrip" data-role="filmstrip" aria-label="Кадры выбранной анимации"></section>
      </main>
    </div>
  `;

  const refs = requireRefs({
    search: host.querySelector<HTMLInputElement>('[data-role="search"]'),
    categoryFilters: host.querySelector<HTMLElement>('[data-role="category-filters"]'),
    teamFilter: host.querySelector<HTMLSelectElement>('[data-role="team-filter"]'),
    sidebarSummary: host.querySelector<HTMLElement>('[data-role="sidebar-summary"]'),
    sequenceList: host.querySelector<HTMLElement>('[data-role="sequence-list"]'),
    auditStatus: host.querySelector<HTMLElement>('[data-role="audit-status"]'),
    stage: host.querySelector<HTMLElement>('[data-role="stage"]'),
    preview: host.querySelector<HTMLImageElement>('[data-role="preview"]'),
    missingOverlay: host.querySelector<HTMLElement>('[data-role="missing-overlay"]'),
    playToggle: host.querySelector<HTMLButtonElement>('[data-role="play-toggle"]'),
    prevFrame: host.querySelector<HTMLButtonElement>('[data-role="prev-frame"]'),
    nextFrame: host.querySelector<HTMLButtonElement>('[data-role="next-frame"]'),
    frameLabel: host.querySelector<HTMLElement>('[data-role="frame-label"]'),
    frameRange: host.querySelector<HTMLInputElement>('[data-role="frame-range"]'),
    selectedCategory: host.querySelector<HTMLElement>('[data-role="selected-category"]'),
    selectedTeam: host.querySelector<HTMLElement>('[data-role="selected-team"]'),
    selectedTitle: host.querySelector<HTMLElement>('[data-role="selected-title"]'),
    selectedSubtitle: host.querySelector<HTMLElement>('[data-role="selected-subtitle"]'),
    selectedCount: host.querySelector<HTMLElement>('[data-role="selected-count"]'),
    selectedFps: host.querySelector<HTMLElement>('[data-role="selected-fps"]'),
    selectedSize: host.querySelector<HTMLElement>('[data-role="selected-size"]'),
    selectedStatus: host.querySelector<HTMLElement>('[data-role="selected-status"]'),
    fpsRange: host.querySelector<HTMLInputElement>('[data-role="fps-range"]'),
    scaleRange: host.querySelector<HTMLInputElement>('[data-role="scale-range"]'),
    backgroundSelect: host.querySelector<HTMLSelectElement>('[data-role="background-select"]'),
    frameKey: host.querySelector<HTMLElement>('[data-role="frame-key"]'),
    framePath: host.querySelector<HTMLAnchorElement>('[data-role="frame-path"]'),
    copyKey: host.querySelector<HTMLButtonElement>('[data-role="copy-key"]'),
    filmstrip: host.querySelector<HTMLElement>('[data-role="filmstrip"]'),
  });

  renderCategoryFilters();
  bindEvents();
  applyFilters();
  updateSelectedView(true);
  updateAuditStatus();
  preloadFrames(allFrames);
  animationFrameHandle = requestAnimationFrame(tick);

  window.addEventListener('beforeunload', () => cancelAnimationFrame(animationFrameHandle), { once: true });

  function renderCategoryFilters(): void {
    const categories: Array<AnimationCategory | 'all'> = ['all', 'unit', 'building', 'resource', 'terrain', 'other'];
    refs.categoryFilters.innerHTML = categories
      .filter((category) => category === 'all' || catalog.some((sequence) => sequence.category === category))
      .map((category) => `<button type="button" data-category="${category}">${CATEGORY_LABELS[category]}</button>`)
      .join('');
  }

  function bindEvents(): void {
    refs.search.addEventListener('input', () => {
      state.query = refs.search.value.trim().toLocaleLowerCase('ru-RU');
      applyFilters();
    });

    refs.categoryFilters.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-category]');
      if (!button) return;
      state.category = button.dataset.category as AnimationCategory | 'all';
      applyFilters();
    });

    refs.teamFilter.addEventListener('change', () => {
      state.team = refs.teamFilter.value as Team | 'all';
      applyFilters();
    });

    refs.sequenceList.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-sequence-id]');
      if (!button) return;
      selectSequence(button.dataset.sequenceId ?? '');
    });

    refs.prevFrame.addEventListener('click', () => stepFrame(-1));
    refs.nextFrame.addEventListener('click', () => stepFrame(1));

    refs.playToggle.addEventListener('click', () => {
      state.playing = !state.playing;
      lastAdvanceAt = performance.now();
      updateTransport();
    });

    refs.frameRange.addEventListener('input', () => {
      state.frame = Number(refs.frameRange.value);
      state.playing = false;
      updateSelectedView(false);
      updateTransport();
    });

    refs.fpsRange.addEventListener('input', () => {
      state.fps = Number(refs.fpsRange.value);
      window.localStorage.setItem('rts:animation-inspector:fps', String(state.fps));
      updateTransport();
    });

    refs.scaleRange.addEventListener('input', () => {
      state.scale = Number(refs.scaleRange.value);
      window.localStorage.setItem('rts:animation-inspector:scale', String(state.scale));
      updatePreviewSize();
    });

    refs.backgroundSelect.addEventListener('change', () => {
      state.background = refs.backgroundSelect.value as BackgroundMode;
      refs.stage.dataset.bg = state.background;
    });

    refs.copyKey.addEventListener('click', () => {
      const frame = currentFrame();
      if (!frame || !navigator.clipboard) return;
      void navigator.clipboard.writeText(frame.key);
    });

    refs.filmstrip.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-frame-index]');
      if (!button) return;
      state.frame = Number(button.dataset.frameIndex);
      state.playing = false;
      updateSelectedView(false);
      updateTransport();
    });

    window.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, select, textarea')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        state.playing = !state.playing;
        lastAdvanceAt = performance.now();
        updateTransport();
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        stepFrame(-1);
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        stepFrame(1);
      }
    });

    refs.preview.addEventListener('load', () => {
      const frame = currentFrame();
      if (!frame) return;
      frameStatus.set(frame.key, 'loaded');
      frameSizes.set(frame.key, {
        width: refs.preview.naturalWidth,
        height: refs.preview.naturalHeight,
      });
      updatePreviewSize();
      updateAuditStatus();
      updateCurrentFrameStatus();
    });

    refs.preview.addEventListener('error', () => {
      const frame = currentFrame();
      if (!frame) return;
      frameStatus.set(frame.key, 'missing');
      updateAuditStatus();
      updateCurrentFrameStatus();
    });
  }

  function applyFilters(): void {
    visibleSequences = catalog.filter((sequence) => {
      if (state.category !== 'all' && sequence.category !== state.category) return false;
      if (state.team !== 'all' && sequence.team !== state.team) return false;
      if (!state.query) return true;
      return sequence.tags.some((tag) => tag.includes(state.query));
    });

    if (!visibleSequences.some((sequence) => sequence.id === state.selectedId)) {
      state.selectedId = visibleSequences[0]?.id ?? catalog[0].id;
      state.frame = 0;
    }

    renderSequenceList();
    renderFilterState();
    updateSelectedView(true);
  }

  function renderFilterState(): void {
    const buttons = refs.categoryFilters.querySelectorAll<HTMLButtonElement>('[data-category]');
    buttons.forEach((button) => button.classList.toggle('is-active', button.dataset.category === state.category));
    refs.teamFilter.value = state.team;
    refs.sidebarSummary.textContent = `${visibleSequences.length} наборов из ${catalog.length}`;
  }

  function renderSequenceList(): void {
    refs.sequenceList.innerHTML = visibleSequences.map((sequence) => {
      const first = sequence.frames[0];
      const team = sequence.team ? TEAM_LABELS[sequence.team] : CATEGORY_LABELS[sequence.category];
      const selected = sequence.id === state.selectedId ? ' is-selected' : '';
      return `
        <button type="button" class="anim-sequence-item${selected}" data-sequence-id="${escapeHtml(sequence.id)}">
          <span class="anim-sequence-thumb">
            <img src="${first.path}" alt="" loading="lazy" draggable="false" />
          </span>
          <span class="anim-sequence-text">
            <strong>${escapeHtml(sequence.title)}</strong>
            <small>${escapeHtml(sequence.state)} · ${escapeHtml(team)} · ${sequence.frames.length} к.</small>
          </span>
        </button>
      `;
    }).join('');
  }

  function selectSequence(id: string): void {
    const next = catalog.find((sequence) => sequence.id === id);
    if (!next) return;
    state.selectedId = next.id;
    state.frame = 0;
    state.fps = next.defaultFps;
    refs.fpsRange.value = String(state.fps);
    window.localStorage.setItem('rts:animation-inspector:selected', next.id);
    window.localStorage.setItem('rts:animation-inspector:fps', String(state.fps));
    renderSequenceList();
    updateSelectedView(true);
    lastAdvanceAt = performance.now();
  }

  function updateSelectedView(rebuildFilmstrip: boolean): void {
    const sequence = selectedSequence();
    state.frame = clampFrame(state.frame, sequence.frames.length);
    const frame = currentFrame();
    if (!frame) return;

    refs.preview.src = frame.path;
    refs.preview.alt = frame.key;
    refs.frameRange.max = String(sequence.frames.length - 1);
    refs.frameRange.value = String(state.frame);
    refs.selectedCategory.textContent = CATEGORY_LABELS[sequence.category];
    refs.selectedTeam.textContent = sequence.team ? TEAM_LABELS[sequence.team] : 'Без фракции';
    refs.selectedTeam.classList.toggle('is-enemy', sequence.team === 'enemy');
    refs.selectedTitle.textContent = sequence.title;
    refs.selectedSubtitle.textContent = sequence.subtitle;
    refs.selectedCount.textContent = String(sequence.frames.length);
    refs.frameKey.textContent = frame.key;
    refs.framePath.href = frame.path;
    refs.framePath.textContent = frame.path;

    if (rebuildFilmstrip) renderFilmstrip(sequence);
    updateTransport();
    updatePreviewSize();
    updateCurrentFrameStatus();
  }

  function updateTransport(): void {
    refs.playToggle.textContent = state.playing ? '⏸' : '▶';
    refs.playToggle.setAttribute('aria-label', state.playing ? 'Пауза' : 'Пуск');
    refs.frameLabel.textContent = `${state.frame + 1} / ${selectedSequence().frames.length}`;
    refs.selectedFps.textContent = `${state.fps}`;
    refs.fpsRange.value = String(state.fps);

    const buttons = refs.filmstrip.querySelectorAll<HTMLButtonElement>('[data-frame-index]');
    buttons.forEach((button) => button.classList.toggle('is-active', Number(button.dataset.frameIndex) === state.frame));
  }

  function updatePreviewSize(): void {
    const frame = currentFrame();
    if (!frame) return;
    const size = frameSizes.get(frame.key);
    const width = size?.width ?? 64;
    const height = size?.height ?? 64;
    refs.preview.style.width = `${Math.round(width * state.scale)}px`;
    refs.preview.style.height = `${Math.round(height * state.scale)}px`;
    refs.scaleRange.value = String(state.scale);
    refs.selectedSize.textContent = size ? `${size.width}×${size.height}` : '...';
  }

  function updateCurrentFrameStatus(): void {
    const frame = currentFrame();
    if (!frame) return;
    const status = frameStatus.get(frame.key) ?? 'pending';
    refs.missingOverlay.classList.toggle('is-visible', status === 'missing');
    refs.selectedStatus.textContent = status === 'missing'
      ? 'нет файла'
      : status === 'loaded' ? 'загружен' : 'проверяется';
  }

  function renderFilmstrip(sequence: AnimationSequence): void {
    refs.filmstrip.innerHTML = sequence.frames.map((frame, index) => `
      <button type="button" data-frame-index="${index}" aria-label="Кадр ${index + 1}">
        <span>${index + 1}</span>
        <img src="${frame.path}" alt="" loading="lazy" draggable="false" />
      </button>
    `).join('');
  }

  function stepFrame(direction: -1 | 1): void {
    const sequence = selectedSequence();
    state.frame = (state.frame + direction + sequence.frames.length) % sequence.frames.length;
    state.playing = false;
    updateSelectedView(false);
    updateTransport();
  }

  function tick(now: number): void {
    const sequence = selectedSequence();
    const frameDuration = 1000 / Math.max(1, state.fps);
    if (state.playing && sequence.frames.length > 1 && now - lastAdvanceAt >= frameDuration) {
      const steps = Math.max(1, Math.floor((now - lastAdvanceAt) / frameDuration));
      state.frame = (state.frame + steps) % sequence.frames.length;
      lastAdvanceAt = now;
      updateSelectedView(false);
    }
    animationFrameHandle = requestAnimationFrame(tick);
  }

  function preloadFrames(frames: AnimationFrameAsset[]): void {
    const maxActive = 10;
    let index = 0;
    let active = 0;

    const pump = () => {
      while (active < maxActive && index < frames.length) {
        const frame = frames[index++];
        if (frameStatus.has(frame.key)) continue;
        active += 1;
        const image = new Image();
        image.onload = () => {
          frameStatus.set(frame.key, 'loaded');
          frameSizes.set(frame.key, { width: image.naturalWidth, height: image.naturalHeight });
          active -= 1;
          updateAuditStatus();
          updateCurrentFrameStatus();
          updatePreviewSize();
          pump();
        };
        image.onerror = () => {
          frameStatus.set(frame.key, 'missing');
          active -= 1;
          updateAuditStatus();
          updateCurrentFrameStatus();
          pump();
        };
        image.src = frame.path;
      }
    };

    pump();
  }

  function updateAuditStatus(): void {
    let loaded = 0;
    let missing = 0;
    for (const frame of allFrames) {
      const status = frameStatus.get(frame.key);
      if (status === 'loaded') loaded += 1;
      if (status === 'missing') missing += 1;
    }
    const checked = loaded + missing;
    const missingText = missing > 0 ? ` · ${missing} нет` : '';
    refs.auditStatus.textContent = `${checked}/${allFrames.length} кадров${missingText}`;
    refs.auditStatus.classList.toggle('has-missing', missing > 0);
  }

  function selectedSequence(): AnimationSequence {
    return catalog.find((sequence) => sequence.id === state.selectedId) ?? catalog[0];
  }

  function currentFrame(): AnimationFrameAsset | null {
    const sequence = selectedSequence();
    return sequence.frames[clampFrame(state.frame, sequence.frames.length)] ?? null;
  }
}

function buildAnimationCatalog(): AnimationSequence[] {
  const groups = new Map<string, MutableSequence>();

  for (const asset of ANIMATION_IMAGE_ASSETS) {
    const parsed = parseAnimationAsset(asset.key);
    const group = groups.get(parsed.id) ?? {
      id: parsed.id,
      category: parsed.category,
      title: parsed.title,
      subtitle: parsed.subtitle,
      state: parsed.state,
      team: parsed.team,
      tags: parsed.tags,
      defaultFps: parsed.defaultFps,
      frames: [],
    };
    group.frames.push({ key: asset.key, path: asset.path, index: parsed.frame });
    groups.set(parsed.id, group);
  }

  return Array.from(groups.values())
    .map((sequence) => ({
      ...sequence,
      frames: sequence.frames.sort((a, b) => a.index - b.index || a.key.localeCompare(b.key)),
    }))
    .sort((a, b) => (
      SORT_WEIGHT[a.category] - SORT_WEIGHT[b.category]
      || teamRank(a.team) - teamRank(b.team)
      || a.title.localeCompare(b.title, 'ru')
      || a.state.localeCompare(b.state, 'ru')
    ));
}

function parseAnimationAsset(key: string): Omit<AnimationSequence, 'frames'> & { frame: number } {
  let match = key.match(/^unit-([a-z]+)-(player|enemy)-(.+)-(\d+)$/);
  if (match) {
    const [, kind, team, source, frame] = match;
    const title = unitName(kind);
    const state = UNIT_STATE_LABELS[source] ?? source;
    return {
      id: `unit:${kind}:${team}:${source}`,
      category: 'unit',
      title,
      subtitle: `${state} · ${TEAM_LABELS[team as Team]}`,
      state,
      team: team as Team,
      tags: searchableTags([title, state, team, kind, source, key]),
      defaultFps: source.startsWith('walk') ? 18 : source === 'hit' ? 16 : 10,
      frame: Number(frame),
    };
  }

  match = key.match(/^bld-([a-z]+)-(player|enemy)-(level2-)?(ready|damaged)-(\d+)$/);
  if (match) {
    const [, kind, team, level2, stage, frame] = match;
    const stateKey = `${level2 ?? ''}${stage}`;
    const title = buildingName(kind);
    const state = BUILDING_STAGE_LABELS[stateKey] ?? stateKey;
    return {
      id: `building:${kind}:${team}:${stateKey}`,
      category: 'building',
      title,
      subtitle: `${state} · ${TEAM_LABELS[team as Team]}`,
      state,
      team: team as Team,
      tags: searchableTags([title, state, team, kind, stateKey, key]),
      defaultFps: stage === 'damaged' ? 1 : 2,
      frame: Number(frame),
    };
  }

  match = key.match(/^bld-([a-z]+)-(player|enemy)-build-(\d+)$/);
  if (match) {
    const [, kind, team, frame] = match;
    const title = buildingName(kind);
    const state = BUILDING_STAGE_LABELS.build;
    return {
      id: `building:${kind}:${team}:build`,
      category: 'building',
      title,
      subtitle: `${state} · ${TEAM_LABELS[team as Team]}`,
      state,
      team: team as Team,
      tags: searchableTags([title, state, team, kind, 'build', key]),
      defaultFps: 8,
      frame: Number(frame),
    };
  }

  match = key.match(/^bld-([a-z]+)-(player|enemy)-destroy-(\d+)$/);
  if (match) {
    const [, kind, team, frame] = match;
    const title = buildingName(kind);
    const state = BUILDING_STAGE_LABELS.destroy;
    return {
      id: `building:${kind}:${team}:destroy`,
      category: 'building',
      title,
      subtitle: `${state} · ${TEAM_LABELS[team as Team]}`,
      state,
      team: team as Team,
      tags: searchableTags([title, state, team, kind, 'destroy', key]),
      defaultFps: 10,
      frame: Number(frame),
    };
  }

  match = key.match(/^bld-([a-z]+)-(player|enemy)-(foundation|scaffold|shell|ready|damaged|ruins)$/);
  if (match) {
    const [, kind, team, stageKey] = match;
    const title = buildingName(kind);
    const state = BUILDING_STAGE_LABELS[stageKey] ?? stageKey;
    return {
      id: `building:${kind}:${team}:${stageKey}`,
      category: 'building',
      title,
      subtitle: `${state} · ${TEAM_LABELS[team as Team]}`,
      state,
      team: team as Team,
      tags: searchableTags([title, state, team, kind, stageKey, key]),
      defaultFps: 1,
      frame: 0,
    };
  }

  match = key.match(/^res-([a-z]+)-(\d+)$/);
  if (match) {
    const [, kind, frame] = match;
    const title = RESOURCE_LABELS[kind] ?? kind;
    const state = 'Пульс ресурса';
    return {
      id: `resource:${kind}`,
      category: 'resource',
      title,
      subtitle: state,
      state,
      tags: searchableTags([title, state, kind, key]),
      defaultFps: 3,
      frame: Number(frame),
    };
  }

  match = key.match(/^tile-(.+)-(\d+)$/);
  if (match) {
    const [, kind, frame] = match;
    const title = TERRAIN_LABELS[kind] ?? kind;
    const state = 'Тайл карты';
    return {
      id: `terrain:${kind}`,
      category: 'terrain',
      title,
      subtitle: state,
      state,
      tags: searchableTags([title, state, kind, key]),
      defaultFps: kind === 'water' ? 5 : 3,
      frame: Number(frame),
    };
  }

  match = key.match(/^(.*)-(\d+)$/);
  if (match) {
    const [, name, frame] = match;
    return {
      id: `other:${name}`,
      category: 'other',
      title: name,
      subtitle: 'Неизвестная последовательность',
      state: 'Прочее',
      tags: searchableTags([name, key]),
      defaultFps: 8,
      frame: Number(frame),
    };
  }

  return {
    id: `other:${key}`,
    category: 'other',
    title: key,
    subtitle: 'Одиночный кадр',
    state: 'Прочее',
    tags: searchableTags([key]),
    defaultFps: 1,
    frame: 0,
  };
}

function uniqueFrames(catalog: AnimationSequence[]): AnimationFrameAsset[] {
  const byKey = new Map<string, AnimationFrameAsset>();
  for (const sequence of catalog) {
    for (const frame of sequence.frames) byKey.set(frame.key, frame);
  }
  return Array.from(byKey.values());
}

function searchableTags(values: Array<string | undefined>): string[] {
  return values
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLocaleLowerCase('ru-RU'));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function teamRank(team?: Team): number {
  if (team === 'player') return 1;
  if (team === 'enemy') return 2;
  return 0;
}

function clampFrame(value: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  return ((Math.floor(value) % frameCount) + frameCount) % frameCount;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function requireRefs<T extends Record<string, Element | null>>(refs: T): { [K in keyof T]: NonNullable<T[K]> } {
  for (const [key, value] of Object.entries(refs)) {
    if (!value) throw new Error(`Animation inspector control is missing: ${key}`);
  }
  return refs as { [K in keyof T]: NonNullable<T[K]> };
}

function ensureInspectorStyle(): void {
  if (document.getElementById('animation-inspector-style')) return;
  const style = document.createElement('style');
  style.id = 'animation-inspector-style';
  style.textContent = INSPECTOR_CSS;
  document.head.appendChild(style);
}

const INSPECTOR_CSS = `
  .animation-inspector-active {
    background: #12110e;
    color: #ece7d8;
    overflow: hidden;
  }

  .animation-inspector-host {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .anim-app {
    display: grid;
    grid-template-columns: 330px minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background:
      linear-gradient(135deg, #181711 0%, #10130f 42%, #14120f 100%);
    color: #ece7d8;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .anim-sidebar {
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    border-right: 1px solid rgba(236, 231, 216, 0.12);
    background: rgba(15, 15, 12, 0.92);
    display: flex;
    flex-direction: column;
    padding: 18px;
    gap: 14px;
  }

  .anim-brand {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 8px;
  }

  .anim-brand__title {
    color: #f1c66f;
    font-size: 28px;
    line-height: 1;
    text-decoration: none;
    font-weight: 800;
    letter-spacing: 0;
  }

  .anim-brand__meta,
  .anim-kicker,
  .anim-search span,
  .anim-field span,
  .anim-range span,
  .anim-meta-grid dt {
    color: #a9a18e;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .anim-search,
  .anim-field,
  .anim-range {
    display: grid;
    gap: 7px;
  }

  .anim-search input,
  .anim-field select {
    width: 100%;
    min-height: 38px;
    border: 1px solid rgba(236, 231, 216, 0.15);
    border-radius: 7px;
    background: #1b1a15;
    color: #f5f0e3;
    font: inherit;
    outline: none;
    padding: 0 11px;
  }

  .anim-search input:focus,
  .anim-field select:focus,
  .anim-range input:focus-visible {
    border-color: #f1c66f;
    box-shadow: 0 0 0 2px rgba(241, 198, 111, 0.16);
  }

  .anim-filter-group {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .anim-filter-group button,
  .anim-key-box button {
    border: 1px solid rgba(236, 231, 216, 0.15);
    border-radius: 7px;
    background: #201f19;
    color: #d8d0bb;
    min-height: 32px;
    padding: 0 10px;
    font: inherit;
    cursor: pointer;
  }

  .anim-filter-group button.is-active,
  .anim-key-box button:hover {
    background: #f1c66f;
    border-color: #f1c66f;
    color: #17140e;
  }

  .anim-sidebar__summary {
    color: #d2c8ae;
    font-size: 13px;
    min-height: 18px;
  }

  .anim-sequence-list {
    display: grid;
    align-content: start;
    gap: 7px;
    min-height: 0;
    overflow: auto;
    padding-right: 2px;
  }

  .anim-sequence-item {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    width: 100%;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 7px;
    text-align: left;
  }

  .anim-sequence-item:hover,
  .anim-sequence-item.is-selected {
    background: rgba(236, 231, 216, 0.06);
    border-color: rgba(241, 198, 111, 0.3);
  }

  .anim-sequence-thumb {
    display: grid;
    place-items: center;
    width: 46px;
    height: 40px;
    background:
      linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.06) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.06) 75%);
    background-color: #24231e;
    background-size: 12px 12px;
    background-position: 0 0, 0 6px, 6px -6px, -6px 0;
    border-radius: 6px;
    overflow: hidden;
  }

  .anim-sequence-thumb img {
    max-width: 42px;
    max-height: 36px;
    object-fit: contain;
  }

  .anim-sequence-text {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .anim-sequence-text strong,
  .anim-sequence-text small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .anim-sequence-text strong {
    color: #f4ead2;
    font-size: 14px;
    font-weight: 700;
  }

  .anim-sequence-text small {
    color: #a9a18e;
    font-size: 12px;
  }

  .anim-workspace {
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) 148px;
    gap: 16px;
    padding: 20px;
    overflow: hidden;
  }

  .anim-topbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 18px;
  }

  .anim-topbar h1 {
    margin: 2px 0 0;
    color: #fff7e3;
    font-size: clamp(26px, 3.2vw, 48px);
    line-height: 1;
    letter-spacing: 0;
  }

  .anim-audit {
    border: 1px solid rgba(236, 231, 216, 0.13);
    border-radius: 7px;
    color: #dbd2bc;
    background: rgba(20, 19, 15, 0.72);
    padding: 9px 12px;
    font-size: 13px;
    white-space: nowrap;
  }

  .anim-audit.has-missing {
    color: #ffb3a8;
    border-color: rgba(255, 96, 80, 0.42);
  }

  .anim-preview-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 16px;
    min-height: 0;
  }

  .anim-preview-panel,
  .anim-inspector {
    min-width: 0;
    border: 1px solid rgba(236, 231, 216, 0.12);
    border-radius: 8px;
    background: rgba(18, 17, 14, 0.72);
  }

  .anim-preview-panel {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-height: 0;
    overflow: hidden;
  }

  .anim-stage {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 0;
    overflow: auto;
    border-bottom: 1px solid rgba(236, 231, 216, 0.1);
  }

  .anim-stage[data-bg="grid"] {
    background:
      linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(255,255,255,0.05) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.05) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.05) 75%);
    background-color: #1b1a16;
    background-size: 28px 28px;
    background-position: 0 0, 0 14px, 14px -14px, -14px 0;
  }

  .anim-stage[data-bg="grass"] {
    background:
      linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.35)),
      repeating-linear-gradient(90deg, #244528 0 22px, #2b542f 22px 44px);
  }

  .anim-stage[data-bg="water"] {
    background:
      linear-gradient(rgba(0,0,0,0.22), rgba(0,0,0,0.38)),
      repeating-linear-gradient(135deg, #17466c 0 18px, #1d5a87 18px 36px);
  }

  .anim-stage[data-bg="dark"] {
    background: #11100d;
  }

  .anim-preview {
    display: block;
    object-fit: contain;
    max-width: min(92%, 980px);
    max-height: 92%;
    image-rendering: auto;
    filter: drop-shadow(0 24px 22px rgba(0, 0, 0, 0.42));
  }

  .anim-missing {
    position: absolute;
    inset: auto 18px 18px auto;
    display: none;
    border: 1px solid rgba(255, 93, 77, 0.5);
    border-radius: 7px;
    background: rgba(80, 24, 18, 0.88);
    color: #ffd2ca;
    padding: 8px 10px;
  }

  .anim-missing.is-visible {
    display: block;
  }

  .anim-transport {
    display: grid;
    grid-template-columns: auto auto auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 12px;
  }

  .anim-icon-button {
    display: grid;
    place-items: center;
    width: 38px;
    height: 34px;
    border: 1px solid rgba(236, 231, 216, 0.15);
    border-radius: 7px;
    background: #1f1e18;
    color: #f5e6c4;
    cursor: pointer;
    font: 700 16px/1 system-ui, sans-serif;
  }

  .anim-icon-button:hover,
  .anim-icon-button:focus-visible {
    border-color: #f1c66f;
    color: #f1c66f;
  }

  .anim-play-button {
    background: #f1c66f;
    color: #15130f;
    border-color: #f1c66f;
  }

  .anim-range input {
    width: 100%;
    accent-color: #f1c66f;
  }

  .anim-frame-range {
    grid-template-columns: 64px minmax(0, 1fr);
    align-items: center;
  }

  .anim-frame-range span {
    text-transform: none;
    color: #e8dbc0;
    font-variant-numeric: tabular-nums;
  }

  .anim-inspector {
    align-self: stretch;
    padding: 16px;
    display: grid;
    align-content: start;
    gap: 14px;
    overflow: auto;
  }

  .anim-selected-head {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .anim-category-pill,
  .anim-team-pill {
    border-radius: 999px;
    background: rgba(241, 198, 111, 0.14);
    color: #f1d28c;
    font-size: 12px;
    padding: 4px 8px;
  }

  .anim-team-pill {
    background: rgba(76, 129, 222, 0.18);
    color: #9fc0ff;
  }

  .anim-team-pill.is-enemy {
    background: rgba(214, 68, 55, 0.18);
    color: #ffaaa0;
  }

  .anim-inspector h2 {
    margin: 0;
    color: #fff3d6;
    font-size: 28px;
    line-height: 1.04;
    letter-spacing: 0;
  }

  .anim-inspector p {
    margin: -8px 0 0;
    color: #b7ad97;
    line-height: 1.35;
  }

  .anim-meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 0;
  }

  .anim-meta-grid div {
    border-top: 1px solid rgba(236, 231, 216, 0.12);
    padding-top: 9px;
  }

  .anim-meta-grid dd {
    margin: 2px 0 0;
    color: #fff5dd;
    font-variant-numeric: tabular-nums;
  }

  .anim-key-box {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }

  .anim-key-box span,
  .anim-path-link {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #d8ccb1;
    font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .anim-path-link {
    color: #f1c66f;
    text-decoration: none;
  }

  .anim-path-link:hover {
    text-decoration: underline;
  }

  .anim-filmstrip {
    display: flex;
    gap: 8px;
    overflow: auto;
    min-width: 0;
    border: 1px solid rgba(236, 231, 216, 0.12);
    border-radius: 8px;
    background: rgba(18, 17, 14, 0.78);
    padding: 10px;
  }

  .anim-filmstrip button {
    flex: 0 0 82px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
    border: 1px solid rgba(236, 231, 216, 0.12);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.03);
    color: #d8ccb1;
    cursor: pointer;
    padding: 6px;
  }

  .anim-filmstrip button.is-active {
    border-color: #f1c66f;
    color: #f6da9d;
    background: rgba(241, 198, 111, 0.1);
  }

  .anim-filmstrip span {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .anim-filmstrip img {
    width: 100%;
    min-height: 0;
    object-fit: contain;
    align-self: center;
    justify-self: center;
  }

  @media (max-width: 960px) {
    .animation-inspector-active {
      overflow: auto;
    }

    .animation-inspector-host {
      height: auto;
      min-height: 100vh;
      overflow: visible;
    }

    .anim-app {
      grid-template-columns: 1fr;
      min-height: 100vh;
    }

    .anim-sidebar {
      border-right: 0;
      border-bottom: 1px solid rgba(236, 231, 216, 0.12);
      max-height: 430px;
    }

    .anim-workspace {
      grid-template-rows: auto auto 142px;
      overflow: visible;
    }

    .anim-preview-layout {
      grid-template-columns: 1fr;
    }

    .anim-preview-panel {
      min-height: 520px;
    }
  }
`;
