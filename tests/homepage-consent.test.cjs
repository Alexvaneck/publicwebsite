const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'assets/cookie-consent.js'), 'utf8');
const lifetime = 180 * 24 * 60 * 60 * 1000;

function setup({choice, expires = Date.now() + lifetime - 1000, raw, blocked = false} = {}) {
  let stored = raw ?? (choice ? JSON.stringify({choice, expires}) : null);
  const nodes = {};
  function node(id) {
    return nodes[id] ||= {
      hidden: true, textContent: '', events: {}, attributes: {}, focused: false,
      addEventListener(type, handler) { this.events[type] = handler; },
      setAttribute(key, value) { this.attributes[key] = value; },
      focus(options) { this.focused = true; this.focusOptions = options; }, contains() { return false; },
      getClientRects() { return [1]; }
    };
  }
  const scripts = [], cookies = [], errors = [], events = {}, scrolls = [];
  const settings = [node('desk-settings'), node('tt-settings')];
  const context = {
    location: {hostname: 'alexvaneck.nl'},
    scrollTo(options) { scrolls.push(options); },
    console: {error(...args) { errors.push(args); }},
    document: {
      getElementById: node, querySelectorAll() { return settings; },
      createElement() { return node('script'); },
      head: {appendChild(script) { scripts.push(script); }},
      get cookie() { return '_ga=old; _ga_59P9G417BB=old; _ga_J5Q1E3G4DJ=new; alexvaneck_ga=new; alexvaneck_ga_59P9G417BB=old; alexvaneck_ga_J5Q1E3G4DJ=new; idmb_ga=other; _ga_PK9D34W1EP=other; _ga_J5LE5VHNVH=other'; },
      set cookie(value) { cookies.push(value); }
    },
    localStorage: {
      getItem() { if (blocked) throw new Error('blocked'); return stored; },
      setItem(key, value) { if (blocked) throw new Error('blocked'); stored = value; },
      removeItem() { stored = null; }
    },
    addEventListener(type, handler) { events[type] = handler; }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return {context, nodes, scripts, cookies, errors, events, settings, scrolls,
    stored: () => stored, click(id) { node(id).events.click(); }};
}

test('homepage uses opt-in script and offers settings in desk and teletext', () => {
  assert.doesNotMatch(html, /<script[^>]+src="https:\/\/www\.googletagmanager/);
  assert.match(html, /src="assets\/cookie-consent\.js[^"]*" defer/);
  assert.equal([...html.matchAll(/class="cookie-settings"/g)].length, 2);
  for (const choice of [undefined, 'rejected']) {
    const app = setup({choice});
    assert.equal(app.scripts.length, 0);
    assert.equal(app.context['ga-disable-G-J5Q1E3G4DJ'], true);
    assert.equal(app.nodes['cookie-note'].hidden, choice === 'rejected');
  }
});

test('acceptance loads once with correct ID, expiry and homepage cookie prefix', () => {
  const app = setup();
  app.click('cookie-accept');
  assert.equal(app.scripts.length, 1);
  assert.equal(app.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-J5Q1E3G4DJ');
  assert.equal(app.context['ga-disable-G-J5Q1E3G4DJ'], false);
  assert.equal(app.context.dataLayer[1][1], 'G-J5Q1E3G4DJ');
  assert.ok(app.context.dataLayer.every(command => command[1] !== 'G-59P9G417BB'));
  assert.equal(app.context.dataLayer[1][2].cookie_prefix, 'alexvaneck');
  assert.equal(app.context.dataLayer[1][2].cookie_path, '/');
  assert.equal(app.context.dataLayer[1][2].cookie_expires, lifetime / 1000);
  const saved = JSON.parse(app.stored());
  assert.equal(saved.choice, 'accepted');
  assert.ok(Math.abs(saved.expires - Date.now() - lifetime) < 1000);
  app.click('cookie-accept');
  assert.equal(app.scripts.length, 1);
  assert.equal(app.context.dataLayer.length, 2);
  assert.equal(setup({choice: 'accepted'}).scripts.length, 1);
});

test('both settings buttons reopen notice; withdrawal preserves IDMB cookies', () => {
  const app = setup({choice: 'accepted'});
  for (const id of ['desk-settings', 'tt-settings']) {
    app.click(id);
    assert.equal(app.nodes['cookie-note'].hidden, false);
    assert.equal(app.nodes['cookie-note-title'].focused, true);
    assert.equal(app.nodes['cookie-note-title'].focusOptions.preventScroll, true);
    assert.equal(app.scrolls.at(-1).top, 0);
    app.nodes['cookie-note'].contains = () => true;
    app.click('cookie-reject');
    assert.equal(app.nodes[id].focused, true);
    assert.equal(app.nodes[id].focusOptions.preventScroll, true);
    assert.equal(app.context['ga-disable-G-J5Q1E3G4DJ'], true);
  }
  assert.ok(app.cookies.some(value => value.startsWith('_ga=')));
  assert.ok(app.cookies.some(value => value.startsWith('alexvaneck_ga=')));
  for (const name of ['_ga_59P9G417BB', '_ga_J5Q1E3G4DJ', 'alexvaneck_ga_59P9G417BB', 'alexvaneck_ga_J5Q1E3G4DJ']) {
    assert.ok(app.cookies.some(value => value.startsWith(`${name}=`)));
  }
  assert.ok(app.cookies.every(value => !/^idmb_ga|^_ga_PK9D34W1EP|^_ga_J5LE5VHNVH/.test(value)));
  assert.equal(JSON.parse(app.stored()).choice, 'rejected');
});

test('expired or invalid saved choices never load Google', () => {
  for (const options of [
    {choice: 'accepted', expires: Date.now() - 1},
    {choice: 'accepted', expires: Date.now() + lifetime * 2},
    {choice: 'unknown'}, {raw: '{broken'}, {raw: 'null'}
  ]) {
    const app = setup(options);
    assert.equal(app.scripts.length, 0);
    assert.equal(app.nodes['cookie-note'].hidden, false);
  }
});

test('storage failures and Google load errors are reported', () => {
  const app = setup({blocked: true});
  assert.equal(app.scripts.length, 0);
  assert.ok(app.errors.length);
  app.click('cookie-reject');
  assert.match(app.nodes['cookie-status'].textContent, /niet worden opgeslagen/);
  assert.equal(app.nodes['cookie-note'].hidden, false);
  const accepted = setup({choice: 'accepted'});
  accepted.scripts[0].events.error();
  assert.match(accepted.nodes['cookie-status'].textContent, /niet beschikbaar/);
  assert.equal(accepted.nodes['cookie-note'].hidden, false);
});

test('clearing consent in another tab disables tracking', () => {
  const app = setup({choice: 'accepted'});
  app.context.localStorage.removeItem();
  app.events.storage({key: null});
  assert.equal(app.context['ga-disable-G-J5Q1E3G4DJ'], true);
  assert.equal(app.nodes['cookie-note'].hidden, false);
});

test('IJsselstein is in metadata and accessible copy, with valid Person structured data', () => {
  assert.match(html, /<title>[^<]*IJsselstein<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]*IJsselstein/);
  assert.match(html, /<h1>[^<]*IJsselstein<\/h1>/);
  assert.match(html, /'over-mij':\{title:'Over mij',intro:'[^']*IJsselstein/);
  assert.doesNotMatch(html, /document\.title='alexvaneck'/);
  assert.match(html, /rel="canonical" href="https:\/\/alexvaneck.nl\/"/);
  const person = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(person['@type'], 'Person');
  assert.equal(person.name, 'Alex van Eck');
  assert.match(person.description, /IJsselstein/);
});

test('cookie notice uses tilted paper and local handwriting fonts', () => {
  const css = fs.readFileSync(path.join(root, 'assets/cookie-note.css'), 'utf8');
  assert.match(css, /transform:rotate\(-3deg\)/);
  assert.match(css, /transform:rotate\(-2deg\)/);
  assert.match(css, /"Bradley Hand","Segoe Print","Comic Sans MS",cursive/);
  assert.doesNotMatch(css, /@import|https?:\/\//);
  assert.match(css, /\.cookie-note\{[^}]*top:34px/);
  assert.match(css, /@media\(max-width:760px\)\{\.cookie-note\{[^}]*top:26px/);
  assert.doesNotMatch(css, /\.cookie-note\{[^}]*bottom:/);
});

test('desk footer copy is visually hidden and settings and attribution remain accessible', () => {
  const css = fs.readFileSync(path.join(root, 'assets/cookie-note.css'), 'utf8');
  assert.match(html, /<div class="visually-hidden">\s*<span id="weatherStatus" role="status">/);
  assert.match(html, /<div class="visually-hidden">\s*<h1>/);
  assert.doesNotMatch(html, /class="weather-caption"|class="desk-intro"/);
  assert.match(html, /<button class="cookie-settings"[^>]*>Cookie-instellingen<\/button>\s*<\/div>\s*<\/section>/);
  assert.match(html, /<aside class="cookie-note"[\s\S]*href="https:\/\/open-meteo\.com\/"[\s\S]*<\/aside>/);
  assert.match(css, /\.visually-hidden\{[^}]*clip-path:inset\(50%\)/);
  assert.match(css, /\.stage > \.cookie-settings\{[^}]*position:absolute;right:12px;bottom:12px/);
});
