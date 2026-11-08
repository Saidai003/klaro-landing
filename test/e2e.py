"""Prueba end-to-end de la landing KLARO con Playwright.

    python test/e2e.py [locale]

Cubre: autodeteccion de idioma, render de senales/planes/FAQ, demo real de analisis
de audio y video, envio del formulario y persistencia del lead en el backend.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:4321"
LOCALE = sys.argv[1] if len(sys.argv) > 1 else "es-ES"
OUT = Path(__file__).parent / "shots"
OUT.mkdir(parents=True, exist_ok=True)

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS  " if ok else "FAIL  ") + name + ((" — " + str(detail)) if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(locale=LOCALE, viewport={"width": 1440, "height": 900})
    page = ctx.new_page()

    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)))

    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_timeout(1500)

    # 1. idioma autodetectado (los locales regionales se aceptan tal cual)
    html_lang = page.get_attribute("html", "lang")
    base = LOCALE.split("-")[0].lower()
    expected = {"zh": "zh-Hans"}.get(base, base)
    ok_lang = html_lang == expected or html_lang == LOCALE or html_lang.lower() == LOCALE.lower()
    check("idioma autodetectado desde el navegador", ok_lang, f"lang={html_lang} esperado~{LOCALE}")

    # 2. sin claves i18n sin traducir visibles
    body_text = page.inner_text("body")
    check("sin claves i18n sin traducir en pantalla", "data-i18n" not in body_text and "level1." not in body_text)

    # 3. hero localizado
    hero_title = (page.text_content(".hero h1") or "").strip()
    check("titulo hero localizado", len(hero_title) > 20, hero_title[:60])

    # 4. senales medidas
    sig_count = page.locator("#signal-list li").count()
    check("8 senales del navegador medidas", sig_count == 8, f"li={sig_count}")

    gpu = (page.text_content("#signal-list li:nth-child(2) .sig-v") or "").strip()
    check("senal GPU con valor real", gpu not in ("", "—") and len(gpu) > 3, gpu[:50])

    audio_sig = (page.text_content("#signal-list li:nth-child(3) .sig-v") or "").strip()
    check("senal de audio con frecuencia de muestreo", "Hz" in audio_sig, audio_sig[:50])

    # 5. planes
    plan_count = page.locator("#plans .plan").count()
    price_text = (page.text_content("#plans .plan-price b") or "").strip()
    check("3 planes con precio", plan_count == 3 and any(c.isdigit() for c in price_text), f"planes={plan_count} precio={price_text}")

    # 6. FAQ
    faq_count = page.locator("#faq-list details").count()
    check("FAQ con 6 preguntas", faq_count == 6, f"details={faq_count}")

    # 7. demo real
    page.click("#use-sample")
    page.wait_for_timeout(7000)
    silence = (page.text_content("#ro-silence") or "").strip()
    lufs = (page.text_content("#ro-lufs") or "").strip()
    bright = (page.text_content("#ro-bright") or "").strip()
    peak = (page.text_content("#ro-peak") or "").strip()
    check("demo analiza audio real (silencio medido)", silence not in ("", "—") and silence.endswith("s"), f"silencio={silence}")
    check("demo calcula nivel integrado", "LUFS" in lufs, f"lufs={lufs}")
    check("demo calcula pico y brillo", peak not in ("", "—") and bright not in ("", "—"), f"pico={peak} brillo={bright}")

    play_disabled = page.get_attribute("#play-clean", "disabled")
    check("boton de fragmento limpio habilitado", play_disabled is None, f"disabled={play_disabled}")

    sig_analysis = (page.text_content("#signal-list li:nth-child(8) .sig-v") or "").strip()
    check("senal de analisis actualizada tras el demo", "sin archivo" not in sig_analysis, sig_analysis[:50])

    # 8. envio del formulario
    page.fill("#f-email", "prueba@ejemplo.com")
    page.fill("#f-name", "Prueba QA")
    page.check("#f-consent")
    page.click("#submit-btn")
    page.wait_for_timeout(2500)

    success_visible = page.is_visible("#success")
    success_text = (page.text_content("#success-body") or "").strip() if success_visible else ""
    check("registro completado con exito", success_visible, success_text[:80])

    # 9. el lead llego al backend
    with urllib.request.urlopen(BASE + "/count", timeout=10) as r:
        count = json.loads(r.read()).get("count", 0)
    check("lead persistido en el backend", count >= 1, f"count={count}")

    page.screenshot(path=str(OUT / f"full-{LOCALE}.png"), full_page=True)
    page.screenshot(path=str(OUT / f"hero-{LOCALE}.png"))

    # 10. movil
    mob = ctx.new_page()
    mob.set_viewport_size({"width": 390, "height": 844})
    mob.goto(BASE + "/", wait_until="networkidle")
    mob.wait_for_timeout(1000)
    mob.screenshot(path=str(OUT / f"mobile-{LOCALE}.png"))
    overflow = mob.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2")
    check("sin desbordamiento horizontal en movil", not overflow)

    # 11. selector de idioma
    page.click("#lang-btn")
    page.wait_for_timeout(300)
    lang_opts = page.locator("#lang-menu button").count()
    check("selector de idioma con 9 opciones", lang_opts == 9, f"opciones={lang_opts}")

    check("sin errores de consola", len(console_errors) == 0, " | ".join(console_errors[:3]))

    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} comprobaciones OK")
if failed:
    print("FALLOS:")
    for name, _ok, detail in failed:
        print(f" - {name} :: {detail}")
    sys.exit(1)
