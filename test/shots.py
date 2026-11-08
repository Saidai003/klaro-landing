import sys
from playwright.sync_api import sync_playwright

LOCALE = sys.argv[1] if len(sys.argv) > 1 else "es-ES"
OUT = "test/shots"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(locale=LOCALE, viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto("http://localhost:4321/", wait_until="networkidle")
    pg.wait_for_timeout(1600)

    pg.evaluate("window.scrollTo(0,0)")
    pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}/v-hero.png")

    for name, sel in [("demo", "#demo"), ("engine", "#engine"), ("price", "#price"), ("signup", "#signup")]:
        pg.locator(sel).scroll_into_view_if_needed()
        pg.wait_for_timeout(500)
        pg.screenshot(path=f"{OUT}/v-{name}.png")

    # con el informe ya lleno
    pg.locator("#demo").scroll_into_view_if_needed()
    pg.click("#use-sample")
    pg.wait_for_timeout(7000)
    pg.locator("#demo").scroll_into_view_if_needed()
    pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}/v-demo-report.png")

    pg.evaluate("window.scrollTo(0,0)")
    pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}/v-hero-after.png")
    b.close()
print("capturas listas")
