// Conecta los plugins nativos con la app web: deja listas tres cosas globales que app.js usa si existen.
//   window.CCNativeSR  -> reconocedor de voz con la misma interfaz que la Web Speech API
//   window.CCNative    -> permisos del micrófono nativos
//   window.CCAds       -> controlador de anuncios
// En la web normal (PWA) este archivo ni se carga, así que nada de esto existe.
import { createSpeechRecognition, createMicPermissions } from './speech-adapter.mjs';
import { createAdsController } from './ads-controller.mjs';

export function installNative({ win, doc, capacitor, SpeechRecognition, AdMob, enums }) {
  if (!capacitor || !capacitor.isNativePlatform || !capacitor.isNativePlatform()) return false;

  win.CCNativeSR = createSpeechRecognition(SpeechRecognition);
  win.CCNative = { platform: capacitor.getPlatform(), mic: createMicPermissions(SpeechRecognition) };

  const adsCfg = (win.CC_CONFIG && win.CC_CONFIG.ads) || {};
  win.CCAds = createAdsController({
    plugin: AdMob, enums, config: adsCfg, storage: win.localStorage,
    // El banner flota sobre la pantalla: se reserva su altura para que no tape botones.
    setBannerHeight: (h) => doc.documentElement.style.setProperty('--banner-h', (h || 0) + 'px'),
  });
  // Consentimiento + SDK arrancan sin bloquear la pantalla de inicio.
  const start = () => { Promise.resolve(win.CCAds.init()).catch(() => {}); };
  if (doc.readyState === 'complete') start(); else win.addEventListener('load', start);
  return true;
}
