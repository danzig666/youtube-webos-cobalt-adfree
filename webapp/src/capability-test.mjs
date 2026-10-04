// These are read-only queries. Cobalt/MSE answers reflect the selected policy,
// and are deliberately not treated as evidence of the physical decoder.
const UNKNOWN = 'unknown';
const clean = value => typeof value === 'string' && /^[A-Za-z0-9 ._()+-]{1,100}$/.test(value) ? value : UNKNOWN;
const flag = value => value === true || value === 'true' ? 'yes' : value === false || value === 'false' ? 'no' : UNKNOWN;
function replyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    (typeof value.returnValue === 'boolean' || (value.ytafLuna && typeof value.ytafLuna === 'object'));
}
// CLI builds can add numbered replies or log lines. Extract complete objects,
// honoring strings/escapes; never print arbitrary output or guess at fragments.
function parseReply(body) {
  const text = typeof body === 'string' ? body.slice(0,16384).replace(/^\uFEFF/,'').trim() : '';
  if (!text) return {error:'empty reply (0 characters)'};
  try {
    let value = JSON.parse(text);
    if (typeof value === 'string') value = JSON.parse(value);
    if (replyObject(value)) return {value};
  } catch (_) {}
  const replies = []; let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i=0;i<text.length;i++) {
    const ch = text[i];
    if (start < 0) { if (ch === '{') { start=i; depth=1; quoted=false; escaped=false; } continue; }
    if (quoted) { if (escaped) escaped=false; else if (ch === '\\') escaped=true; else if (ch === '"') quoted=false; continue; }
    if (ch === '"') quoted=true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { const value=JSON.parse(text.slice(start,i+1)); if (replyObject(value)) replies.push(value); } catch (_) {}
      start=-1;
      if (replies.length>1) return {error:'multiple replies; result ambiguous'};
    }
  }
  if (replies.length===1) return {value:replies[0]};
  if (/luna-send|usage/i.test(text) && /-h|-n|uri message/.test(text)) return {error:'command printed usage; incompatible CLI options'};
  return {error:`unrecognized reply (${text.length} characters)`};
}
function response(part) {
  const backend = ['ls2','cli'].includes(part?.backend) ? ` [${part.backend==='ls2'?'direct LS2':'CLI'}]` : '';
  const result = (status,fields={}) => ({status:status+backend,fields});
  if (part?.status !== 'ok') return result(clean(part?.status));
  let decoded = parseReply(part.body);
  if (decoded.error) return result(decoded.error);
  let parsed = decoded.value;
  if (parsed.ytafLuna) {
    const meta = parsed.ytafLuna;
    const stage = ['initialize','register','attach','call','reply'].includes(meta.stage) ? meta.stage : 'unknown stage';
    if (typeof parsed.payload !== 'string') {
      const reason = ['failed','permission-denied','timeout','output-limit'].includes(meta.reason) ? meta.reason.replace(/-/g,' ') : 'failed';
      const code = Number.isInteger(meta.code) && meta.code!==0 && Math.abs(meta.code)<1000000 ? ` (code ${meta.code})` : '';
      return result(`${stage}: ${reason}${code}`);
    }
    decoded = parseReply(parsed.payload);
    if (decoded.error) return result(`${stage}: ${decoded.error}`);
    parsed = decoded.value;
  }
  if (parsed.returnValue !== true) {
    const denied = typeof parsed.errorText==='string' && /permission|denied|not allowed|not permitted|privileg/i.test(parsed.errorText);
    return result(`${denied?'permission denied':'service failed'}${Number.isInteger(parsed.errorCode) && Math.abs(parsed.errorCode)<1000000 ? ` (code ${parsed.errorCode})` : ''}`);
  }
  return result('answered',parsed.configs && typeof parsed.configs === 'object' ? parsed.configs : parsed);
}

export function capabilityHardwareReport(raw) {
  let result;
  try { result = JSON.parse(typeof raw === 'string' ? raw.slice(0,110000) : ''); } catch (_) { return 'Hardware test: invalid response; capabilities unknown.'; }
  if (result.state !== 'done') return `Hardware test: ${['idle','running','unavailable'].includes(result.state) ? result.state : 'unknown'}.`;
  const config = response(result.config), system = response(result.system);
  const c = config.fields, s = system.fields;
  const panel = clean(c['tv.hw.panelResolution']);
  const lines = ['LG hardware information (read-only):',
    `LG config query: ${config.status}`, `LG system query: ${system.status}`];
  const values = [
    ['Model',clean(c['tv.model.modelname']) !== UNKNOWN ? clean(c['tv.model.modelname']) : clean(s.modelName)],
    ['Firmware',clean(c['tv.nyx.firmwareVersion']) !== UNKNOWN ? clean(c['tv.nyx.firmwareVersion']) : clean(s.firmwareVersion)],
    ['Platform',clean(c['tv.nyx.platformVersion'])], ['webOS SDK',clean(s.sdkVersion)],
    ['Mainboard',clean(c['tv.model.mainboardMaker'])], ['Panel resolution code',panel],
    ['Panel interpretation',panel==='UD'?'4K UHD':panel==='8K'?'8K UHD':UNKNOWN],
    ['UHD system flag',flag(s.UHD)], ['Panel type',clean(c['tv.hw.displayType'])],
    ['OLED system flag',flag(s.OLED)], ['8K support flag',flag(c['tv.model.supportTemp8K'])]
  ].filter(([,value])=>value!==UNKNOWN);
  lines.push(...values.map(([label,value])=>`${label}: ${value}`));
  if (!values.length) lines.push('Panel/model fields unavailable from LG; no panel capability inferred.');
  lines.push(`HDR10 flag (LG supportHDR): ${flag(c['tv.model.supportHDR'])}`,
    `Dolby Vision flag: ${flag(c['tv.config.supportDolbyHDRContents'])}`,
    'HLG: unknown (not reported by this LG query)', '',
    'Starfish reported decoder ceilings (not panel resolution or playback validation):');
  const decoder = result.decoder;
  if (decoder?.status !== 'ok') lines.push(`Query: ${clean(decoder?.status)}; decoder limits unknown.`);
  else {
    const body = typeof decoder.body === 'string' ? decoder.body.slice(0,4096) : '';
    const status = /^decoder=(library-unavailable|query-unavailable)$/m.exec(body);
    if (status) lines.push(`Query: ${status[1]}; decoder limits unknown.`);
    const ceilings = [];
    for (const codec of ['H264','VP9','AV1']) {
      const match = new RegExp(`^${codec}=(\\d{1,5}),(\\d{1,5}),(\\d{1,4})$`,'m').exec(body);
      const values = match?.slice(1).map(Number);
      if (match) ceilings.push(match[0].split('=')[1]);
      lines.push(`${codec}: ${values && values[0]>0 && values[0]<=32768 && values[1]>0 && values[1]<=32768 && values[2]>0 && values[2]<=1000 ? `${values[0]} × ${values[1]} @ ${values[2]} fps` : UNKNOWN}`);
    }
    if (ceilings.length===3 && ceilings.every(value=>value===ceilings[0]))
      lines.push('Identical limits for every codec may be a shared firmware ceiling.');
  }
  lines.push('', 'Hardware flags and decoder limits do not prove every codec/HDR combination plays.',
    'Unknown means missing, denied, or unavailable—not unsupported. No settings were changed.');
  return lines.join('\n');
}
export function capabilityPolicyReport(doc, win) {
  const lines = ['Cobalt policy checks (not independent hardware proof):'];
  const media = doc.createElement('video');
  const probes = [
    ['H264 1080p60','avc1.64002a',1920,1080,''],
    ['H264 2160p60','avc1.640033',3840,2160,''],
    ['VP9 2160p60 SDR','vp09.00.51.08',3840,2160,''],
    ['VP9 2160p60 HDR10','vp09.02.51.10.01.09.16.09.00',3840,2160,'; eotf=smpte2084'],
    ['VP9 2160p60 HLG','vp09.02.51.10.01.09.18.09.00',3840,2160,'; eotf=arib-std-b67'],
    ['AV1 2160p60 SDR','av01.0.13M.08',3840,2160,''],
    ['AV1 2160p60 HDR10','av01.0.13M.10.0.110.09.16.09.0',3840,2160,'; eotf=smpte2084']
  ];
  for (const [label,codec,width,height,hdr] of probes) {
    const type = `video/mp4; codecs="${codec}"; width=${width}; height=${height}; framerate=60${hdr}`;
    let mse = UNKNOWN, element = UNKNOWN;
    try { if (win.MediaSource?.isTypeSupported) mse = flag(win.MediaSource.isTypeSupported(type)); } catch (_) {}
    try { if (media.canPlayType) { const answer = media.canPlayType(type); element = ['probably','maybe',''].includes(answer) ? answer || 'no' : UNKNOWN; } } catch (_) {}
    lines.push(`${label}: MSE ${mse}; video ${element}`);
  }
  lines.push('These answers can be restricted by the current Safe/UHD/UHD HDR setting.');
  return lines.join('\n');
}
export function createCapabilityTest(doc, win, onUpdate) {
  let polling = false, pollCount = 0;
  let report = win.__ytafCapabilityTestReport || '';
  const system = () => win.h5vcc?.system;
  function save(text) { report = text.slice(0,16384); win.__ytafCapabilityTestReport = report; onUpdate(); }
  function poll() {
    let raw;
    try { raw = system()?.getYtafCapabilityTestReport?.(); } catch (_) {}
    let state;
    try { state = JSON.parse(raw).state; } catch (_) {}
    if (state === 'running' && pollCount++ < 48) {
      (win.setTimeout || setTimeout)(poll,250); return;
    }
    polling = false;
    save(`${state === 'running' ? 'Hardware test timed out; capabilities unknown.' : capabilityHardwareReport(raw)}\n\n${capabilityPolicyReport(doc,win)}`);
  }
  return {
    report: () => report,
    running: () => polling,
    run() {
      if (polling) return;
      if (!system()?.startYtafCapabilityTest || !system()?.getYtafCapabilityTestReport) {
        save('Hardware test requires the updated native Cobalt runtime.\n\n'+capabilityPolicyReport(doc,win)); return;
      }
      polling = true; pollCount = 0;
      save('Capability test running… (up to 12 seconds). Playback settings are unchanged.');
      try {
        if (!system().startYtafCapabilityTest()) {
          const current = JSON.parse(system().getYtafCapabilityTestReport());
          if (current.state !== 'running') { polling = false; save('Capability test could not start. Capabilities unknown.'); return; }
        }
      } catch (_) { polling = false; save('Capability test unavailable. Capabilities unknown.'); return; }
      poll();
    }
  };
}
