const { spawnSync } = require('node:child_process');

const result = spawnSync(process.execPath, ['scripts/apply-knight-asset-rules-atlas.cjs'], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
