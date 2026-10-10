(() => {
  const measurementId = 'G-59P9G417BB';
  const storageKey = 'alexvaneck.analytics-consent.v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const notice = document.getElementById('cookie-note');
  const status = document.getElementById('cookie-status');
  const settings = [...document.querySelectorAll('.cookie-settings')];
  let scriptLoaded = false;
  let trackingEnabled = false;
  let opener = null;
  window['ga-disable-' + measurementId] = true;

  function readChoice() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (saved && ['accepted', 'rejected'].includes(saved.choice) &&
          Number.isFinite(saved.expires) && saved.expires > Date.now() &&
          saved.expires <= Date.now() + lifetime) return saved.choice;
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('De cookiekeuze voor alexvaneck kon niet worden gelezen.', error);
      status.textContent = 'Je opgeslagen keuze is niet beschikbaar. Kies opnieuw; Analytics blijft uit tot je toestemming geeft.';
    }
    return null;
  }

  function clearAnalyticsCookies() {
    const domains = location.hostname.split('.');
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0].trim();
      if (!/^alexvaneck_ga(?:_|$)/.test(name) && name !== '_ga' && name !== '_ga_59P9G417BB') continue;
      const expired = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      document.cookie = expired;
      for (let i = 0; i < domains.length - 1; i++) {
        document.cookie = `${expired}; domain=${domains.slice(i).join('.')}`;
      }
    }
  }

  function setNoticeVisible(visible) {
    notice.hidden = !visible;
    settings.forEach(button => button.setAttribute('aria-expanded', String(visible)));
  }

  function applyChoice(choice) {
    window['ga-disable-' + measurementId] = choice !== 'accepted';
    if (choice !== 'accepted') {
      trackingEnabled = false;
      clearAnalyticsCookies();
      return;
    }
    if (trackingEnabled) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    if (!scriptLoaded) {
      window.gtag('js', new Date());
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      script.addEventListener('error', () => {
        console.error('Google Analytics kon niet worden geladen.');
        status.textContent = 'Google Analytics is niet beschikbaar. Je cookiekeuze blijft bewaard.';
        setNoticeVisible(true);
      });
      document.head.appendChild(script);
      scriptLoaded = true;
    }
    window.gtag('config', measurementId, {
      cookie_prefix: 'alexvaneck',
      cookie_path: '/',
      cookie_expires: lifetime / 1000
    });
    trackingEnabled = true;
  }

  function saveChoice(choice) {
    let saved = true;
    status.textContent = '';
    try {
      localStorage.setItem(storageKey, JSON.stringify({choice, expires: Date.now() + lifetime}));
    } catch (error) {
      saved = false;
      console.error('De cookiekeuze voor alexvaneck kon niet worden opgeslagen.', error);
      status.textContent = 'Je keuze geldt voor dit bezoek, maar kon niet worden opgeslagen. Bij een volgend bezoek vragen we opnieuw toestemming.';
    }
    applyChoice(choice);
    if (saved) {
      setNoticeVisible(false);
      if (notice.contains(document.activeElement)) {
        const visibleButton = opener || settings.find(button => button.getClientRects().length);
        if (visibleButton) visibleButton.focus({preventScroll: true});
      }
      opener = null;
    }
  }

  settings.forEach(button => button.addEventListener('click', () => {
    opener = button;
    setNoticeVisible(true);
    window.scrollTo({top: 0, left: 0, behavior: 'instant'});
    document.getElementById('cookie-note-title').focus({preventScroll: true});
  }));
  document.getElementById('cookie-accept').addEventListener('click', () => saveChoice('accepted'));
  document.getElementById('cookie-reject').addEventListener('click', () => saveChoice('rejected'));
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    const choice = readChoice();
    applyChoice(choice);
    if (!choice) setNoticeVisible(true);
  });
  const choice = readChoice();
  applyChoice(choice);
  if (!choice) setNoticeVisible(true);
})();
