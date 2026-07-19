# FAHRENHEIT // 華氏

Photography portfolio for **Fahrenheit** — vintage-hardware photography, streetwear &
vintage-styled subjects. Stationed in Rapid City, South Dakota.

Glitchcore / circuit-bent aesthetic with Japanese & Korean accents. Static site — no build step.

## Features
- WebGL living background: the photos are warped by drifting refraction orbs and
  recolored with intense, slowly-shifting circuit-bent false color.
- Circuit-bent text that samples the real background color and renders its complement,
  so text never blends into the background.
- Seamless crossfading ambient audio with a mellow Web Audio FX chain.
- Organized galleries (Subjects / Field), lightbox, page transitions.
- Booking page that emails Fahrenheit.Support@gmail.com.

## Run locally
Double-click **`Launch Fahrenheit.bat`** (Windows), or from any static server:

```
python -m http.server 8777
```

then open <http://127.0.0.1:8777/index.html>.

## Structure
```
index.html          hero, dossier, galleries, contact CTA
contact.html        booking form
css/style.css       theme (sharp edges, embedded fonts, circuit-bent text vars)
js/bggl.js          WebGL warped/circuit-bent background + bg color sampling
js/vfx.js           overlay iridescent orbs + glitch bursts
js/audio.js         crossfading ambient audio engine
js/main.js          entrance, transitions, glitch title, text-hue driver, gallery
js/contact.js       booking form -> email delivery
assets/             optimized images, audio, embedded fonts
```
