Alex interactive desk website

Open index.html in a modern browser, or run python3 -m http.server 8765
from this folder and visit http://localhost:8765/ for a local preview.
The homepage title is Alex van Eck | Technologie & projecten in IJsselstein
in both desk and teletext views. The description, Open Graph metadata,
canonical URL and Person structured data describe Alex and his connection
to IJsselstein. A visually hidden heading and introduction remain available
to screen readers; the shared About/teletext introduction also mentions IJsselstein.
No introduction or weather caption is displayed below the desk. Weather
status remains available to screen readers, and the phone still shows the weather.
The Open-Meteo attribution link is available in the cookie notice.
Its robots meta tag explicitly permits indexing and following links.
The homepage only loads Google Analytics (G-J5Q1E3G4DJ, the independent
Alexvaneck property) after acceptance
in a tilted yellow sticky-note cookie notice with locally available
handwriting fonts (no external font requests), in both desk and teletext views.
The choice is remembered for 180 days and can be changed using
the small Cookie-instellingen button at the bottom right of the desk
or in the teletext footer.
Opening these settings scrolls to the top and focuses the notice without
an extra scroll jump. The sticky note stays at the top of the viewport;
closing it restores keyboard focus without scrolling back to the footer.
assets/cookie-consent.js uses a separate storage key and alexvaneck cookie
prefix so the homepage and IDMB have independent consent. Refusal disables
homepage tracking and removes its prefixed and legacy Analytics cookies,
including cookies from the previous G-59P9G417BB stream.
Storage and script errors are explicitly reported in the notice.
Run homepage consent/SEO tests: node --test tests/homepage-consent.test.cjs

The IDMB page (/idmb/) only loads Google Analytics (G-PK9D34W1EP)
after explicit acceptance in its cookie notice. Accepting and rejecting
are stored locally for 180 days; Cookie-instellingen in the footer
reopens the notice. Rejection disables this page's tracking and removes
its Analytics cookies. IDMB uses the idmb cookie prefix and /idmb/ path
to keep its cookies separate from the homepage. If browser storage fails,
the notice reports this and the choice only applies to the current visit.
Run consent tests: node --test tests/idmb-consent.test.cjs

IDMB projects:
- All project cards link to internal pages under /idmb/projecten/.
- Centric / Zuiderpark, Hoge Biezen, KNIK Houten and Nieuwe ontwikkeling
  each have their own URL, title and canonical link.
- Run npm run build:idmb after changing the IDMB homepage layout, footer,
  cookie notice or project data in scripts/build-idmb-projects.cjs.
  The generator shares the homepage shell and one project layout across
  all four static pages; do not edit generated project HTML directly.
- The pages share the IDMB cookie choice and include project facts, images,
  contact and links to all other projects. Original external project links
  remain supplementary links on the detail pages. Missing facts are labelled
  as details to follow; no extra project specifications are assumed.
- Publish generated project pages before idmb/index.html so new links work.
- Run project tests: node --test tests/idmb-projects.test.cjs

Interactions:
- Lamp: click the lamp shade to toggle the lower light glow.
- Monitor: carousel of websites with left/right arrows; click a card for a modal and live URL.
- Keyboard: hover over keys for a subtle keyboard sound after the first click/tap on the page.
- X17: click the robot for the X17 page; the gripper/paper has a subtle pickup motion.
- TEDx: click only the TEDx lettering on the mug.
- Hondstrouw: click the orange book for the documentary.
- De Vrolikke Lab: click the blue book for the Bol.com page.
- Poster: click the Enjoycleaningup poster to open the portal.
- Documents: click the paper stack to fan out four non-editable pages.
- Lees meer: opens the About Alex modal.
- Website previews include Nexttrade as a private portal without an external
  link, and AmsterdamExcursies explicitly as a previous version we built;
  its external link leads to the current website. Both also appear in teletext.

The background image is intentionally retained as the visual foundation, with interactive layers placed on top.

The window and wall follow daylight and current weather in IJsselstein
(52.02 N, 5.04 E), using Open-Meteo without an API key. The fixed location is
used for every visitor; no browser geolocation is requested. The text,
monitor, poster, lamp and desk retain their original appearance and hotspots.
Rain, snow and fog are limited to the window; night reduces the daylight glow.
The illustrated phone displays current temperature, weather icon, a compact
condition label and the observation time in Europe/Amsterdam. Its screen
overlay uses a four-corner projective transform on a regular HTML layer
(not inside SVG foreignObject, for iPad/Safari compatibility). A ResizeObserver
scales its 1448 x 1086 coordinate plane with the desk, including orientation changes.
The 152 x 300 screen maps to (166,736), (281,736), (210,859),
and (66,856) in the original 1448 x 1086 artwork, clockwise from top left.
Rain falls in three layers at different speeds; snowflakes fall and drift
in three depth layers. Only the effect matching the current weather animates.
Precipitation and fog use a baked PNG alpha mask on a regular HTML layer,
with standard and -webkit CSS masking for iPhone Safari compatibility.
The mask uses the original artwork's luminance and a one-pixel inset at leaf edges.
The distant tower's region is also included, with neutral-color selection at
its base so rain and snow pass in front of it without covering overlapping leaves.
The plant, window frame and indoor foreground occlude these effects.
Regenerate after replacing the artwork: python3 scripts/generate-weather-mask.py
Validate the mask: python3 -m unittest discover -s tests -p 'test_weather_mask.py'
Weather refreshes every 15 minutes while the desk page is visible. Sunrise
and sunset use Europe/Amsterdam and transition over an hour.
If weather cannot be fetched, the caption reports this explicitly and an
offline solar calculation still supplies day/night. No simulated weather is
presented as live data. Reduced-motion preferences disable precipitation
animation. The mobile teletext view does not fetch weather.
Weather data: https://open-meteo.com/ (CC BY 4.0).
Open /?desk&weather-demo=rain to preview rain independently of live weather.
Open /?desk&weather-demo=snow for the snow preview.
These explicitly labelled demos do not fetch weather and survive reloads.
Remove the weather-demo parameter from the URL to return to live weather.

Run weather logic tests: node --test tests/desk-weather.test.cjs

Deploy:
- Run npm run deploy from this folder (Node.js 20+, Git and curl required).
- The site has its own Git repository: https://github.com/Alexvaneck/publicwebsite
  on branch main. The parent repository does not track this project.
- The command runs the tests, stages website/source changes, commits if needed, and pushes
  to GitHub before uploading index.html, assets/ and idmb/ over encrypted FTP
  to ftp.cieff1h7t.service.one, /webroots/sites/alexvaneck.nl/.
- Authentication uses the existing local ~:.netrc file, or ~/.netrc if absent.
  Credentials, environment files, old homepage copies and local backups are
  excluded from Git and production. GitHub authentication must already work
  through Git's credential helper; the deploy command never asks for passwords.
- Each file is uploaded to a temporary name and then renamed. Assets and idmb/
  go first; the homepage goes last. Existing remote-only files (including the
  server's .htaccess) are preserved; this is not a remote deletion/sync command.
- Before replacing the homepage, a copy is saved in .deploy-backups/.
  The command verifies the public HTTPS homepage against the local file and
  fails explicitly on errors. Multi-file uploads are not transactional: on
  failure some files may already be updated. Correct the error and rerun;
  restore a backup manually if rollback is required.
- Run npm test for weather and deploy tests.
