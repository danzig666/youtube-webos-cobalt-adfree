import {getCurrentVideoId} from './sponsorblock-channels.mjs';
import {nativePlaybackState} from './native-playback-state.mjs';
export const playbackRates = [.5,.75,1,1.25,1.5,1.75,2];
export function startPlaybackSpeed(doc, win, read, write, notify) {
  let timer = null, ticket = null, internalWrite = false;
  const now = () => win.Date?.now?.() ?? Date.now();
  const api = {status:'Uses YouTube’s playback speed.',render(){},request,adjust,reset};
  function status(text) {api.status=text;api.render();}
  function save(value) {
    internalWrite=true;
    try {write('playbackSpeed',value);} finally {internalWrite=false;}
  }
  function cancel() {if(timer!==null)win.clearTimeout(timer);timer=null;ticket=null;}
  function normal() {
    cancel();save('youtube');
    const video=doc.querySelector('video');
    try {if(video){video.defaultPlaybackRate=1;video.playbackRate=1;}} catch (_) {}
    // DOM SetRate may not reach a preroll/buffering pipeline. This bridge posts
    // a 1x recovery to the native worker without changing a genuine pause.
    try {win.h5vcc?.system?.resetYtafPlaybackRate?.(Boolean(!video || video.paused));} catch (_) {}
  }
  function reset() {normal();status('Normal playback speed: 1×');notify(api.status,2500,'green');return true;}
  function fail(current,text) {
    if(ticket!==current)return;
    normal();status(text);notify(text,5000,'yellow');
  }
  function check(current) {
    timer=null;
    if(ticket!==current)return;
    const video=current.video;
    if(doc.querySelector('video')!==video || getCurrentVideoId(win,doc,false)!==current.id) {normal();return;}
    if(video.ended) {normal();status('Normal speed restored for the next video.');return;}
    const time=now(), state=nativePlaybackState(win);
    if(video.paused) {
      // Pause is intentional, not a stalled firmware rate. Begin fresh when it resumes.
      current.lastProgress=time;current.baseline=null;if(!current.applied)current.started=time;
    } else if(!current.applied) {
      if(state && !state.shared) {fail(current,'Custom speeds are unavailable in this playback backend. Normal speed restored.');return;}
      if(state?.shared && state.frames>0 && video.readyState>=3 && !video.seeking) {
        try {
          if(win.h5vcc?.system?.enableYtafPlaybackRates?.()!==true) throw Error('rate policy');
          video.playbackRate=current.rate;
          current.applied=true;current.started=time;current.lastProgress=time;current.lastState=state;
          status(`Requested playback speed: ${current.rate}×; checking playback.`);
        } catch (_) {fail(current,'Playback speed is unavailable. Normal speed restored.');return;}
      } else if(time-current.started>=10000) {
        fail(current,'Playback has not started. Normal speed restored.');return;
      }
    } else {
      // Firmware accepting SetPlayRate is not proof of playback. Watch actual
      // native frame timestamps, including while readyState falls into buffering.
      if(Math.abs(Number(video.playbackRate)-current.rate)>.001) {
        fail(current,'YouTube reset playback speed. Normal speed restored.');return;
      }
      if(state) {
        const old=current.lastState;
        if(old && (old.session!==state.session || old.generation!==state.generation)) {
          current.baseline=null;
        }
        if(state.frames>0 && old && state.session===old.session && state.generation===old.generation &&
            state.frames>old.frames && state.position>old.position) current.lastProgress=time;
        current.lastState=state;
        if(state.applied>0 && time-current.started>=2000 &&
            (Math.abs(state.requested-current.rate)>.001 || Math.abs(state.applied-current.rate)>.001)) {
          fail(current,'Native player did not apply playback speed. Normal speed restored.');return;
        }
        if(!video.seeking && Math.abs(state.applied-current.rate)<.001 && state.frames>0) {
          if(!current.baseline)current.baseline={...state,time};
          const base=current.baseline, elapsed=(time-base.time)/1000;
          if(elapsed>=3 && state.frames>base.frames && state.position>base.position) {
            const measured=(state.position-base.position)/elapsed;
            if(Math.abs(measured-current.rate)>Math.max(.15,current.rate*.18)) {
              fail(current,'This TV did not sustain the selected speed. Normal speed restored.');return;
            }
            status(`Playback speed: ${current.rate}× (native playback progressing)`);
            current.baseline={...state,time};
          }
        } else current.baseline=null;
      }
      if(time-current.lastProgress>=8000) {
        fail(current,'Playback stalled at the selected speed. Normal speed restored.');return;
      }
    }
    if(ticket===current)timer=win.setTimeout(()=>check(current),500);
  }
  function request(rate) {
    if(!playbackRates.includes(rate))return false;
    if(rate===1)return reset();
    const video=doc.querySelector('video'),id=getCurrentVideoId(win,doc,false);
    if(!video || !id) {notify('Start a video before changing its speed.',3000,'yellow');return false;}
    if(ticket?.video===video && ticket.id===id && ticket.rate===rate) {
      notify(`Playback speed: ${rate}×`,2500,'green');return true;
    }
    cancel();save(String(rate));
    const current={video,id,rate,started:now(),lastProgress:now(),applied:false,baseline:null,lastState:null};
    ticket=current;
    status(`Playback speed: ${rate}× (requested for this video)`);notify(api.status,2500,'green');
    check(current);return true;
  }
  function adjust(direction) {
    const video=doc.querySelector('video');if(!video)return false;
    const rate=ticket?.rate || Number(video.playbackRate) || 1;
    const closest=playbackRates.reduce((best,value,index)=>Math.abs(value-rate)<Math.abs(playbackRates[best]-rate)?index:best,0);
    return request(playbackRates[Math.max(0,Math.min(playbackRates.length-1,closest+direction))]);
  }
  function leave() {
    if(ticket || read('playbackSpeed')!=='youtube') {normal();status('Normal speed restored for the next video.');}
  }
  doc.addEventListener('emptied',event=>{if(!ticket || event.target===ticket.video)leave();},true);
  doc.addEventListener('loadedmetadata',event=>{
    if(ticket && (event.target!==ticket.video || getCurrentVideoId(win,doc,false)!==ticket.id))leave();
  },true);
  doc.addEventListener('yt-navigate-finish',()=>{
    if(ticket && getCurrentVideoId(win,doc,false)!==ticket.id)leave();
  });
  win.addEventListener('hashchange',()=>{if(ticket && getCurrentVideoId(win,doc,false)!==ticket.id)leave();});
  win.addEventListener('pagehide',leave);
  doc.addEventListener('ytaf-config-changed',event=>{
    if(event.detail?.key!=='playbackSpeed' || internalWrite)return;
    const value=read('playbackSpeed');
    if(value==='youtube')reset();else if(!request(Number(value)))save('youtube');
  });
  // Migrate poisoned persistent rates from older builds. Custom speed is now
  // an explicit choice for one video, never an automatic startup requirement.
  if(read('playbackSpeed')!=='youtube') {normal();status('Previous custom speed cleared; normal playback restored.');}
  return api;
}
