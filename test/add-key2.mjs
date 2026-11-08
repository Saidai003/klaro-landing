// Inserta claves de vocabulario para los valores de señal (palabras, no frases) en los 9 idiomas.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'site/assets/i18n';

const WORDS = {
  'es.json':    { 'level2.wordCores': 'núcleos', 'level2.wordChannels': 'canales', 'level2.wordMobile': 'móvil', 'level2.unavailable': 'no disponible' },
  'en.json':    { 'level2.wordCores': 'cores', 'level2.wordChannels': 'channels', 'level2.wordMobile': 'mobile', 'level2.unavailable': 'not available' },
  'de.json':    { 'level2.wordCores': 'Kerne', 'level2.wordChannels': 'Kanäle', 'level2.wordMobile': 'Mobil', 'level2.unavailable': 'nicht verfügbar' },
  'fr.json':    { 'level2.wordCores': 'cœurs', 'level2.wordChannels': 'canaux', 'level2.wordMobile': 'mobile', 'level2.unavailable': 'indisponible' },
  'it.json':    { 'level2.wordCores': 'core', 'level2.wordChannels': 'canali', 'level2.wordMobile': 'mobile', 'level2.unavailable': 'non disponibile' },
  'pt-BR.json': { 'level2.wordCores': 'núcleos', 'level2.wordChannels': 'canais', 'level2.wordMobile': 'móvel', 'level2.unavailable': 'indisponível' },
  'zh-Hans.json': { 'level2.wordCores': '核', 'level2.wordChannels': '声道', 'level2.wordMobile': '移动设备', 'level2.unavailable': '不可用' },
  'ja.json':    { 'level2.wordCores': 'コア', 'level2.wordChannels': 'チャンネル', 'level2.wordMobile': 'モバイル', 'level2.unavailable': '利用不可' },
  'ko.json':    { 'level2.wordCores': '코어', 'level2.wordChannels': '채널', 'level2.wordMobile': '모바일', 'level2.unavailable': '사용 불가' },
};

for (const [file, entries] of Object.entries(WORDS)) {
  const path = join(DIR, file);
  const json = JSON.parse(await readFile(path, 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(json)) {
    out[k] = v;
    // se insertan tras la última clave "level2.signal*" para no romper el orden de bloque
    if (k === 'level2.signalAnalysisDesc') {
      for (const [nk, nv] of Object.entries(entries)) out[nk] = nv;
    }
  }
  // por si el ancla no existiera
  for (const [nk, nv] of Object.entries(entries)) if (!(nk in out)) out[nk] = nv;

  await writeFile(path, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`${file}: ${Object.keys(out).length} claves`);
}
