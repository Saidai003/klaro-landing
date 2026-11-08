// Etiquetas de la vista previa de datos (panel lateral del formulario).
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'site/assets/i18n';

const WORDS = {
  'es.json':    { 'level2.previewEmail': 'Email (se rellena en el formulario)', 'level2.previewLocale': 'Idioma', 'level2.previewSystem': 'Sistema', 'level2.previewAudio': 'Audio', 'level2.previewScreen': 'Pantalla', 'level2.previewCodecs': 'Códecs', 'level2.previewBehavior': 'Comportamiento', 'level2.previewFile': 'Archivo analizado' },
  'en.json':    { 'level2.previewEmail': 'Email (filled in the form)', 'level2.previewLocale': 'Language', 'level2.previewSystem': 'System', 'level2.previewAudio': 'Audio', 'level2.previewScreen': 'Screen', 'level2.previewCodecs': 'Codecs', 'level2.previewBehavior': 'Behaviour', 'level2.previewFile': 'Analysed file' },
  'de.json':    { 'level2.previewEmail': 'E-Mail (im Formular auszufüllen)', 'level2.previewLocale': 'Sprache', 'level2.previewSystem': 'System', 'level2.previewAudio': 'Audio', 'level2.previewScreen': 'Bildschirm', 'level2.previewCodecs': 'Codecs', 'level2.previewBehavior': 'Verhalten', 'level2.previewFile': 'Analysierte Datei' },
  'fr.json':    { 'level2.previewEmail': 'E-mail (à remplir dans le formulaire)', 'level2.previewLocale': 'Langue', 'level2.previewSystem': 'Système', 'level2.previewAudio': 'Audio', 'level2.previewScreen': 'Écran', 'level2.previewCodecs': 'Codecs', 'level2.previewBehavior': 'Comportement', 'level2.previewFile': 'Fichier analysé' },
  'it.json':    { 'level2.previewEmail': 'Email (da compilare nel modulo)', 'level2.previewLocale': 'Lingua', 'level2.previewSystem': 'Sistema', 'level2.previewAudio': 'Audio', 'level2.previewScreen': 'Schermo', 'level2.previewCodecs': 'Codec', 'level2.previewBehavior': 'Comportamento', 'level2.previewFile': 'File analizzato' },
  'pt-BR.json': { 'level2.previewEmail': 'E-mail (a preencher no formulário)', 'level2.previewLocale': 'Idioma', 'level2.previewSystem': 'Sistema', 'level2.previewAudio': 'Áudio', 'level2.previewScreen': 'Tela', 'level2.previewCodecs': 'Codecs', 'level2.previewBehavior': 'Comportamento', 'level2.previewFile': 'Arquivo analisado' },
  'zh-Hans.json': { 'level2.previewEmail': '邮箱（在表单中填写）', 'level2.previewLocale': '语言', 'level2.previewSystem': '系统', 'level2.previewAudio': '音频', 'level2.previewScreen': '屏幕', 'level2.previewCodecs': '编解码器', 'level2.previewBehavior': '行为', 'level2.previewFile': '已分析文件' },
  'ja.json':    { 'level2.previewEmail': 'メール（フォームで入力）', 'level2.previewLocale': '言語', 'level2.previewSystem': 'OS', 'level2.previewAudio': 'オーディオ', 'level2.previewScreen': '画面', 'level2.previewCodecs': 'コーデック', 'level2.previewBehavior': '行動', 'level2.previewFile': '解析したファイル' },
  'ko.json':    { 'level2.previewEmail': '이메일(양식에서 입력)', 'level2.previewLocale': '언어', 'level2.previewSystem': '시스템', 'level2.previewAudio': '오디오', 'level2.previewScreen': '화면', 'level2.previewCodecs': '코덱', 'level2.previewBehavior': '행동', 'level2.previewFile': '분석한 파일' },
};

for (const [file, entries] of Object.entries(WORDS)) {
  const path = join(DIR, file);
  const json = JSON.parse(await readFile(path, 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(json)) {
    out[k] = v;
    if (k === 'level2.wordPeak') {
      for (const [nk, nv] of Object.entries(entries)) out[nk] = nv;
    }
  }
  for (const [nk, nv] of Object.entries(entries)) if (!(nk in out)) out[nk] = nv;
  await writeFile(path, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`${file}: ${Object.keys(out).length} claves`);
}
