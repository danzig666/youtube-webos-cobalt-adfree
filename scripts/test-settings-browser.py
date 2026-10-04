"""Browser regression for the actual settings bundle; no TV/account access.

Requires `npm --prefix webapp run build -- --env production`, Python Playwright
and Chromium. Uses system Chromium when available, otherwise Playwright's copy.
"""

from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = """<!doctype html><html><head>
<link rel="stylesheet" href="/adblockMain.css">
<style>body {margin:0;background:#17212b}</style></head><body>
<button id="outside" style="position:fixed;right:0;top:0;width:40px;height:40px">Page</button>
<script>
let prefs='',quality=0;window.outsideClicks=0;
document.querySelector('#outside').addEventListener('click',()=>outsideClicks++);
window.h5vcc={system:{
  getYtafUiPreferences:()=>prefs,
  setYtafUiPreferences:value=>{prefs=value;return true;},
  getYtafVideoCapabilitySetting:()=>JSON.stringify({saved:quality,active:0,overridden:false}),
  setYtafVideoCapabilitySetting:value=>{quality=value;return true;},
  getYtafMediaReport:()=>['BROWSER TEST SAMPLE — no TV connected',
    ...Array.from({length:100},(_,i)=>'Playback event '+i)].join('\\n')
}};
</script><script src="/adblockMain.js"></script></body></html>"""


def check_settings(browser, width, height):
    context = browser.new_context(viewport={"width": width, "height": height})
    errors = []

    def route(request):
        url = urlparse(request.request.url)
        if url.netloc != "test.invalid":
            request.abort()
        elif url.path.startswith("/fonts/"):
            request.fulfill(body=(ROOT / "webapp/output/fonts" / Path(url.path).name).read_bytes(),
                            content_type="font/woff2")
        elif url.path in ["/adblockMain.js", "/adblockMain.css"]:
            request.fulfill(body=(ROOT / "webapp/output" / url.path.lstrip("/")).read_bytes(),
                            content_type="text/javascript" if url.path.endswith(".js") else "text/css")
        else:
            request.fulfill(body=HTML, content_type="text/html")

    context.route("**/*", route)
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://test.invalid/tv#/")
    page.wait_for_function("window.__ytafUiInitialized")
    page.keyboard.press("=")
    page.locator(".ytaf-ui-container").wait_for(state="visible")
    choices_checked = 0
    for category in ["general", "playback", "captions", "remote", "sponsorblock", "diagnostics"]:
        page.locator("#__settings_" + category).hover()
        page.wait_for_timeout(60)
        pane = page.locator("#__settings_section_" + category)
        assert pane.locator(":scope > h2").evaluate("""n => n.getBoundingClientRect().top >=
            document.querySelector('.ytaf-ui-viewport').getBoundingClientRect().top - 1"""), category
        assert pane.evaluate("n => getComputedStyle(n).fontFamily.includes('YTAF Inter')"), category
        for control_id in pane.locator('[data-ytaf-control="choice"]').evaluate_all("nodes=>nodes.map(n=>n.id)"):
            page.locator("#" + control_id).focus()
            page.wait_for_timeout(30)
            page.keyboard.press("Enter")
            popup = page.locator(".ytaf-choice-popup")
            popup.wait_for(state="visible")
            assert popup.evaluate("""n => {
                const box=n.getBoundingClientRect(), panel=document.querySelector('.ytaf-ui-container').getBoundingClientRect();
                return box.top>=panel.top && box.bottom<=panel.bottom && box.left>=panel.left && box.right<=panel.right;
            }"""), control_id
            page.keyboard.press("Escape")
            assert popup.count() == 0, control_id
            choices_checked += 1

    page.locator("#__run_capability_test").focus()
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(60)
    assert page.evaluate("document.activeElement.id") == "__diagnostics_report"
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(60)
    assert page.locator(".ytaf-ui-content").evaluate("n=>parseFloat(n.style.top)") < 0
    # First Up returns to the report's beginning; the next returns to its action.
    page.keyboard.press("ArrowUp")
    page.wait_for_timeout(60)
    page.keyboard.press("ArrowUp")
    page.wait_for_timeout(60)
    assert page.evaluate("document.activeElement.id") == "__run_capability_test"
    page.mouse.click(width - 20, 20)
    assert page.evaluate("outsideClicks") == 0

    # Magic Remote cursor selection must save once and remove the popup.
    page.locator("#__settings_general").hover()
    page.locator("#__startup_page").click()
    page.get_by_role("option", name="Subscriptions", exact=True).click()
    assert page.locator(".ytaf-choice-popup").count() == 0
    assert "Subscriptions" in page.locator("#__startup_page").inner_text()
    page.keyboard.press("Escape")
    page.mouse.click(width - 20, 20)
    assert page.evaluate("outsideClicks") == 1
    assert not errors, errors
    print(f"{width}x{height}: six categories, {choices_checked} dropdowns, heading/option bounds, "
          "diagnostics navigation, cursor selection and modal pointer isolation passed", flush=True)
    context.close()


def main():
    with sync_playwright() as playwright:
        options = {"args": ["--no-sandbox"]}
        if Path("/usr/bin/chromium").is_file():
            options["executable_path"] = "/usr/bin/chromium"
        browser = playwright.chromium.launch(**options)
        for width, height in [(1280, 720), (1920, 1080)]:
            check_settings(browser, width, height)
        browser.close()


if __name__ == "__main__":
    main()
