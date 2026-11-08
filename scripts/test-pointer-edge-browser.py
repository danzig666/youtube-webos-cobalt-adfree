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
#page{position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;display:block}
#pagetrack{position:absolute;left:0;top:0;width:100%}
.rowitem{position:absolute;left:0;top:0;width:100%;height:300px}
.rowlist{position:absolute;top:0;left:0;width:100%;height:300px;overflow:hidden;display:block}
.track{position:absolute;left:0;top:0;height:300px;width:100%}
.item{position:absolute;left:0;top:0;width:720px}
ytlr-tile-renderer{display:block;width:720px;height:300px;background:#345}
ytlr-tile-renderer:focus{outline:4px solid #fff}</style></head><body>
<yt-virtual-list id="page"><div id="pagetrack" style="transform:translateY(0rem) translateZ(0px)"></div></yt-virtual-list>
<ytlr-guide-response style="position:fixed;left:0;top:0;width:156px;height:100%;z-index:5;display:block;background:#222"></ytlr-guide-response>
<script>
window.logged=[];window.prefs=JSON.stringify({pointerDiagnosticsLog:true});
window.h5vcc={system:{getYtafUiPreferences:()=>prefs,setYtafUiPreferences:v=>{prefs=v;return true;},
  appendYtafPointerLog:text=>{logged.push(...text.split('\\n'));return true;}}};
// Like YouTube TV on Cobalt (from the TV logs): a page of rows in a vertical
// virtual list moved with translateY(rem); each row's tiles sit at k*31.5rem in
// a track moved with translateX(rem); hover does not focus; arrow keys move
// focus and tracks on the next frame; only items near focus are rendered.
const pagetrack=document.getElementById('pagetrack');const rows=[],idx=[];
for(let r=0;r<6;r++){
  const rowitem=document.createElement('div');rowitem.className='rowitem';
  rowitem.style.transform='translateY('+(400+r*400)/24+'rem)';
  const hl=document.createElement('ytlr-horizontal-list-renderer');const vl=document.createElement('yt-virtual-list');vl.className='rowlist';
  const tr=document.createElement('div');tr.className='track';tr.style.transform='translateX(0rem) translateZ(0px)';
  if(r===0)tr.id='track';
  for(let i=0;i<30;i++){const item=document.createElement('div');item.className='item';
    item.style.transform='translateX('+(i*31.5)+'rem)';const t=document.createElement('ytlr-tile-renderer');
    t.tabIndex=0;item.appendChild(t);tr.appendChild(item);}
  vl.appendChild(tr);hl.appendChild(vl);rowitem.appendChild(hl);pagetrack.appendChild(rowitem);
  rows.push({item:rowitem,track:tr,tiles:[...tr.querySelectorAll('ytlr-tile-renderer')],rem:0});idx.push(0);
}
const track=rows[0].track,tiles=rows[0].tiles;let index=0,row=0,pageRem=0;
window.searchBox=document.createElement('div');searchBox.tabIndex=0;document.body.appendChild(searchBox);searchBox.focus();
function render(){rows.forEach((R,r)=>{R.item.style.display=Math.abs(r-row)<=2?'block':'none';
  R.tiles.forEach((t,i)=>{t.parentElement.style.display=Math.abs(i-idx[r])<=3?'block':'none';});});}
render();
document.addEventListener('keydown',e=>{
  const R=rows[row];
  if(e.keyCode===39&&idx[row]<29)idx[row]++;else if(e.keyCode===37&&idx[row]>0)idx[row]--;
  else if(e.keyCode===40&&row<5)row++;else if(e.keyCode===38&&row>0)row--;else return;
  index=idx[0];
  requestAnimationFrame(()=>{
    // "page": shift a row only when focus would leave the screen (Home on
    // the TV); "slot": keep focus in the left slot, shifting on every press.
    const C=rows[row],left=(idx[row]*31.5+C.rem)*24;
    if(location.hash==='#slot'||left+720>1920||left<0){C.rem=-idx[row]*31.5+6.5;C.track.style.transform='translateX('+C.rem+'rem) translateZ(0px)';}
    pageRem=-(row*400)/24;pagetrack.style.transform='translateY('+pageRem+'rem) translateZ(0px)';
    render();C.tiles[idx[row]].focus();
  });
});
window.samples=[];window.vsamples=[];window.blank=0;(function sample(){
  // Positions of row 0's tile 0 and of the page, in screen space.
  samples.push(track.getBoundingClientRect().left);
  vsamples.push(pagetrack.getBoundingClientRect().top);
  if(rows[0].item.style.display!=='none'){
    let right=-1e9,leftmost=1e9;for(const t of tiles){if(t.parentElement.style.display==='none')continue;const r=t.getBoundingClientRect();right=Math.max(right,r.right);leftmost=Math.min(leftmost,r.left);}
    if(right<innerWidth-2||leftmost>2)blank++;
  }
  requestAnimationFrame(sample);})();
</script><script src="/adblockMain.js"></script></body></html>"""


def main():
    with sync_playwright() as playwright:
        options = {"args": ["--no-sandbox"]}
        if Path("/usr/bin/chromium").is_file():
            options["executable_path"] = "/usr/bin/chromium"
        browser = playwright.chromium.launch(**options)
        for width, height, mode in [(1280, 720, "page"), (1920, 1080, "page"), (1920, 1080, "slot")]:
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
            page.goto("http://test.invalid/tv#" + mode)
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
            # A resting row keeps YouTube's own function list and unit (no appended
            # translate), so YouTube's transitions never interpolate mismatched lists.
            assert page.evaluate("/^translateX\\(-?[\\d.]+rem\\) translateZ\\(0px\\)$/.test(track.style.transform)"), \
                page.evaluate("track.style.transform")
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
            # Up/down glide the page of rows smoothly (TV: stepped before).
            page.mouse.move(width // 2, height // 2)
            page.wait_for_timeout(300)
            page.evaluate("vsamples.length=0")
            page.mouse.move(width // 2, height - 5)
            page.wait_for_timeout(2500)
            vj = page.evaluate("vsamples.slice(1).map((v,i)=>v-vsamples[i])")
            assert page.evaluate("row") >= 1, "the page moved down at least one row"
            assert max(abs(j) for j in vj) < 60, f"vertical jump {max(abs(j) for j in vj)}"
            assert max(vj) < 1, "a down glide never moves back up"
            page.mouse.move(width // 2, height // 2)
            page.wait_for_timeout(600)
            page.evaluate("window.__ytafPointerLog.flush()")
            lines = page.evaluate("logged")
            assert any(" glide start down " in line for line in lines), lines[-12:]
            assert not any(" glide error " in line for line in lines), [l for l in lines if "error" in l]
            # The settings menu blocks edge scrolling.
            page.keyboard.press("=")
            page.locator(".ytaf-ui-container").wait_for(state="visible")
            assert page.locator("#__pointer_edge_scroll").count() == 1
            before = page.evaluate("window.__ytafPointerEdge.steps()")
            page.mouse.move(width - 10, y)
            page.wait_for_timeout(1500)
            assert page.evaluate("window.__ytafPointerEdge.steps()") == before, "menu open blocks scrolling"
            assert not errors, errors
            print(f"{width}x{height} {mode}: smooth right/left glide ({moved} tiles, max frame move {max(abs(j) for j in jumps):.1f}px), settle on leaving the band, "
                  f"vertical page glide (max {max(abs(j) for j in vj):.1f}px/frame), menu blocking and {len(lines)} log lines passed", flush=True)
            context.close()
        browser.close()


if __name__ == "__main__":
    main()
