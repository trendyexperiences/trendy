# Trendy Experiences — sitio web

Sitio oficial de **Trendy Experiences**, estudio de videojuegos con estética *Tropical Azul Nocturna*, y de su primer juego, **EL CLUB**.

Es un sitio estático: HTML, CSS y JavaScript sin dependencias ni paso de build. Todo el arte se dibuja en vivo con `<canvas>` y la música se sintetiza en el navegador con Web Audio, así que no hay imágenes ni audios externos.

Recorrido: **Entrada** (con o sin sonido) · **Inicio** (Trendy Experiences) · **Juegos** (zoom a través de la luna del logo hacia EL CLUB y sus cinco zonas) · **Estudio** (DEVELOPING FANTASY: letras que funcionan como ventana a una escena de luz) · **Contacto**.

## Verlo en local

```bash
npx serve .          # o: python3 -m http.server 8000
```

Abre `http://localhost:3000` (o el puerto que indique).

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `index.html` | Contenido y secciones del sitio |
| `assets/css/styles.css` | Paleta, tipografía y todos los estilos |
| `assets/js/scenes.js` | Escenas animadas en canvas (costa del inicio, luz de DEVELOPING FANTASY y las 5 zonas de EL CLUB) |
| `assets/js/audio.js` | Groove house tropical a 122 BPM; suena apagado "desde afuera" y se abre al cruzar la luna |
| `assets/js/main.js` | Puerta de entrada, portal de la luna, zonas con autoplay, DEVELOPING FANTASY, menú, efectos de texto y botones, copiar correo |

## Contacto

El correo del sitio es `trendyexperiences@gmail.com` (sección Contacto de `index.html`).
