"""Browser regression: Magic Remote edge scrolling in the production bundle.

The fixture imitates a YouTube TV virtual row: only arrow keys move focus,
and focus changes rewrite the row transform. Requires the production build,
Python Playwright and Chromium.
"""

from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = """<!doctype html><html style="font-size:24px"><head><meta charset="utf-8">
<link rel="stylesheet" href="/adblockMain.css">
<style>body{margin:0;background:#111;overflow:hidden}
yt-virtual-list{position:absolute;top:400px;left:0;width:100%;height:300px;overflow:hidden;display:block}
#track{position:absolute;left:0;top:0;height:300px;width:100%}
.item{position:absolute;left:0;top:0;width:720px}
ytlr-tile-renderer{display:block;width:720px;height:300px;background:#345}
ytlr-tile-renderer:focus{outline:4px solid #fff}</style></head><body>
<yt-virtual-list><div id="track" style="transform:translateX(0rem) translateZ(0px)"></div></yt-virtual-list>
<script>
window.logged=[];window.prefs=JSON.stringify({pointerDiagnosticsLog:true});
window.h5vcc={system:{getYtafUiPreferences:()=>prefs,setYtafUiPreferences:v=>{prefs=v;return true;},
  appendYtafPointerLog:text=>{logged.push(...text.split('\\n'));return true;}}};
// Like YouTube TV on Cobalt (from the TV log): items sit at k*31.5rem inside a
// track moved with translateX(rem); hover does not focus; an arrow key moves
// focus and the track one tile, applied on the next frame.
const track=document.getElementById('track');let index=0;
for(let i=0;i<30;i++){const item=document.createElement('div');item.className='item';
  item.style.transform='translateX('+(i*31.5)+'rem)';const t=document.createElement('ytlr-tile-renderer');
  t.tabIndex=0;item.appendChild(t);track.appendChild(item);}
const tiles=[...track.querySelectorAll('ytlr-tile-renderer')];
window.searchBox=document.createElement('div');searchBox.tabIndex=0;document.body.appendChild(searchBox);searchBox.focus();
// As on the TV: the track moves only when focus would leave the screen,
// then by a page; only tiles near focus are rendered (virtual list).
let trackRem=0;
function render(){tiles.forEach((t,i)=>{t.parentElement.style.display=Math.abs(i-index)<=3?'block':'none';});}
render();
document.addEventListener('keydown',e=>{
  if(e.keyCode===39&&index<29)index++;else if(e.keyCode===37&&index>0)index--;else return;
  requestAnimationFrame(()=>{
    const left=(index*31.5+trackRem)*24;
    if(left+720>1920||left<0){trackRem=-index*31.5+6.5;track.style.transform='translateX('+trackRem+'rem) translateZ(0px)';}
    render();tiles[index].focus();
  });
});
window.samples=[];window.blank=0;(function sample(){
  // Position of tile 0 in screen space (moves with the whole track).
  samples.push(track.getBoundingClientRect().left);
  let right=-1e9,leftmost=1e9;for(const t of tiles){if(t.parentElement.style.display==='none')continue;const r=t.getBoundingClientRect();right=Math.max(right,r.right);leftmost=Math.min(leftmost,r.left);}
  if(right<innerWidth-2||leftmost>2)blank++;
  requestAnimationFrame(sample);})();
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
            y = 550  # inside the fixture row at both sizes
            page.mouse.move(width // 2, y)
            page.evaluate("samples.length=0")
            page.mouse.move(width - 10, y)
            page.wait_for_timeout(3000)
            moved = page.evaluate("index")
            assert moved >= 2, f"{width}x{height}: edge rest moved {moved} tiles"
            # Smooth: no frame jumps by a tile, the row only moves one way.
            jumps = page.evaluate("samples.slice(1).map((v,i)=>v-samples[i])")
            assert max(abs(j) for j in jumps) < 60, f"jump {max(abs(j) for j in jumps)}"
            assert max(jumps) < 1, "right glide never moves back"
            page.mouse.move(width // 2, y)
            page.wait_for_timeout(600)
            settled = page.evaluate("index")
            before = page.evaluate("track.getBoundingClientRect().left")
            page.wait_for_timeout(1000)
            assert page.evaluate("index") == settled, "leaving the band stops"
            assert abs(page.evaluate("track.getBoundingClientRect().left") - before) < 40, "the row rests where it is"
            page.mouse.move(10, y)
            page.wait_for_timeout(2500)
            assert page.evaluate("index") < settled, "left edge moves back"
            page.evaluate("window.__ytafPointerLog.flush()")
            lines = page.evaluate("logged")
            assert any(" glide start right " in line for line in lines) and any(" glide start left " in line for line in lines), lines[-20:]
            assert any(" glide shift " in line for line in lines)
            # TV regressions: never refocus a tile while gliding, no false row end.
            gliding = False
            for line in lines:
                if " glide start " in line: gliding = True
                elif " glide end " in line: gliding = False
                elif gliding: assert " focus-tile " not in line, line
            assert not any(" end right after " in line for line in lines), [l for l in lines if " end " in l]
            assert page.evaluate("blank") == 0, f"{page.evaluate('blank')} frames showed an empty part of the row"
            # The settings menu blocks edge scrolling.
            page.keyboard.press("=")
            page.locator(".ytaf-ui-container").wait_for(state="visible")
            assert page.locator("#__pointer_edge_scroll").count() == 1
            before = page.evaluate("window.__ytafPointerEdge.steps()")
            page.mouse.move(width - 10, y)
            page.wait_for_timeout(1500)
            assert page.evaluate("window.__ytafPointerEdge.steps()") == before, "menu open blocks scrolling"
            assert not errors, errors
            print(f"{width}x{height}: smooth right/left glide ({moved} tiles, max frame move {max(abs(j) for j in jumps):.1f}px), settle on leaving the band, "
                  f"menu blocking and {len(lines)} log lines passed", flush=True)
            context.close()
        browser.close()


if __name__ == "__main__":
    main()
