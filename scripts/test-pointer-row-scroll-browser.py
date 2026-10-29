"""Production-bundle pointer row regressions using YouTube-shaped DOM fixtures.

Requires the production webpack build, Playwright and system Chromium. These
fixtures exercise DOM interaction; native YouTube/Cobalt integration needs a TV.
"""
import importlib.util
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('settings', ROOT / 'scripts/test-settings-browser.py')
settings = importlib.util.module_from_spec(spec)
spec.loader.exec_module(settings)
cards = ''.join(f'<ytlr-tile-renderer tabindex="0" id="card{i}"><span>Video {i}</span></ytlr-tile-renderer>' for i in range(10))
HTML = settings.HTML.replace('</head>', '''<style>
#rail {position:absolute;left:80px;right:80px;top:160px;height:240px;overflow:auto;}
#track {display:flex;gap:28px;width:max-content;overflow:hidden;}
ytlr-tile-renderer {display:block;flex:0 0 240px;height:200px;background:#3478a0;}
ytlr-tile-renderer:focus {outline:2px solid white;outline-offset:-2px;}
</style></head>''').replace('<button id="outside"', f'<ytlr-shelf-renderer id="rail"><div id="track">{cards}</div></ytlr-shelf-renderer><button id="outside"')


def run(browser, width, height, virtual):
    context = browser.new_context(viewport={'width': width, 'height': height})
    errors = []

    def route(r):
        u = urlparse(r.request.url)
        if u.netloc != 'test.invalid':
            return r.abort()
        if u.path in ['/adblockMain.js', '/adblockMain.css']:
            return r.fulfill(body=(ROOT / 'webapp/output' / u.path[1:]).read_bytes(),
                             content_type='text/css' if u.path.endswith('.css') else 'text/javascript')
        if u.path.startswith('/fonts/'):
            return r.fulfill(body=(ROOT / 'webapp/output/fonts' / Path(u.path).name).read_bytes(), content_type='font/woff2')
        return r.fulfill(body=HTML, content_type='text/html')

    context.route('**/*', route)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://test.invalid/tv#/')
    page.wait_for_function('window.__ytafUiInitialized && window.__ytafPointerRows')
    page.evaluate('''() => {
      window.activations=0;window.focuses=[];window.scrollWrites=0;
      const native=Object.getOwnPropertyDescriptor(Element.prototype,'scrollLeft');
      Object.defineProperty(rail,'scrollLeft',{get(){return native.get.call(this);},set(v){scrollWrites++;native.set.call(this,v);}});
      document.querySelectorAll('ytlr-tile-renderer').forEach(n=>{
        n.addEventListener('click',()=>activations++);
        n.addEventListener('focus',()=>focuses.push(n.id));
      });
      // Cobalt does not supply Element.closest().
      Element.prototype.closest=undefined;
      CSSStyleDeclaration.prototype.getPropertyPriority=undefined;
      // Its Document also omits this modern browser hit-test API.
      document.elementFromPoint=undefined;
      const computed=window.getComputedStyle;
      window.getComputedStyle=function(node) {
        const style=computed.call(window,node);
        // Cobalt exposes overflow, but not overflowX or direction, in its
        // computed-style IDL. Exercise that same subset on the browsing row.
        return node===rail ? {display:style.display,visibility:style.visibility,
          opacity:style.opacity,overflow:style.overflow} : style;
      };
    }''')

    page.evaluate("""virtual => {
      if(virtual) rail.style.overflow='hidden';
      window.navCount=0;rail.addEventListener('keydown',()=>navCount++);
      // Different clock origins and long frame gaps must not cause jumps.
      const raf=window.requestAnimationFrame;
      window.clockJump=60000;
      window.requestAnimationFrame=fn=>raf(t=>fn(t+clockJump));
      window.scanCount=0;
      const query=Document.prototype.querySelectorAll;
      Document.prototype.querySelectorAll=function(s){scanCount++;return query.call(this,s)};
    }""",virtual)
    def send(x,y):
        page.evaluate("p=>document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:p.x,clientY:p.y}))",{'x':x,'y':y})
    def offset():
        return page.evaluate('track.getBoundingClientRect().left')
    def steady():
        before=offset();page.wait_for_timeout(350)
        assert abs(offset()-before)<1,(before,offset())

    right=width-88;left=88;y=240
    baseline=offset()
    send(right,y)
    page.wait_for_timeout(800)
    first=offset()
    page.wait_for_timeout(800)
    second=offset()
    assert second < first-80 and first < baseline-80,(baseline,first,second)
    assert page.evaluate('navCount')==0
    assert page.evaluate('activations')==0
    assert page.evaluate('focuses.length')==0,'Panning must not trigger native focus snapping'
    # Repeated pointer packets on the same row do not restart motion or scan
    # every card. Slow frames are clamped to one small movement increment.
    scans=page.evaluate('scanCount')
    page.evaluate("window.samples=[];window.sampling=true;function sample(){samples.push(track.getBoundingClientRect().left);if(sampling)requestAnimationFrame(sample)};requestAnimationFrame(sample)")
    for i in range(12):
        send(right-i%2,y)
        page.wait_for_timeout(20)
    page.evaluate('clockJump+=20000')
    page.wait_for_timeout(250)
    page.evaluate('sampling=false')
    samples=page.evaluate('samples')
    assert len(samples)>10
    assert all(-16<=b-a<=1 for a,b in zip(samples,samples[1:])),samples
    assert page.evaluate('scanCount')-scans<30
    # Moving inward stops without snapping to a complete tile.
    send(width/2,y)
    steady()
    assert page.evaluate("() => {const b=rail.getBoundingClientRect();return [...track.querySelectorAll('[tabindex]')].some(n=>{const r=n.getBoundingClientRect();return (r.left<b.right-2&&r.right>b.right+2)||(r.left<b.left-2&&r.right>b.left+2)})}")
    send(left,y)
    page.wait_for_timeout(800)
    first=offset();page.wait_for_timeout(800);second=offset()
    assert second>first+60,(first,second)
    # Continue all the way to the left end without leaving the row for sidebar.
    page.wait_for_timeout(2200)
    assert abs(offset()-baseline)<1,(offset(),baseline)
    steady()
    assert page.evaluate('navCount')==0
    # Menu opening, wheel input and held drags stop ongoing scrolling.
    for stop in ['menu','wheel','drag']:
        send(width/2,60);send(right,y);page.wait_for_timeout(300)
        if stop=='menu':page.evaluate("document.dispatchEvent(new Event('ytaf-menu-opened'))")
        elif stop=='wheel':page.evaluate("document.dispatchEvent(new WheelEvent('wheel',{deltaY:20}))")
        else:page.evaluate("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,buttons:1}))")
        steady()
        if stop=='menu':page.evaluate("document.dispatchEvent(new Event('ytaf-menu-closed'))")
        if stop=='drag':page.evaluate("window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))")
    send(width/2,60);send(right,y);page.wait_for_timeout(300)
    page.keyboard.press('ArrowDown')
    steady()
    # Tiny pointer movement after remote navigation must not reacquire control.
    send(right-2,y);steady()
    send(width/2,60)
    page.evaluate("document.body.classList.add('WEB_PAGE_TYPE_WATCH')")
    send(right,y);steady()
    page.evaluate("document.body.classList.remove('WEB_PAGE_TYPE_WATCH')")
    send(width/2,60)
    if virtual:
        page.evaluate("track.style.transform='translateX(-268px)';track.style.transition='transform 0.2s linear'")
        page.wait_for_timeout(250)
        send(left,y);page.wait_for_timeout(300)
        assert offset()>-188
        # An application transform update wins, including on destruction.
        page.evaluate("track.style.transform='translateX(-400px)'")
        page.wait_for_timeout(300)
        assert page.evaluate('track.style.transform')=='translateX(-400px)'
        page.evaluate('__ytafPointerRows.destroy()')
        assert page.evaluate('track.style.transform')=='translateX(-400px)'
    else:page.evaluate('__ytafPointerRows.destroy()')
    steady()
    assert not errors,errors
    print(f'{width}x{height} {"virtual" if virtual else "DOM"}: continuous both ways; stop/end bounds; no focus/key jumps; clock/scan/guard checks passed',flush=True)
    context.close()

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height in [(1280,720),(1920,1080)]:
        for virtual in [False,True]:run(browser,width,height,virtual)
    browser.close()
