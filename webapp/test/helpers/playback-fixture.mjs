export function playbackFixture() {
  let clock = 2000000000000, sequence = 0;
  const timers = new Map(), writes = [], notifications = [];
  function events(object = {}) {
    const listeners = new Map();
    object.addEventListener = (type, callback) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    };
    object.emit = (type, values = {}) => {
      const event = {type, ...values};
      for (const callback of listeners.get(type) || []) callback(event);
    };
    return object;
  }
  const video = {readyState: 4, duration: 300, currentTime: 0, seeking: false,
    ended: false, paused: false, seekable: {length: 0}};
  const doc = events({body: {classList: {contains: name => name === 'WEB_PAGE_TYPE_WATCH'}},
    activeElement: null, video, player: null,
    querySelector: selector => selector === 'video' ? doc.video : doc.player,
    getElementById: () => doc.player});
  const win = events({location: {href: 'https://www.youtube.com/tv?v=aaaaaaaaaaa'},
    __ytafPlaybackMetadata: [{id: 'aaaaaaaaaaa',live: false,duration: 300}],
    Date: {now: () => clock},
    setTimeout: (fn, delay) => {const id = ++sequence;timers.set(id,{fn,at:clock+delay});return id;},
    clearTimeout: id => timers.delete(id)});
  const settings = {playbackResumeMode: 'youtube-local',rememberPlaybackPosition: true,playbackPositions: [],seekBehavior: 'youtube'};
  function advance(ms) {
    const end = clock+ms;
    for (;;) {
      const next = [...timers].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
      if (!next) break;
      clock = next[1].at;timers.delete(next[0]);next[1].fn();
    }
    clock = end;
  }
  return {doc,win,video,settings,writes,notifications,timers,advance,
    read: key => settings[key],
    save: positions => {settings.playbackPositions=positions;writes.push(positions);return true;},
    notify: (...args) => notifications.push(args),
    media: type => doc.emit(type,{target:doc.video}),
    bookmark: (position = 90) => ({id:'aaaaaaaaaaa',position,duration:300,updated:clock}),
    key: (code, type='keydown') => ({type,keyCode:code,preventDefault(){this.consumed=true;},stopPropagation(){},stopImmediatePropagation(){}})
  };
}
