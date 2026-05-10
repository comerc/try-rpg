const { spawnSync } = require('node:child_process');

const result = spawnSync(process.execPath, ['scripts/generate-building-animations.cjs', '--only-level2'], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
