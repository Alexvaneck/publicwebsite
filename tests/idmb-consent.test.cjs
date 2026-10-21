const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../idmb/index.html'), 'utf8');
const source = html.match(/<script id="google-consent">([\s\S]*?)<\/script>/)[1];
const key = 'idmb.analytics-consent.v1';
const lifetime = 180 * 24 * 60 * 60 * 1000;

function setup({choice, expires = Date.now() + lifetime - 1000, raw, failStorage = false} = {}) {
  const elements = {};
  function element(id) {
    return elements[id] ||= {
      hidden: true, textContent: '', listeners: {}, attributes: {},
      addEventListener(event, handler) { this.listeners[event] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() {}, contains() { return false; }
    };
  }
  const scripts = [];
  const removedCookies = [];
  let stored = raw ?? (choice ? JSON.stringify({choice, expires}) : null);
  const document = {
    getElementById: element, querySelector: element,
    createElement() { return element('script'); },
    head: {appendChild(script) { scripts.push(script); }},
    get cookie() { return 'idmb_ga=test; idmb_ga_PK9D34W1EP=old; idmb_ga_J5LE5VHNVH=new; _ga_PK9D34W1EP=legacy; _ga_J5LE5VHNVH=new; _ga=homepage; _ga_OTHER=homepage'; },
    set cookie(value) { removedCookies.push(value); }
  };
  const errors = [];
  const events = {};
  const context = {
    document, location: {hostname: 'alexvaneck.nl'},
    console: {error(...args) { errors.push(args); }},
    localStorage: {
      getItem() { if (failStorage) throw new Error('blocked'); return stored; },
      setItem(k, value) { if (failStorage) throw new Error('blocked'); stored = value; },
      removeItem() { stored = null; }
    },
    addEventListener(event, handler) { events[event] = handler; }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return {
    context, scripts, elements, removedCookies, errors, events,
    stored: () => stored,
    click(id) { element(id).listeners.click(); }
  };
}

test('no static Google script; no choice or refusal never loads Analytics', () => {
  assert.doesNotMatch(html, /<script[^>]+src="https:\/\/www\.googletagmanager/);
  for (const choice of [undefined, 'rejected']) {
    const app = setup({choice});
    assert.equal(app.scripts.length, 0);
    assert.equal(app.context['ga-disable-G-J5LE5VHNVH'], true);
    assert.equal(app.elements['cookie-notice'].hidden, choice === 'rejected');
  }
});

test('acceptance loads once, stores expiry and configures isolated cookies', () => {
  const app = setup();
  app.click('cookie-accept');
  assert.equal(app.scripts.length, 1);
  assert.equal(app.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-J5LE5VHNVH');
  assert.equal(app.context['ga-disable-G-J5LE5VHNVH'], false);
  const config = app.context.dataLayer[1];
  assert.equal(config[0], 'config');
  assert.equal(config[1], 'G-J5LE5VHNVH');
  assert.ok(app.context.dataLayer.every(command => command[1] !== 'G-PK9D34W1EP'));
  assert.equal(config[2].cookie_prefix, 'idmb');
  assert.equal(config[2].cookie_path, '/idmb/');
  assert.equal(config[2].cookie_expires, lifetime / 1000);
  assert.equal(JSON.parse(app.stored()).choice, 'accepted');
  assert.ok(Math.abs(JSON.parse(app.stored()).expires - Date.now() - lifetime) < 1000);
  app.click('.cookie-settings');
  assert.equal(app.elements['cookie-notice'].hidden, false);
  app.click('cookie-accept');
  assert.equal(app.scripts.length, 1);
  assert.equal(app.context.dataLayer.length, 2);
});

test('saved acceptance loads; expired, malformed and unknown choices do not', () => {
  assert.equal(setup({choice: 'accepted'}).scripts.length, 1);
  for (const options of [
    {choice: 'accepted', expires: Date.now() - 1},
    {choice: 'accepted', expires: Date.now() + lifetime * 2},
    {choice: 'unknown'}, {raw: '{}'}, {raw: 'null'}, {raw: '{broken'}
  ]) {
    const app = setup(options);
    assert.equal(app.scripts.length, 0);
    assert.equal(app.elements['cookie-notice'].hidden, false);
  }
});

test('withdrawal disables tracking and removes only IDMB cookies', () => {
  const app = setup({choice: 'accepted'});
  app.click('.cookie-settings');
  app.click('cookie-reject');
  assert.equal(app.context['ga-disable-G-J5LE5VHNVH'], true);
  assert.equal(JSON.parse(app.stored()).choice, 'rejected');
  assert.ok(app.removedCookies.some(value => value.startsWith('idmb_ga=')));
  for (const name of ['idmb_ga_PK9D34W1EP', 'idmb_ga_J5LE5VHNVH', '_ga_PK9D34W1EP', '_ga_J5LE5VHNVH']) {
    assert.ok(app.removedCookies.some(value => value.startsWith(`${name}=`)));
  }
  assert.ok(app.removedCookies.some(value => value.includes('domain=alexvaneck.nl')));
  assert.ok(app.removedCookies.every(value => !/^_ga(?:=|_OTHER=)/.test(value)));
  app.click('cookie-accept');
  assert.equal(app.scripts.length, 1);
  assert.equal(app.context['ga-disable-G-J5LE5VHNVH'], false);
});

test('storage failure is reported and does not imply prior consent', () => {
  const app = setup({failStorage: true});
  assert.equal(app.scripts.length, 0);
  assert.ok(app.errors.length);
  app.click('cookie-reject');
  assert.match(app.elements['cookie-status'].textContent, /niet worden opgeslagen/);
  assert.equal(app.elements['cookie-notice'].hidden, false);
});

test('storage removal in another tab disables Analytics and asks again', () => {
  const app = setup({choice: 'accepted'});
  app.context.localStorage.removeItem(key);
  app.events.storage({key});
  assert.equal(app.context['ga-disable-G-J5LE5VHNVH'], true);
  assert.equal(app.elements['cookie-notice'].hidden, false);
});

test('script failure is explicitly reported', () => {
  const app = setup({choice: 'accepted'});
  app.scripts[0].listeners.error();
  assert.equal(app.errors.length, 1);
  assert.match(app.elements['cookie-status'].textContent, /niet beschikbaar/);
  assert.equal(app.elements['cookie-notice'].hidden, false);
});
