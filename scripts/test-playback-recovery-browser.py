from pathlib import Path
from playwright.sync_api import sync_playwright
# Requires the production web bundle and Python Playwright with Chromium.
# Timers, media and HTTP responses are explicit fixtures; no TV/account access.
root=Path(__file__).resolve().parents[1]
html='''<!doctype html><html><head><link rel="stylesheet" href="/adblockMain.css"></head><body class="WEB_PAGE_TYPE_WATCH"><ytlr-player id="ytlr-player__player-container-player"><video></video><yt-focus-container idomkey="controls" style="position:fixed;inset:0"><button id="native-control" style="position:absolute;left:80px;top:570px;width:80px;height:40px;opacity:0">Pause</button><ytlr-progress-bar idomkey="progress-bar" style="display:block;position:absolute;left:80px;top:640px;width:1000px;height:8px;opacity:0"><div idomkey="segment" style="width:100%;height:8px"></div></ytlr-progress-bar></yt-focus-container></ytlr-player><script>
let virtualTime=1700000000000,seq=0,prefs='',position=0,ready=4;const jobs=new Map();
const nativeSetTimeout=window.setTimeout;Date.now=()=>virtualTime;
window.setTimeout=(fn,delay=0)=>{const id=++seq;jobs.set(id,{fn,at:virtualTime+Math.max(0,Number(delay)||0)});return id};
window.setInterval=(fn,delay)=>{const id=++seq;jobs.set(id,{fn,at:virtualTime+delay,repeat:delay});return id};
window.clearTimeout=window.clearInterval=id=>jobs.delete(id);
window.requestAnimationFrame=fn=>setTimeout(()=>fn(virtualTime),16);window.cancelAnimationFrame=clearTimeout;
window.fixtureSkips=[];window.fixtureNativeReveals=0;window.fixtureBacks=0;
const video=document.querySelector('video'),control=document.querySelector('#native-control'),timeline=document.querySelector('ytlr-progress-bar');
Object.defineProperties(video,{readyState:{get:()=>ready},duration:{get:()=>1500},paused:{get:()=>false},ended:{get:()=>false},seeking:{get:()=>false},currentTime:{get:()=>position,set:v=>{fixtureSkips.push(v);position=v;}},seekable:{get:()=>({length:1,start:()=>0,end:()=>1500})}});
const player=document.querySelector('ytlr-player');player.getVideoData=()=>({video_id:'aaaaaaaaaaa'});
window.ytInitialPlayerResponse={videoDetails:{videoId:'aaaaaaaaaaa',channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',lengthSeconds:'1500',isLiveContent:false}};
window.h5vcc={system:{getYtafUiPreferences:()=>prefs,setYtafUiPreferences:v=>{prefs=v;return true;},getYtafVideoCapabilitySetting:()=>JSON.stringify({saved:0,active:0,overridden:false}),getYtafMediaReport:()=>['Current player: Shared Starfish','Session: 1 generation: 1','Native presentation: '+position+' seconds','Presented frames: '+Math.round(position*60),'Playback rate: requested 1x applied 1x'].join('\\n')}};
class FixtureXHR {open(_method,url){this.url=url;}send(){setTimeout(()=>{this.status=200;this.responseText=JSON.stringify(this.url.includes('sponsor.ajay')?[120,600,1100].map(start=>({segment:[start,start+20],category:'sponsor',actionType:'skip'})):{dislikes:123});this.onload?.();},1);}}
window.XMLHttpRequest=FixtureXHR;
window.fixtureAdvance=ms=>{const end=virtualTime+ms;let loops=0;while(true){const sorted=[...jobs].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at);if(!sorted.length)break;const [id,t]=sorted[0];position+=(t.at-virtualTime)/1000;virtualTime=t.at;if(t.repeat)t.at+=t.repeat;else jobs.delete(id);t.fn();if(++loops>100000)throw Error('timer loop');}position+=(end-virtualTime)/1000;virtualTime=end;return jobs.size;};
setInterval(()=>video.dispatchEvent(new Event('timeupdate')),250);
window.fixtureHideControls=()=>{control.style.opacity='1';control.focus();control.style.opacity='0';timeline.style.opacity='0';};
document.body.addEventListener('keyup',event=>{if(event.keyCode===13){fixtureNativeReveals++;timeline.style.opacity='1';control.style.opacity='1';}});
document.body.addEventListener('keydown',event=>{if([461,8,27].includes(event.keyCode))fixtureBacks++;});
</script><script src="/adblockMain.js"></script></body></html>'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(1280,720),(1920,1080)]:
  context=browser.new_context(viewport={'width':width,'height':height});errors=[]
  def route(req):
   path=req.request.url.split('?',1)[0].split('test.invalid',1)[-1]
   if path.startswith('/fonts/'):
    req.fulfill(body=(root/'webapp/output'/path.lstrip('/')).read_bytes(),content_type='font/woff2')
   elif path in ['/adblockMain.js','/adblockMain.css']:
    req.fulfill(body=(root/'webapp/output'/path.lstrip('/')).read_bytes(),content_type='text/javascript' if path.endswith('.js') else 'text/css')
   elif req.request.url.startswith('http://test.invalid'):
    req.fulfill(body=html,content_type='text/html')
   else:req.abort()
  context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://test.invalid/tv#/watch?v=aaaaaaaaaaa');page.evaluate('fixtureAdvance(1000)')
  assert page.evaluate('window.__ytafUiInitialized && !!window.sponsorblock'),errors
  for minute in range(20):
   page.evaluate('fixtureAdvance(60000)')
   if minute in [1,8,17]:
    page.evaluate('fixtureHideControls()');page.keyboard.press('ArrowUp');page.evaluate('fixtureAdvance(100)')
    assert page.evaluate('getComputedStyle(document.querySelector("ytlr-progress-bar")).opacity')=='1',(minute,errors)
    reveals=page.evaluate('fixtureNativeReveals');page.keyboard.press('ArrowUp');page.evaluate('fixtureAdvance(100)')
    assert page.evaluate('fixtureNativeReveals')==reveals
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Green',keyCode:404,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Green',keyCode:404,bubbles:true}));fixtureAdvance(1000)")
    assert page.locator('.ytaf-ui-container').is_visible()
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'BrowserBack',keyCode:461,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'BrowserBack',keyCode:461,bubbles:true}));fixtureAdvance(1000)")
    assert not page.locator('.ytaf-ui-container').is_visible()
    assert page.evaluate('fixtureBacks')==0
  assert page.evaluate('fixtureSkips')==[140,620,1120],page.evaluate('fixtureSkips')
  assert page.evaluate('window.sponsorblock.pollErrors')==0
  assert page.evaluate('jobs.size')<15,page.evaluate('jobs.size')
  assert not errors,errors
  print(f'{width}x{height}: production bundle passed 20 simulated playback minutes, three sponsor skips, three hidden-focus recovery cycles, visible-control protection and GREEN/BACK isolation',flush=True)
  context.close()
 browser.close()
