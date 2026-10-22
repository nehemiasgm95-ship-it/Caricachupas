// Conecta los plugins nativos con la app web: deja listas tres cosas globales que app.js usa si existen.
//   window.CCNativeSR  -> reconocedor de voz con la misma interfaz que la Web Speech API
//   window.CCNative    -> permisos del micrófono nativos y compartir imagen (hoja de compartir de Android)
//   window.CCAds       -> controlador de anuncios
// En la web normal (PWA) este archivo ni se carga, así que nada de esto existe.
import { createSpeechRecognition, createMicPermissions } from './speech-adapter.mjs';
import { createAdsController } from './ads-controller.mjs';

export function installNative({ win, doc, capacitor, SpeechRecognition, AdMob, Share, Filesystem, Directory, enums }) {
  if (!capacitor || !capacitor.isNativePlatform || !capacitor.isNativePlatform()) return false;

  win.CCNativeSR = createSpeechRecognition(SpeechRecognition);
  win.CCNative = { platform: capacitor.getPlatform(), mic: createMicPermissions(SpeechRecognition) };
  if (Share && Filesystem) win.CCNative.share = createSharer({ Share, Filesystem, Directory });

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

// El WebView de Android no tiene navigator.share: la imagen se guarda en la caché de la app y se pasa
// a la hoja de compartir del sistema (WhatsApp, Instagram...). No necesita permisos de almacenamiento.
export function createSharer({ Share, Filesystem, Directory }) {
  return async ({ dataUrl, text, title }) => {
    const data = String(dataUrl || '').split(',')[1];
    if (!data) throw new Error('imagen vacía');
    const f = await Filesystem.writeFile({ path: 'caricachupas-resultado.png', data, directory: (Directory && Directory.Cache) || 'CACHE' });
    try {
      await Share.share({ title, text, files: [f.uri], dialogTitle: 'Compartir resultado' });
    } catch (e) {
      // Cerrar la hoja de compartir no es un error.
      if (/cancel/i.test(String((e && e.message) || e))) { const err = new Error('cancelado'); err.name = 'AbortError'; throw err; }
      throw e;
    }
    return true;
  };
}
