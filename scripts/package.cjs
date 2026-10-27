const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { checkProject } = require('./check.cjs');
const root = path.resolve(__dirname, '..');
let stage;
try {
  const { files, archive } = checkProject(root);
  stage = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-cleaner-package-'));
  const timestamp = new Date('2000-01-01T00:00:00Z');
  for (const file of files) {
    const target = path.join(stage, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, 'extension', file), target);
    fs.chmodSync(target, 0o644);
    fs.utimesSync(target, timestamp, timestamp);
  }
  const stagedArchive = path.join(stage, 'release.zip');
  const result = spawnSync('zip', ['-X', '-q', stagedArchive, ...files], {
    cwd: stage, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' }
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'zip failed');
  const out = path.join(root, 'dist');
  fs.mkdirSync(out, { recursive: true });
  const target = path.join(out, archive);
  fs.copyFileSync(stagedArchive, target);
  const digest = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  fs.writeFileSync(path.join(out, 'SHA256SUMS'), `${digest}  ${archive}\n`);
  console.log(target);
  console.log(`${digest}  ${archive}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (stage) fs.rmSync(stage, { recursive: true, force: true });
}
