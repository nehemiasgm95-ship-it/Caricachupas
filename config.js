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
  playUrl: '',       // enlace de la ficha en Google Play, cuando exista (activa "Calificar en Play")
  privacyUrl: 'privacidad.html',
};
