import {getCurrentVideoId} from './sponsorblock-channels.mjs';

// Inspired by LawfulGremlin/youtube-webos-cobalt v2 (e11ea278a7,
// 3b5ce08dd2). Only use levels the current YouTube player exposes. Auto must
// regain control; a permanent highest-quality pin defeats adaptive playback.
const levels = ['tiny','small','medium','large','hd720','hd1080','hd1440','hd2160','hd2880','hd4320','highres'];
export function highestQuality(available) {
  return Array.isArray(available) ? levels.filter(level => available.includes(level)).pop() || null : null;
}
export function startAutoQuality(doc, win, read) {
  let timer = null, session = null, stopped = false;
  const api = {status:'Higher-quality Auto startup is off.', render(){}, destroy};
  const now = () => win.Date?.now?.() ?? Date.now();
  function status(text) {api.status=text;api.render();}
  function clearTimer() {if(timer!==null)win.clearTimeout(timer);timer=null;}
  function identity() {
    if (!doc.body?.classList.contains('WEB_PAGE_TYPE_WATCH')) return null;
    const video=doc.querySelector('video'), id=getCurrentVideoId(win,doc,false);
    return video && id ? {video,id} : null;
  }
  function matches(ticket) {
    const current=identity();
    if(!current || current.id!==ticket.id || current.video!==ticket.video)return false;
    // Route changes can precede replacement of YouTube's player data.
    try {return !ticket.player || ticket.player.getVideoData().video_id===ticket.id;}
    catch (_) {return false;}
  }
  function finish(ticket, text, release=true) {
    if(session!==ticket)return;
    clearTimer();ticket.done=true;
    if(release && ticket.pinned && matches(ticket)) {
      try {
        const preferred=ticket.player.getPreferredQuality();
        if(preferred===ticket.top || preferred==='auto')ticket.player.setPlaybackQualityRange('auto','auto');
      } catch (_) {text='Could not return quality to Auto. Select Auto in YouTube’s quality menu.';}
    }
    ticket.pinned=false;status(text);
  }
  function check(ticket) {
    timer=null;
    if(stopped || session!==ticket || ticket.done)return;
    if(!matches(ticket)){finish(ticket,'Waiting for the next video.',false);return;}
    if(doc.hidden || doc.visibilityState==='hidden'){finish(ticket,'Auto startup stopped while the app is in the background.');return;}
    try {
      if(!ticket.pinned) {
        const player=doc.getElementById('ytlr-player__player-container-player') || doc.querySelector('.html5-video-player');
        if(player && ['getVideoData','getPreferredQuality','getPlaybackQuality','getAvailableQualityLevels','setPlaybackQualityRange'].every(key=>typeof player[key]==='function') &&
            player.getVideoData()?.video_id===ticket.id) {
          ticket.player=player;
          if(player.getPreferredQuality()!=='auto'){finish(ticket,'YouTube’s manual quality selection is unchanged.',false);return;}
          const top=highestQuality(player.getAvailableQualityLevels());
          if(top) {
            if(player.getPlaybackQuality()===top){finish(ticket,'Auto is already at the highest available quality.',false);return;}
            ticket.top=top;ticket.pinned=true;ticket.deadline=now()+10000;
            player.setPlaybackQualityRange(top,top);
            status('Starting at the highest available quality; returning to Auto.');
          }
        }
      } else {
        const preferred=ticket.player.getPreferredQuality();
        if(preferred!==ticket.top && preferred!=='auto'){finish(ticket,'YouTube’s manual quality selection is unchanged.',false);return;}
        if(ticket.player.getPlaybackQuality()===ticket.top){finish(ticket,'Startup quality reached; Auto is adapting normally.');return;}
      }
      if(now()>=ticket.deadline || --ticket.remaining<=0) {
        finish(ticket,ticket.pinned?'Startup quality timed out; returned to Auto.':'Auto startup is unavailable on this YouTube player.');return;
      }
      timer=win.setTimeout(()=>check(ticket),250);
    } catch (_) {finish(ticket,'Auto startup could not be applied. YouTube controls quality.');}
  }
  function start(event) {
    if(stopped || !read('highQualityAutoStartup'))return;
    const current=identity();
    if(!current || (event?.target && event.target!==current.video))return;
    // A media element is often reused across videos; both identities matter.
    if(session && session.id===current.id && session.video===current.video)return;
    if(session)finish(session,'Waiting for the next video.');
    session={...current,deadline:now()+10000,remaining:80,pinned:false,done:false};
    status('Waiting for YouTube’s Auto quality levels.');check(session);
  }
  function input() {
    // Release BEFORE YouTube handles a remote/cursor selection. This also
    // preserves a manual choice of the same quality as our temporary pin.
    if(session && !session.done)finish(session,'Auto startup ended after remote or cursor input.');
  }
  function route() {
    const current=identity();
    if(session && (!current || current.id!==session.id || current.video!==session.video)) {
      finish(session,'Waiting for the next video.');session=null;
    }
  }
  function mediaEnd(event) {
    if(event.target===session?.video){finish(session,'Auto startup ended.');session=null;}
  }
  function config(event) {
    if(event.detail?.key!=='highQualityAutoStartup')return;
    if(session)finish(session,'Higher-quality Auto startup is off.');
    session=null;
    if(read('highQualityAutoStartup')){status('Enabled for Auto quality playback.');start();}
    else status('Higher-quality Auto startup is off.');
  }
  function background() {if(doc.hidden || doc.visibilityState==='hidden')input();}
  const bindings=[
    [doc,'playing',start,true],[doc,'loadedmetadata',start,true],
    [doc,'ended',mediaEnd,true],[doc,'emptied',mediaEnd,true],
    [win,'keydown',input,true],[win,'pointerdown',input,true],[win,'mousedown',input,true],
    [doc,'ytaf-menu-opened',input,false],[doc,'yt-navigate-finish',route,false],
    [doc,'visibilitychange',background,false],[doc,'ytaf-config-changed',config,false],
    [win,'hashchange',route,false]
  ];
  for(const [target,type,callback,capture] of bindings)target.addEventListener(type,callback,capture);
  function destroy() {
    if(session)finish(session,'Auto startup stopped.');stopped=true;clearTimer();
    for(const [target,type,callback,capture] of bindings)target.removeEventListener?.(type,callback,capture);
  }
  if(read('highQualityAutoStartup')){status('Enabled for Auto quality playback.');start();}
  return api;
}
