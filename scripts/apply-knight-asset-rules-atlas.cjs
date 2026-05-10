const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = process.cwd();
const customDir = path.join(root, 'local-assets/generated/custom/knight');
const atlasDir = path.join(customDir, 'asset-rules-atlases');
const frameDir = path.join(customDir, 'frames');
const qaDir = path.join(customDir, 'qa');
const assetDir = path.join(root, 'public/assets/generated');
const outDir = path.join(assetDir, 'animation');

const sourceCell = 128;
const canvas = { width: 148, height: 148 };
const target = { width: 144, height: 138 };
const sourceFrameCount = 8;
const teams = ['player', 'enemy'];

const rowStates = [
  { row: 0, source: 'idle', outputs: [{ state: 'idle', count: 12 }] },
  { row: 1, source: 'walk-down', outputs: [{ state: 'walk-down', count: 18 }] },
  { row: 2, source: 'walk-right', outputs: [{ state: 'walk-right', count: 18 }] },
  { row: 3, source: 'walk-up', outputs: [{ state: 'walk-up', count: 18 }] },
  { row: 4, source: 'attack', outputs: [{ state: 'attack', count: 12 }] },
  { row: 5, source: 'hit', outputs: [{ state: 'hit', count: 8 }] },
  { row: 6, source: 'death', outputs: [{ state: 'death', count: 12 }] },
  { row: 7, source: 'work-build', outputs: [{ state: 'gather', count: 12 }, { state: 'build', count: 12 }] },
];

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(frameDir, { recursive: true });
  await fs.mkdir(qaDir, { recursive: true });

  const written = [];
  for (const team of teams) {
    const atlas = path.join(atlasDir, `knight-${team}-8x8-grid.png`);
    if (!(await exists(atlas))) throw new Error(`missing atlas: ${path.relative(root, atlas)}`);

    for (const rowState of rowStates) {
      const sourceFrames = [];
      for (let col = 0; col < sourceFrameCount; col++) {
        const raw = await extractSourceCell(atlas, rowState.row, col);
        sourceFrames.push(await normalizeCell(raw));
      }
      const runtimeFrames = await normalizeRuntimeFrames(rowState.source, sourceFrames);

      const sourceStateDir = path.join(frameDir, team, rowState.source);
      await fs.mkdir(sourceStateDir, { recursive: true });
      for (let i = 0; i < runtimeFrames.length; i++) {
        await fs.writeFile(path.join(sourceStateDir, `${String(i).padStart(3, '0')}.png`), runtimeFrames[i]);
      }

      for (const output of rowState.outputs) {
        const stateDir = path.join(frameDir, team, output.state);
        await fs.mkdir(stateDir, { recursive: true });
        for (let frame = 0; frame < output.count; frame++) {
          const sourceIndex = mapFrame(frame, output.count);
          const png = runtimeFrames[sourceIndex];
          const frameName = `${String(frame).padStart(3, '0')}.png`;
          const framePath = path.join(stateDir, frameName);
          const runtimePath = path.join(outDir, `unit-knight-${team}-${output.state}-${frame}.png`);
          await fs.writeFile(framePath, png);
          await fs.writeFile(runtimePath, png);
          written.push(runtimePath);
          if (output.state === 'idle' && frame === 0) {
            await fs.writeFile(path.join(assetDir, `unit-knight-${team}-d.png`), png);
          }
        }
      }
    }
  }

  await writeQa(written);
  console.log(`applied ${written.length} runtime knight files from 8x8 asset-rules atlases`);
}

async function extractSourceCell(file, row, col) {
  const meta = await sharp(file).metadata();
  if (meta.width !== 1024 || meta.height !== 1024) {
    throw new Error(`expected 1024x1024 atlas, got ${meta.width}x${meta.height}: ${path.relative(root, file)}`);
  }
  const inset = 2;
  const extract = {
    left: col * sourceCell + inset,
    top: row * sourceCell + inset,
    width: sourceCell - inset * 2,
    height: sourceCell - inset * 2,
  };
  const { data, info } = await sharp(file)
    .extract(extract)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  cleanKeyAndGrid(data);
  removeSmallAlphaComponents(data, info.width, info.height);
  return { data, width: info.width, height: info.height, box: alphaBox(data, info.width, info.height) };
}

function cleanKeyAndGrid(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const greenKey = g > 105 && g > r * 1.12 && g > b * 1.12;
    const magentaGrid = r > 130 && b > 120 && g < 120;
    const antialiasMagentaGrid = r > 35 && b > 35 && g < 80 && r > g * 1.35 && b > g * 1.35 && Math.abs(r - b) < 90;
    const nearBlackBorder = r < 18 && g < 18 && b < 28;
    if (greenKey || magentaGrid || antialiasMagentaGrid || nearBlackBorder) data[i + 3] = 0;
  }
}

async function normalizeCell(cell) {
  const box = cell.box;
  const padX = 5;
  const padTop = 5;
  const padBottom = 2;
  const left = Math.max(0, box.minX - padX);
  const top = Math.max(0, box.minY - padTop);
  const right = Math.min(cell.width, box.maxX + padX + 1);
  const bottom = Math.min(cell.height, box.maxY + padBottom + 1);
  const cropWidth = Math.max(1, right - left);
  const cropHeight = Math.max(1, bottom - top);
  const rawPng = await sharp(cell.data, {
    raw: { width: cell.width, height: cell.height, channels: 4 },
  })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  const scale = Math.min(1.2, Math.min(target.width / cropWidth, target.height / cropHeight));
  const resizedWidth = Math.max(1, Math.round(cropWidth * scale));
  const resizedHeight = Math.max(1, Math.round(cropHeight * scale));
  const sprite = await sharp(rawPng)
    .resize({ width: resizedWidth, height: resizedHeight, fit: 'fill' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: sprite,
      left: Math.round((canvas.width - resizedWidth) / 2),
      top: canvas.height - resizedHeight - 5,
    }])
    .png()
    .toBuffer();
}

async function normalizeRuntimeFrames(source, frames) {
  if (source === 'idle') {
    return frames.map(() => frames[0]);
  }
  if (source === 'walk-right') {
    return Promise.all(frames.map((frame) => sharp(frame).flop().png().toBuffer()));
  }
  return frames;
}

function mapFrame(frame, outputCount) {
  if (outputCount === sourceFrameCount) return frame;
  return Math.min(sourceFrameCount - 1, Math.floor((frame * sourceFrameCount) / outputCount));
}

function alphaBox(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] <= 12) continue;
    const p = (i - 3) / 4;
    const x = p % width;
    const y = Math.floor(p / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  return { minX, minY, maxX, maxY };
}

function removeSmallAlphaComponents(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 12) mask[(i - 3) / 4] = 1;
  }
  const components = componentPixels(mask, width, height);
  const largest = components.reduce((max, component) => Math.max(max, component.length), 0);
  const minKeep = Math.max(80, Math.floor(largest * 0.08));
  for (const component of components) {
    const edgeFragment = touchesEdge(component, width, height) && component.length < largest * 0.25;
    if (component.length >= minKeep && !edgeFragment) continue;
    for (const p of component) data[p * 4 + 3] = 0;
  }
}

function componentPixels(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const stack = [];
  const components = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      const pixels = [];
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const current = stack.pop();
        pixels.push(current);
        const cx = current % width;
        const cy = Math.floor(current / width);
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
      components.push(pixels);
    }
  }
  return components;
}

function touchesEdge(component, width, height) {
  return component.some((p) => {
    const x = p % width;
    const y = Math.floor(p / width);
    return x === 0 || y === 0 || x === width - 1 || y === height - 1;
  });
}

async function writeQa(files) {
  const report = {
    generatedAt: new Date().toISOString(),
    source: path.relative(root, atlasDir),
    sourceFormat: '1024x1024, 8x8, 128px cells',
    runtimeFiles: files.length,
    dimensions: `${canvas.width}x${canvas.height}`,
    transparentCornerFiles: 0,
    lowCoverage: [],
  };
  for (const file of files) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
    if (alpha(0, 0) === 0 && alpha(info.width - 1, 0) === 0 && alpha(0, info.height - 1) === 0 && alpha(info.width - 1, info.height - 1) === 0) {
      report.transparentCornerFiles += 1;
    }
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 12) opaque += 1;
    }
    const coverage = opaque / (info.width * info.height);
    if (coverage < 0.035) report.lowCoverage.push(path.relative(root, file));
  }
  await fs.writeFile(path.join(qaDir, 'alpha-report-asset-rules.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeContactSheet(path.join(qaDir, 'contact-sheet-asset-rules.png'));
}

async function writeContactSheet(out) {
  const states = ['idle', 'walk-down', 'walk-right', 'walk-up', 'attack', 'hit', 'death', 'gather', 'build'];
  const columns = 18;
  const cell = 58;
  const labelW = 118;
  const rowH = 70;
  const composites = [];
  let row = 0;
  for (const team of teams) {
    for (const state of states) {
      const y = row * rowH;
      const label = Buffer.from(`<svg width="${labelW}" height="${rowH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1f242b"/><text x="10" y="26" font-family="Arial" font-size="15" fill="#f7f1d7">${team}</text><text x="10" y="50" font-family="Arial" font-size="14" fill="#b9c0ca">${state}</text></svg>`);
      composites.push({ input: label, left: 0, top: y });
      for (let frame = 0; frame < columns; frame++) {
        const file = path.join(outDir, `unit-knight-${team}-${state}-${frame}.png`);
        if (!(await exists(file))) continue;
        const png = await sharp(file).resize(54, 54, { fit: 'contain' }).png().toBuffer();
        composites.push({ input: png, left: labelW + frame * cell + 2, top: y + 8 });
      }
      row += 1;
    }
  }
  await sharp({
    create: {
      width: labelW + columns * cell,
      height: row * rowH,
      channels: 4,
      background: '#111417',
    },
  })
    .composite(composites)
    .png()
    .toFile(out);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
