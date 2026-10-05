# Trendy Experiences — sitio web

Sitio oficial de **Trendy Experiences**, estudio de videojuegos con estética *Tropical Azul Nocturna*, y de su primer juego, **EL CLUB**.

Es un sitio estático: HTML, CSS y JavaScript sin dependencias ni paso de build. Todo el arte (playa, antro, zonas, póster) se dibuja en vivo con `<canvas>` y la música del antro se sintetiza con Web Audio, así que no hay imágenes ni audios externos.

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
| `assets/js/scenes.js` | Escenas animadas en canvas (hero, póster y las 5 zonas del antro) |
| `assets/js/audio.js` | Groove house tropical a 122 BPM; se oye "desde afuera" y se abre al entrar a las zonas |
| `assets/js/main.js` | Preloader, neón, scroll horizontal, cursor, modal, formulario y pulsera |

## Pendientes para producción

- **Formulario de la lista**: hoy solo guarda la pulsera en el navegador. Conecta tu servicio redefiniendo `TE.submitToList(email)` en `assets/js/main.js` (debe devolver una promesa).
- **Redes sociales**: los enlaces del footer tienen `href="#"`; cambia por las URLs reales.
- **Tráiler**: el botón abre un aviso de "viene en camino"; reemplázalo por el video cuando exista.
- **Noticias**: las tres tarjetas son ejemplos; edita títulos, fechas y enlaces.
