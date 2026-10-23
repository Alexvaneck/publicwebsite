const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const projects = [
  {
    slug: 'centric-zuiderpark', title: 'Centric / Zuiderpark', location: 'IJsselstein',
    category: 'Wonen / transformatie', status: 'In verkoop',
    intro: 'Herontwikkeling naar een nieuwe woonomgeving.',
    description: 'Met Centric / Zuiderpark in IJsselstein richten wij ons op de transformatie naar wonen. Wij laten u graag de projectbeelden zien. Via de aanvullende projectinformatie leest u meer over de verkoop.',
    images: ['centric-01.jpg', 'centric-02.jpg'],
    external: 'https://www.ijsselstein20.nl/nieuwe-appartementen-in-zuiderpark-ijsselstein-voormalig-centric-pand-verkoop-in-volle-gang/',
    externalLabel: 'Lees het bericht over de verkoop'
  },
  {
    slug: 'hoge-biezen', title: 'Hoge Biezen', location: 'IJsselstein',
    category: 'Ontwikkeling', status: 'In voorbereiding',
    intro: 'Een ontwikkeling in voorbereiding in IJsselstein.',
    description: 'Wij bereiden de ontwikkeling van Hoge Biezen in IJsselstein voor. Zodra we meer kunnen delen over het plan en de planning, vindt u dat hier.',
    images: ['omgeving.jpg', 'omgeving2.jpg']
  },
  {
    slug: 'knik-houten', title: 'KNIK Houten', location: 'Houten',
    category: 'Samenwerking / ontwikkeling', status: 'Details volgen',
    intro: 'Samenwerking en ontwikkeling in Houten.',
    description: 'Wij hebben KNIK Houten als samenwerking opgenomen in ons projectoverzicht. Meer informatie over onze betrokkenheid en de projectstatus delen we hier zodra die beschikbaar is. Op de projectwebsite vindt u aanvullende informatie.',
    images: ['overzicht2.jpg', 'overzicht.jpg'],
    external: 'https://knik-houten.nl/', externalLabel: 'Bezoek de KNIK-projectwebsite'
  },
  {
    slug: 'nieuwe-ontwikkeling', title: 'Nieuwe ontwikkeling', location: 'Details volgen',
    category: 'Ontwikkeling', status: 'Details volgen',
    intro: 'Ruimte voor een volgend project.',
    description: 'Hier maken wij ruimte voor een nieuwe ontwikkeling. Wij delen de projectnaam, locatie en planning zodra we die kunnen bekendmaken. Voor nu tonen we beelden uit ons bestaande conceptoverzicht.',
    images: ['overzicht.jpg', 'overzicht2.jpg']
  }
];

function escape(value) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function extract(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) throw new Error(`IDMB-template mist ${label}.`);
  return match[0];
}

function renderHeader(source) {
  return extract(source, /<header>[\s\S]*?<\/header>/, 'header')
    .replace('class="wrap nav"', 'class="wrap nav project-nav"')
    .replace('<nav class="menu">', '<a class="project-home" href="/idmb/">Vastgoedgroep</a><nav class="menu">')
    .replaceAll('href="#', 'href="/idmb/#');
}

function renderContact(source) {
  const head = extract(source, /<!doctype html>[\s\S]*?<\/head>/, 'head')
    .replace(/<title>[\s\S]*?<\/title>/, '<title>Contact — Vastgoedgroep</title>')
    .replace(/<meta name="description" content="[^"]*" \/>/,
      '<meta name="description" content="Neem contact op met Vastgoedgroep. Bespreek uw kans, locatie of project via ons contactformulier." />')
    .replace('</head>', `<link rel="canonical" href="https://alexvaneck.nl/idmb/contact/" />
  <style>
    .project-nav{justify-content:space-between}.project-home{font-size:14px;font-weight:700}
    .contact-page{padding-top:60px}.contact-page .cta-box{align-items:start}
    .contact-page h1{font-size:clamp(38px,5vw,64px);line-height:1.03;letter-spacing:-.03em;margin:14px 0}
    .project-home:focus-visible{outline:3px solid var(--gold);outline-offset:4px}
  </style>
</head>`);
  const footer = extract(source, /<footer>[\s\S]*?<\/footer>/, 'footer')
    .replaceAll('href="#', 'href="/idmb/#');
  const consent = extract(source, /<aside class="cookie-notice"[\s\S]*?<\/aside>\s*<script id="google-consent">[\s\S]*?<\/script>/, 'cookiekeuze');
  return `${head}
<body>
${renderHeader(source)}
<main id="top">
  <section class="cta contact-page" id="contact"><div class="wrap"><div class="cta-box">
    <div><div class="eyebrow">Contact met Vastgoedgroep</div><h1>Wij horen graag over uw plannen.</h1><p>Heeft u een kans, locatie of project dat u met ons wilt bespreken? Wij komen graag in contact met grondeigenaren, ontwikkelaars, investeerders en andere partijen die kansen zien in vastgoed.</p><p>Vul het formulier in en wij nemen contact met u op.</p></div>
    <form class="contact-form" action="/idmb/contact.php" method="post">
      <label for="contact-name">Naam<input id="contact-name" name="name" autocomplete="name" maxlength="100" required></label>
      <label for="contact-email">E-mailadres<input id="contact-email" name="email" type="email" autocomplete="email" maxlength="254" required></label>
      <label for="contact-message">Uw bericht<textarea id="contact-message" name="message" rows="6" maxlength="5000" required></textarea></label>
      <label class="contact-trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <p class="note">Wij gebruiken uw gegevens alleen om uw bericht te beantwoorden.</p>
      <button class="btn" type="submit">Verstuur bericht ↗</button>
      <p class="contact-status" role="status" aria-live="polite" aria-atomic="true"></p>
    </form>
  </div></div></section>
</main>
${footer}
${consent}
<script src="/idmb/assets/contact.js" defer></script>
</body></html>
`;
}

function renderProject(source, project) {
  const head = extract(source, /<!doctype html>[\s\S]*?<\/head>/, 'head')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(project.title)} — Vastgoedgroep</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${escape(project.intro)} Vastgoedgroep." />`)
    .replace('</head>', `<link rel="canonical" href="https://alexvaneck.nl/idmb/projecten/${project.slug}/" />
  <style>
    .project-nav{justify-content:space-between}.project-home{font-size:14px;font-weight:700}
    .project-hero{padding-bottom:40px}.project-hero .hero-card{min-height:540px}.project-hero h1{overflow-wrap:anywhere}
    .project-breadcrumb{padding:26px 0;font-size:13px;color:var(--muted)}.project-breadcrumb a{text-decoration:underline;text-underline-offset:4px}
    .project-information{padding-top:50px}.project-facts{margin-top:30px;border-top:1px solid var(--line)}.project-facts div{padding:16px 0;border-bottom:1px solid var(--line)}.project-facts dt{font-size:12px;color:var(--muted);margin-bottom:6px}.project-facts dd{margin:0;font-size:17px}
    .project-gallery{background:var(--sand)}.project-images{display:grid;grid-template-columns:1fr 1fr;gap:24px}.project-images figure{margin:0}.project-images img{width:100%;height:380px;object-fit:cover}.project-images figcaption{margin-top:12px;font-size:13px;color:var(--muted)}
    .project-home:focus-visible,.project-breadcrumb a:focus-visible{outline:3px solid var(--gold);outline-offset:4px}
    @media(max-width:900px){.project-hero .hero-card{min-height:480px}.project-hero .hero-content{padding:48px 28px}}
    @media(max-width:580px){.project-images{grid-template-columns:1fr}.project-images img{height:280px}.project-hero h1{font-size:42px}}
  </style>
</head>`);
  const header = renderHeader(source);
  const footer = extract(source, /<footer>[\s\S]*?<\/footer>/, 'footer')
    .replaceAll('href="#', 'href="/idmb/#');
  const consent = extract(source, /<aside class="cookie-notice"[\s\S]*?<\/aside>\s*<script id="google-consent">[\s\S]*?<\/script>/, 'cookiekeuze');
  const contact = extract(source, /<section class="cta" id="contact">[\s\S]*?<\/section>/, 'contact');
  const text = escape(project.title);
  const related = projects.filter(other => other.slug !== project.slug).map(other =>
    `<a class="item" href="../${other.slug}/"><img src="/idmb/assets/${other.images[0]}" alt="${escape(other.title)}" loading="lazy"><h4>${escape(other.title)}</h4><p>${escape(other.category)} · ${escape(other.status)} ↗</p></a>`
  ).join('\n        ');
  return `${head}
<body>
${header}
<main id="top">
  <nav class="wrap project-breadcrumb" aria-label="Broodkruimel"><a href="/idmb/">Home</a> / <a href="/idmb/#projecten">Projecten</a> / <span aria-current="page">${text}</span></nav>
  <section class="hero project-hero"><div class="wrap"><div class="hero-card">
    <img src="/idmb/assets/${project.images[0]}" alt="${text}">
    <div class="hero-content"><div class="eyebrow">${escape(project.location)} / ${escape(project.category)}</div><h1>${text}</h1><p>${escape(project.intro)}</p><div class="actions"><a class="btn light" href="#projectinformatie">Over dit project</a><a class="btn light" href="/idmb/contact/">Neem contact op ↗</a></div></div>
  </div></div></section>
  <section class="project-information" id="projectinformatie"><div class="wrap intro">
    <div><div class="eyebrow">Het project</div><h2>${text}</h2><dl class="project-facts"><div><dt>Locatie</dt><dd>${escape(project.location)}</dd></div><div><dt>Discipline</dt><dd>${escape(project.category)}</dd></div><div><dt>Status</dt><dd>${escape(project.status)}</dd></div></dl></div>
    <div class="intro-copy"><p>${escape(project.description)}</p><p class="note">Conceptinformatie op basis van het bestaande projectoverzicht. Verdere projectdetails volgen.</p>${project.external ? `<a class="text-link" href="${escape(project.external)}" target="_blank" rel="noopener noreferrer">${escape(project.externalLabel)} ↗</a>` : ''}</div>
  </div></section>
  <section class="project-gallery"><div class="wrap"><div class="section-head"><div><div class="eyebrow">In beeld</div><h2>Een blik op het project.</h2></div><p>Beelden uit het bestaande conceptoverzicht.</p></div><div class="project-images">
    ${project.images.map((image, index) => `<figure><img src="/idmb/assets/${image}" alt="${text} — projectbeeld ${index + 1}" loading="lazy"><figcaption>${text} · Projectbeeld ${index + 1}</figcaption></figure>`).join('\n    ')}
  </div></div></section>
  ${contact}
  <section class="projects" id="andere-projecten"><div class="wrap"><div class="section-head"><div><div class="eyebrow">Verder ontdekken</div><h2>Andere projecten.</h2></div><a class="text-link" href="/idmb/#projecten">Alle projecten ↗</a></div><div class="project-list">
        ${related}
  </div></div></section>
</main>
${footer}
${consent}
</body></html>
`;
}

function build() {
  const source = fs.readFileSync(path.join(ROOT, 'idmb/index.html'), 'utf8');
  const contactDirectory = path.join(ROOT, 'idmb/contact');
  fs.mkdirSync(contactDirectory, {recursive: true});
  fs.writeFileSync(path.join(contactDirectory, 'index.html'), renderContact(source));
  console.log('Contactpagina gebouwd');
  for (const project of projects) {
    const directory = path.join(ROOT, 'idmb/projecten', project.slug);
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(path.join(directory, 'index.html'), renderProject(source, project));
    console.log(`Projectpagina gebouwd: ${project.slug}`);
  }
}

if (require.main === module) build();
module.exports = {projects, renderProject, renderContact, build};
