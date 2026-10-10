const test = require('node:test');
const assert = require('node:assert/strict');
const {weatherKind, parseWeather, daylight, solarDaylight, appearance} = require('../assets/desk-weather.js');

const now = Date.parse('2026-10-07T12:00:00+02:00');
const sunrise = Date.parse('2026-10-07T07:50:00+02:00');
const sunset = Date.parse('2026-10-07T19:00:00+02:00');
const days = [{sunrise, sunset}];
const payload = () => ({
  current:{time:now / 1000, temperature_2m:13.5, weather_code:2, cloud_cover:59},
  daily:{sunrise:[sunrise / 1000], sunset:[sunset / 1000]}
});

test('maps all supported WMO codes to the appropriate visual weather', () => {
  for (const [kind, codes] of Object.entries({
    clear:[0,1], 'partly-cloudy':[2], cloudy:[3], fog:[45,48],
    rain:[51,53,55,56,57,61,63,65,66,67,80,81,82],
    snow:[71,73,75,77,85,86], storm:[95,96,99]
  })) {
    for (const code of codes) assert.equal(weatherKind(code), kind);
  }
  assert.throws(() => weatherKind(123));
  assert.throws(() => weatherKind('61'));
});

test('validates live data and converts epoch seconds to milliseconds', () => {
  const weather = parseWeather(payload(), now);
  assert.deepEqual(weather, {kind:'partly-cloudy', cloud:.59, temperature:13.5, observedAt:now, days});
  for (const invalid of [null, {}, {current:{}}]) assert.throws(() => parseWeather(invalid, now));
  const invalidCloud = payload();
  invalidCloud.current.cloud_cover = 101;
  assert.throws(() => parseWeather(invalidCloud, now));
  const invalidTemperature = payload();
  invalidTemperature.current.temperature_2m = null;
  assert.throws(() => parseWeather(invalidTemperature, now));
  const stale = payload();
  stale.current.time -= 3 * 60 * 60;
  assert.throws(() => parseWeather(stale, now), /niet actueel/);
  const future = payload();
  future.current.time += 60 * 60;
  assert.throws(() => parseWeather(future, now), /niet actueel/);
  const reversedSun = payload();
  reversedSun.daily.sunset = [sunrise / 1000 - 1];
  assert.throws(() => parseWeather(reversedSun, now));
  const missingToday = payload();
  missingToday.daily.sunrise[0] += 86400;
  missingToday.daily.sunset[0] += 86400;
  assert.throws(() => parseWeather(missingToday, now), /vandaag ontbreken/);
});

test('transitions through dawn, day, dusk and night around local sun times', () => {
  const halfHour = 30 * 60 * 1000;
  assert.deepEqual(daylight(sunrise - halfHour - 1, days), {light:0, phase:'night'});
  assert.deepEqual(daylight(sunrise, days), {light:.5, phase:'dawn'});
  assert.deepEqual(daylight(sunrise + halfHour, days), {light:1, phase:'day'});
  assert.deepEqual(daylight(now, days), {light:1, phase:'day'});
  assert.deepEqual(daylight(sunset, days), {light:.5, phase:'dusk'});
  assert.deepEqual(daylight(sunset + halfHour, days), {light:0, phase:'night'});
});

test('uses Amsterdam calendar dates, including DST and local midnight', () => {
  const summerDay = [{sunrise:Date.parse('2026-06-21T05:20:00+02:00'), sunset:Date.parse('2026-06-21T22:05:00+02:00')}];
  assert.deepEqual(daylight(Date.parse('2026-06-21T21:05:00+02:00'), summerDay), {light:1, phase:'day'});
  assert.equal(daylight(Date.parse('2026-06-22T00:15:00+02:00'), summerDay).phase, 'night');
  const winterDay = [{sunrise:Date.parse('2026-12-21T08:45:00+01:00'), sunset:Date.parse('2026-12-21T16:30:00+01:00')}];
  assert.deepEqual(daylight(Date.parse('2026-12-21T08:45:00+01:00'), winterDay), {light:.5, phase:'dawn'});
});

test('offline solar calculation keeps day/night working across seasons', () => {
  for (const date of ['2026-01-15','2026-06-21','2026-10-07']) {
    assert.equal(solarDaylight(Date.parse(`${date}T12:00:00Z`)).phase, 'day');
    assert.equal(solarDaylight(Date.parse(`${date}T00:00:00Z`)).phase, 'night');
  }
  const dusk = solarDaylight(Date.parse('2026-10-07T17:00:00Z'));
  assert.equal(dusk.phase, 'dusk');
  assert.ok(dusk.light > 0 && dusk.light < 1);
});

test('rain, snow and fog effects are mutually exclusive and sunlight goes off at night', () => {
  for (const kind of ['clear','cloudy','rain','snow','fog','storm']) {
    const weather = {kind, cloud:kind === 'clear' ? 0 : 1};
    const day = appearance({phase:'day', light:1}, weather);
    const night = appearance({phase:'night', light:0}, weather);
    assert.equal(day['--weather-rain'] > 0, kind === 'rain' || kind === 'storm');
    assert.equal(day['--weather-snow'] > 0, kind === 'snow');
    assert.equal(day['--weather-fog'] > 0, kind === 'fog');
    assert.equal(night['--weather-sun-glow'], 0);
    assert.equal(night['--weather-sun-shadow'], 0);
    assert.ok(night['--wall-brightness'] < day['--wall-brightness']);
    assert.ok(night['--window-brightness'] < day['--window-brightness']);
  }
});

test('unknown weather never invents sunshine, precipitation or a clear sky', () => {
  const unknown = appearance({phase:'day', light:1}, null);
  for (const property of ['--weather-rain','--weather-snow','--weather-fog','--weather-sun-glow','--weather-stars','--weather-moon']) {
    assert.equal(unknown[property], 0);
  }
});
