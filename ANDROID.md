# Caricachupas en Android

La app Android es la misma web empaquetada con Capacitor, con voz y anuncios nativos. Todo se compila en la nube
(GitHub Actions); no necesitas instalar nada en tu computadora para probarla.

## 1. Probar en tu teléfono (APK de prueba)
1. En el repositorio: pestaña **Actions → Android → (última ejecución en verde)**.
2. Abajo, en **Artifacts**, descarga **caricachupas-debug-apk** y descomprime el `.zip`.
3. Pasa `app-debug.apk` al teléfono, ábrelo y permite “instalar apps de orígenes desconocidos” cuando lo pida.
4. Al abrirla pedirá el micrófono. Los anuncios que verás son **de prueba** de Google (dicen “Test Ad”).

Cada vez que cambies la app en `main` se genera un APK nuevo. También puedes correrlo a mano:
**Actions → Android → Run workflow → tipo: debug**.

## 2. Antes de publicar (una sola vez)
### a) Nombre de paquete (no se puede cambiar después de publicar)
Hoy es `com.nehemiasgm95.caricachupas`. Para cambiarlo: `node scripts/set-app-id.js com.tuempresa.caricachupas` y luego `npm test`.

### b) Llave de subida
En tu computadora (con Java instalado):
```
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```
- **Guarda `upload.jks` y las contraseñas en un lugar seguro y con copia.** Nunca lo subas al repositorio.
- Google Play firma la app final con su propia llave (Play App Signing); esta es solo la llave de subida.
- Conviértela a texto: `base64 -w0 upload.jks` (en Mac: `base64 -i upload.jks`).
- En GitHub: **Settings → Secrets and variables → Actions → New repository secret**, crea:
  `ANDROID_KEYSTORE_BASE64` (el texto de arriba), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`.

### c) Anuncios reales (AdMob)
1. Crea tu cuenta en AdMob y registra la app Android.
2. Crea 3 bloques de anuncios: **Banner**, **Intersticial** y **Con recompensa**.
3. En `config.js`: `ads.useTestIds: false` y pega los 3 IDs (`ca-app-pub-…/…`).
4. En `android/app/src/main/res/values/admob.xml`: reemplaza `admob_app_id` por el ID de tu app (`ca-app-pub-…~…`).
5. En AdMob → **Privacidad y mensajes**: crea y publica el mensaje de consentimiento (GDPR) y el de leyes de EE.UU.
   La app lo muestra sola.

### d) Política de privacidad
Completa los datos entre corchetes en `privacidad.html` y borra el aviso de BORRADOR. Incluye la parte de anuncios.

### e) Opiniones
Configura el Google Form como indica el README (sección Retroalimentación) y pega los datos en `config.js`.

## 3. Compilar la versión de tienda (AAB)
**Actions → Android → Run workflow → tipo: release.**
El flujo revisa primero que no queden IDs de prueba ni borradores (`npm run check:release`). Si falta algo, te dice qué.
Al terminar, descarga **caricachupas-release-aab** y súbelo a Play Console.

## 4. Google Play Console
1. Crea la app (nombre y paquete definitivos).
2. **Prueba cerrada**: sube el AAB, agrega **12 o más testers** y mantenlos **14 días seguidos** (requisito de cuentas personales nuevas).
3. Llena: ficha (textos y gráficos en `store/`), política de privacidad (URL de Pages), seguridad de los datos,
   clasificación de contenido, público objetivo (13+), declaración de anuncios. Ver `store/listing-es.md`.
4. Pide acceso a producción y publica.

## 5. Lista de revisión antes de producción
- [ ] APK de prueba probado en 2 teléfonos distintos (voz, ruleta, equipos, anuncios de prueba)
- [ ] Permiso del micrófono: negarlo, concederlo desde Ajustes y volver a jugar
- [ ] Sin internet: el juego abre y los botones ✔ / ✘ funcionan
- [ ] Banner no tapa el botón de jugar; anuncio intersticial solo entre temas
- [ ] `npm run check:release` en verde
- [ ] Versión de tienda instalada desde la prueba cerrada (no solo el APK de prueba)
- [ ] Probar la versión de tienda antes de activar R8 (ofuscación); ver nota en `android/app/build.gradle`

## Notas técnicas
- Apunta a Android 16 (API 36), requisito de Google Play para apps nuevas desde el 31-ago-2026.
- Voz: plugin nativo (`@capacitor-community/speech-recognition`) con un adaptador que imita la Web Speech API
  (`native/speech-adapter.mjs`). Necesita internet en la mayoría de teléfonos.
- Anuncios: `native/ads-controller.mjs` (consentimiento primero; banner solo en jugadores y resultados;
  intersticial al cambiar de tema con tope de frecuencia; con recompensa voluntario).
- La web publicada (GitHub Pages) no cambia: la capa nativa solo se agrega al compilar `www/`.
- Pruebas: `npm test` (Node). Corren solas en GitHub en cada cambio.
