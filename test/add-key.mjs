// Inserta la clave 'level1.legendClean' en todos los archivos i18n, tras 'level1.silenceLabel',
// manteniendo el orden de claves alineado entre idiomas.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'site/assets/i18n';
const LABEL = {
  'es.json': 'Fragmento limpio',
  'en.json': 'Clean fragment',
  'de.json': 'Sauberes Fragment',
  'fr.json': 'Fragment nettoyé',
  'it.json': 'Frammento ripulito',
  'pt-BR.json': 'Trecho limpo',
  'zh-Hans.json': '干净片段',
  'ja.json': 'クリーンな音声',
  'ko.json': '정돈된 구간',
};

for (const [file, value] of Object.entries(LABEL)) {
  const path = join(DIR, file);
  const raw = await readFile(path, 'utf8');
  const json = JSON.parse(raw);
  if ('level1.legendClean' in json) { console.log(`${file}: ya existe`); continue; }

  const out = {};
  for (const [k, v] of Object.entries(json)) {
    out[k] = v;
    if (k === 'level1.silenceLabel') out['level1.legendClean'] = value;
  }
  await writeFile(path, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`${file}: insertada (${Object.keys(out).length} claves)`);
}
