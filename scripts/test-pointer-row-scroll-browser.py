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


def run(browser, width, height):
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

    def edge():
        return page.evaluate('''() => {
          const box=rail.getBoundingClientRect();
          for(const card of document.querySelectorAll('ytlr-tile-renderer')) {
            const r=card.getBoundingClientRect();
            if(r.left<box.right-5 && r.right>box.right+5)
              return {id:card.id,x:box.right-8,y:r.top+80};
          }
          throw Error('fixture has no clipped card');
        }''')

    def reset():
        page.mouse.move(width / 2, 60)
        page.evaluate('rail.scrollLeft=0;document.activeElement.blur()')
        page.wait_for_timeout(50)

    reset()
    target = edge()
    page.mouse.move(target['x'], target['y'])
    page.wait_for_timeout(1100)
    assert page.evaluate('document.activeElement.id') == target['id']
    revealed = page.evaluate('''id => {
      const r=document.getElementById(id).getBoundingClientRect(),b=rail.getBoundingClientRect();
      return {right:r.right,edge:b.right,offset:rail.scrollLeft};
    }''', target['id'])
    assert revealed['offset'] > 0 and revealed['right'] <= revealed['edge'] - 10, revealed
    assert page.evaluate('activations') == 0, 'Hover must not activate videos'
    snapshot = page.evaluate('[rail.scrollLeft,scrollWrites,focuses.length]')
    page.wait_for_timeout(1300)
    assert page.evaluate('[rail.scrollLeft,scrollWrites,focuses.length]') == snapshot, 'A stationary cursor must not run through the row'
    assert page.evaluate('window.scrollY') == 0
    # Reveal the clipped first card on the left, without clicking.
    for i in range(12):
        if page.evaluate('rail.scrollLeft') == 0: break
        page.mouse.move(84 + i % 2, target['y'])
        page.wait_for_timeout(1100)
    assert page.evaluate('rail.scrollLeft') == 0

    # The neighboring card stays reachable at the edge after each reveal.
    # Actual pointer movement advances; leaving it stationary never does.
    reset()
    for i in range(3):
        target = edge()
        before_offset = page.evaluate('rail.scrollLeft')
        page.mouse.move(target['x'] - i % 2, target['y'])
        page.wait_for_timeout(1100)
        assert page.evaluate('document.activeElement.id') == target['id']
        assert page.evaluate('rail.scrollLeft') > before_offset

    # A shared focusable track must not win over the card's own nested link.
    reset()
    target = edge()
    page.evaluate('''id => {
      track.tabIndex=0;
      const card=document.getElementById(id);card.removeAttribute('tabindex');
      const link=document.createElement('a');link.href='#';link.tabIndex=0;
      link.id='nested-card-link';link.style='display:block;width:100%;height:100%';
      card.replaceChildren(link);
    }''', target['id'])
    page.mouse.move(target['x'],target['y'])
    page.wait_for_timeout(1100)
    assert page.evaluate('document.activeElement.id') == 'nested-card-link'
    assert page.evaluate('rail.scrollLeft') > 0
    page.evaluate("document.getElementById('nested-card-link').parentElement.tabIndex=0;track.removeAttribute('tabindex')")

    # Arrow navigation owns focus until deliberate pointer movement resumes.
    reset()
    target = edge()
    page.mouse.move(target['x'], target['y'])
    page.wait_for_timeout(1100)
    page.keyboard.press('ArrowLeft')
    page.evaluate("card0.focus({preventScroll:true})")
    page.mouse.move(target['x'] - 2, target['y'])
    page.wait_for_timeout(100)
    assert page.evaluate('document.activeElement.id') == 'card0'
    page.mouse.move(width / 2, 60)

    # Playback, dragging and visible native menus cannot acquire row focus.
    for mode in ['watch', 'shorts', 'dialog', 'drag', 'hidden']:
        reset()
        target = edge()
        if mode == 'watch': page.evaluate("document.body.className='WEB_PAGE_TYPE_WATCH'")
        if mode == 'shorts': page.evaluate("document.body.className='WEB_PAGE_TYPE_SHORTS'")
        if mode == 'dialog': page.evaluate("let n=document.createElement('div');n.id='dialog';n.setAttribute('role','dialog');n.style='position:absolute;top:5px;left:10px;width:20px;height:20px';document.body.appendChild(n)")
        if mode == 'hidden': page.evaluate("rail.style.opacity='0'")
        writes_before = page.evaluate('scrollWrites')
        focus_before = page.evaluate('focuses.length')
        if mode == 'drag': page.mouse.down()
        page.mouse.move(target['x'], target['y'])
        page.wait_for_timeout(100)
        assert page.evaluate('scrollWrites') == writes_before, mode
        assert page.evaluate('focuses.length') == focus_before, mode
        # Chromium itself can scroll a selection during a held drag. The
        # feature must leave that native gesture alone, without its own writes.
        if mode != 'drag': assert page.evaluate('rail.scrollLeft') == 0, mode
        if mode == 'drag': page.mouse.up()
        page.evaluate("document.body.className='';document.getElementById('dialog')?.remove();rail.style.opacity='1'")

    # Opening settings cancels an animation, and the switch is durable.
    reset()
    target = edge()
    page.mouse.move(target['x'], target['y'])
    page.wait_for_timeout(80)
    page.keyboard.press('=')
    paused = page.evaluate('rail.scrollLeft')
    page.wait_for_timeout(300)
    assert page.evaluate('rail.scrollLeft') == paused
    assert page.get_by_role('checkbox', name='Pointer row scrolling', exact=True).get_attribute('aria-checked') == 'true'
    page.get_by_role('checkbox', name='Pointer row scrolling', exact=True).click()
    assert page.evaluate('JSON.parse(h5vcc.system.getYtafUiPreferences()).pointerRowScroll') is False
    page.keyboard.press('Escape')
    reset()
    target = edge()
    page.mouse.move(target['x'], target['y'])
    page.wait_for_timeout(200)
    assert page.evaluate('rail.scrollLeft') == 0

    # A hybrid focus that actually scrolls owns the row; no competing writes.
    page.evaluate("window.__ytafConfigState.pointerRowScroll=true;document.querySelectorAll('ytlr-tile-renderer').forEach(n=>n.tabIndex=-2)")
    reset()
    target = edge()
    page.evaluate("id => {document.getElementById(id).focus=function(){HTMLElement.prototype.focus.call(this,{preventScroll:true});setTimeout(()=>rail.scrollLeft+=100,30)}}", target['id'])
    before = page.evaluate('scrollWrites')
    page.mouse.move(target['x'], target['y'])
    page.wait_for_timeout(400)
    assert page.evaluate('document.activeElement.id') == target['id']
    assert page.evaluate('scrollWrites') == before + 1
    # Cobalt may send pointer events without compatibility mouse events.
    # Focus can succeed without starting a native row scroll.
    reset()
    target = edge()
    page.evaluate("document.querySelectorAll('ytlr-tile-renderer').forEach(n=>{n.focus=function(){HTMLElement.prototype.focus.call(this,{preventScroll:true})}})")
    page.evaluate("p => document.getElementById(p.id).dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:p.x,clientY:p.y,buttons:0}))", target)
    page.wait_for_timeout(1300)
    assert page.evaluate('document.activeElement.id') == target['id']
    assert page.evaluate('rail.scrollLeft') > 0, 'Native focus without native scrolling must reveal the clipped card'

    # A per-card focus wrapper can include metadata outside the card bounds.
    reset()
    target = edge()
    page.evaluate("id => {const c=document.getElementById(id); c.removeAttribute('tabindex');c.textContent='Video';const w=document.createElement('div');w.id='card-wrapper';w.tabIndex=-2;w.style='flex:0 0 240px;height:230px';c.before(w);w.appendChild(c)}", target['id'])
    page.evaluate("p => document.getElementById(p.id).dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:p.x,clientY:p.y}))", target)
    page.wait_for_timeout(400)
    assert page.evaluate('document.activeElement.id') == 'card-wrapper'
    # Different renderer names and a covering event target, as can occur on
    # the TV, must resolve by geometry rather than fixture component names.
    reset()
    target = edge()
    page.evaluate("document.querySelectorAll('ytlr-tile-renderer').forEach(n=>{const c=document.createElement('ytlr-test-video-card');for(const a of n.attributes)c.setAttribute(a.name,a.value);c.style='display:block;flex:0 0 240px;height:200px';c.innerHTML=n.innerHTML;n.replaceWith(c)})")
    page.evaluate("p=>document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:p.x,clientY:p.y}))", target)
    page.wait_for_timeout(1400)
    assert page.evaluate('rail.scrollLeft') > 0, page.evaluate('({status:__ytafPointerRows.status,focus:document.activeElement.id,offset:rail.scrollLeft,controls:[...document.querySelectorAll("[tabindex]")].map(n=>({tag:n.localName,id:n.id,rect:n.getBoundingClientRect().toJSON()}))})')
    assert not errors, errors
    print(f'{width}x{height}: clipped cards reveal both ways; hover never activates; stationary/D-pad/modal/playback/drag guards; saved switch; native-focus ownership passed', flush=True)
    context.close()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(1280, 720), (1920, 1080)]:
        run(browser, width, height)
    browser.close()
