// Ajustes que se cambian sin tocar la lógica del juego.
window.CC_CONFIG = {
  version: '1.4.0',
  // Retroalimentación: se envía a un Google Form (gratis, sin servidor). Ver README → "Retroalimentación".
  // Mientras formUrl esté vacío, la app ofrece compartir el mensaje (WhatsApp, correo...) o copiarlo.
  feedback: {
    formUrl: '',     // https://docs.google.com/forms/d/e/<ID>/formResponse
    fields: { rating: '', type: '', message: '', contact: '', words: '', meta: '' },   // entry.123456789 ...
    email: '',       // correo de respaldo para el botón "Compartir" (opcional)
  },
  // Anuncios (solo en la app Android; la web no muestra anuncios). Con useTestIds:true se usan los anuncios de
  // prueba de Google. Antes de subir a Play: useTestIds:false, IDs reales de AdMob y el app ID en
  // android/app/src/main/res/values/admob.xml (npm run check:release lo comprueba).
  ads: {
    enabled: true,
    useTestIds: true,
    ids: { banner: '', interstitial: '', rewarded: '' },
    testDevices: [],
  },
  playUrl: '',       // enlace de la ficha en Google Play, cuando exista (activa "Calificar en Play")
  privacyUrl: 'privacidad.html',
};
