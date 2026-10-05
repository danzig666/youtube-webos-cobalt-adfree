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
window.fixtureSkips=[];window.fixtureNativeReveals=0;window.fixtureNativeDismissals=0;window.fixtureBacks=0;
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
document.body.addEventListener('keydown',event=>{
 if([461,8,27].includes(event.keyCode))fixtureBacks++;
 // Model YouTube consuming Up to dismiss its visible transport UI. Painting is
 // asynchronous; it happens after capture listeners but before recovery checks.
 if(event.keyCode===38&&!event.repeat&&timeline.style.opacity==='1')setTimeout(()=>{
  fixtureNativeDismissals++;control.style.opacity='0';timeline.style.opacity='0';
 },16);
});
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
    reveals=page.evaluate('fixtureNativeReveals');dismissals=page.evaluate('fixtureNativeDismissals')
    page.keyboard.down('ArrowUp');page.evaluate('fixtureAdvance(20)')
    assert page.evaluate('fixtureNativeDismissals')==dismissals+1
    assert page.evaluate('getComputedStyle(document.querySelector("ytlr-progress-bar")).opacity')=='0'
    # Up must stay dismissed after delayed recovery, with genuine held repeats,
    # and on TVs that emit repeated keydowns without setting event.repeat.
    page.evaluate('fixtureAdvance(100)')
    assert page.evaluate('getComputedStyle(document.querySelector("ytlr-progress-bar")).opacity')=='0','Up dismissal was immediately undone'
    for repeat in [True,False,False,True]:
     page.evaluate("repeat=>{document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',code:'ArrowUp',keyCode:38,which:38,repeat,bubbles:true,cancelable:true}));fixtureAdvance(200)}",repeat)
     assert page.evaluate('getComputedStyle(document.querySelector("ytlr-progress-bar")).opacity')=='0','Held Up reopened dismissed controls'
    page.keyboard.up('ArrowUp');page.evaluate('fixtureAdvance(100)')
    assert page.evaluate('getComputedStyle(document.querySelector("ytlr-progress-bar")).opacity')=='0','Up release reopened dismissed controls'
    assert page.evaluate('fixtureNativeReveals')==reveals
    # A new press is a new intention, and can recover controls left hidden.
    page.keyboard.press('ArrowUp');page.evaluate('fixtureAdvance(100)')
    assert page.evaluate('getComputedStyle(document.querySelector("ytlr-progress-bar")).opacity')=='1','Fresh Up did not recover hidden controls'
    assert page.evaluate('fixtureNativeReveals')==reveals+1
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Green',keyCode:404,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Green',keyCode:404,bubbles:true}));fixtureAdvance(1000)")
    assert page.locator('.ytaf-ui-container').is_visible()
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'BrowserBack',keyCode:461,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'BrowserBack',keyCode:461,bubbles:true}));fixtureAdvance(1000)")
    assert not page.locator('.ytaf-ui-container').is_visible()
    assert page.evaluate('fixtureBacks')==0
  assert page.evaluate('fixtureSkips')==[140,620,1120],page.evaluate('fixtureSkips')
  assert page.evaluate('window.sponsorblock.pollErrors')==0
  assert page.evaluate('jobs.size')<15,page.evaluate('jobs.size')
  # Automatic seeking belongs to the video/timeline, never the video shelf
  # nested under the same watch/player host (or broad controls container).
  page.evaluate("""()=>{
   window.__ytafConfigState.seekBehavior='immediate';
   const controls=document.querySelector('yt-focus-container');
   const list=document.createElement('div');list.setAttribute('role','grid');
   const card=document.createElement('ytlr-tile-renderer');card.id='recommendation';card.tabIndex=0;
   list.append(card);controls.append(list);document.body.tabIndex=0;
   window.fixtureListArrows=[];
   document.body.addEventListener('keydown',e=>{
    if(e.keyCode===40){card.focus();return;}
    if([37,39].includes(e.keyCode)&&document.activeElement===card)fixtureListArrows.push(e.keyCode);
   });
   fixtureHideControls();document.body.focus();
  }""")
  writes=page.evaluate('fixtureSkips.length')
  page.keyboard.press('ArrowRight')
  assert page.locator('.ytaf-seek-preview').count()==1
  page.keyboard.press('ArrowDown')
  assert page.locator('#recommendation').evaluate('n=>n===document.activeElement')
  assert page.locator('.ytaf-seek-preview').count()==0
  for key in ['ArrowLeft','ArrowRight','ArrowRight']:page.keyboard.press(key)
  page.evaluate('fixtureAdvance(3000)')
  assert page.evaluate('fixtureSkips.length')==writes,'List navigation changed playback position'
  assert page.evaluate('fixtureListArrows')==[37,39,39],'List arrows were intercepted'
  # Focus may change without Down (for example, pointer/YouTube navigation).
  page.evaluate('fixtureHideControls();document.body.focus();fixtureAdvance(1600)')
  page.keyboard.press('ArrowRight');page.locator('#recommendation').focus()
  page.evaluate('fixtureAdvance(500)')
  assert page.evaluate('fixtureSkips.length')==writes,'Pending seek followed focus into the shelf'
  # Returning to the player retains the configured 500-ms delay.
  page.evaluate('document.body.focus()');target=page.evaluate("document.querySelector('video').currentTime+10")
  page.keyboard.press('ArrowRight');page.evaluate('fixtureAdvance(499)')
  assert page.evaluate('fixtureSkips.length')==writes
  page.evaluate('fixtureAdvance(1)')
  assert page.evaluate('fixtureSkips.length')==writes+1
  assert abs(page.evaluate('fixtureSkips.at(-1)')-target)<0.001
  page.evaluate("window.__ytafConfigState.clockDisplay='controls';window.__ytafCornerClock.refresh()")
  right=page.locator('#ytaf-corner-clock').evaluate('n=>parseFloat(n.style.right)')
  assert round(width*.02)<=right<=round(width*.02)+9
  assert not errors,errors
  print(f'{width}x{height}: production bundle passed 20 simulated playback minutes, three sponsor skips, three hidden-focus recovery cycles, Up dismissal through held/released keys, fresh-key recovery and GREEN/BACK isolation; video-shelf arrow navigation, seek cancellation/delay and right clock margin',flush=True)
  context.close()
 browser.close()
