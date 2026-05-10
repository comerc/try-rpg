const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = process.cwd();
const customDir = path.join(root, 'local-assets/generated/custom/footman');
const frameDir = path.join(customDir, 'frames');
const outDir = path.join(customDir, 'atlases-grid');
const cell = 164;
const grid = 4;
const background = { r: 0, g: 255, b: 0, alpha: 1 };
const gridColor = { r: 255, g: 0, b: 255, alpha: 1 };
const teams = ['player', 'enemy'];

const jobs = [
  { out: 'unit-idle-atlas.png', columns: 12, state: 'idle' },
  { out: 'unit-attack-atlas.png', columns: 12, state: 'attack' },
  { out: 'unit-work-atlas.png', columns: 12, state: 'gather' },
  { out: 'unit-hit-atlas.png', columns: 8, state: 'hit' },
  { out: 'unit-death-atlas.png', columns: 12, state: 'death' },
  { out: 'unit-walk-down-atlas.png', columns: 18, state: 'walk-down' },
  { out: 'unit-walk-right-atlas.png', columns: 18, state: 'walk-right' },
  { out: 'unit-walk-up-atlas.png', columns: 18, state: 'walk-up' },
];

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  for (const job of jobs) {
    await buildAtlas(job);
  }
}

async function buildAtlas(job) {
  const width = job.columns * cell + (job.columns + 1) * grid;
  const height = teams.length * cell + (teams.length + 1) * grid;
  const composites = [];

  for (let col = 0; col <= job.columns; col++) {
    composites.push({
      input: await block(grid, height, gridColor),
      left: col * (cell + grid),
      top: 0,
    });
  }

  for (let row = 0; row <= teams.length; row++) {
    composites.push({
      input: await block(width, grid, gridColor),
      left: 0,
      top: row * (cell + grid),
    });
  }

  for (let row = 0; row < teams.length; row++) {
    const team = teams[row];
    for (let col = 0; col < job.columns; col++) {
      const source = path.join(frameDir, team, job.state, `${String(col).padStart(3, '0')}.png`);
      if (!(await exists(source))) {
        throw new Error(`missing frame for grid atlas: ${path.relative(root, source)}`);
      }
      const cleaned = await removeSmallAlphaComponents(source);
      const sprite = await sharp(cleaned)
        .resize({ width: 144, height: 144, fit: 'contain' })
        .png()
        .toBuffer();
      composites.push({
        input: sprite,
        left: grid + col * (cell + grid) + Math.round((cell - 144) / 2),
        top: grid + row * (cell + grid) + Math.round((cell - 144) / 2),
      });
    }
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(outDir, job.out));
  console.log(`grid atlas ${path.relative(root, path.join(outDir, job.out))}`);
}

async function block(width, height, color) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

async function removeSmallAlphaComponents(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 12) mask[(i - 3) / 4] = 1;
  }
  const components = componentPixels(mask, info.width, info.height);
  const largest = components.reduce((max, component) => Math.max(max, component.length), 0);
  const minKeep = Math.max(120, Math.floor(largest * 0.2));
  for (const component of components) {
    const edgeFragment = touchesEdge(component, info.width, info.height) && component.length < largest * 0.25;
    if (component.length >= minKeep && !edgeFragment) continue;
    for (const p of component) data[p * 4 + 3] = 0;
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
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
