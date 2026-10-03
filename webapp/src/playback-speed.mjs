import {getCurrentVideoId} from './sponsorblock-channels.mjs';
export const playbackRates = [.5,.75,1,1.25,1.5,1.75,2];
export function startPlaybackSpeed(doc, win, read, write, notify) {
  let timer = null, ticket = null, previous = null, failed = null, revision = 0;
  const api = {status:'Uses YouTube’s playback speed.',render(){},request,adjust};
  function status(text) {api.status=text;api.render();}
  function cancel() {if(timer!==null)win.clearTimeout(timer);timer=null;ticket=null;}
  function fail(current, text) {
    if(ticket!==current)return;
    failed={video:current.video,id:current.id,rate:current.rate};
    cancel();
    // Keep the selected preference for future videos, but recover this player.
    try {current.video.playbackRate=1;} catch (_) {}
    status(text);notify(text,5000,'yellow');
  }
  function check(current) {
    timer=null;
    if(ticket!==current || doc.querySelector('video')!==current.video ||
        getCurrentVideoId(win,doc,false)!==current.id || read('playbackSpeed')!==String(current.rate)) {cancel();return;}
    current.checks++;
    if(Math.abs(Number(current.video.playbackRate)-current.rate)>.001) {
      if(current.retries++ >= 3) {fail(current,'YouTube reset playback speed. Normal speed restored.');return;}
      try {current.video.playbackRate=current.rate;} catch (_) {fail(current,'Playback speed could not be changed. Normal speed restored.');return;}
    }
    try {
      const report=win.h5vcc?.system?.getYtafMediaReport?.() || '';
      const rates=report.match(/Playback rate: requested ([\d.e+-]+)x applied ([\d.e+-]+)x/);
      // A native report is more useful than the DOM's requested-rate readback.
      if(rates && !current.video.paused && !current.video.seeking && current.video.readyState>=3 &&
          !/Current player: [^\n]*\(inactive\)/.test(report)) {
        const requested=Number(rates[1]),applied=Number(rates[2]);
        if(applied>0 && Math.abs(requested-current.rate)<.001 && Math.abs(applied-current.rate)<.001) {
          current.confirmed=true;status(`Native playback speed: ${current.rate}×`);
        } else if(current.checks>=4 && applied>0) {
          fail(current,'Native player did not apply playback speed. Normal speed restored.');return;
        }
      }
    } catch (_) { /* Reports are unavailable on older runtimes. */ }
    // Catch early YouTube resets and delayed native recovery, without polling
    // throughout a whole video or silently fighting subsequent manual choices.
    if(current.checks<10)timer=win.setTimeout(()=>check(current),500);
    else if(!current.confirmed)status(`Requested ${current.rate}×; native confirmation unavailable.`);
  }
  function apply() {
    revision++;
    cancel();
    const chosen=read('playbackSpeed'), video=doc.querySelector('video'), id=getCurrentVideoId(win,doc,false);
    if(chosen==='youtube') {
      if(previous?.video===video && Math.abs(Number(video?.playbackRate)-previous.rate)<.001) {
        try {video.playbackRate=1;} catch (_) {}
      }
      previous=null;status('Uses YouTube’s playback speed.');return;
    }
    const rate=Number(chosen);
    if(!playbackRates.includes(rate)) {status('Invalid speed preference; YouTube controls retained.');return;}
    if(!video || !id || video.readyState<1) {status(`Selected ${rate}×; waiting for video.`);return;}
    if(failed?.video===video && failed.id===id && failed.rate===rate)return;
    try {
      if(rate!==1 && win.h5vcc?.system?.enableYtafPlaybackRates?.()!==true) {
        status('Custom speeds require the updated runtime and an enabled native rate policy.');
        notify(api.status,5000,'yellow');return;
      }
      const current={video,id,rate,checks:0,retries:0,confirmed:false};ticket=current;previous=current;
      video.playbackRate=rate;
      status(`Requested playback speed: ${rate}×`);
      timer=win.setTimeout(()=>check(current),500);
    } catch (_) {
      cancel();status('Playback speed could not be changed.');notify(api.status,4000,'yellow');
    }
  }
  function request(rate) {
    if(!playbackRates.includes(rate))return false;
    const before = revision;
    write('playbackSpeed',String(rate));
    // configWrite dispatches synchronously; independent callers may not.
    if(revision===before)apply();
    return true;
  }
  function adjust(direction) {
    const video=doc.querySelector('video');if(!video)return false;
    const rate=Number(read('playbackSpeed')) || Number(video.playbackRate) || 1;
    const closest=playbackRates.reduce((best,value,index)=>Math.abs(value-rate)<Math.abs(playbackRates[best]-rate)?index:best,0);
    return request(playbackRates[Math.max(0,Math.min(playbackRates.length-1,closest+direction))]);
  }
  for(const type of ['loadedmetadata','playing'])doc.addEventListener(type,event=>{
    if(event.target===doc.querySelector('video'))apply();
  },true);
  doc.addEventListener('emptied',cancel,true);
  doc.addEventListener('yt-navigate-finish',cancel);
  win.addEventListener('hashchange',cancel);
  win.addEventListener('pagehide',cancel);
  doc.addEventListener('ytaf-config-changed',event=>{if(event.detail?.key==='playbackSpeed'){failed=null;apply();}});
  apply();return api;
}
