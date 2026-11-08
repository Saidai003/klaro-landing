/**
 * KLARO — receptor de reservas en Google Sheets (alternativa gratuita, sin límites prácticos).
 *
 * Cómo montarlo (5 minutos, todo gratis):
 *  1. Abre https://sheets.google.com y crea una hoja nueva llamada "KLARO reservas".
 *  2. Menú Extensiones > Apps Script > pega este código > Guardar.
 *  3. "Implementar" > "Nueva implementación" > tipo "Aplicación web" > ejecutar como "Yo" >
 *     "Cualquier persona" > Implementar > copia la URL /exec.
 *  4. Pega esa URL en site/assets/config.js -> endpoints.
 *  5. Añade la hoja a tuDrive y edita los permisos de la web app para que la URL /exec acepte
 *     peticiones POST de cualquier origen (revisar que el despliegue esté en "Cualquier persona").
 *
 * Nota: la primera vez que se ejecute la app web, Google puede pedir autorización. Acepta.
 */

const SHEET_NAME = 'KLARO reservas';

function doGet(e) {
  return json({ ok: true, count: countLeads() });
}

function doPost(e) {
  let payload = {};
  try {
    payload = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return json({ ok: false, error: 'invalid-json' }, 400);
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return json({ ok: false, error: 'invalid-email' }, 400);
  }
  if (!payload.consent) {
    return json({ ok: false, error: 'no-consent' }, 400);
  }

  const sheet = getSheet();
  sheet.appendRow([
    new Date().toISOString(),
    email,
    payload.name || '',
    payload.role || '',
    payload.useCase || '',
    payload.locale || 'es',
    payload.ref || '',
    (payload.behavior && payload.behavior.secondsOnPage) || 0,
    (payload.behavior && payload.behavior.maxScrollDepth) || 0,
    (payload.behavior && payload.behavior.demoUsed) ? 'sí' : 'no',
    (payload.analysis && payload.analysis.silenceSeconds) || '',
    (payload.analysis && payload.analysis.lufs) || '',
    (payload.analysis && payload.analysis.meanLuma) || '',
    (payload.signals && payload.signals.device && payload.signals.device.platform) || '',
    (payload.signals && payload.signals.gpu && payload.signals.gpu.renderer) || '',
    JSON.stringify(payload.source || {}),
  ]);

  return json({ ok: true, email, count: countLeads() });
}

function json(obj, code) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'fecha', 'email', 'nombre', 'rol', 'uso', 'idioma', 'referido',
      'segundos_en_pagina', 'scroll_profundidad', 'uso_demo',
      'silencio_s', 'lufs', 'brillo', 'sistema', 'gpu', 'origen'
    ]);
  }
  return sheet;
}

function countLeads() {
  const sheet = getSheet();
  return Math.max(0, sheet.getLastRow() - 1);
}
