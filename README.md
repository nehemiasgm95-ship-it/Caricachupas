# Caricachupas (prototipo web)

Juego de categorías ("animales con la letra A") con cronómetro, micrófono y juez automático.
Es una PWA sin dependencias: HTML + JS puro.

## Inicio de partida
- **🎲 Automático** (por defecto): pones los nombres y una **ruleta** elige la dificultad; otra ruleta elige quién
  empieza. El orden de turnos se mezcla y quien abre cada tema nuevo también es aleatorio.
- **🎛️ Manual**: eliges dificultad, vueltas, tiempo y qué pasa al fallar; solo gira la ruleta de quién empieza.
- El tema se anuncia y el reloj corre enseguida, sin pausa para pensar.

## Retos, comodines y puntos
- **Retos sorpresa** (≈40 % de los temas, desde el 2.º): ⚡ Relámpago (−2 s), 🐢 Tranquilo (+3 s), 🔄 Al revés
  (el turno gira al otro lado), 💎 Doble puntos, 📏 Palabras largas (7+ letras) y ✂️ Palabras cortas (máx. 5).
  El juez los aplica solo. Se apagan en "Más ajustes".
- **Comodines** (uno de cada por jugador y partida): ⏱️ +4 s y ⏭️ Pasar.
- **Puntos:** 10 por acierto + hasta 5 por rapidez + 3 por cada acierto seguido (máx. 12), por el multiplicador del reto.
- **Castigos con ruleta:** en modo castigo gira una ruleta de 8 castigos al azar; puedes añadir los tuyos en "Más ajustes".
- **Resultados:** marcador, campeón y premios (⚡ más rápido, 🔥 mejor racha, 🧠 más aciertos, 😅 más fallas).

## Modo equipos
- 👥 **Equipos** (junto a "Individual"): dos equipos, 🔴 Rojo y 🔵 Azul. Se reparten al azar y equilibrados; toca a un
  jugador para cambiarlo de equipo o usa 🎲 Mezclar.
- Los turnos se alternan entre equipos. Los puntos de cada acierto suman al equipo.
- Al fallar: con **Vidas** el equipo pierde ❤️ (3 por equipo) y gana el otro al quedarse sin vidas; con **Castigo**
  gira la ruleta y se decide por puntos al ver los resultados.

## Instalar como app (PWA)
- Chrome (Android): aparece el botón **📲 Instalar app** (bienvenida y "Más ajustes"), o menú ⋮ → *Instalar aplicación*.
  iPhone (Safari): Compartir ⬆️ → *Añadir a pantalla de inicio* (la app lo recuerda con un aviso).
- Íconos 192/512, *maskable* y de iPhone en `icons/`; funciona sin conexión; siempre intenta traer la versión más
  nueva primero (red primero, caché de respaldo); mantiene la pantalla encendida durante la partida.
- Nota: el reconocimiento de voz de Chrome usa internet. Sin conexión el juego abre pero hay que usar ✔ / ✘.

## Micrófono
- **🔊 Probar micrófono** (Más ajustes): medidor de volumen en vivo con veredicto (bajo / bien / muy fuerte) y prueba
  de reconocimiento que muestra lo que entendió.
- **🎙️ Micrófono continuo por tema** (prueba): una sola apertura por tema, sin pitido ni retraso en cada turno.
  Lo dicho antes del turno se ignora y se cierra al terminar el tema.

## Retroalimentación
Botón **💬 Tu opinión** (inicio y resultados): calificación con caritas, tipo (idea / error / falta algo / me gustó),
mensaje, contacto opcional y, si la persona lo permite, las palabras que el juego no reconoció. Sin internet, se guarda
y se envía al reconectar.

Para recibirlas (gratis, sin servidor): crea un **Google Form** con 6 preguntas de respuesta corta (calificación, tipo,
mensaje, contacto, palabras, versión), obtén su enlace con *Obtener enlace prellenado* para ver los `entry.XXXXXX` de
cada pregunta y llena `config.js` (`formUrl` = la URL del formulario terminada en `/formResponse`, y `fields`).
Las respuestas llegan a una hoja de cálculo. Mientras no esté configurado, la app ofrece *Compartir* el mensaje
(WhatsApp, correo…) o copiarlo.

`privacidad.html` es un **borrador** de política de privacidad (Google Play exige un enlace público): completa los datos
entre corchetes antes de usarla.

## App Android y Google Play
Hay una versión Android (Capacitor) con voz nativa y anuncios (AdMob). Guía completa en **[ANDROID.md](ANDROID.md)**.
Los materiales de la ficha (ícono, gráfico, capturas y textos) están en `store/`. `npm test` corre las pruebas.

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
- `wheel.js`: ruleta SVG (dibujo, giro con desaceleración y sector ganador).
- `sfx.js`: aplausos, lamento y pitidos generados con Web Audio.
- `sw.js` / `manifest.json`: instalable y usable sin conexión.

## Pendiente / ideas
- Una palabra válida que falta en la lista se rechaza. Para cubrir todo hace falta un juez con IA, que necesita un
  backend pequeño para guardar la clave de API (una app estática no puede esconderla).
- Packs por país (modismos) y más listas.
- Medir en una fiesta real: ruido, latencia y acentos.
