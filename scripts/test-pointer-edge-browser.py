"""Browser regression: Magic Remote edge scrolling in the production bundle.

The fixture imitates a YouTube TV virtual row: only arrow keys move focus,
and focus changes rewrite the row transform. Requires the production build,
Python Playwright and Chromium.
"""

from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/adblockMain.css">
<style>body{margin:0;background:#111;overflow:hidden} #row{position:absolute;top:400px;left:0;white-space:nowrap}
.tile{display:inline-block;width:380px;height:220px;margin-right:20px;background:#345}
.tile:focus{outline:4px solid #fff}</style></head><body>
<div id="row"></div>
<script>
window.logged=[];window.prefs=JSON.stringify({pointerDiagnosticsLog:true});
window.h5vcc={system:{getYtafUiPreferences:()=>prefs,setYtafUiPreferences:v=>{prefs=v;return true;},
  appendYtafPointerLog:text=>{logged.push(...text.split('\\n'));return true;}}};
const row=document.getElementById('row');let index=0;
for(let i=0;i<30;i++){const t=document.createElement('div');t.className='tile';t.tabIndex=0;row.appendChild(t);}
const tiles=[...row.children];
function show(){row.style.transform='translateX('+(-index*400+100)+'px)';tiles[index].focus();}
// Like YouTube TV: hover focuses a tile, arrows move focus and the row.
tiles.forEach((t,i)=>t.addEventListener('mouseenter',()=>{index=i;tiles[i].focus();}));
document.addEventListener('keydown',e=>{if(e.keyCode===39&&index<29)index++;else if(e.keyCode===37&&index>0)index--;else return;show();});
show();
</script><script src="/adblockMain.js"></script></body></html>"""


def main():
    with sync_playwright() as playwright:
        options = {"args": ["--no-sandbox"]}
        if Path("/usr/bin/chromium").is_file():
            options["executable_path"] = "/usr/bin/chromium"
        browser = playwright.chromium.launch(**options)
        for width, height in [(1280, 720), (1920, 1080)]:
            context = browser.new_context(viewport={"width": width, "height": height})

            def route(request):
                url = urlparse(request.request.url)
                if url.netloc != "test.invalid":
                    request.abort()
                elif url.path.startswith("/fonts/"):
                    request.fulfill(body=(ROOT / "webapp/output/fonts" / Path(url.path).name).read_bytes(),
                                    content_type="font/woff2")
                elif url.path in ["/adblockMain.js", "/adblockMain.css"]:
                    kind = "text/javascript" if url.path.endswith(".js") else "text/css"
                    request.fulfill(body=(ROOT / "webapp/output" / url.path.lstrip("/")).read_bytes(),
                                    content_type=kind + "; charset=utf-8")
                else:
                    request.fulfill(body=HTML, content_type="text/html; charset=utf-8")

            context.route("**/*", route)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto("http://test.invalid/tv#/")
            page.wait_for_function("window.__ytafUiInitialized && window.__ytafPointerEdge")
            y = 500  # inside the fixture row at both sizes
            page.mouse.move(width // 2, y)
            page.mouse.move(width - 10, y)
            page.wait_for_timeout(3000)
            moved = page.evaluate("index")
            assert moved >= 5, f"{width}x{height}: edge rest moved {moved} tiles"
            page.mouse.move(width // 2, y)
            page.wait_for_timeout(200)
            settled = page.evaluate("index")
            page.wait_for_timeout(1500)
            assert page.evaluate("index") == settled, "leaving the band stops"
            page.mouse.move(10, y)
            page.wait_for_timeout(2000)
            assert page.evaluate("index") < settled, "left edge moves back"
            page.evaluate("window.__ytafPointerLog.flush()")
            lines = page.evaluate("logged")
            assert any(" step right " in line for line in lines) and any(" step left " in line for line in lines)
            assert any("focusChanged=true" in line for line in lines)
            # The settings menu blocks edge scrolling.
            page.keyboard.press("=")
            page.locator(".ytaf-ui-container").wait_for(state="visible")
            assert page.locator("#__pointer_edge_scroll").count() == 1
            before = page.evaluate("window.__ytafPointerEdge.steps()")
            page.mouse.move(width - 10, y)
            page.wait_for_timeout(1500)
            assert page.evaluate("window.__ytafPointerEdge.steps()") == before, "menu open blocks scrolling"
            assert not errors, errors
            print(f"{width}x{height}: continuous right/left edge stepping ({moved} tiles), stop on leaving the band, "
                  f"menu blocking and {len(lines)} log lines passed", flush=True)
            context.close()
        browser.close()


if __name__ == "__main__":
    main()
