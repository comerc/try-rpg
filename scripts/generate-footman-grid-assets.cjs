const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = process.cwd();
const customDir = path.join(root, 'local-assets/generated/custom/footman');
const atlasDir = path.join(customDir, 'atlases-grid');
const frameDir = path.join(customDir, 'frames');
const qaDir = path.join(customDir, 'qa');
const assetDir = path.join(root, 'public/assets/generated');
const outDir = path.join(assetDir, 'animation');
const canvas = { width: 148, height: 148 };
const target = { width: 142, height: 132 };
const teams = ['player', 'enemy'];

const jobs = [
  { atlas: 'unit-idle-atlas.png', columns: 12, outputs: ['idle'] },
  { atlas: 'unit-attack-atlas.png', columns: 12, outputs: ['attack'] },
  { atlas: 'unit-work-atlas.png', columns: 12, outputs: ['gather', 'build'] },
  { atlas: 'unit-hit-atlas.png', columns: 8, outputs: ['hit'] },
  { atlas: 'unit-death-atlas.png', columns: 12, outputs: ['death'] },
  { atlas: 'unit-walk-down-atlas.png', columns: 18, outputs: ['walk-down'] },
  { atlas: 'unit-walk-right-atlas.png', columns: 18, outputs: ['walk-right'] },
  { atlas: 'unit-walk-up-atlas.png', columns: 18, outputs: ['walk-up'] },
];

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(frameDir, { recursive: true });
  await fs.mkdir(qaDir, { recursive: true });

  const written = [];
  for (const job of jobs) {
    const source = path.join(atlasDir, job.atlas);
    if (!(await exists(source))) {
      throw new Error(`missing footman grid atlas: ${path.relative(root, source)}`);
    }
    const rows = await cutGridAtlas(source, teams.length, job.columns);
    for (let row = 0; row < teams.length; row++) {
      const team = teams[row];
      for (const state of job.outputs) {
        const stateDir = path.join(frameDir, team, state);
        await fs.mkdir(stateDir, { recursive: true });
        for (let frame = 0; frame < job.columns; frame++) {
          const png = await normalizeCell(rows[row][frame]);
          const frameName = `${String(frame).padStart(3, '0')}.png`;
          const framePath = path.join(stateDir, frameName);
          const runtimePath = path.join(outDir, `unit-footman-${team}-${state}-${frame}.png`);
          await fs.writeFile(framePath, png);
          await fs.writeFile(runtimePath, png);
          written.push(runtimePath, framePath);
          if (state === 'idle' && frame === 0) {
            await fs.writeFile(path.join(assetDir, `unit-footman-${team}-d.png`), png);
          }
        }
      }
    }
  }

  await writeQa(written);
  console.log(`generated ${written.length} footman files from visible-grid atlases`);
}

async function cutGridAtlas(file, rowCount, columnCount) {
  const meta = await sharp(file).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const rows = [];
  for (let row = 0; row < rowCount; row++) {
    const cells = [];
    const top = Math.round((row * height) / rowCount);
    const bottom = Math.round(((row + 1) * height) / rowCount);
    for (let col = 0; col < columnCount; col++) {
      const left = Math.round((col * width) / columnCount);
      const right = Math.round(((col + 1) * width) / columnCount);
      cells.push(await cleanCell(file, left, top, right - left, bottom - top));
    }
    rows.push(cells);
  }
  return rows;
}

async function cleanCell(file, left, top, width, height) {
  const inset = Math.min(4, Math.floor(Math.min(width, height) * 0.04));
  const extract = {
    left: left + inset,
    top: top + inset,
    width: Math.max(1, width - inset * 2),
    height: Math.max(1, height - inset * 2),
  };
  const { data, info } = await sharp(file)
    .extract(extract)
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
    const magentaGrid = r > 130 && b > 120 && g < 120;
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

  removeSmallAlphaComponents(data, info.width, info.height);
  minX = info.width;
  minY = info.height;
  maxX = -1;
  maxY = -1;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] <= 12) continue;
    const p = (i - 3) / 4;
    const x = p % info.width;
    const y = Math.floor(p / info.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (maxX < minX || maxY < minY) {
    minX = 0;
    minY = 0;
    maxX = info.width - 1;
    maxY = info.height - 1;
  }

  return { data, width: info.width, height: info.height, box: { minX, minY, maxX, maxY } };
}

async function normalizeCell(cell) {
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

  const scale = Math.min(1.18, Math.min(target.width / cropWidth, target.height / cropHeight));
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

async function writeQa(files) {
  const pngs = files.filter((file) => file.includes(`${path.sep}public${path.sep}`));
  const report = {
    generatedAt: new Date().toISOString(),
    source: path.relative(root, atlasDir),
    runtimeFiles: pngs.length,
    dimensions: `${canvas.width}x${canvas.height}`,
    transparentCornerFiles: 0,
    lowCoverage: [],
  };
  for (const file of pngs) {
    const image = sharp(file).ensureAlpha();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
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
  await fs.writeFile(path.join(qaDir, 'alpha-report-grid.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeContactSheet(path.join(qaDir, 'contact-sheet-grid.png'));
}

function removeSmallAlphaComponents(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 12) mask[(i - 3) / 4] = 1;
  }
  const components = componentPixels(mask, width, height);
  const largest = components.reduce((max, component) => Math.max(max, component.length), 0);
  const minKeep = Math.max(120, Math.floor(largest * 0.2));
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

async function writeContactSheet(out) {
  const states = ['idle', 'attack', 'gather', 'build', 'hit', 'death', 'walk-down', 'walk-right', 'walk-up'];
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
        const file = path.join(outDir, `unit-footman-${team}-${state}-${frame}.png`);
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
