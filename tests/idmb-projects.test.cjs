const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {projects, renderProject} = require('../scripts/build-idmb-projects.cjs');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'idmb/index.html'), 'utf8');

test('navigation follows the homepage section order on every page', () => {
  const {renderContact} = require('../scripts/build-idmb-projects.cjs');
  const ids = ['over', 'disciplines', 'projecten', 'partners'];
  const positions = ids.map(id => source.indexOf(`id="${id}"`));
  assert.ok(positions.every((position, index) => position >= 0 &&
    (index === 0 || position > positions[index - 1])));
  for (const html of [source, renderContact(source), ...projects.map(project => renderProject(source, project))]) {
    for (const area of [html.match(/<nav class="menu">[\s\S]*?<\/nav>/)[0],
      html.match(/<footer>[\s\S]*?<\/footer>/)[0]]) {
      const links = [...area.matchAll(/href="(?:\/idmb\/)?#(over|disciplines|projecten|partners)"/g)]
        .map(match => match[1]);
      assert.deepEqual(links, ids);
    }
  }
});

test('all six homepage project cards have real internal page links', () => {
  const cards = [...source.matchAll(/<a class="(?:project-main|project-card|item)" href="([^"]+)"/g)];
  assert.equal(cards.length, 6);
  for (const [, href] of cards) {
    assert.ok(href.startsWith('projecten/'));
    assert.ok(fs.existsSync(path.join(root, 'idmb', href, 'index.html')));
  }
  for (const project of projects) {
    assert.ok(cards.some(([, href]) => href === `projecten/${project.slug}/`));
  }
});

for (const project of projects) {
  test(`${project.slug}: shared template, unique URL, valid assets and navigation`, () => {
    const filename = path.join(root, 'idmb/projecten', project.slug, 'index.html');
    const html = fs.readFileSync(filename, 'utf8');
    assert.equal(html, renderProject(source, project), 'Run npm run build:idmb to refresh generated pages');
    assert.ok(html.includes(`<h1>${project.title}</h1>`));
    assert.ok(html.includes(`https://alexvaneck.nl/idmb/projecten/${project.slug}/`));
    for (const id of ['projectinformatie', 'contact', 'andere-projecten', 'cookie-notice']) {
      assert.ok(html.includes(`id="${id}"`));
    }
    const consent = /<script id="google-consent">[\s\S]*?<\/script>/;
    assert.equal(html.match(consent)[0], source.match(consent)[0]);
    assert.doesNotMatch(html, /heroVideo|<script[^>]+src="https:\/\/www\.googletagmanager/);
    assert.equal([...html.matchAll(/class="item"/g)].length, 3);
    for (const other of projects.filter(other => other.slug !== project.slug)) {
      assert.ok(html.includes(`href="../${other.slug}/"`));
    }
    for (const [, src] of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      assert.ok(fs.existsSync(path.join(root, src.replace(/^\//, ''))), src);
    }
    for (const [, href] of html.matchAll(/href="(#[^"]+)"/g)) {
      assert.ok(html.includes(`id="${href.slice(1)}"`), href);
    }
    assert.ok(html.includes('href="/idmb/#projecten"'));
    if (project.external) assert.ok(html.includes(project.external));
  });
}
