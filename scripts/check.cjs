const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function checkProject(root, tag = process.env.RELEASE_TAG) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  assert.equal(pkg.name, 'chatgpt-chat-cleaner', 'package name must match the repository');
  assert.equal(manifest.name, 'ChatGPT Chat Cleaner', 'manifest name must match the release');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'version must use major.minor.patch');
  assert.equal(manifest.version, pkg.version, 'manifest and package version must match');
  assert.equal(manifest.manifest_version, 3, 'Manifest V3 is required');
  if (tag) {
    assert.equal(tag, `v${pkg.version}`, 'release tag must match the package version');
    const notes = path.join(root, 'docs/releases', `${tag}.md`);
    assert.ok(fs.existsSync(notes) && fs.readFileSync(notes, 'utf8').trim(), 'versioned release notes are required');
  }

  const files = [...new Set([
    'manifest.json', manifest.background.service_worker,
    ...manifest.content_scripts.flatMap(script => [...(script.js || []), ...(script.css || [])]),
    ...Object.values(manifest.icons || {}), ...Object.values(manifest.action.default_icon || {})
  ])].sort();
  for (const file of files) {
    assert.ok(typeof file === 'string' && /^[A-Za-z0-9_./-]+$/.test(file) && !file.startsWith('/') && !file.split('/').includes('..'), 'manifest resources must be local relative paths');
    const source = path.join(root, 'extension', file);
    assert.ok(fs.lstatSync(source).isFile(), `missing or non-file manifest resource: ${file}`);
    if (file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', source], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || `syntax check failed: ${file}`);
    }
  }
  return { files, version: pkg.version, archive: `${pkg.name}-${pkg.version}.zip` };
}

if (require.main === module) {
  try {
    const result = checkProject(path.resolve(__dirname, '..'));
    console.log(`Checked ChatGPT Chat Cleaner ${result.version}: ${result.files.length} runtime files`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { checkProject };
