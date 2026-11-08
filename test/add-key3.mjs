// Añade el vocabulario restante de las señales a los 9 idiomas.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'site/assets/i18n';

const WORDS = {
  'es.json':    { 'level2.wordSections': 'secciones', 'level2.noFile': 'sin archivo cargado', 'level2.wordSilence': 's de silencio', 'level2.wordPeak': 'pico' },
  'en.json':    { 'level2.wordSections': 'sections', 'level2.noFile': 'no file loaded', 'level2.wordSilence': 's of silence', 'level2.wordPeak': 'peak' },
  'de.json':    { 'level2.wordSections': 'Abschnitte', 'level2.noFile': 'keine Datei geladen', 'level2.wordSilence': 's Stille', 'level2.wordPeak': 'Spitze' },
  'fr.json':    { 'level2.wordSections': 'sections', 'level2.noFile': 'aucun fichier chargé', 'level2.wordSilence': 's de silence', 'level2.wordPeak': 'crête' },
  'it.json':    { 'level2.wordSections': 'sezioni', 'level2.noFile': 'nessun file caricato', 'level2.wordSilence': 's di silenzio', 'level2.wordPeak': 'picco' },
  'pt-BR.json': { 'level2.wordSections': 'seções', 'level2.noFile': 'nenhum arquivo carregado', 'level2.wordSilence': 's de silêncio', 'level2.wordPeak': 'pico' },
  'zh-Hans.json': { 'level2.wordSections': '个板块', 'level2.noFile': '未加载文件', 'level2.wordSilence': '秒静音', 'level2.wordPeak': '峰值' },
  'ja.json':    { 'level2.wordSections': 'セクション', 'level2.noFile': 'ファイル未読み込み', 'level2.wordSilence': '秒の無音', 'level2.wordPeak': 'ピーク' },
  'ko.json':    { 'level2.wordSections': '개 섹션', 'level2.noFile': '로드된 파일 없음', 'level2.wordSilence': '초 정적', 'level2.wordPeak': '피크' },
};

for (const [file, entries] of Object.entries(WORDS)) {
  const path = join(DIR, file);
  const json = JSON.parse(await readFile(path, 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(json)) {
    out[k] = v;
    if (k === 'level2.unavailable') {
      for (const [nk, nv] of Object.entries(entries)) out[nk] = nv;
    }
  }
  for (const [nk, nv] of Object.entries(entries)) if (!(nk in out)) out[nk] = nv;
  await writeFile(path, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`${file}: ${Object.keys(out).length} claves`);
}
