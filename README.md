# KLARO — landing de validación

Landing page de un producto hipotético que limpia el audio y el brillo de un video ya grabado:
recorta silencios incómodos, iguala el nivel de las voces y corrige el brillo cuadro a cuadro.

Estructura de la idea: la página **no vende un editor**, vende el resultado. El visitante mete su
propio video y ve el diagnóstico real en su navegador antes de dejar su correo. El formulario da
créditos de prueba y bloquea un precio de lanzamiento.

## Qué hace la página

- **Demo real en el navegador** (sin backend, sin subir archivos): con la Web Audio API mide
  silencios, loudness integrado (K-weighting + gating, aprox. BS.1770), pico y picos recortados;
  con un `<video>` + canvas mide la luminancia media por cuadro y su variación.
- **Fragmento limpio reproducible**: reconstruye el audio sin los silencios detectados y lo
  reproduce, para que se oiga la diferencia sin instalar nada.
- **Señales del dispositivo**: GPU/renderer, códecs soportados, frecuencia de muestreo, latencia,
  pantalla, red, comportamiento en la página. Todo visible para el visitante en "Ver mis datos".
- **Registro** de reservas con esos datos, más un contador público de reservas.
- **9 idiomas** con autodetección desde `navigator.languages` y selector manual.

## Estructura

```
voicefix-landing/
├── site/                      # sitio estático (lo que se despliega)
│   ├── index.html
│   └── assets/
│       ├── styles.css
│       ├── app.js             # i18n + demo + señales + registro
│       ├── config.js          # configuración editable sin recompilar
│       └── i18n/              # es en de fr it pt-BR zh-Hans ja ko
├── backend/
│   ├── worker/                # Cloudflare Worker + D1 (recomendado)
│   │   ├── src/index.js
│   │   ├── schema.sql
│   │   └── wrangler.toml
│   └── google-apps-script/    # alternativa: Google Sheets
├── server.mjs                 # servidor local (site + /signup a JSONL)
├── netlify.toml
└── test/
    ├── e2e.py                 # suite Playwright (18 comprobaciones)
    ├── i18n-check.mjs         # paridad de claves entre idiomas
    └── shots.py               # capturas de cada sección
```

## Desarrollo local

```bash
node server.mjs          # http://localhost:4321
python test/e2e.py es-ES # suite completa
node test/i18n-check.mjs # paridad de traducciones
```

El servidor local guarda las reservas en `data/leads.jsonl`.

## Publicar

El sitio es estático: vale cualquier hosting con archivos y HTTPS. Opciones gratuitas,
de mejor a peor para este caso:

| Opción | Hosting | Registros | Notas |
|---|---|---|---|
| **Cloudflare Pages + Worker + D1** | Pages (gratis, ancho de banda ilimitado) | D1 (5 GB, 100k escrituras/día) | Un solo dominio, sin límites reales para validar |
| **Netlify** | Netlify (gratis) | Netlify Forms (gratis) | Lo detecta solo por el dominio, cero backend |
| **Cloudflare Pages solo** | Pages | Cola en `localStorage` + reintento | Los registros no salen del navegador hasta que configures un endpoint |
| **Google Sites / GitHub Pages** | Gratis | Igual que el anterior | Funciona, pero sin formulario nativo |

### Cloudflare Pages + Worker + D1 (recomendado)

```bash
# 1. sitio
npm i -g wrangler
wrangler login
cd backend/worker
wrangler d1 create klaro-leads          # copia el database_id a wrangler.toml
wrangler d1 execute klaro-leads --file=./schema.sql
wrangler deploy                         # -> https://klaro-signup.<tu>.workers.dev

# 2. conectar el sitio
#    en site/assets/config.js:
#    endpoints: ['https://klaro-signup.<tu>.workers.dev/signup']
```

### Google Sheets (sin tocar un terminal)

1. Crea una hoja en <https://sheets.google.com> llamada `KLARO reservas`.
2. Extensiones → Apps Script → pega `backend/google-apps-script/Code.gs` → Implementar → Aplicación web → "Cualquier persona".
3. Copia la URL `/exec` y ponla en `site/assets/config.js` → `endpoints`.

### Netlify

```bash
npm i -g netlify-cli
netlify deploy --dir=site --prod
```

El formulario se detecta solo en dominios `*.netlify.app` y las reservas aparecen en el panel de Netlify.

## Configuración

Todo editable en `site/assets/config.js`:

```js
window.KLARO_CONFIG = {
  endpoints: ['https://.../signup'],  // se prueban en orden
  offer: { foundingDiscountPct: 40, foundingCredits: 120, trialCredits: 10 },
  plans: [ { id, nameKey, price, credits, featured } ],
};
```

Si ningún endpoint responde, la reserva se guarda en `localStorage` y se reintenta sola al
volver la conexión. No se pierde ninguna.

## Referidos

`?ref=codigo` marca la reserva con el referido y muestra el aviso de créditos compartida.
El contador público usa `GET <base>/count`.

## Privacidad

- El video **nunca** se sube: se analiza con las APIs del navegador y se descarta al cerrar la pestaña.
- Se guardan el correo y las medidas técnicas de la visita, visibles para el visitante en "Ver mis datos".
- Sin cookies de seguimiento ni perfilado fuera de esta página.
