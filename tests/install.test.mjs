import assert from 'node:assert/strict';
import { installNative } from '../native/install.mjs';

const mkEnv = (readyState = 'complete') => {
  const listeners = {}; const css = {};
  return {
    win: { localStorage: { getItem: () => null, setItem() {} }, CC_CONFIG: { ads: { enabled: false } }, addEventListener: (n, f) => { listeners[n] = f; } },
    doc: { readyState, documentElement: { style: { setProperty: (k, v) => { css[k] = v; } } } },
    listeners, css,
  };
};
const plugin = { checkPermissions: async () => ({ speechRecognition: 'granted' }), requestPermissions: async () => ({ speechRecognition: 'granted' }), available: async () => ({ available: true }) };
const enums = {};

// en la web normal no se instala nada
{
  const e = mkEnv();
  assert.equal(installNative({ ...e, capacitor: { isNativePlatform: () => false }, SpeechRecognition: plugin, AdMob: {}, enums }), false);
  assert.equal(e.win.CCNative, undefined); assert.equal(e.win.CCAds, undefined); assert.equal(e.win.CCNativeSR, undefined);
}
// en Android deja listas las tres piezas
{
  const e = mkEnv();
  assert.equal(installNative({ ...e, capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' }, SpeechRecognition: plugin, AdMob: {}, enums }), true);
  assert.equal(typeof e.win.CCNativeSR, 'function');
  assert.equal(e.win.CCNative.platform, 'android');
  assert.equal(await e.win.CCNative.mic.state(), 'granted');
  assert.equal(typeof e.win.CCAds.beforeNextTopic, 'function');
  assert.equal(e.win.CCAds.canReward(), false, 'anuncios apagados en la configuración: nada que mostrar');
  assert.equal(await e.win.CCAds.beforeNextTopic(), false);
}
// si la página aún carga, la inicialización de anuncios espera al evento load
{
  const e = mkEnv('loading');
  installNative({ ...e, capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' }, SpeechRecognition: plugin, AdMob: {}, enums });
  assert.equal(typeof e.listeners.load, 'function');
}
// el banner reserva altura en una variable CSS
{
  const e = mkEnv(); let heightCb;
  e.win.CC_CONFIG = { ads: { enabled: true, useTestIds: true } };
  const AdMob = {
    requestConsentInfo: async () => ({ status: 'NOT_REQUIRED', canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' }),
    initialize: async () => {}, addListener: async (n, f) => { if (n === 'bannerAdSizeChanged') heightCb = f; return { remove() {} }; },
    prepareInterstitial: async () => ({}), prepareRewardVideoAd: async () => ({}), showBanner: async () => {},
  };
  const en = { AdmobConsentStatus: { REQUIRED: 'REQUIRED' }, MaxAdContentRating: { Teen: 'Teen' }, BannerAdPluginEvents: { SizeChanged: 'bannerAdSizeChanged' },
    BannerAdSize: {}, BannerAdPosition: {}, InterstitialAdPluginEvents: { Dismissed: 'd', FailedToShow: 'f' }, RewardAdPluginEvents: { Rewarded: 'r' } };
  installNative({ ...e, capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' }, SpeechRecognition: plugin, AdMob, enums: en });
  await new Promise((r) => setTimeout(r, 20));
  await e.win.CCAds.onScreen('setup'); heightCb({ height: 50 });
  assert.equal(e.css['--banner-h'], '50px');
  await e.win.CCAds.onScreen('turn'); assert.equal(e.css['--banner-h'], '0px');
}
// compartir: guarda la imagen en la caché y abre la hoja de compartir; cancelar se trata como AbortError
{
  const e = mkEnv(); const calls = [];
  const Filesystem = { writeFile: async (o) => { calls.push(['write', o]); return { uri: 'file:///cache/' + o.path }; } };
  let cancel = false;
  const Share = { share: async (o) => { calls.push(['share', o]); if (cancel) throw new Error('Share canceled'); } };
  installNative({ ...e, capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' }, SpeechRecognition: plugin, AdMob: {}, Share, Filesystem, Directory: { Cache: 'CACHE' }, enums });
  assert.equal(await e.win.CCNative.share({ dataUrl: 'data:image/png;base64,QUJD', text: 'hola', title: 'T' }), true);
  assert.equal(calls[0][1].data, 'QUJD'); assert.equal(calls[0][1].directory, 'CACHE');
  assert.deepEqual(calls[1][1].files, ['file:///cache/caricachupas-resultado.png']); assert.equal(calls[1][1].text, 'hola');
  cancel = true;
  await assert.rejects(e.win.CCNative.share({ dataUrl: 'data:image/png;base64,QUJD' }), (err) => err.name === 'AbortError');
  await assert.rejects(e.win.CCNative.share({ dataUrl: '' }));
}
console.log('install OK (con compartir)');
