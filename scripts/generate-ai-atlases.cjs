const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = process.cwd();
const outDir = path.join(root, 'local-assets/generated/v4');
const refDir = path.join(root, 'local-assets/generated/references');
const promptDir = path.join(outDir, 'prompts');

const unitRows = [
  'player peasant: small medieval worker, blue cloth accent, tan tunic, simple tool belt, hammer and axe readable at small scale',
  'player footman: armored melee soldier, blue cloth accent, metal helmet, short sword and round shield',
  'player archer: slim ranged soldier, blue cloth accent, green-brown hood, bow and quiver',
  'player knight: heavy elite cavalry-inspired infantry knight, blue cloth accent, larger silhouette, full helm with plume, large kite shield, long lance or heavy sword, clearly not a footman',
  'enemy peasant: small medieval worker, red cloth accent, rough tan tunic, simple tool belt, hammer and axe readable at small scale',
  'enemy footman: armored melee soldier, red cloth accent, darker metal, short sword and round shield',
  'enemy archer: slim ranged soldier, red cloth accent, olive hood, bow and quiver',
  'enemy knight: heavy elite cavalry-inspired infantry knight, red cloth accent, larger silhouette, full helm with plume, large kite shield, long lance or heavy sword, clearly not a footman',
];

const cavalryRows = [
  'player cavalier: fast mounted melee soldier on a brown warhorse, blue cloth accent, light lance and small shield, readable horse silhouette',
  'player horse archer: mounted archer on a lean brown horse, blue cloth accent, bow drawn from saddle, quiver visible, clearly ranged cavalry',
  'player horse knight: elite armored knight on a barded warhorse, blue cloth accent, heavy lance, full helm, larger silhouette',
  'enemy cavalier: fast mounted melee soldier on a dark warhorse, red cloth accent, light lance and small shield, readable horse silhouette',
  'enemy horse archer: mounted archer on a lean dark horse, red cloth accent, bow drawn from saddle, quiver visible, clearly ranged cavalry',
  'enemy horse knight: elite armored knight on a barded dark warhorse, red cloth accent, heavy lance, full helm, larger silhouette',
];

const buildingRows = [
  'player town hall, blue banners',
  'player barracks, blue banners',
  'player farm, blue banners',
  'player tower, blue banners',
  'enemy town hall, red banners',
  'enemy barracks, red banners',
  'enemy farm, red banners',
  'enemy tower, red banners',
];

const joustingRows = [
  'player jousting yard / stables, blue banners, fenced training ring, tack racks, stable roof, no horses outside the footprint',
  'enemy jousting yard / stables, red banners, fenced training ring, tack racks, stable roof, no horses outside the footprint',
];

const jobs = [
  {
    key: 'unit-idle',
    out: 'unit-idle-atlas.png',
    prompt: unitPrompt('idle breathing loop', 12, [
      'twelve unique subtle idle breathing poses per row',
      'feet anchored, tiny torso, cloth, head, hand, and weapon shifts',
      'no duplicate cells, no crossfade ghosts',
    ]),
  },
  {
    key: 'unit-attack',
    out: 'unit-attack-atlas.png',
    prompt: unitPrompt('attack loop', 12, [
      'twelve unique attack anticipation, strike, follow-through, and recovery poses per row',
      'peasants swing a small tool, footmen swing sword and shield, archers draw and release bow, knights make heavy lance or sword strikes behind a large shield',
      'strong readable silhouettes, no duplicate cells',
    ]),
  },
  {
    key: 'unit-work',
    out: 'unit-work-atlas.png',
    prompt: unitPrompt('gathering and building work loop', 12, [
      'twelve unique chopping, mining, hammering, and carrying work poses per row',
      'tool and arms move through real intermediate positions',
      'knights keep their elite silhouette even in fallback work poses',
      'no duplicate cells, no blurred motion trails',
    ]),
  },
  {
    key: 'unit-hit',
    out: 'unit-hit-atlas.png',
    prompt: unitPrompt('hit reaction loop', 8, [
      'eight unique hit reaction poses per row',
      'small recoil, bracing, stagger, and recovery poses',
      'keep the same character size in every cell',
    ]),
  },
  {
    key: 'unit-death',
    out: 'unit-death-atlas.png',
    prompt: unitPrompt('death fall loop', 12, [
      'twelve unique death animation poses per row from standing to fallen',
      'body lowers gradually across cells, final cells are collapsed but readable',
      'no blood, no gore, no duplicate cells',
    ]),
  },
  {
    key: 'unit-walk-down',
    out: 'unit-walk-down-atlas.png',
    prompt: unitPrompt('walk cycle facing camera/down', 18, [
      'eighteen unique forward/down walking poses per row',
      'full foot cycle with left and right steps and real in-between leg positions',
      'feet remain near the same baseline, no scale changes between cells',
    ]),
  },
  {
    key: 'unit-walk-right',
    out: 'unit-walk-right-atlas.png',
    prompt: unitPrompt('walk cycle facing right', 18, [
      'eighteen unique side-view/right walking poses per row',
      'full foot cycle with left and right steps and real in-between leg positions',
      'feet remain near the same baseline, no scale changes between cells',
    ]),
  },
  {
    key: 'unit-walk-up',
    out: 'unit-walk-up-atlas.png',
    prompt: unitPrompt('walk cycle facing away/up', 18, [
      'eighteen unique away/up walking poses per row',
      'full foot cycle with shoulders, back, and legs changing across cells',
      'feet remain near the same baseline, no scale changes between cells',
    ]),
  },
  {
    key: 'unit-cavalry-idle',
    out: 'unit-cavalry-idle-atlas.png',
    prompt: cavalryPrompt('idle breathing loop', 12, [
      'twelve unique subtle idle poses per row, horse head, rider torso, reins, cloth, and weapon shift gently',
      'hooves stay anchored and each row keeps the same scale and baseline',
    ]),
  },
  {
    key: 'unit-cavalry-attack',
    out: 'unit-cavalry-attack-atlas.png',
    prompt: cavalryPrompt('attack loop', 12, [
      'twelve unique anticipation, strike, release, and recovery poses per row',
      'cavaliers thrust with a lance, horse archers draw and release a bow, horse knights make a heavy lance charge strike',
    ]),
  },
  {
    key: 'unit-cavalry-work',
    out: 'unit-cavalry-work-atlas.png',
    prompt: cavalryPrompt('fallback work loop', 12, [
      'twelve unique reins, saddle adjustment, scouting, and readying poses per row',
      'keep the mounted identity; do not show mining or chopping tools',
    ]),
  },
  {
    key: 'unit-cavalry-hit',
    out: 'unit-cavalry-hit-atlas.png',
    prompt: cavalryPrompt('hit reaction loop', 8, [
      'eight unique hit reaction poses per row, horse and rider recoil then recover',
      'no falling in this loop',
    ]),
  },
  {
    key: 'unit-cavalry-death',
    out: 'unit-cavalry-death-atlas.png',
    prompt: cavalryPrompt('death fall loop', 12, [
      'twelve unique death animation poses per row from mounted to collapsed',
      'final cells are fallen but readable, no blood and no gore',
    ]),
  },
  {
    key: 'unit-cavalry-walk-down',
    out: 'unit-cavalry-walk-down-atlas.png',
    prompt: cavalryPrompt('walk cycle facing camera/down', 18, [
      'eighteen unique down-facing horse walk poses per row with real hoof in-betweens',
      'rider stays stable in saddle and the horse remains fully inside each cell',
    ]),
  },
  {
    key: 'unit-cavalry-walk-right',
    out: 'unit-cavalry-walk-right-atlas.png',
    prompt: cavalryPrompt('walk cycle facing right', 18, [
      'eighteen unique side-view horse walk poses per row with a full hoof cycle',
      'keep the long horse silhouette readable and inside the cell',
    ]),
  },
  {
    key: 'unit-cavalry-walk-up',
    out: 'unit-cavalry-walk-up-atlas.png',
    prompt: cavalryPrompt('walk cycle facing away/up', 18, [
      'eighteen unique up-facing horse walk poses per row with shoulders, rump, rider back, and hooves changing',
      'feet remain near the same baseline, no scale changes between cells',
    ]),
  },
  {
    key: 'terrain-animation',
    out: 'terrain-animation-atlas.png',
    prompt: [
      'Create a clean sprite atlas for a top-down painted fantasy RTS terrain animation.',
      'Format: exactly 4 rows and 8 columns with thin visible magenta grid lines between cells and around the outer border.',
      'Rows in order: short grass, lush tall grass, packed dirt, shallow blue water.',
      'Each cell is a seamless square tile variant for animation, not a camera crop.',
      'Grass rows: blades bend in slow soft wind positions across 8 cells; keep changes subtle and not noisy.',
      'Dirt row: tiny dust, pebbles, cracks, and light shifts across 8 cells.',
      'Water row: broad slow wavelets and soft highlights through 8 real intermediate positions; avoid flickery high-frequency sparkle.',
      'Top-down orthographic, painterly RTS game asset, consistent scale and lighting.',
      'No text, no labels, no UI, no border, no perspective scene, no objects.',
    ].join(' '),
  },
  {
    key: 'building-construction',
    out: 'building-construction-atlas.png',
    prompt: buildingPrompt('construction progression', 12, [
      'twelve unique construction frames per row, from foundation to scaffold to shell to finished building',
      'real intermediate construction details appear gradually, no crossfade look',
      'consistent footprint and scale in every cell',
      'leave generous transparent padding below each building so the lower foundation and shadow are never cut off',
    ]),
  },
  {
    key: 'building-ready',
    out: 'building-ready-atlas.png',
    prompt: buildingPrompt('finished base building idle loop', 8, [
      'eight ready idle frames per row with small flags, banners, lights, smoke, and highlights moving very slowly',
      'base level buildings only, no golden upgrade details',
      'all cells keep the same building footprint and scale',
      'leave generous transparent padding below each building so the lower foundation and shadow are never cut off',
    ]),
  },
  {
    key: 'building-damaged',
    out: 'building-damaged-atlas.png',
    prompt: buildingPrompt('damaged base building idle loop', 8, [
      'eight damaged idle frames per row with cracks, soot, smoke wisps, and broken pieces shifting slowly',
      'base level buildings only, no golden upgrade details',
      'all cells keep the same building footprint and scale',
      'leave generous transparent padding below each building so the lower foundation and shadow are never cut off',
    ]),
  },
  {
    key: 'building-level2-ready',
    out: 'building-level2-ready-atlas.png',
    prompt: buildingPrompt('upgraded level 2 finished building idle loop', 8, [
      'eight ready idle frames per row',
      'level 2 buildings must be genuinely redesigned, not a border overlay: stronger roofs, taller details, better masonry, richer banners, upgraded doors, extra farm crops, academy-like barracks, larger town hall, improved tower top',
      'small flags, banners, lights, smoke, and highlights move very slowly',
      'all cells keep the same building footprint and scale as the base reference',
      'leave generous transparent padding below each building so the lower foundation and shadow are never cut off',
    ]),
  },
  {
    key: 'building-level2-damaged',
    out: 'building-level2-damaged-atlas.png',
    prompt: buildingPrompt('upgraded level 2 damaged building idle loop', 8, [
      'eight damaged idle frames per row',
      'level 2 buildings must be genuinely redesigned, not a border overlay: keep upgraded roofs, masonry, doors, banners, crops, academy barracks, larger town hall, improved tower top',
      'add cracks, soot, smoke wisps, and broken upgraded pieces shifting slowly',
      'all cells keep the same building footprint and scale as the base reference',
      'leave generous transparent padding below each building so the lower foundation and shadow are never cut off',
    ]),
  },
  {
    key: 'building-ruins',
    out: 'building-ruins-atlas.png',
    prompt: buildingPrompt('destroyed ruins static sheet', 1, [
      'one destroyed ruins sprite per row',
      'ruins must be clearly destroyed but still recognizable as the original building type',
      'collapsed roofs, broken masonry, burned beams, wrecked farm plots, shattered tower tops, and faction-colored banner scraps are allowed',
      'no active flames or large smoke clouds that obscure the silhouette',
      'consistent footprint and scale with the corresponding finished building',
      'leave generous transparent padding below each building so rubble and the lower footprint are never cut off',
    ]),
  },
  {
    key: 'building-jousting-construction',
    out: 'building-jousting-construction-atlas.png',
    prompt: joustingPrompt('construction progression', 12, [
      'twelve unique construction frames per row, from foundation to fences, stable frame, roof, training yard, and finished building',
      'real intermediate construction details appear gradually, no crossfade look',
    ]),
  },
  {
    key: 'building-jousting-ready',
    out: 'building-jousting-ready-atlas.png',
    prompt: joustingPrompt('finished base building idle loop', 8, [
      'eight ready idle frames per row with small banners, torch glints, reins, and stable cloth moving very slowly',
      'base level building only, no golden upgrade details',
    ]),
  },
  {
    key: 'building-jousting-damaged',
    out: 'building-jousting-damaged-atlas.png',
    prompt: joustingPrompt('damaged base building idle loop', 8, [
      'eight damaged idle frames per row with cracked fences, broken tack racks, soot, and smoke wisps shifting slowly',
      'base level building only, no golden upgrade details',
    ]),
  },
  {
    key: 'building-jousting-level2-ready',
    out: 'building-jousting-level2-ready-atlas.png',
    prompt: joustingPrompt('upgraded level 2 finished building idle loop', 8, [
      'eight ready idle frames per row',
      'level 2 must be genuinely redesigned: stronger stables, richer banners, stone fence posts, better training ring, armored tack details',
    ]),
  },
  {
    key: 'building-jousting-level2-damaged',
    out: 'building-jousting-level2-damaged-atlas.png',
    prompt: joustingPrompt('upgraded level 2 damaged building idle loop', 8, [
      'eight damaged idle frames per row with broken upgraded fences, cracked masonry, torn banners, soot, and smoke wisps',
    ]),
  },
  {
    key: 'building-jousting-ruins',
    out: 'building-jousting-ruins-atlas.png',
    prompt: joustingPrompt('destroyed ruins static sheet', 1, [
      'one destroyed ruins sprite per row, recognizable as a jousting yard and stable',
      'collapsed fence rails, broken stable roof, charred tack, and faction-colored banner scraps are allowed',
    ]),
  },
];

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(refDir, { recursive: true });
  await fs.mkdir(promptDir, { recursive: true });
  await createReferenceSheets();
  if (process.argv.includes('--refs-only')) return;

  const only = getArg('--only');
  const selected = only ? jobs.filter((job) => job.key === only || job.out === only) : jobs;
  if (only && selected.length === 0) throw new Error(`unknown atlas job: ${only}`);

  const manifest = [];
  for (const job of selected) {
    const outPath = path.join(outDir, job.out);
    const promptPath = path.join(promptDir, `${job.key}.txt`);
    const prompt = withReferenceNotes(job.prompt, outPath);
    await fs.writeFile(promptPath, prompt, 'utf8');
    manifest.push({
      key: job.key,
      output: path.relative(root, outPath),
      prompt: path.relative(root, promptPath),
    });
    console.log(`prompt ${path.relative(root, promptPath)} -> ${path.relative(root, outPath)}`);
  }
  await fs.writeFile(path.join(outDir, 'jobs.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function withReferenceNotes(prompt, outPath) {
  return [
    'Use Codex built-in image_gen, not OmniRoute and not a procedural SVG generator.',
    prompt,
    'Use the reference sheets already prepared in this project as visual guidance for style, scale, silhouettes, palette, camera angle, and factions.',
    `Reference sheet paths: ${path.join(refDir, 'unit-reference-sheet.png')}, ${path.join(refDir, 'building-reference-sheet.png')}, ${path.join(refDir, 'terrain-reference-sheet.png')}.`,
    'Match those references closely, while improving variety and avoiding cropped bottoms.',
    `After generation, save the selected image to: ${outPath}.`,
  ].join(' ');
}

function unitPrompt(action, columns, requirements) {
  return [
    `Create a clean sprite atlas for a top-down fantasy RTS unit ${action}.`,
    `Format: exactly 8 rows and ${columns} columns with thin visible magenta grid lines between cells and around the outer border.`,
    'Rows in order:',
    ...unitRows.map((row, index) => `${index + 1}. ${row}.`),
    ...requirements,
    'Each cell contains exactly one isolated full-body unit sprite on a perfectly flat solid #00ff00 chroma-key background.',
    'The #00ff00 background inside each cell must be uniform with no shadows, gradients, floor plane, texture, or labels. Grid lines may exist only on cell boundaries and must not cross any sprite.',
    'Keep the character fully inside each cell with padding, same camera angle, same art style, same scale, and same foot baseline across the whole row.',
    'Painted pixel-art inspired RTS asset, crisp readable silhouette, 3/4 top-down orthographic camera.',
    'Do not use #00ff00 inside the characters. No text, no watermarks, no UI.',
  ].join(' ');
}

function cavalryPrompt(action, columns, requirements) {
  return [
    `Create a clean sprite atlas for a top-down fantasy RTS mounted cavalry unit ${action}.`,
    `Format: exactly 6 rows and ${columns} columns with thin visible magenta grid lines between cells and around the outer border.`,
    'Rows in order:',
    ...cavalryRows.map((row, index) => `${index + 1}. ${row}.`),
    ...requirements,
    'Each cell contains exactly one isolated full-body mounted unit sprite on a perfectly flat solid #00ff00 chroma-key background.',
    'The #00ff00 background inside each cell must be uniform with no shadows, gradients, floor plane, texture, or labels. Grid lines may exist only on cell boundaries and must not cross any sprite.',
    'Keep the horse and rider fully inside each cell with padding, same camera angle, same art style, same scale, and same hoof baseline across the whole row.',
    'Painted pixel-art inspired RTS asset, crisp readable silhouette, 3/4 top-down orthographic camera.',
    'Do not use #00ff00 inside the characters or horses. No text, no watermarks, no UI.',
  ].join(' ');
}

function buildingPrompt(action, columns, requirements) {
  return [
    `Create a clean sprite atlas for top-down fantasy RTS building ${action}.`,
    `Format: exactly 8 rows and ${columns} columns with thin visible magenta grid lines between cells and around the outer border.`,
    'Rows in order:',
    ...buildingRows.map((row, index) => `${index + 1}. ${row}.`),
    ...requirements,
    'Each cell contains exactly one isolated building sprite on a perfectly flat solid #00ff00 chroma-key background.',
    'The #00ff00 background inside each cell must be uniform with no shadows, gradients, floor plane, texture, or labels. Grid lines may exist only on cell boundaries and must not cross any building.',
    'Keep every building centered, same top-down orthographic camera, same footprint, same scale across its entire row, and full lower base visible.',
    'Painted RTS game asset, crisp readable roof and facade details.',
    'Do not use #00ff00 inside the buildings. No text, no watermarks, no UI.',
  ].join(' ');
}

function joustingPrompt(action, columns, requirements) {
  return [
    `Create a clean sprite atlas for top-down fantasy RTS jousting yard / stable building ${action}.`,
    `Format: exactly 2 rows and ${columns} columns with thin visible magenta grid lines between cells and around the outer border.`,
    'Rows in order:',
    ...joustingRows.map((row, index) => `${index + 1}. ${row}.`),
    ...requirements,
    'Each cell contains exactly one isolated building sprite on a perfectly flat solid #00ff00 chroma-key background.',
    'The #00ff00 background inside each cell must be uniform with no shadows, gradients, floor plane, texture, or labels. Grid lines may exist only on cell boundaries and must not cross any building.',
    'Keep every building centered, same top-down orthographic camera, same footprint, same scale across its entire row, and full lower base visible.',
    'Painted RTS game asset, crisp readable stable roof, fenced training ring, banners, and facade details.',
    'Do not use #00ff00 inside the buildings. No text, no watermarks, no UI.',
  ].join(' ');
}

async function createReferenceSheets() {
  await createSheet({
    out: path.join(refDir, 'unit-reference-sheet.png'),
    files: await collectExisting([
      ...unitRows.flatMap((_, index) => {
        const unit = unitByRow(index);
        return [
          `public/assets/generated/unit-${unit.kind}-${unit.team}-d.png`,
          `public/assets/generated/animation/unit-${unit.kind}-${unit.team}-idle-0.png`,
          `public/assets/generated/animation/unit-${unit.kind}-${unit.team}-attack-0.png`,
          `public/assets/generated/animation/unit-${unit.kind}-${unit.team}-walk-down-0.png`,
        ];
      }),
    ]),
    cell: 96,
    columns: 8,
  });

  await createSheet({
    out: path.join(refDir, 'building-reference-sheet.png'),
    files: await collectExisting([
      ...buildingRows.flatMap((_, index) => {
        const building = buildingByRow(index);
        return [
          `public/assets/generated/bld-${building.kind}-${building.team}-d.png`,
          `public/assets/generated/animation/bld-${building.kind}-${building.team}-ready-0.png`,
          `public/assets/generated/animation/bld-${building.kind}-${building.team}-damaged-0.png`,
          `public/assets/generated/bld-${building.kind}-${building.team}-level2-d.png`,
        ];
      }),
    ]),
    cell: 112,
    columns: 8,
  });

  await createSheet({
    out: path.join(refDir, 'terrain-reference-sheet.png'),
    files: await collectExisting([
      'public/assets/generated/tile-grass.png',
      'public/assets/generated/tile-grass-rich.png',
      'public/assets/generated/tile-dirt.png',
      'public/assets/generated/tile-water.png',
      ...['grass', 'grass-rich', 'dirt', 'water'].flatMap((tile) => [0, 2, 4, 6].map((i) => `public/assets/generated/animation/tile-${tile}-${i}.png`)),
    ]),
    cell: 96,
    columns: 8,
  });
}

async function collectExisting(files) {
  const result = [];
  for (const file of files) {
    const abs = path.join(root, file);
    if (await exists(abs)) result.push(abs);
  }
  return result;
}

async function createSheet({ out, files, cell, columns }) {
  if (files.length === 0) return;
  const rows = Math.ceil(files.length / columns);
  const composites = [];
  for (let i = 0; i < files.length; i++) {
    const img = await sharp(files[i])
      .ensureAlpha()
      .resize(cell - 12, cell - 12, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const meta = await sharp(img).metadata();
    const x = (i % columns) * cell + Math.round((cell - (meta.width ?? cell)) / 2);
    const y = Math.floor(i / columns) * cell + Math.round((cell - (meta.height ?? cell)) / 2);
    composites.push({ input: img, left: x, top: y });
  }
  await sharp({
    create: {
      width: columns * cell,
      height: rows * cell,
      channels: 4,
      background: { r: 24, g: 32, b: 38, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(out);
  console.log(`reference ${path.relative(root, out)}`);
}

function unitByRow(index) {
  const rows = [
    { kind: 'peasant', team: 'player' },
    { kind: 'footman', team: 'player' },
    { kind: 'archer', team: 'player' },
    { kind: 'knight', team: 'player' },
    { kind: 'peasant', team: 'enemy' },
    { kind: 'footman', team: 'enemy' },
    { kind: 'archer', team: 'enemy' },
    { kind: 'knight', team: 'enemy' },
  ];
  return rows[index];
}

function buildingByRow(index) {
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
  return rows[index];
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
