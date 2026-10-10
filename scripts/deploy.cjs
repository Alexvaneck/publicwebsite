const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = 'https://github.com/Alexvaneck/publicwebsite.git';
const FTP_ROOT = 'ftp://ftp.cieff1h7t.service.one/webroots/sites/alexvaneck.nl/';
const FTP_PATH = '/webroots/sites/alexvaneck.nl/';
const LIVE_URL = 'https://alexvaneck.nl/';
const GIT_PATHS = ['index.html', 'assets', 'idmb', 'scripts', 'tests', 'README.txt',
  'package.json', '.gitignore', '.vscode'];

function excluded(file) {
  return file.split('/').some(part => part.startsWith('.') ||
    /netrc|\.before-|\.pem$|\.key$|\.pyc$|^__pycache__$|^node_modules$/i.test(part));
}

function siteFile(file) {
  return !excluded(file) &&
    (file === 'index.html' || file.startsWith('assets/') || file.startsWith('idmb/'));
}

function collectSiteFiles(root) {
  const files = [];
  function visit(relative) {
    if (excluded(relative)) return;
    const stat = fs.lstatSync(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`Symlink niet toegestaan bij deploy: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
        visit(`${relative}/${name}`);
      }
    } else if (stat.isFile() && siteFile(relative)) {
      files.push(relative);
    } else {
      throw new Error(`Onverwacht bestandstype: ${relative}`);
    }
  }
  for (const entry of ['assets', 'idmb', 'index.html']) visit(entry);
  return files;
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    env: {...process.env, GIT_TERMINAL_PROMPT: '0'}
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} mislukt (exitcode ${result.status}). Deploy gestopt.`);
  }
  return capture ? result.stdout : '';
}

function deploy() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    throw new Error('Deze website moet een eigen Git-repository hebben; deploy vanuit de bovenliggende repo is niet toegestaan.');
  }
  if (run('git', ['rev-parse', '--show-toplevel'], true).trim() !== ROOT) {
    throw new Error('Onjuiste Git-root. Deploy gestopt.');
  }
  const remote = run('git', ['remote', 'get-url', 'origin'], true).trim();
  if (remote !== REPOSITORY) throw new Error(`Origin moet ${REPOSITORY} zijn.`);
  if (run('git', ['branch', '--show-current'], true).trim() !== 'main') {
    throw new Error('Deploy is alleen toegestaan vanaf main.');
  }

  const localNetrc = path.join(ROOT, '~:.netrc');
  const netrc = fs.existsSync(localNetrc) ? localNetrc : path.join(os.homedir(), '.netrc');
  fs.accessSync(netrc, fs.constants.R_OK);
  const ftpArgs = ['--fail', '--silent', '--show-error', '--ssl-reqd',
    '--connect-timeout', '20', '--max-time', '300', '--netrc-file', netrc];
  const files = collectSiteFiles(ROOT);
  const tests = fs.readdirSync(path.join(ROOT, 'tests')).sort()
    .filter(file => file.endsWith('.test.cjs')).map(file => `tests/${file}`);
  if (!tests.length) throw new Error('Geen deploytests gevonden.');
  run(process.execPath, ['--test', ...tests]);
  run('curl', [...ftpArgs, '--list-only', FTP_ROOT], true);

  run('git', ['add', '-A', '--', ...GIT_PATHS]);
  const tracked = run('git', ['ls-files', '-z'], true).split('\0').filter(Boolean);
  for (const file of tracked) {
    if (/netrc|(^|\/)\.env($|\.)|\.pem$|\.key$/i.test(file)) {
      throw new Error(`Mogelijke inloggegevens in Git: ${file}. Deploy gestopt.`);
    }
  }
  for (const file of files) {
    if (!tracked.includes(file)) throw new Error(`Productiebestand ontbreekt in Git: ${file}`);
  }
  const staged = run('git', ['diff', '--cached', '--name-only', '-z'], true).split('\0').filter(Boolean);
  for (const file of staged) {
    if (!GIT_PATHS.some(entry => file === entry || file.startsWith(`${entry}/`))) {
      throw new Error(`Onverwachte staged wijziging: ${file}. Deploy gestopt.`);
    }
  }
  if (staged.length) {
    run('git', ['commit', '-m', `Deploy website ${new Date().toISOString()}`,
      '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>']);
  }
  run('git', ['push', '--set-upstream', 'origin', 'main']);

  const revision = run('git', ['rev-parse', 'HEAD'], true).trim();
  const backups = path.join(ROOT, '.deploy-backups');
  fs.mkdirSync(backups, {recursive: true});
  const backup = path.join(backups, `index-${Date.now()}.html`);
  run('curl', [...ftpArgs, `${FTP_ROOT}index.html`, '--output', backup]);
  console.log(`Productieback-up: ${backup}`);

  for (const file of files) {
    const suffix = `.deploy-${crypto.randomUUID()}.tmp`;
    const temporary = file + suffix;
    const url = FTP_ROOT + temporary.split('/').map(encodeURIComponent).join('/');
    console.log(`Upload: ${file}`);
    run('curl', [...ftpArgs, '--ftp-create-dirs', '--upload-file', path.join(ROOT, file),
      '--quote', `-RNFR ${FTP_PATH}${temporary}`,
      '--quote', `-RNTO ${FTP_PATH}${file}`, url]);
  }

  const verified = path.join(backups, `verified-${revision}.html`);
  run('curl', ['--fail', '--silent', '--show-error', '--location',
    '--connect-timeout', '20', '--max-time', '60',
    `${LIVE_URL}?deploy=${revision}-${Date.now()}`, '--output', verified]);
  if (!fs.readFileSync(verified).equals(fs.readFileSync(path.join(ROOT, 'index.html')))) {
    throw new Error(`Live homepage wijkt af van de upload. Controleer productie; back-up: ${backup}`);
  }
  fs.unlinkSync(verified);
  console.log(`Deploy voltooid: ${LIVE_URL} (Git ${revision.slice(0, 7)}).`);
}

if (require.main === module) {
  try {
    deploy();
  } catch (error) {
    console.error(`DEPLOY FOUT: ${error.message}`);
    console.error('Geen succes bevestigd. Bij een uploadfout kunnen sommige bestanden al vernieuwd zijn; herstel zo nodig de back-up.');
    process.exitCode = 1;
  }
}

module.exports = {excluded, siteFile, collectSiteFiles};
