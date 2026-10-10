(() => {
  const LATITUDE = 52.02;
  const LONGITUDE = 5.04;
  const REFRESH_INTERVAL = 15 * 60 * 1000;
  const MAX_WEATHER_AGE = 2 * 60 * 60 * 1000;
  const HALF_HOUR = 30 * 60 * 1000;
  const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=52.02&longitude=5.04&current=temperature_2m,weather_code,cloud_cover&daily=sunrise,sunset&timezone=Europe%2FAmsterdam&timeformat=unixtime&forecast_days=3';
  const localDate = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Amsterdam', year:'numeric', month:'2-digit', day:'2-digit'});
  const clamp = value => Math.max(0, Math.min(1, value));

  function weatherKind(code) {
    if (code === 0 || code === 1) return 'clear';
    if (code === 2) return 'partly-cloudy';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'rain';
    if ([71,73,75,77,85,86].includes(code)) return 'snow';
    if ([95,96,99].includes(code)) return 'storm';
    throw new Error(`Onbekende WMO-weercode: ${code}`);
  }

  function parseWeather(payload, now = Date.now()) {
    const current = payload?.current;
    const daily = payload?.daily;
    if (!current || !Number.isFinite(current.time) || current.time <= 0 ||
        !Number.isFinite(current.temperature_2m) || !Number.isFinite(current.cloud_cover) ||
        current.cloud_cover < 0 || current.cloud_cover > 100 ||
        !Array.isArray(daily?.sunrise) || !Array.isArray(daily?.sunset) ||
        daily.sunrise.length === 0 || daily.sunrise.length !== daily.sunset.length) {
      throw new Error('De weerdienst gaf ongeldige gegevens terug.');
    }
    const observedAt = current.time * 1000;
    if (now - observedAt > MAX_WEATHER_AGE || observedAt - now > REFRESH_INTERVAL) {
      throw new Error('De weergegevens zijn niet actueel.');
    }
    const days = daily.sunrise.map((sunrise, index) => {
      const sunset = daily.sunset[index];
      if (!Number.isFinite(sunrise) || !Number.isFinite(sunset) || sunrise <= 0 || sunset <= sunrise ||
          localDate.format(new Date(sunrise * 1000)) !== localDate.format(new Date(sunset * 1000))) {
        throw new Error('De weerdienst gaf ongeldige zonsopkomst/-ondergang terug.');
      }
      return {sunrise:sunrise * 1000, sunset:sunset * 1000};
    });
    if (!days.some(day => localDate.format(new Date(day.sunrise)) === localDate.format(new Date(now)))) {
      throw new Error('De zontijden voor vandaag ontbreken.');
    }
    return {kind:weatherKind(current.weather_code), cloud:current.cloud_cover / 100,
      temperature:current.temperature_2m, observedAt, days};
  }

  function solarDaylight(now) {
    const date = new Date(now);
    const start = Date.UTC(date.getUTCFullYear(), 0, 1);
    const day = Math.floor((now - start) / 86400000) + 1;
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    // NOAA's fractional-year approximation provides offline solar light at fixed IJsselstein coordinates.
    const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
    const declination = .006918 - .399912 * Math.cos(gamma) + .070257 * Math.sin(gamma)
      - .006758 * Math.cos(2 * gamma) + .000907 * Math.sin(2 * gamma)
      - .002697 * Math.cos(3 * gamma) + .00148 * Math.sin(3 * gamma);
    const equation = 229.18 * (.000075 + .001868 * Math.cos(gamma) - .032077 * Math.sin(gamma)
      - .014615 * Math.cos(2 * gamma) - .040849 * Math.sin(2 * gamma));
    const solarMinutes = (hour * 60 + equation + 4 * LONGITUDE + 1440) % 1440;
    const angle = (solarMinutes / 4 - 180) * Math.PI / 180;
    const latitude = LATITUDE * Math.PI / 180;
    const altitude = Math.asin(Math.sin(latitude) * Math.sin(declination)
      + Math.cos(latitude) * Math.cos(declination) * Math.cos(angle)) * 180 / Math.PI;
    const light = clamp((altitude + 6) / 12);
    return {light, phase:light === 0 ? 'night' : light === 1 ? 'day' : solarMinutes < 720 ? 'dawn' : 'dusk'};
  }

  function daylight(now, days = []) {
    const today = localDate.format(new Date(now));
    const sun = days.find(day => localDate.format(new Date(day.sunrise)) === today);
    if (!sun) return solarDaylight(now);
    if (now < sun.sunrise - HALF_HOUR || now >= sun.sunset + HALF_HOUR) return {light:0, phase:'night'};
    if (now < sun.sunrise + HALF_HOUR) return {light:clamp((now - sun.sunrise + HALF_HOUR) / (2 * HALF_HOUR)), phase:'dawn'};
    if (now >= sun.sunset - HALF_HOUR) return {light:clamp((sun.sunset + HALF_HOUR - now) / (2 * HALF_HOUR)), phase:'dusk'};
    return {light:1, phase:'day'};
  }

  function appearance(sun, weather) {
    const light = sun.light;
    const cloud = weather ? weather.cloud : .5;
    const kind = weather ? weather.kind : 'unknown';
    const gloomy = ['fog','rain','snow','storm'].includes(kind);
    const sunshine = light * (1 - cloud) * (gloomy || kind === 'unknown' ? 0 : 1);
    return {
      '--wall-brightness':.36 + light * (.62 - cloud * .12),
      '--wall-saturation':.28 + light * (.66 - cloud * .4),
      '--window-brightness':.22 + light * (.83 - cloud * .17),
      '--window-saturation':.22 + light * (.7 - cloud * .42),
      '--weather-tint':light < .3 ? '#183555' : sun.phase === 'dawn' || sun.phase === 'dusk' ? '#d78346' : cloud > .45 || gloomy ? '#688ba7' : '#f7d49b',
      '--wall-tint-opacity':.3 * (1 - light) + light * (cloud * .12),
      '--window-tint-opacity':.4 * (1 - light) + light * (cloud * .16),
      '--weather-sun-glow':.46 * sunshine,
      '--weather-sun-shadow':.11 * sunshine,
      '--weather-rain':kind === 'rain' ? .65 : kind === 'storm' ? .9 : 0,
      '--weather-snow':kind === 'snow' ? .85 : 0,
      '--weather-fog':kind === 'fog' ? .85 : 0,
      '--weather-stars':weather && !gloomy ? (1 - light) * (1 - cloud) : 0,
      '--weather-moon':weather && !gloomy ? (1 - light) * (1 - cloud) * .7 : 0
    };
  }

  function initWeather() {
    const stage = document.getElementById('stage');
    const status = document.getElementById('weatherStatus');
    if (!stage || !status) return;
    const labels = {clear:'Helder', 'partly-cloudy':'Gedeeltelijk bewolkt', cloudy:'Bewolkt',
      fog:'Mist', rain:'Regen', snow:'Sneeuw', storm:'Onweer'};
    const phases = {day:'Dag', night:'Nacht', dawn:'Zonsopkomst', dusk:'Zonsondergang'};
    const temperature = new Intl.NumberFormat('nl-NL', {maximumFractionDigits:1});
    const phone = document.getElementById('phoneWeather');
    const phoneTemperature = document.getElementById('phoneWeatherTemperature');
    const phoneCondition = document.getElementById('phoneWeatherCondition');
    const phoneTime = document.getElementById('phoneWeatherTime');
    const phoneIcon = document.getElementById('phoneWeatherIcon');
    const observationTime = new Intl.DateTimeFormat('nl-NL', {timeZone:'Europe/Amsterdam', hour:'2-digit', minute:'2-digit'});
    const phoneLabels = {...labels, 'partly-cloudy':'Half bewolkt'};
    const phoneIcons = {clear:'Sun', 'partly-cloudy':'Cloud', cloudy:'Cloud', fog:'Fog', rain:'Rain', snow:'Snow', storm:'Storm'};
    const requestedDemo = new URLSearchParams(location.search).get('weather-demo');
    const demoKind = ['rain','snow'].includes(requestedDemo) ? requestedDemo : null;
    const demoLabel = demoKind === 'snow' ? 'Sneeuw' : 'Regen';
    let weather = null;
    let request = null;
    let nextRefresh = 0;
    let failed = false;
    let wasActive = false;
    const active = () => !document.hidden && !document.documentElement.classList.contains('tt-mode');

    function render() {
      const now = Date.now();
      const fresh = demoKind ? {kind:demoKind, cloud:1, temperature:demoKind === 'snow' ? -1 : 12, observedAt:now}
        : weather && now - weather.observedAt <= MAX_WEATHER_AGE && !failed ? weather : null;
      const sun = demoKind ? {light:1, phase:'day'} : daylight(now, weather ? weather.days : []);
      stage.dataset.dayPhase = sun.phase;
      stage.dataset.weather = fresh ? fresh.kind : 'unknown';
      for (const [property, value] of Object.entries(appearance(sun, fresh))) {
        stage.style.setProperty(property, String(value));
      }
      const message = demoKind ? `DEMO: ${demoLabel.toLowerCase()}animatie - gesimuleerd weer, niet het actuele weer in IJsselstein.` : fresh
        ? `IJsselstein \u00b7 ${temperature.format(fresh.temperature)} \u00b0C \u00b7 ${labels[fresh.kind]} \u00b7 ${phases[sun.phase]}`
        : `IJsselstein \u00b7 ${phases[sun.phase]} \u00b7 ${failed ? 'Actueel weer niet beschikbaar; alleen dag/nacht actief.' : 'Weer wordt geladen.'}`;
      if (status.textContent !== message) status.textContent = message;
      if (phone && phoneTemperature && phoneCondition && phoneTime && phoneIcon) {
        phone.setAttribute('aria-label', message);
        phoneTemperature.textContent = fresh ? `${temperature.format(fresh.temperature)}\u00b0` : '--';
        phoneCondition.textContent = fresh ? phoneLabels[fresh.kind] : failed ? 'Niet beschikbaar' : 'Laden...';
        phoneTime.textContent = demoKind ? `${demoLabel}-demo` : fresh ? `Bijgewerkt ${observationTime.format(new Date(fresh.observedAt))}` : 'Actueel weer';
        const icon = fresh ? fresh.kind === 'clear' && sun.phase === 'night' ? 'Moon' : phoneIcons[fresh.kind] : 'Cloud';
        phoneIcon.setAttribute('href', `#phoneIcon${icon}`);
        phoneIcon.style.visibility = fresh ? 'visible' : 'hidden';
      }
    }

    async function refreshWeather() {
      if (demoKind || request || !active()) return;
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(new Error('De weerdienst reageerde niet binnen 10 seconden.')), 10000);
      try {
        const response = await fetch(WEATHER_URL, {signal:controller.signal, credentials:'omit', referrerPolicy:'no-referrer'});
        if (!response.ok) throw new Error(`Weerdienst HTTP ${response.status}`);
        weather = parseWeather(await response.json());
        failed = false;
      } catch (error) {
        if (!active() && controller.signal.aborted) return;
        failed = true;
        console.warn('Het actuele weer in IJsselstein kon niet worden opgehaald. Alleen dag/nacht blijft actief.', error);
      } finally {
        clearTimeout(timeout);
        request = null;
        nextRefresh = Date.now() + REFRESH_INTERVAL;
        if (active()) render();
      }
    }

    function sync() {
      if (demoKind) {
        render();
        return;
      }
      if (!active()) {
        if (request) request.abort();
        wasActive = false;
        return;
      }
      if (!wasActive) nextRefresh = 0;
      wasActive = true;
      render();
      if (Date.now() >= nextRefresh) refreshWeather();
    }
    document.addEventListener('visibilitychange', sync);
    new MutationObserver(sync).observe(document.documentElement, {attributes:true, attributeFilter:['class']});
    setInterval(sync, 60000);
    sync();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {weatherKind, parseWeather, daylight, solarDaylight, appearance};
  }
  if (typeof document !== 'undefined') initWeather();
})();
