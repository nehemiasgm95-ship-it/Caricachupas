import assert from 'node:assert/strict';
import { createAdsController, shouldShowInterstitial, DEFAULT_POLICY, TEST_IDS } from '../native/ads-controller.mjs';

const enums = {
  AdmobConsentStatus: { NOT_REQUIRED: 'NOT_REQUIRED', OBTAINED: 'OBTAINED', REQUIRED: 'REQUIRED', UNKNOWN: 'UNKNOWN' },
  MaxAdContentRating: { Teen: 'Teen' },
  BannerAdPluginEvents: { SizeChanged: 'bannerAdSizeChanged' },
  BannerAdSize: { ADAPTIVE_BANNER: 'ADAPTIVE_BANNER' }, BannerAdPosition: { BOTTOM_CENTER: 'BOTTOM_CENTER' },
  InterstitialAdPluginEvents: { Dismissed: 'interstitialAdDismissed', FailedToShow: 'interstitialAdFailedToShow' },
  RewardAdPluginEvents: { Rewarded: 'onRewardedVideoAdReward' },
};
function fakeAdmob(over = {}) {
  const calls = [], handlers = {};
  const p = {
    calls, handlers,
    consent: { status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' },
    async requestConsentInfo(o) { calls.push(['requestConsentInfo', o]); return { ...p.consent }; },
    async showConsentForm() { calls.push(['showConsentForm']); p.consent = { ...p.consent, status: 'OBTAINED', canRequestAds: true }; return { ...p.consent }; },
    async initialize(o) { calls.push(['initialize', o]); },
    async addListener(name, fn) { handlers[name] = fn; return { remove() {} }; },
    async prepareInterstitial(o) { calls.push(['prepareInterstitial', o]); return {}; },
    async prepareRewardVideoAd(o) { calls.push(['prepareRewardVideoAd', o]); return {}; },
    async showBanner(o) { calls.push(['showBanner', o]); }, async hideBanner() { calls.push(['hideBanner']); },
    async resumeBanner() { calls.push(['resumeBanner']); }, async removeBanner() { calls.push(['removeBanner']); },
    async showInterstitial(o) { calls.push(['showInterstitial', o]); setImmediate(() => handlers.interstitialAdDismissed && handlers.interstitialAdDismissed()); },
    async showRewardVideoAd(o) { calls.push(['showRewardVideoAd', o]); handlers.onRewardedVideoAdReward && handlers.onRewardedVideoAdReward({ type: 'x', amount: 1 }); return { type: 'x', amount: 1 }; },
    async showPrivacyOptionsForm() { calls.push(['showPrivacyOptionsForm']); },
    ...over,
  };
  return p;
}
const names = (p) => p.calls.map((c) => c[0]);
const mkStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const mk = (plugin, config = { enabled: true, useTestIds: true }, extra = {}) => {
  const heights = []; const c = createAdsController({ plugin, enums, config, storage: mkStore(), setBannerHeight: (h) => heights.push(h), ...extra }); c.heights = heights; return c;
};

// ---- política de frecuencia
{
  const P = DEFAULT_POLICY, base = { topicsCompleted: 3, topicsSinceAd: 3, lastAdAt: 0, shown: 0, now: 1e9 };
  assert.equal(shouldShowInterstitial({ ...base, topicsCompleted: 2, topicsSinceAd: 2 }, P), false, 'no antes del 3.er tema');
  assert.equal(shouldShowInterstitial(base, P), true);
  assert.equal(shouldShowInterstitial({ ...base, topicsSinceAd: 2 }, P), false, 'uno cada 3 temas');
  assert.equal(shouldShowInterstitial({ ...base, lastAdAt: 1e9 - 60000 }, P), false, 'mínimo 3 min entre anuncios');
  assert.equal(shouldShowInterstitial({ ...base, lastAdAt: 1e9 - 181000 }, P), true);
  assert.equal(shouldShowInterstitial({ ...base, shown: 8 }, P), false, 'tope por sesión');
}

// ---- desactivado: no toca el SDK en absoluto
{
  const p = fakeAdmob(); const c = mk(p, { enabled: false });
  assert.equal(await c.init(), false);
  await c.onScreen('setup'); assert.equal(await c.beforeNextTopic(), false); assert.equal(c.canReward(), false);
  assert.deepEqual(p.calls, []);
}

// ---- consentimiento: se muestra ANTES de inicializar
{
  const p = fakeAdmob(); p.consent = { status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' };
  const c = mk(p); assert.equal(await c.init(), true);
  const n = names(p);
  assert(n.indexOf('showConsentForm') > -1 && n.indexOf('showConsentForm') < n.indexOf('initialize'), 'consentimiento antes de initialize');
  assert.equal(c.privacyOptionsRequired, true);
  await c.openPrivacyOptions(); assert(names(p).includes('showPrivacyOptionsForm'));
}
// sin consentimiento (no se puede pedir anuncios): no se inicializa ni se pide nada
{
  const p = fakeAdmob(); p.consent = { status: 'REQUIRED', isConsentFormAvailable: false, canRequestAds: false, privacyOptionsRequirementStatus: 'UNKNOWN' };
  const c = mk(p); assert.equal(await c.init(), false);
  assert(!names(p).includes('initialize') && !names(p).includes('prepareInterstitial'));
  await c.onScreen('setup'); assert(!names(p).includes('showBanner'));
}
// parámetros de inicialización: público adolescente, nada dirigido a niños, modo prueba si se usan IDs de prueba
{
  const p = fakeAdmob(); const c = mk(p); await c.init();
  const init = p.calls.find((x) => x[0] === 'initialize')[1];
  assert.equal(init.maxAdContentRating, 'Teen'); assert.equal(init.tagForChildDirectedTreatment, false); assert.equal(init.initializeForTesting, true);
  assert.equal(p.calls.find((x) => x[0] === 'prepareInterstitial')[1].adId, TEST_IDS.interstitial);
}
// con IDs reales no se usan los de prueba
{
  const p = fakeAdmob(); const real = { banner: 'ca-app-pub-1/1', interstitial: 'ca-app-pub-1/2', rewarded: 'ca-app-pub-1/3' };
  const c = mk(p, { enabled: true, useTestIds: false, ids: real }); await c.init();
  assert.equal(p.calls.find((x) => x[0] === 'prepareInterstitial')[1].adId, 'ca-app-pub-1/2');
  assert.equal(p.calls.find((x) => x[0] === 'prepareInterstitial')[1].isTesting, false);
  await c.onScreen('setup'); assert.equal(p.calls.find((x) => x[0] === 'showBanner')[1].adId, 'ca-app-pub-1/1');
}

// ---- banner solo en pantallas de pausa
{
  const p = fakeAdmob(); const c = mk(p); await c.init();
  for (const s of ['welcome', 'topic', 'turn', 'wheel', 'round-end', 'mictest', 'feedback', 'teams']) await c.onScreen(s);
  assert(!names(p).includes('showBanner'), 'ninguna pantalla de juego muestra banner');
  await c.onScreen('setup'); assert.equal(names(p).filter((x) => x === 'showBanner').length, 1);
  p.handlers.bannerAdSizeChanged({ width: 360, height: 50 }); assert.equal(c.heights.at(-1), 50);   // el juego reserva ese espacio
  await c.onScreen('setup'); assert.equal(names(p).filter((x) => x === 'showBanner').length, 1, 'no se duplica');
  await c.onScreen('wheel'); assert(names(p).includes('hideBanner')); assert.equal(c.heights.at(-1), 0);
  await c.onScreen('winner'); assert(names(p).includes('resumeBanner'));
}

// ---- intersticial: respeta la política y espera a que se cierre
{
  let t = 1e9; const p = fakeAdmob(); const c = mk(p, { enabled: true, useTestIds: true }, { now: () => t }); await c.init();
  const shownAt = [];
  for (let topic = 1; topic <= 9; topic++) {
    const shown = await c.beforeNextTopic(); if (shown) shownAt.push(topic);
    t += 200000;                                              // pasan más de 3 minutos entre temas
  }
  assert.deepEqual(shownAt, [3, 6, 9], 'temas en los que sale un anuncio');
  assert.equal(names(p).filter((x) => x === 'showInterstitial').length, 3);
  assert(names(p).filter((x) => x === 'prepareInterstitial').length >= 4, 'se precarga el siguiente');
}
// temas rápidos: el mínimo de 3 minutos manda
{
  let t = 1e9; const p = fakeAdmob(); const c = mk(p, { enabled: true, useTestIds: true }, { now: () => t }); await c.init();
  const at = []; for (let i = 1; i <= 9; i++) { if (await c.beforeNextTopic()) at.push(i); t += 30000; }
  assert.deepEqual(at, [3, 9], 'con temas de 30 s el mínimo de 3 minutos retrasa el 2.º anuncio hasta el tema 9');
}
// si el anuncio no cargó, no se bloquea el juego
{
  const p = fakeAdmob({ async prepareInterstitial() { throw new Error('no fill'); } }); const c = mk(p); await c.init();
  for (let i = 0; i < 6; i++) assert.equal(await c.beforeNextTopic(), false);
}
// si el SDK falla al mostrar, no explota ni cuenta como mostrado
{
  const p = fakeAdmob({ async showInterstitial() { throw new Error('boom'); } }); let t = 1e9; const c = mk(p, { enabled: true, useTestIds: true }, { now: () => t }); await c.init();
  for (let i = 0; i < 3; i++) { await c.beforeNextTopic(); t += 200000; }
  assert.equal(c.state.shown, 0);
}
// si el anuncio nunca avisa que se cerró, la red de seguridad libera el juego
{
  const p = fakeAdmob({ async showInterstitial() { /* nunca emite Dismissed */ } });
  const fired = []; const timers = { setTimeout: (fn, ms) => { fired.push(ms); setImmediate(fn); return 1; }, clearTimeout() {} };
  let t = 1e9; const c = mk(p, { enabled: true, useTestIds: true }, { now: () => t, timers }); await c.init();
  await c.beforeNextTopic(); t += 2e5; await c.beforeNextTopic(); t += 2e5;
  assert.equal(await c.beforeNextTopic(), true); assert(fired.includes(12000));
}

// ---- recompensa
{
  const p = fakeAdmob(); const c = mk(p); await c.init();
  assert.equal(c.canReward(), true);
  assert.equal(await c.showReward(), true);
  assert.equal(c.state.rewards, 1);
  assert(names(p).filter((x) => x === 'prepareRewardVideoAd').length >= 2, 'precarga el siguiente');
}
{
  const p = fakeAdmob({ async showRewardVideoAd() { throw new Error('closed early'); } }); const c = mk(p); await c.init();
  assert.equal(await c.showReward(), false, 'cerrar el video antes de tiempo no da recompensa');
}
{
  const p = fakeAdmob({ async prepareRewardVideoAd() { throw new Error('no fill'); } }); const c = mk(p); await c.init();
  assert.equal(c.canReward(), false);
}
{
  const p = fakeAdmob(); const c = mk(p, { enabled: true, useTestIds: true, policy: { maxRewardsPerSession: 2 } }); await c.init();
  await c.showReward(); await c.showReward(); assert.equal(c.canReward(), false, 'tope de recompensas por sesión');
}

// ---- quitar anuncios (compra futura): se recuerda y apaga todo
{
  const store = mkStore(); const p = fakeAdmob();
  let c = createAdsController({ plugin: p, enums, config: { enabled: true, useTestIds: true }, storage: store }); await c.init();
  await c.onScreen('setup'); await c.setRemoved(true);
  assert(names(p).includes('removeBanner')); assert.equal(c.canReward(), false);
  assert.equal(await c.beforeNextTopic(), false);
  const p2 = fakeAdmob(); c = createAdsController({ plugin: p2, enums, config: { enabled: true, useTestIds: true }, storage: store });
  assert.equal(await c.init(), false, 'al abrir de nuevo sigue sin anuncios'); assert.deepEqual(p2.calls, []);
}
console.log('ads-controller OK');
