// Comprueba que los 9 archivos i18n tienen el mismo conjunto y orden de claves,
// y que ninguna traducción conserva placeholders rotos o textos en español sin localizar.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'site/assets/i18n';
const FILES = ['es.json', 'en.json', 'de.json', 'fr.json', 'it.json', 'pt-BR.json', 'zh-Hans.json', 'ja.json', 'ko.json'];

const es = JSON.parse(await readFile(join(DIR, 'es.json'), 'utf8'));
const esKeys = Object.keys(es);
const PLACEHOLDER = /\{(\w+)\}/g;

let failures = 0;
const fail = (m) => { console.log('FALLO: ' + m); failures++; };

for (const f of FILES) {
  const raw = await readFile(join(DIR, f), 'utf8');
  if (raw.charCodeAt(0) !== 0x7b) fail(`${f}: empieza con BOM o caracter invalido`);
  const j = JSON.parse(raw);
  const keys = Object.keys(j);

  if (keys.length !== esKeys.length) fail(`${f}: ${keys.length} claves vs ${esKeys.length} en es.json`);
  for (let i = 0; i < Math.min(keys.length, esKeys.length); i++) {
    if (keys[i] !== esKeys[i]) { fail(`${f}: orden divergente en la posicion ${i} (${keys[i]} vs ${esKeys[i]})`); break; }
  }

  for (const k of esKeys) {
    const ph = (String(es[k]).match(PLACEHOLDER) || []).sort().join(',');
    const phT = (String(j[k] ?? '').match(PLACEHOLDER) || []).sort().join(',');
    if (ph !== phT) fail(`${f}: placeholders distintos en "${k}" (${ph} vs ${phT})`);
    if (typeof j[k] !== 'string' || !j[k].trim()) fail(`${f}: valor vacio en "${k}"`);
  }
}

// Ninguna traduccion (salvo es/en) debe conservar palabras inglesas o espanolas de la interfaz.
const LEAKS = ['núcleos', 'canales', 'secciones', 'sin archivo', 'Comportamiento', 'Archivo analizado', 'Idioma', 'Pantalla'];
for (const f of FILES.filter((x) => !['es.json', 'en.json', 'it.json', 'pt-BR.json'].includes(x))) {
  const j = JSON.parse(await readFile(join(DIR, f), 'utf8'));
  for (const [k, v] of Object.entries(j)) {
    if (typeof v !== 'string') continue;
    for (const leak of LEAKS) {
      if (v.includes(leak)) fail(`${f}: "${k}" contiene texto sin localizar -> "${leak}"`);
    }
  }
}

console.log(failures === 0 ? `OK: ${FILES.length} idiomas, ${esKeys.length} claves, paridad completa` : `${failures} fallos`);
process.exit(failures ? 1 : 0);
