// Prueba end-to-end de la landing KLARO con Playwright.
//   node test/e2e.mjs [locale]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE || 'http://localhost:4321';
const locale = process.argv[2] || 'es-ES';
const OUT = 'test/shots';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  locale,
  permissions: [],
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 1. idioma detectado
const htmlLang = await page.getAttribute('html', 'lang');
check('idioma autodetectado desde el navegador', htmlLang === locale.split('-')[0] || htmlLang === 'zh-Hans', `lang=${htmlLang}`);

// 2. no quedan claves sin traducir visibles
const raw = await page.evaluate(() => document.body.innerText);
check('sin claves i18n sin traducir en pantalla', !raw.includes('data-i18n') && !raw.includes('level1.'), '');

// 3. textos traducidos presentes
const heroTitle = await page.textContent('.hero h1');
check('titulo hero localizado', heroTitle && heroTitle.trim().length > 20, heroTitle?.trim().slice(0, 60));

// 4. panel de señales poblado
const sigCount = await page.locator('#signal-list li').count();
check('8 señales del navegador medidas', sigCount === 8, `li=${sigCount}`);

const sigText = await page.textContent('#signal-list li:nth-child(2) .sig-v');
check('señal GPU con valor real', !!sigText && sigText.trim() !== '—' && sigText.trim().length > 3, sigText?.trim().slice(0, 50));

// 5. planes renderizados con precios
const planCount = await page.locator('#plans .plan').count();
const priceText = await page.textContent('#plans .plan-price b');
check('3 planes con precio', planCount === 3 && /[$€£¥]|\d/.test(priceText || ''), `planes=${planCount} precio=${priceText}`);

// 6. FAQ
const faqCount = await page.locator('#faq-list details').count();
check('FAQ con 6 preguntas', faqCount === 6, `details=${faqCount}`);

// 7. demo: análisis de un clip generado
await page.click('#use-sample');
await page.waitForTimeout(6000);
const silence = await page.textContent('#ro-silence');
const lufs = await page.textContent('#ro-lufs');
const bright = await page.textContent('#ro-bright');
check('demo analiza audio real', silence && silence !== '—' && /s$/.test(silence.trim()), `silencio=${silence}`);
check('demo calcula nivel integrado', lufs && /LUFS/.test(lufs), `lufs=${lufs}`);
check('demo calcula brillo por cuadro', bright && bright !== '—', `brillo=${bright}`);

const playDisabled = await page.getAttribute('#play-clean', 'disabled');
check('boton de fragmento limpio habilitado', playDisabled === null, `disabled=${playDisabled}`);

// 8. captura de señal post-demo
const sigAnalysis = await page.textContent('#signal-list li:nth-child(8) .sig-v');
check('señal de analisis actualizada', !!sigAnalysis && sigAnalysis.indexOf('sin archivo') === -1, sigAnalysis?.trim().slice(0, 50));

// 9. envío del formulario
await page.fill('#f-email', 'prueba@ejemplo.com');
await page.fill('#f-name', 'Prueba QA');
await page.check('#f-consent');
await page.click('#submit-btn');
await page.waitForTimeout(2500);

const successVisible = await page.isVisible('#success');
const successText = successVisible ? await page.textContent('#success-body') : '';
check('registro completado con exito', successVisible, successText?.trim().slice(0, 80));

// 10. el lead llegó al backend
const count = await (await fetch(BASE + '/count')).json();
check('lead persistido en el backend', count.count >= 1, `count=${count.count}`);

await page.screenshot({ path: `${OUT}/full-${locale}.png`, fullPage: true });
await page.screenshot({ path: `${OUT}/hero-${locale}.png` });

// 11. vista móvil
const mob = await ctx.newPage();
await mob.setViewportSize({ width: 390, height: 844 });
await mob.goto(BASE + '/', { waitUntil: 'networkidle' });
await mob.waitForTimeout(900);
await mob.screenshot({ path: `${OUT}/mobile-${locale}.png` });
const hOverflow = await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
check('sin desbordamiento horizontal en movil', !hOverflow, '');

check('sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones OK`);
if (failed.length) {
  console.log('FALLOS:');
  failed.forEach((f) => console.log(' - ' + f.name + (f.detail ? ' :: ' + f.detail : '')));
  process.exit(1);
}
