from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto("http://localhost:4321/", wait_until="networkidle")
    pg.wait_for_timeout(1500)
    for i in range(1, 9):
        v = (pg.text_content(f"#signal-list li:nth-child({i}) .sig-v") or "").strip()
        print(i, "->", v)
    b.close()
