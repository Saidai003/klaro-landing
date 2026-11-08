/* KLARO — configuración editable sin recompilar.
   Cambia estos valores y vuelve a desplegar; no hace falta tocar el resto del código. */
window.KLARO_CONFIG = {
  product: 'KLARO',

  /* Endpoints de registro, en orden de preferencia.
     Opción A (recomendada, gratis): Cloudflare Worker + D1  ->  pega la URL /signup
     Opción B (gratis, sin límites): Google Apps Script -> Google Sheets -> pega la URL doPost
     Opción C: Netlify Forms (solo si despliegas en Netlify; se detecta solo por el dominio)
     Opción D: Formspree / Web3Forms -> pega la URL
     Si ninguno responde, la solicitud se guarda en este dispositivo y se reintenta sola. */
  endpoints: [
    // 'https://klaro-signup.<tu-subdominio>.workers.dev/signup',
    // 'https://script.google.com/macros/s/AKfycb.../exec',
  ],

  /* Netlify Forms: actívalo si despliegas en netlify.app (detección automática por dominio). */
  netlifyForms: true,

  /* URL del checkout externo (opcional). Si está vacío se usa el formulario de la página. */
  checkoutUrl: '',

  /* Oferta de lançamento */
  offer: {
    foundingDiscountPct: 40,
    foundingCredits: 120,
    trialCredits: 10,
  },

  /* Créditos: 1 crédito = 1 minuto de video procesado. */
  plans: [
    {
      id: 'explorer',
      nameKey: 'tierExplorer',
      price: 0,
      credits: 10,
      featured: false,
    },
    {
      id: 'creator',
      nameKey: 'tierCreator',
      price: 19,
      credits: 300,
      featured: true,
    },
    {
      id: 'studio',
      nameKey: 'tierStudio',
      price: 59,
      credits: 1200,
      featured: false,
    },
  ],

  /* Dónde mirar las reservas (opcional, hosting estático). */
  contactEmail: '',
};
