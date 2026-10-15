// Inspired by ja3850's C4 capability-query investigation. Only normalize a
// decimal bitrate; do not infer decoder throughput from a generic pixel budget
// or divide a queried frame rate by playback speed.
function parameters(type) {
  if (typeof type !== 'string' || type.length > 4096 || /[\r\n\\]/.test(type)) return null;
  const parts=[];let quoted=false,start=0;
  for(let i=0;i<type.length;i++) {
    if(type[i]==='"')quoted=!quoted;
    else if(type[i]===';'&&!quoted){parts.push(type.slice(start,i));start=i+1;}
  }
  if(quoted)return null;parts.push(type.slice(start));
  if(!/^\s*(?:video|audio)\/(?:mp4|webm)\s*$/i.test(parts[0]))return null;
  const values=Object.create(null);
  for(let i=1;i<parts.length;i++) {
    const match=/^\s*([\w-]+)\s*=\s*("[^";]*"|[^\s";]+)\s*$/.exec(parts[i]);
    if(!match)return null;
    const key=match[1].toLowerCase();
    if(Object.prototype.hasOwnProperty.call(values,key))return null;
    values[key]={value:match[2],index:i};
  }
  return {parts,values};
}
export function normalizeCapabilityBitrate(type) {
  const parsed=parameters(type),param=parsed?.values.bitrate;
  if(!param||!/^\d+\.\d+$/.test(param.value))return type;
  const [integer,fraction]=param.value.split('.');
  // Ceil from decimal text so floating-point rounding cannot accidentally
  // admit a value above a hardware bitrate ceiling.
  const bitrate=Number(integer)+(/[1-9]/.test(fraction)?1:0);
  if(!Number.isSafeInteger(bitrate)||bitrate>2147483647)return type;
  parsed.parts[param.index]=parsed.parts[param.index].replace(param.value,String(bitrate));
  return parsed.parts.join(';');
}
function probeDetails(type) {
  const parsed=parameters(type);if(!parsed)return null;
  const number=key=>{const value=parsed.values[key]?.value;
    return value && /^\d+(?:\.\d+)?$/.test(value) && Number(value)<=1e12?Number(value):0;};
  const codecs=parsed.values.codecs?.value || '';
  const codec=/avc1|avc3/i.test(codecs)?'H264':/vp09|vp9/i.test(codecs)?'VP9':/av01/i.test(codecs)?'AV1':/opus/i.test(codecs)?'Opus':'other';
  return {codec,width:number('width'),height:number('height'),fps:number('framerate'),bitrate:number('bitrate')};
}
export function installMediaCapabilityQueries(win,doc) {
  if(win.__ytafCapabilityQueries)return win.__ytafCapabilityQueries;
  const events=[];let queries=0,normalized=0,rejected=0;
  function wrap(owner,name,method) {
    const original=owner?.[name];if(typeof original!=='function')return;
    function query(type) {
      const result=original.apply(this,arguments);
      queries=Math.min(1e9,queries+1);
      let final=result,adjusted=false;
      if(result===false||result==='') {
        const candidate=normalizeCapabilityBitrate(type);
        if(candidate!==type) {
          const args=Array.prototype.slice.call(arguments);args[0]=candidate;
          try {final=original.apply(this,args);adjusted=true;normalized=Math.min(1e9,normalized+1);} catch(_){/* Preserve the original rejection. */}
        }
      }
      const denied=final===false||final==='';if(denied)rejected=Math.min(1e9,rejected+1);
      if(denied||adjusted) {
        const detail=probeDetails(type);
        if(detail) {
          let rate=0;try{rate=Number(doc.querySelector('video')?.playbackRate)||0;}catch(_){}
          if(!Number.isFinite(rate)||rate<0||rate>16)rate=0;
          const event={...detail,method,rate,adjusted,denied};
          const previous=events[events.length-1];
          if(!previous||Object.keys(event).some(key=>event[key]!==previous[key])) {
            events.push(event);if(events.length>12)events.shift();
          }
        }
      }
      return final;
    }
    try {owner[name]=query;}catch(_){/* Read-only bindings retain native behavior. */}
  }
  const controller={report:()=>{
    return [`Capability queries: ${queries}; decimal-bitrate retries ${normalized}; rejected ${rejected}`,
      'Frame-rate/resolution limits are unchanged. Recent rejected or normalized queries:',
      ...events.map(e=>`${e.method} ${e.codec} ${e.width}x${e.height} @ ${e.fps} fps; bitrate ${e.bitrate}; speed ${e.rate}x; ${e.adjusted?'bitrate normalized; ':''}${e.denied?'rejected':'supported'}`)].join('\n');
  }};
  wrap(win.MediaSource,'isTypeSupported','MSE');
  wrap(win.HTMLMediaElement?.prototype,'canPlayType','video');
  win.__ytafCapabilityQueries=controller;return controller;
}
export function capabilityQueryReport(win) {
  return win.__ytafCapabilityQueries?.report?.() || 'Capability queries: unavailable';
}
