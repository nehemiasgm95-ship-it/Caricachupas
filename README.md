# Caricachupas (prototipo web)

Juego de categorías ("animales con la letra A") con cronómetro, micrófono y juez automático.
Es una PWA sin dependencias: HTML + JS puro.

## Experiencia
- Al abrir la app pide el micrófono antes de nada. Si ya estaba permitido, entra directo; si está bloqueado,
  muestra cómo activarlo y deja reintentar o jugar sin voz (con botones ✔ / ✘).
- Cronómetro circular que cambia de color al acabarse el tiempo, con pitidos en los últimos 3 segundos.
- Aplausos y confeti al acertar; sonido de trombón triste y pantalla sacudida al fallar.
  Los sonidos se generan con Web Audio (sin archivos) y se pueden apagar en "Más ajustes".

## Cómo funciona un turno
1. El juego anuncia el tema y arranca la cuenta regresiva del jugador en turno.
2. El micrófono escucha (Web Speech API, español).
3. **El juez es la propia app**, sin intervención humana. Prueba todas las alternativas que da el reconocedor y decide:
   - Está en la lista del tema, empieza con la letra y no se repitió → válida, pasa al siguiente.
   - Letra equivocada, repetida o fuera de la lista → falla y la pantalla explica por qué.
   - Tolera errores de reconocimiento: plurales, artículos, muletillas ("eh... perro"), h muda, b/v, c/s/z y
     una letra de diferencia en palabras largas.
4. Si falla o se acaba el tiempo: se elimina al jugador o recibe un castigo (según el ajuste).

Las palabras rechazadas por no estar en la lista se guardan en Ajustes ("Palabras que no reconocí"): sirven para
ampliar las listas de `data.js`.

## Ajustes de juego
- **Dificultad** (fácil, medio, difícil, extremo): decide qué temas salen, qué letras (de las que tienen muchas
  palabras a las rarísimas) y sugiere el tiempo por turno.
- **Cambiar de tema después de N vueltas**: si todos responden N veces sin fallar, se pasa al siguiente tema
  sin perdedor. "Hasta que alguien falle" es el modo clásico.
- **Al fallar**: eliminar o castigo.

## Temas (38)
Animales, frutas, países, nombres, comida mexicana, deportes, y populares como Los Simpson, Disney y Pixar,
superhéroes, Pokémon, Dragon Ball, videojuegos, películas, series y caricaturas, cantantes, futbolistas,
equipos y selecciones, dulces y botanas, bebidas, entre otros. Se agregan en `data.js` con su `level` (1 a 3).

Solo se usan nombres en texto, sin logotipos, imágenes ni letras de canciones. Esos nombres pertenecen a sus
dueños y el juego no está afiliado a ellos.

## Probarlo en el teléfono
El micrófono del navegador **solo funciona en HTTPS** (o `localhost`). Opciones:

- **Túnel HTTPS temporal** (lo más rápido):
  `python3 -m http.server 8000` en esta carpeta y, en otra terminal, `npx localtunnel --port 8000`
  (o `cloudflared tunnel --url http://localhost:8000`). Abre la URL https en Chrome del teléfono.
- **USB + Android:** `adb reverse tcp:8000 tcp:8000` y abre `http://localhost:8000` en Chrome del teléfono.
- **GitHub Pages** (URL fija): Settings → Pages → *Deploy from a branch* → elige la rama `main` y la carpeta `/ (root)`.
  Queda en `https://<usuario>.github.io/<repo>/`.

Recomendado: **Chrome en Android**. En iPhone (Safari) el reconocimiento de voz es irregular.

## Archivos
- `logic.js`: normalización y juez automático (sin DOM, probable con Node).
- `data.js`: temas, listas de palabras, niveles de dificultad y castigos. Aquí se agregan categorías.
- `app.js`: pantallas, cronómetro, micrófono y flujo del juego.
- `sfx.js`: aplausos, lamento y pitidos generados con Web Audio.
- `sw.js` / `manifest.json`: instalable y usable sin conexión.

## Pendiente / ideas
- Una palabra válida que falta en la lista se rechaza. Para cubrir todo hace falta un juez con IA, que necesita un
  backend pequeño para guardar la clave de API (una app estática no puede esconderla).
- Packs por país (modismos) y más listas.
- Medir en una fiesta real: ruido, latencia y acentos.
