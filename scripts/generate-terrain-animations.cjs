const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = process.cwd();
const outDir = path.join(root, 'public/assets/generated/animation');
const atlasPaths = [
  path.join(root, 'local-assets/generated/v4/terrain-animation-atlas.png'),
  path.join(root, 'local-assets/generated/v3/terrain-animation-atlas.png'),
];

const rows = [
  'grass',
  'grass-rich',
  'dirt',
  'water',
];

const columns = 8;

async function main() {
  const atlasPath = await findAtlas();
  await fs.mkdir(outDir, { recursive: true });
  const meta = await sharp(atlasPath).metadata();
  const atlasW = meta.width ?? 1;
  const atlasH = meta.height ?? 1;

  for (let row = 0; row < rows.length; row++) {
    const top = Math.round((row * atlasH) / rows.length);
    const bottom = Math.round(((row + 1) * atlasH) / rows.length);
    for (let col = 0; col < columns; col++) {
      const left = Math.round((col * atlasW) / columns);
      const right = Math.round(((col + 1) * atlasW) / columns);
      await sharp(atlasPath)
        .extract({ left, top, width: right - left, height: bottom - top })
        .resize(96, 96, { fit: 'cover' })
        .png()
        .toFile(path.join(outDir, `tile-${rows[row]}-${col}.png`));
    }
  }
}

async function findAtlas() {
  for (const file of atlasPaths) {
    try {
      await fs.access(file);
      return file;
    } catch {
      // Try the next source directory.
    }
  }
  throw new Error('missing terrain-animation-atlas.png. Run npm run assets:ai-atlases');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
