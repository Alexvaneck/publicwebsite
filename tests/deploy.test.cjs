const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {excluded, siteFile, collectSiteFiles} = require('../scripts/deploy.cjs');

test('only publishes website files, not credentials or tooling', () => {
  for (const file of ['index.html', 'assets/desk-weather.js', 'idmb/index.html']) {
    assert.equal(siteFile(file), true);
  }
  for (const file of ['~:.netrc', '.env', 'assets/.env', 'assets/server.key',
    'assets/login.netrc', 'README.txt', 'scripts/deploy.cjs',
    'index.before-latest.html', 'idmb/.DS_Store', '.git/config']) {
    assert.equal(siteFile(file), false);
  }
  assert.equal(excluded('idmb/assets/.DS_Store'), true);
});

test('collects assets and subpages before the homepage, excluding hidden files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alexvaneck-deploy-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.mkdirSync(path.join(root, 'idmb'));
  for (const file of ['assets/test.js', 'assets/.DS_Store', 'idmb/index.html', 'index.html']) {
    fs.writeFileSync(path.join(root, file), 'test');
  }
  assert.deepEqual(collectSiteFiles(root), ['assets/test.js', 'idmb/index.html', 'index.html']);
  fs.symlinkSync(path.join(root, 'index.html'), path.join(root, 'assets/link.html'));
  assert.throws(() => collectSiteFiles(root), /Symlink/);
});
