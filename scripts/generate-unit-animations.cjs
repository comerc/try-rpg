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
const canvas = { width: 148, height: 148 };

const rowUnitsV4 = [
  { kind: 'peasant', team: 'player' },
  { kind: 'footman', team: 'player' },
  { kind: 'archer', team: 'player' },
  { kind: 'knight', team: 'player' },
  { kind: 'peasant', team: 'enemy' },
  { kind: 'footman', team: 'enemy' },
  { kind: 'archer', team: 'enemy' },
  { kind: 'knight', team: 'enemy' },
];

const rowUnitsV3 = [
  { kind: 'peasant', team: 'player' },
  { kind: 'footman', team: 'player' },
  { kind: 'archer', team: 'player' },
  { kind: 'peasant', team: 'enemy' },
  { kind: 'footman', team: 'enemy' },
  { kind: 'archer', team: 'enemy' },
];

const rowUnitsCavalry = [
  { kind: 'cavalier', team: 'player' },
  { kind: 'horseArcher', team: 'player' },
  { kind: 'horseKnight', team: 'player' },
  { kind: 'cavalier', team: 'enemy' },
  { kind: 'horseArcher', team: 'enemy' },
  { kind: 'horseKnight', team: 'enemy' },
];

const targetByKind = {
  peasant: { height: 122, width: 142 },
  footman: { height: 132, width: 142 },
  archer: { height: 126, width: 142 },
  knight: { height: 138, width: 144 },
  cavalier: { height: 144, width: 164 },
  horseArcher: { height: 142, width: 166 },
  horseKnight: { height: 148, width: 172 },
};

const canvasByKind = {
  cavalier: { width: 176, height: 156 },
  horseArcher: { width: 176, height: 156 },
  horseKnight: { width: 184, height: 160 },
};

const jobs = [
  { atlas: 'unit-idle-atlas.png', columns: 12, outputs: [{ state: 'idle' }] },
  { atlas: 'unit-attack-atlas.png', columns: 12, outputs: [{ state: 'attack' }] },
  { atlas: 'unit-work-atlas.png', columns: 12, outputs: [{ state: 'gather' }, { state: 'build' }] },
  { atlas: 'unit-hit-atlas.png', columns: 8, outputs: [{ state: 'hit' }] },
  { atlas: 'unit-death-atlas.png', columns: 12, outputs: [{ state: 'death' }] },
  { atlas: 'unit-walk-down-atlas.png', columns: 18, outputs: [{ state: 'walk-down' }] },
  { atlas: 'unit-walk-right-atlas.png', columns: 18, outputs: [{ state: 'walk-right' }] },
  { atlas: 'unit-walk-up-atlas.png', columns: 18, outputs: [{ state: 'walk-up' }] },
];

const cavalryJobs = [
  { atlas: 'unit-cavalry-idle-atlas.png', columns: 12, outputs: [{ state: 'idle' }] },
  { atlas: 'unit-cavalry-attack-atlas.png', columns: 12, outputs: [{ state: 'attack' }] },
  { atlas: 'unit-cavalry-work-atlas.png', columns: 12, outputs: [{ state: 'gather' }, { state: 'build' }] },
  { atlas: 'unit-cavalry-hit-atlas.png', columns: 8, outputs: [{ state: 'hit' }] },
  { atlas: 'unit-cavalry-death-atlas.png', columns: 12, outputs: [{ state: 'death' }] },
  { atlas: 'unit-cavalry-walk-down-atlas.png', columns: 18, outputs: [{ state: 'walk-down' }] },
  { atlas: 'unit-cavalry-walk-right-atlas.png', columns: 18, outputs: [{ state: 'walk-right' }] },
  { atlas: 'unit-cavalry-walk-up-atlas.png', columns: 18, outputs: [{ state: 'walk-up' }] },
];

async function main() {
  const only = getArg('--only');
  const cavalryOnly = only && rowUnitsCavalry.some((unit) => unit.kind === only);
  const selectedJobs = cavalryOnly ? cavalryJobs : jobs;
  await fs.mkdir(outDir, { recursive: true });
  for (const job of selectedJobs) {
    const source = await findAtlas(job.atlas);
    const rowUnits = job.atlas.startsWith('unit-cavalry-')
      ? rowUnitsCavalry
      : source.includes(`${path.sep}v4${path.sep}`) ? rowUnitsV4 : rowUnitsV3;
    if (only && !rowUnits.some((unit) => unit.kind === only)) {
      throw new Error(`atlas ${path.relative(root, source)} has no unit row for ${only}; run npm run assets:ai-atlases first`);
    }
    const cells = await cutAtlas(source, rowUnits.length, job.columns);
    for (let row = 0; row < rowUnits.length; row++) {
      const { kind, team } = rowUnits[row];
      if (only && kind !== only) continue;
      for (const output of job.outputs) {
        for (let frame = 0; frame < job.columns; frame++) {
          const png = await normalizeUnitCell(cells[row][frame], kind, output.state);
          await fs.writeFile(path.join(outDir, `unit-${kind}-${team}-${output.state}-${frame}.png`), png);
          if (output.state === 'idle' && frame === 0) {
            await fs.writeFile(path.join(assetDir, `unit-${kind}-${team}-d.png`), png);
          }
        }
      }
    }
  }
}

async function findAtlas(name) {
  for (const dir of atlasDirs) {
    const file = path.join(dir, name);
    if (await exists(file)) return file;
  }
  throw new Error(`missing source atlas: ${name}. Run npm run assets:ai-atlases`);
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
    .filter((box) => box.count > 120);
  const tallSprites = boxes
    .filter((box) => box.count > 800 && (box.maxY - box.minY + 1) > row.height * 0.34)
    .sort((a, b) => a.minX - b.minX);
  if (tallSprites.length >= expectedCount) {
    return tallSprites.slice(0, expectedCount).map((box) => ({
      data: row.data,
      width: row.width,
      height: row.height,
      box,
    }));
  }
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
  const inset = file.includes(`${path.sep}v4${path.sep}`) ? 10 : 0;
  for (let col = 0; col < columnCount; col++) {
    const left = Math.round((col * width) / columnCount);
    const right = Math.round(((col + 1) * width) / columnCount);
    frames.push(await cleanCell(file, left + inset, top + inset, right - left - inset * 2, height - inset * 2));
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
    const magentaGrid = r > 160 && b > 145 && g < 105;
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

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function getArg(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function normalizeUnitCell(cell, kind, state) {
  const target = targetByKind[kind];
  const outputCanvas = canvasByKind[kind] ?? canvas;
  const padX = 5;
  const padTop = 5;
  const padBottom = 2;
  const left = Math.max(0, cell.box.minX - padX);
  const top = Math.max(0, cell.box.minY - padTop);
  const right = Math.min(cell.width, cell.box.maxX + padX + 1);
  const bottom = Math.min(cell.height, cell.box.maxY + padBottom + 1);
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const rawPng = await sharp(cell.data, {
    raw: { width: cell.width, height: cell.height, channels: 4 },
  })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  const targetHeight = target.height;
  const scale = Math.min(1.18, Math.min(target.width / cropWidth, targetHeight / cropHeight));
  const resizedWidth = Math.max(1, Math.round(cropWidth * scale));
  const resizedHeight = Math.max(1, Math.round(cropHeight * scale));
  const sprite = await sharp(rawPng)
    .resize({ width: resizedWidth, height: resizedHeight, fit: 'fill' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: outputCanvas.width,
      height: outputCanvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: sprite,
      left: Math.round((outputCanvas.width - resizedWidth) / 2),
      top: outputCanvas.height - resizedHeight - 5,
    }])
    .png()
    .toBuffer();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
