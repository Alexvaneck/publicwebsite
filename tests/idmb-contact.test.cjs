const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {spawn, spawnSync} = require('node:child_process');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const homepage = fs.readFileSync(path.join(root, 'idmb/index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'idmb/assets/contact.js'), 'utf8');

test('all pages link to the dedicated contact page with one header link per viewport', () => {
  const {projects, renderProject, renderContact} = require('../scripts/build-idmb-projects.cjs');
  const contact = fs.readFileSync(path.join(root, 'idmb/contact/index.html'), 'utf8');
  assert.equal(contact, renderContact(homepage), 'Run npm run build:idmb to refresh the contact page');
  assert.doesNotMatch(contact, /Liever zelf mailen\?/);
  assert.doesNotMatch(contact.match(/<main[\s\S]*?<\/main>/)[0], /mailto:info@speebeheer\.nl/);
  const otherPages = [homepage, ...projects.map(project => renderProject(homepage, project))];
  for (const html of [...otherPages, contact]) {
    const header = html.match(/<header>[\s\S]*?<\/header>/)[0];
    const footer = html.match(/<footer>[\s\S]*?<\/footer>/)[0];
    assert.doesNotMatch(footer, /info@speebeheer\.nl|mailto:/);
    assert.match(footer, /href="\/idmb\/contact\/"/);
    const menu = header.match(/<nav class="menu">[\s\S]*?<\/nav>/)[0];
    assert.equal([...menu.matchAll(/href="\/idmb\/contact\/"/g)].length, 1);
    assert.match(header, /class="mobile btn" href="\/idmb\/contact\/"/);
    assert.doesNotMatch(html, /IDM[BD] RE B\.V\./);
    assert.match(html, /<title>[^<]*Vastgoedgroep/);
    assert.match(html, /© 2026 Vastgoedgroep/);
  }
  for (const html of otherPages) {
    assert.doesNotMatch(html, /<form|src="\/idmb\/assets\/contact.js"|href="#contact"/);
  }
  assert.equal([...contact.matchAll(/<form class="contact-form"/g)].length, 1);
  assert.match(contact, /action="\/idmb\/contact.php" method="post"/);
  assert.match(contact, /src="\/idmb\/assets\/contact.js" defer/);
  assert.match(contact, /rel="canonical" href="https:\/\/alexvaneck.nl\/idmb\/contact\/"/);
  for (const field of ['name', 'email', 'message']) {
    assert.match(contact, new RegExp(`name="${field}"[^>]*required`));
  }
  const consent = /<script id="google-consent">[\s\S]*?<\/script>/;
  assert.equal(contact.match(consent)[0], homepage.match(consent)[0]);
  assert.match(contact, /role="status" aria-live="polite"/);
  assert.match(homepage, /Wij zijn Vastgoedgroep/);
  assert.doesNotMatch(homepage, /waarmee binnen projecten wordt samengewerkt/);
});

function setupClient(fetch) {
  const status = {textContent: ''};
  const button = {disabled: false};
  let submit;
  let resets = 0;
  const errors = [];
  const form = {
    action: 'https://example.test/idmb/contact.php',
    querySelector: selector => selector === '.contact-status' ? status : button,
    addEventListener: (_, handler) => { submit = handler; },
    reportValidity: () => true,
    reset: () => { resets++; }
  };
  vm.runInNewContext(script, {
    document: {querySelector: () => form}, fetch,
    FormData: class {}, AbortSignal, Error,
    console: {error: (...args) => errors.push(args)}
  });
  return {status, button, errors, resets: () => resets,
    submit: () => submit({preventDefault() {}})};
}

test('client clears only accepted messages and prevents duplicate submissions', async () => {
  let complete;
  let requests = 0;
  const app = setupClient(() => {
    requests++;
    return new Promise(resolve => { complete = resolve; });
  });
  const pending = app.submit();
  assert.equal(app.button.disabled, true);
  await app.submit();
  assert.equal(requests, 1);
  complete({ok: true, json: async () => ({success: true, message: 'Bedankt'})});
  await pending;
  assert.equal(app.resets(), 1);
  assert.equal(app.status.textContent, 'Bedankt');
  assert.equal(app.button.disabled, false);
});

test('client preserves input and reports server, network and invalid-response errors', async () => {
  for (const fetch of [
    async () => ({ok: false, json: async () => ({success: false, message: 'Versturen is niet gelukt.'})}),
    async () => { throw new Error('offline'); },
    async () => ({ok: true, json: async () => { throw new SyntaxError('Not JSON'); }}),
    async () => ({ok: true, json: async () => ({success: false})})
  ]) {
    const app = setupClient(fetch);
    await app.submit();
    assert.equal(app.resets(), 0);
    assert.equal(app.button.disabled, false);
    assert.match(app.status.textContent, /Versturen|niet bevestigen/);
    assert.equal(app.errors.length, 1);
  }
});

async function startServer(t, failMail = false) {
  const php = spawnSync('php', ['-v'], {encoding: 'utf8'});
  assert.equal(php.status, 0, 'PHP 8.1+ is required for contact endpoint tests');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'idmb-contact-'));
  t.after(() => fs.rmSync(temporary, {recursive: true, force: true}));
  const mailbox = path.join(temporary, 'mail.txt');
  const transport = path.join(temporary, 'sendmail');
  fs.writeFileSync(transport, `#!/bin/sh\ncat > "${mailbox}"\nexit ${failMail ? 1 : 0}\n`, {mode: 0o700});
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn('php', ['-d', `sendmail_path=${transport}`,
    '-d', `session.save_path=${temporary}`, '-S', `127.0.0.1:${port}`, '-t', root],
  {stdio: ['ignore', 'pipe', 'pipe']});
  let logs = '';
  server.stderr.on('data', chunk => { logs += chunk; });
  t.after(async () => {
    if (server.exitCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve));
      server.kill();
      await exited;
    }
  });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${origin}/idmb/contact.php`);
      if (response.status === 405) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, `PHP server failed to start: ${logs}`);
  return {
    mailbox, logs: () => logs,
    request: (data, options = {}) => fetch(`${origin}/idmb/contact.php`, {
      method: 'POST',
      body: new URLSearchParams(data),
      ...options,
      headers: {Accept: 'application/json', Origin: origin, ...options.headers}
    })
  };
}

const valid = {name: 'Jan de Vries', email: 'jan@example.com', message: 'Wij bespreken graag een locatie.', website: ''};

test('PHP validates requests, sends safely, throttles and supports non-JS forms', async t => {
  const server = await startServer(t);
  for (const data of [
    {...valid, name: ''}, {...valid, email: 'invalid'},
    {...valid, email: 'jan@example.com\r\nBcc: other@example.com'},
    {...valid, name: 'Jan\nBcc: other@example.com'},
    {...valid, message: ''}, {...valid, website: 'https://spam.example'},
    {...valid, message: 'a'.repeat(5001)}, {...valid, name: 'a'.repeat(101)},
    {...valid, 'email[]': 'jan@example.com', email: undefined}
  ]) {
    const response = await server.request(data);
    assert.equal(response.status, 422, JSON.stringify(data).slice(0, 200));
    assert.equal((await response.json()).success, false);
  }
  assert.equal(fs.existsSync(server.mailbox), false);
  const forbidden = await server.request(valid, {headers: {Origin: 'https://other.example'}});
  assert.equal(forbidden.status, 403);
  const accepted = await server.request({...valid, name: 'é'.repeat(100), message: 'é'.repeat(5000)});
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).success, true);
  const mail = fs.readFileSync(server.mailbox, 'utf8');
  assert.match(mail, /To: info@speebeheer.nl/);
  assert.match(mail, /From: Vastgoedgroep website <noreply@alexvaneck.nl>/);
  assert.match(mail, /Subject: Nieuw bericht via de Vastgoedgroep-website/);
  assert.match(mail, /Reply-To: jan@example.com/);
  assert.match(mail, /é{5000}/);
  const cookie = accepted.headers.get('set-cookie').split(';')[0];
  const limited = await server.request(valid, {headers: {Cookie: cookie}});
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  const fallback = await server.request(valid, {headers: {Accept: 'text/html'}});
  assert.equal(fallback.status, 200);
  assert.match(fallback.headers.get('content-type'), /text\/html/);
  const fallbackHtml = await fallback.text();
  assert.match(fallbackHtml, /href="\/idmb\/contact\/"/);
  assert.match(fallbackHtml, /Contact — Vastgoedgroep/);
});

test('PHP mail transport failure returns an explicit error, never a confirmation', async t => {
  const server = await startServer(t, true);
  const response = await server.request(valid);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).success, false);
  assert.match(server.logs(), /mail transport rejected/);
});
