const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = process.cwd();
const assetDir = path.join(root, 'public/assets/generated');
const outDir = path.join(root, 'public/assets/generated/animation');
const atlasDirs = [
  path.join(root, 'local-assets/generated/v4'),
  path.join(root, 'local-assets/generated/v3'),
];

const rows = [
  { kind: 'townhall', team: 'player' },
  { kind: 'barracks', team: 'player' },
  { kind: 'farm', team: 'player' },
  { kind: 'tower', team: 'player' },
  { kind: 'townhall', team: 'enemy' },
  { kind: 'barracks', team: 'enemy' },
  { kind: 'farm', team: 'enemy' },
  { kind: 'tower', team: 'enemy' },
];

const joustingRows = [
  { kind: 'jousting', team: 'player' },
  { kind: 'jousting', team: 'enemy' },
];

const targetByKind = {
  townhall: { width: 134, height: 134 },
  barracks: { width: 134, height: 134 },
  farm: { width: 104, height: 104 },
  tower: { width: 104, height: 124 },
  jousting: { width: 142, height: 132 },
};

const jobs = [
  { atlas: 'building-construction-atlas.png', columns: 12, state: 'build', level2: false },
  { atlas: 'building-ready-atlas.png', columns: 8, state: 'ready', level2: false },
  { atlas: 'building-damaged-atlas.png', columns: 8, state: 'damaged', level2: false },
  { atlas: 'building-level2-ready-atlas.png', columns: 8, state: 'ready', level2: true },
  { atlas: 'building-level2-damaged-atlas.png', columns: 8, state: 'damaged', level2: true },
  { atlas: 'building-ruins-atlas.png', columns: 1, state: 'ruins', level2: false, staticOnly: true },
];

const joustingJobs = [
  { atlas: 'building-jousting-construction-atlas.png', columns: 12, state: 'build', level2: false },
  { atlas: 'building-jousting-ready-atlas.png', columns: 8, state: 'ready', level2: false },
  { atlas: 'building-jousting-damaged-atlas.png', columns: 8, state: 'damaged', level2: false },
  { atlas: 'building-jousting-level2-ready-atlas.png', columns: 8, state: 'ready', level2: true },
  { atlas: 'building-jousting-level2-damaged-atlas.png', columns: 8, state: 'damaged', level2: true },
  { atlas: 'building-jousting-ruins-atlas.png', columns: 1, state: 'ruins', level2: false, staticOnly: true },
];

async function main() {
  const onlyLevel2 = process.argv.includes('--only-level2');
  const only = getArg('--only');
  if (only === 'jousting' && await writeJoustingGridAtlases(onlyLevel2)) return;
  const activeRows = only === 'jousting' ? joustingRows : rows;
  const activeJobs = only === 'jousting' ? joustingJobs : jobs;
  await fs.mkdir(outDir, { recursive: true });
  for (const job of activeJobs.filter((item) => !onlyLevel2 || item.level2)) {
    const splitFiles = await findSplitAtlases(job.atlas);
    if (splitFiles) {
      for (const item of splitFiles) {
        const cells = await cutAtlas(item.file, item.rows.length, job.columns);
        await writeJobCells(job, item.rows, cells);
      }
      continue;
    }
    const file = await findAtlas(job.atlas);
    const cells = await cutAtlas(file, activeRows.length, job.columns);
    await writeJobCells(job, activeRows, cells);
  }
}

async function writeJoustingGridAtlases(onlyLevel2) {
  const files = {
    player: await findOptionalAtlas('building-jousting-grid-player-atlas.png'),
    enemy: await findOptionalAtlas('building-jousting-grid-enemy-atlas.png'),
  };
  if (!files.player && !files.enemy) return false;
  if (!files.player || !files.enemy) {
    throw new Error('missing paired jousting grid atlas; expected player and enemy 8x8 atlases');
  }

  await fs.mkdir(outDir, { recursive: true });
  for (const [team, file] of Object.entries(files)) {
    const cells = await cutFixedAtlas(file, 8, 8);
    if (!onlyLevel2) {
      await writeJoustingBuild(team, cells[0]);
      await writeJoustingSurface(team, 'ready', cells[1], false);
      await writeJoustingSurface(team, 'damaged', cells[3], false);
      await writeJoustingDestroy(team, cells[6]);
      await writeJoustingStatic(team, 'ruins', cells[7][0]);
    }
    await writeJoustingSurface(team, 'ready', cells[4], true);
    await writeJoustingSurface(team, 'damaged', cells[5], true);
  }
  return true;
}

async function cutFixedAtlas(file, rowCount, columnCount) {
  const meta = await sharp(file).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const result = [];
  for (let row = 0; row < rowCount; row++) {
    const top = Math.round((row * height) / rowCount);
    const bottom = Math.round(((row + 1) * height) / rowCount);
    result.push(await fixedGridRow(file, top, bottom - top, width, columnCount));
  }
  return result;
}

async function writeJoustingBuild(team, sourceFrames) {
  const frames = resampleFrames(sourceFrames, 12);
  for (let frame = 0; frame < frames.length; frame++) {
    const png = await normalizeBuildingCell(frames[frame], 'jousting');
    await fs.writeFile(path.join(outDir, `bld-jousting-${team}-build-${frame}.png`), png);
    const staticStage = constructionStageForFrame(frame);
    if (staticStage) await fs.writeFile(path.join(outDir, `bld-jousting-${team}-${staticStage}.png`), png);
  }
}

async function writeJoustingSurface(team, state, sourceFrames, level2) {
  const stage = level2 ? `level2-${state}` : state;
  for (let frame = 0; frame < sourceFrames.length; frame++) {
    const png = await normalizeBuildingCell(sourceFrames[frame], 'jousting');
    await fs.writeFile(path.join(outDir, `bld-jousting-${team}-${stage}-${frame}.png`), png);
    if (frame === 0) {
      if (!level2) {
        await fs.writeFile(path.join(outDir, `bld-jousting-${team}-${state}.png`), png);
      }
      if (state === 'ready') {
        const staticName = level2 ? `bld-jousting-${team}-level2-d.png` : `bld-jousting-${team}-d.png`;
        await fs.writeFile(path.join(assetDir, staticName), png);
      }
    }
  }
}

async function writeJoustingDestroy(team, sourceFrames) {
  for (let frame = 0; frame < sourceFrames.length; frame++) {
    const png = await normalizeBuildingCell(sourceFrames[frame], 'jousting');
    await fs.writeFile(path.join(outDir, `bld-jousting-${team}-destroy-${frame}.png`), png);
  }
}

async function writeJoustingStatic(team, state, sourceFrame) {
  const png = await normalizeBuildingCell(sourceFrame, 'jousting');
  await fs.writeFile(path.join(outDir, `bld-jousting-${team}-${state}.png`), png);
}

function resampleFrames(frames, count) {
  if (frames.length === count) return frames;
  return Array.from({ length: count }, (_, index) => {
    const source = Math.round((index * (frames.length - 1)) / (count - 1));
    return frames[source];
  });
}

async function writeJobCells(job, rowDefs, cells) {
  for (let row = 0; row < rowDefs.length; row++) {
    const { kind, team } = rowDefs[row];
    for (let frame = 0; frame < job.columns; frame++) {
      const png = await normalizeBuildingCell(cells[row][frame], kind);
      if (job.staticOnly) {
        await fs.writeFile(path.join(outDir, `bld-${kind}-${team}-${job.state}.png`), png);
        continue;
      }
      const stage = job.level2 ? `level2-${job.state}` : job.state;
      await fs.writeFile(path.join(outDir, `bld-${kind}-${team}-${stage}-${frame}.png`), png);
      if (job.state === 'build') {
        const staticStage = constructionStageForFrame(frame);
        if (staticStage) await fs.writeFile(path.join(outDir, `bld-${kind}-${team}-${staticStage}.png`), png);
      }
      if (!job.level2 && (job.state === 'ready' || job.state === 'damaged') && frame === 0) {
        await fs.writeFile(path.join(outDir, `bld-${kind}-${team}-${job.state}.png`), png);
      }
      if (job.state === 'ready' && frame === 0) {
        const staticName = job.level2 ? `bld-${kind}-${team}-level2-d.png` : `bld-${kind}-${team}-d.png`;
        await fs.writeFile(path.join(assetDir, staticName), png);
      }
    }
  }
}

function constructionStageForFrame(frame) {
  if (frame === 0) return 'foundation';
  if (frame === 4) return 'scaffold';
  if (frame === 8) return 'shell';
  return null;
}

async function findAtlas(name) {
  for (const dir of atlasDirs) {
    const file = path.join(dir, name);
    if (await exists(file)) return file;
  }
  throw new Error(`missing source atlas: ${name}. Run npm run assets:ai-atlases`);
}

async function findSplitAtlases(name) {
  const ext = '-atlas.png';
  if (!name.endsWith(ext)) return null;
  const prefix = name.slice(0, -ext.length);
  const player = await findOptionalAtlas(`${prefix}-player${ext}`);
  const enemy = await findOptionalAtlas(`${prefix}-enemy${ext}`);
  if (!player || !enemy) return null;
  return [
    { file: player, rows: rows.filter((row) => row.team === 'player') },
    { file: enemy, rows: rows.filter((row) => row.team === 'enemy') },
  ];
}

async function findOptionalAtlas(name) {
  for (const dir of atlasDirs) {
    const file = path.join(dir, name);
    if (await exists(file)) return file;
  }
  return null;
}

async function cutAtlas(file, rowCount, columnCount) {
  const meta = await sharp(file).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const result = [];
  for (let row = 0; row < rowCount; row++) {
    const top = Math.round((row * height) / rowCount);
    const bottom = Math.round(((row + 1) * height) / rowCount);
    const frames = await segmentRow(file, top, bottom - top, width, columnCount);
    result.push(frames.length === columnCount ? frames : await fixedGridRow(file, top, bottom - top, width, columnCount));
  }
  return result;
}

async function segmentRow(file, top, height, width, expectedCount) {
  const row = await cleanCell(file, 0, top, width, height);
  const mask = new Uint8Array(row.width * row.height);
  for (let i = 0; i < row.data.length; i += 4) {
    if (row.data[i + 3] > 12) mask[i / 4] = 1;
  }
  const boxes = componentBoxes(mask, row.width, row.height)
    .filter((box) => box.count > 250);
  const merged = boxesForColumns(boxes, row.width, expectedCount, 0.08)
    .filter(Boolean);
  if (merged.length !== expectedCount) return [];
  return merged.map((box) => ({
    data: row.data,
    width: row.width,
    height: row.height,
    box,
  }));
}

async function fixedGridRow(file, top, height, width, columnCount) {
  const frames = [];
  for (let col = 0; col < columnCount; col++) {
    const left = Math.round((col * width) / columnCount);
    const right = Math.round(((col + 1) * width) / columnCount);
    frames.push(await cleanCell(file, left, top, right - left, height));
  }
  return frames;
}

async function cleanCell(file, left, top, width, height) {
  const { data, info } = await sharp(file)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const greenKey = g > 105 && g > r * 1.12 && g > b * 1.12;
    const magentaGrid = r > 120 && b > 100 && g < 90;
    if (greenKey || magentaGrid) data[i + 3] = 0;
    if (data[i + 3] > 12) {
      const p = i / 4;
      const x = p % info.width;
      const y = Math.floor(p / info.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    minX = 0;
    minY = 0;
    maxX = info.width - 1;
    maxY = info.height - 1;
  }

  return {
    data,
    width: info.width,
    height: info.height,
    box: { minX, minY, maxX, maxY },
  };
}

function componentBoxes(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const stack = [];
  const boxes = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const current = stack.pop();
        count += 1;
        const cx = current % width;
        const cy = Math.floor(current / width);
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
      if (count > 40) boxes.push({ minX, maxX, minY, maxY, count });
    }
  }
  return boxes;
}

function boxesForColumns(boxes, width, expectedCount, marginRatio) {
  const columnW = width / expectedCount;
  return Array.from({ length: expectedCount }, (_, col) => {
    const min = (col - marginRatio) * columnW;
    const max = (col + 1 + marginRatio) * columnW;
    const parts = boxes.filter((box) => {
      const cx = (box.minX + box.maxX) / 2;
      const overlapsColumn = box.maxX >= min && box.minX <= max;
      return overlapsColumn && cx >= min && cx <= max;
    });
    if (!parts.length) return null;
    return mergeBoxes(parts);
  });
}

function mergeBoxes(boxes) {
  return boxes.reduce((acc, box) => ({
    minX: Math.min(acc.minX, box.minX),
    maxX: Math.max(acc.maxX, box.maxX),
    minY: Math.min(acc.minY, box.minY),
    maxY: Math.max(acc.maxY, box.maxY),
    count: acc.count + box.count,
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, count: 0 });
}

async function normalizeBuildingCell(cell, kind) {
  const target = targetByKind[kind];
  const left = Math.max(0, cell.box.minX - 4);
  const top = Math.max(0, cell.box.minY - 4);
  const right = Math.min(cell.width, cell.box.maxX + 5);
  const bottom = Math.min(cell.height, cell.box.maxY + 5);
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const { data, info } = await sharp(cell.data, {
    raw: { width: cell.width, height: cell.height, channels: 4 },
  })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .raw()
    .toBuffer({ resolveWithObject: true });

  removeWrappedTopArtifacts(data, info.width, info.height);
  removeDetachedTopArtifacts(data, info.width, info.height);
  const cleanedBox = alphaBox(data, info.width, info.height);
  const cleanWidth = cleanedBox.maxX - cleanedBox.minX + 1;
  const cleanHeight = cleanedBox.maxY - cleanedBox.minY + 1;
  const rawPng = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract({ left: cleanedBox.minX, top: cleanedBox.minY, width: cleanWidth, height: cleanHeight })
    .png()
    .toBuffer();

  const scale = Math.min(target.width / cleanWidth, target.height / cleanHeight);
  const resizedWidth = Math.max(1, Math.round(cleanWidth * scale));
  const resizedHeight = Math.max(1, Math.round(cleanHeight * scale));
  const sprite = await sharp(rawPng)
    .resize({ width: resizedWidth, height: resizedHeight, fit: 'fill' })
    .png()
    .toBuffer();
  const padX = 28;
  const padTop = 18;
  const padBottom = 22;
  const canvasWidth = target.width + padX;
  const canvasHeight = target.height + padTop + padBottom;

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: sprite,
      left: Math.round((canvasWidth - resizedWidth) / 2),
      top: canvasHeight - resizedHeight - padBottom,
    }])
    .png()
    .toBuffer();
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function removeWrappedTopArtifacts(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 12) mask[i / 4] = 1;
  }

  const seen = new Uint8Array(mask.length);
  const stack = [];
  const pixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      pixels.length = 0;
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const current = stack.pop();
        pixels.push(current);
        const cx = current % width;
        const cy = Math.floor(current / width);
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }

      const componentWidth = maxX - minX + 1;
      const componentHeight = maxY - minY + 1;
      const shallowTopStrip = minY <= 2
        && componentHeight <= Math.max(14, Math.floor(height * 0.16))
        && componentWidth >= 2;
      if (!shallowTopStrip) continue;
      for (const pixel of pixels) data[pixel * 4 + 3] = 0;
    }
  }
}

function alphaBox(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 12) continue;
    const p = i / 4;
    const x = p % width;
    const y = Math.floor(p / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  }
  return { minX, minY, maxX, maxY };
}

function removeDetachedTopArtifacts(data, width, height) {
  const components = collectComponents(data, width, height);
  if (components.length < 2) return;
  const main = components.reduce((best, component) => component.count > best.count ? component : best, components[0]);
  for (const component of components) {
    if (component === main) continue;
    const aboveMainBody = component.maxY < main.minY - 6;
    if (!aboveMainBody || isSmokeLike(component)) continue;
    for (const pixel of component.pixels) data[pixel * 4 + 3] = 0;
  }
}

function collectComponents(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 12) mask[i / 4] = 1;
  }

  const seen = new Uint8Array(mask.length);
  const stack = [];
  const components = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let red = 0;
      let green = 0;
      let blue = 0;
      const pixels = [];
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const current = stack.pop();
        pixels.push(current);
        const cx = current % width;
        const cy = Math.floor(current / width);
        const offset = current * 4;
        red += data[offset];
        green += data[offset + 1];
        blue += data[offset + 2];
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
      components.push({
        minX,
        maxX,
        minY,
        maxY,
        count: pixels.length,
        pixels,
        avgR: red / pixels.length,
        avgG: green / pixels.length,
        avgB: blue / pixels.length,
      });
    }
  }
  return components;
}

function isSmokeLike(component) {
  const max = Math.max(component.avgR, component.avgG, component.avgB);
  const min = Math.min(component.avgR, component.avgG, component.avgB);
  return min > 120 && max - min < 70;
}

function getArg(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
