# Trendy Experiences — sitio web

Sitio oficial de **Trendy Experiences**, estudio de videojuegos con estética *Tropical Azul Nocturna*, y de su primer juego, **EL CLUB**.

Es un sitio estático: HTML, CSS y JavaScript sin dependencias ni paso de build. Todo el arte (la costa de noche y las zonas de EL CLUB) se dibuja en vivo con `<canvas>`, así que no hay imágenes externas.

Secciones: **Inicio** (Trendy Experiences) · **Juegos** (EL CLUB con sus cinco zonas) · **Estudio** · **Contacto**.

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
| `assets/js/scenes.js` | Escenas animadas en canvas (costa del inicio y las 5 zonas de EL CLUB) |
| `assets/js/main.js` | Menú, entrada del hero, zonas con autoplay, manifiesto, copiar correo |

## Antes de publicar

- **Correo de contacto**: `hola@trendyexperiences.com` es provisional. Reemplázalo en `index.html` (aparece en la sección Contacto).
- **Redes sociales**: cuando existan, se pueden agregar al footer.
