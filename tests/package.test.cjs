const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const files = ['adapter.js', 'api.js', 'background.js', 'bridge.js', 'content.js', 'core.js', 'inline.js', 'manifest.json'];
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-cleaner-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const folder of ['scripts', 'extension']) fs.cpSync(path.join(root, folder), path.join(dir, folder), { recursive: true });
  const pkg = { ...require('../package.json'), name: 'chatgpt-chat-cleaner' };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  const manifest = { ...require('../extension/manifest.json'), name: 'ChatGPT Chat Cleaner' };
  fs.writeFileSync(path.join(dir, 'extension/manifest.json'), JSON.stringify(manifest));
  return dir;
}
function build(dir, tag = '') {
  return spawnSync(process.execPath, ['scripts/package.cjs'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, RELEASE_TAG: tag }
  });
}
const hash = data => createHash('sha256').update(data).digest('hex');

test('release ZIP contains exact manifest resources, matching bytes and a repeatable checksum', t => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, 'extension/diagnostic.js'), 'private diagnostic data');
  fs.writeFileSync(path.join(dir, 'extension/.env'), 'private configuration');
  const first = build(dir);
  assert.equal(first.status, 0, first.stderr);
  const name = `chatgpt-chat-cleaner-${require('../package.json').version}.zip`;
  const target = path.join(dir, 'dist', name);
  assert.ok(fs.existsSync(target), 'archive uses the public project name');
  const archive = fs.readFileSync(target);
  const list = spawnSync('unzip', ['-Z1', target], { encoding: 'utf8' });
  assert.equal(list.status, 0, list.stderr);
  assert.deepEqual(list.stdout.trim().split('\n').sort(), files);
  for (const file of files) {
    const entry = spawnSync('unzip', ['-p', target, file]);
    assert.equal(entry.status, 0);
    assert.deepEqual(entry.stdout, fs.readFileSync(path.join(dir, 'extension', file)), file);
    fs.utimesSync(path.join(dir, 'extension', file), new Date(), new Date());
  }
  assert.equal(fs.readFileSync(path.join(dir, 'dist/SHA256SUMS'), 'utf8'), `${hash(archive)}  ${name}\n`);
  const second = build(dir);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(fs.readFileSync(target), archive, 'source timestamps must not change release bytes');
});

test('packaging refuses mismatched manifest and package versions before producing artifacts', t => {
  const dir = fixture(t);
  const file = path.join(dir, 'extension/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file)); manifest.version = '0.0.1';
  fs.writeFileSync(file, JSON.stringify(manifest));
  const result = build(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /version/i);
  assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
});

test('a release tag must name the version being packaged', t => {
  const dir = fixture(t);
  const result = build(dir, 'v99.0.0');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /tag/i);
  assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
});

test('tagged packaging requires versioned release notes before producing artifacts', t => {
  const dir = fixture(t);
  const tag = `v${require('../package.json').version}`;
  const result = build(dir, tag);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /release notes/i);
  assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
  fs.mkdirSync(path.join(dir, 'docs/releases'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/releases', `${tag}.md`), 'Release notes');
  const ready = build(dir, tag);
  assert.equal(ready.status, 0, ready.stderr);
});
