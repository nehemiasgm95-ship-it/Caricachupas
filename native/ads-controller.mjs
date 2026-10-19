// Anuncios (AdMob) con reglas pensadas para un juego con reloj y micrófono:
//  - Se pide el consentimiento (UMP) ANTES de cargar cualquier anuncio.
//  - Banner solo en pantallas de pausa (jugadores y resultados). Nunca en turno, ruleta ni anuncio de tema.
//  - Intersticial solo al pasar al siguiente tema, con tope de frecuencia. Nunca en los primeros temas.
//  - Con recompensa: siempre voluntario.
//  - Cualquier fallo del SDK se traga: el juego nunca debe romperse por un anuncio.

// IDs de PRUEBA publicados por Google. Nunca se deben usar en la versión de tienda (ver scripts/check-release.js).
export const TEST_IDS = {
  appId: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-3940256099942544/9214589741',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

export const DEFAULT_POLICY = {
  firstEligibleTopic: 3,    // el 1.º anuncio puede salir al terminar el 3.er tema
  everyNTopics: 3,          // y luego, como máximo, uno cada 3 temas
  minGapMs: 180000,         // y nunca con menos de 3 minutos entre anuncios
  maxPerSession: 8,
  maxRewardsPerSession: 6,
  bannerScreens: ['setup', 'winner'],
};

export function shouldShowInterstitial(s, policy = DEFAULT_POLICY) {
  if (s.topicsCompleted < policy.firstEligibleTopic) return false;
  if (s.topicsSinceAd < policy.everyNTopics) return false;
  if (s.shown >= policy.maxPerSession) return false;
  if (s.lastAdAt && s.now - s.lastAdAt < policy.minGapMs) return false;
  return true;
}

const REMOVED_KEY = 'caricachupas.adsRemoved.v1';

export function createAdsController({ plugin, enums, config = {}, storage, now = Date.now, setBannerHeight = () => {},
  timers = { setTimeout, clearTimeout } }) {
  const cfg = { enabled: false, useTestIds: true, ids: {}, ...config };
  const policy = { ...DEFAULT_POLICY, ...(config.policy || {}) };
  const ids = cfg.useTestIds ? { ...TEST_IDS, ...cfg.ids, banner: cfg.ids.banner || TEST_IDS.banner,
    interstitial: cfg.ids.interstitial || TEST_IDS.interstitial, rewarded: cfg.ids.rewarded || TEST_IDS.rewarded } : cfg.ids;
  const get = (k) => { try { return storage && storage.getItem(k); } catch (_) { return null; } };
  const put = (k, v) => { try { storage && storage.setItem(k, v); } catch (_) { /* sin almacenamiento */ } };

  const st = {
    ready: false, removed: get(REMOVED_KEY) === '1', privacyOptionsRequired: false,
    interstitialReady: false, rewardedReady: false, bannerCreated: false, bannerVisible: false,
    topicsCompleted: 0, topicsSinceAd: 0, lastAdAt: 0, shown: 0, rewards: 0,
    earned: false, pendingInterstitial: null,
  };

  const safe = async (fn, fallback) => { try { return await fn(); } catch (_) { return fallback; } };

  async function preloadInterstitial() {
    st.interstitialReady = false;
    st.interstitialReady = await safe(async () => { await plugin.prepareInterstitial({ adId: ids.interstitial, isTesting: cfg.useTestIds }); return true; }, false);
  }
  async function preloadRewarded() {
    st.rewardedReady = false;
    st.rewardedReady = await safe(async () => { await plugin.prepareRewardVideoAd({ adId: ids.rewarded, isTesting: cfg.useTestIds }); return true; }, false);
  }

  async function attachListeners() {
    const E = enums;
    await safe(() => plugin.addListener(E.BannerAdPluginEvents.SizeChanged, (info) => setBannerHeight(st.bannerVisible ? (info && info.height) || 0 : 0)));
    await safe(() => plugin.addListener(E.InterstitialAdPluginEvents.Dismissed, () => st.pendingInterstitial && st.pendingInterstitial()));
    await safe(() => plugin.addListener(E.InterstitialAdPluginEvents.FailedToShow, () => st.pendingInterstitial && st.pendingInterstitial()));
    await safe(() => plugin.addListener(E.RewardAdPluginEvents.Rewarded, () => { st.earned = true; }));
  }

  return {
    get state() { return { ...st }; },
    ids,

    async init() {
      if (!cfg.enabled || st.removed) return false;
      try {
        const E = enums;
        let info = await plugin.requestConsentInfo({
          debugGeography: cfg.debugGeography, testDeviceIdentifiers: cfg.testDevices, tagForUnderAgeOfConsent: false,
        });
        if (info.status === E.AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
          info = await plugin.showConsentForm();
        }
        st.privacyOptionsRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';   // el plugin devuelve texto; su enum no se exporta
        if (!info.canRequestAds) return false;           // sin consentimiento no se pide ningún anuncio
        await plugin.initialize({
          initializeForTesting: !!cfg.useTestIds,
          testingDevices: cfg.testDevices,
          maxAdContentRating: E.MaxAdContentRating.Teen,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
        });
        await attachListeners();
        st.ready = true;
        await Promise.all([preloadInterstitial(), preloadRewarded()]);
        return true;
      } catch (_) { st.ready = false; return false; }
    },

    // Banner solo en pantallas de pausa.
    async onScreen(name) {
      if (!st.ready || st.removed) return;
      const want = policy.bannerScreens.includes(name);
      if (want && !st.bannerVisible) {
        st.bannerVisible = true;
        const E = enums;
        if (!st.bannerCreated) {
          st.bannerCreated = true;
          await safe(() => plugin.showBanner({ adId: ids.banner, adSize: E.BannerAdSize.ADAPTIVE_BANNER,
            position: E.BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: !!cfg.useTestIds }));
        } else {
          await safe(() => plugin.resumeBanner());
        }
      } else if (!want && st.bannerVisible) {
        st.bannerVisible = false;
        setBannerHeight(0);
        await safe(() => plugin.hideBanner());
      }
    },

    // Se llama al pasar al siguiente tema (el micrófono ya está cerrado en ese punto).
    async beforeNextTopic() {
      st.topicsCompleted += 1;
      st.topicsSinceAd += 1;
      if (!st.ready || st.removed) return false;
      if (!st.interstitialReady) { preloadInterstitial(); return false; }
      if (!shouldShowInterstitial({ ...st, now: now() }, policy)) return false;
      st.interstitialReady = false;
      const done = new Promise((resolve) => {
        const t = timers.setTimeout(resolve, 12000);                // red de seguridad
        st.pendingInterstitial = () => { timers.clearTimeout(t); resolve(); };
      });
      const shown = await safe(async () => { await plugin.showInterstitial({ adId: ids.interstitial }); return true; }, false);
      if (shown) await done;
      st.pendingInterstitial = null;
      if (shown) { st.lastAdAt = now(); st.topicsSinceAd = 0; st.shown += 1; }
      preloadInterstitial();
      return shown;
    },

    canReward() { return st.ready && !st.removed && st.rewardedReady && st.rewards < policy.maxRewardsPerSession; },

    // true solo si la persona terminó el video y ganó la recompensa.
    async showReward() {
      if (!this.canReward()) return false;
      st.rewardedReady = false;
      st.earned = false;
      const item = await safe(() => plugin.showRewardVideoAd({ adId: ids.rewarded }), null);
      const earned = st.earned || !!item;
      if (earned) st.rewards += 1;
      preloadRewarded();
      return earned;
    },

    get privacyOptionsRequired() { return st.privacyOptionsRequired && st.ready; },
    async openPrivacyOptions() { if (st.privacyOptionsRequired) await safe(() => plugin.showPrivacyOptionsForm()); },

    // Para la compra "Quitar anuncios".
    async setRemoved(v) {
      st.removed = !!v; put(REMOVED_KEY, v ? '1' : '0');
      if (v) { st.bannerVisible = false; setBannerHeight(0); await safe(() => plugin.removeBanner()); st.bannerCreated = false; }
    },
  };
}
