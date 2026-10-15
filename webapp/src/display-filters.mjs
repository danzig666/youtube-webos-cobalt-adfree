// Optional display ideas adapted from ja3850/c4-speed-legacy. Gate on actual
// YouTube response shapes; account/authentication and playback tracking survive.
const THUMB=/^(https:\/\/i\.ytimg\.com\/)vi(?:_webp)?\/([A-Za-z0-9_-]{11})\/(?:hq|mq)?default\.(?:jpg|webp)(?:\?[^\s]*)?$/;
export function sharperThumbnail(url) {
 const match=typeof url==='string'&&THUMB.exec(url);
 return match?`${match[1]}vi/${match[2]}/sddefault.jpg`:url;
}
function object(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
function recommendationPrompt(item) {
 if(!object(item))return false;
 const renderer=item.feedNudgeRenderer||item.alertWithActionsRenderer||item.gridButtonRenderer;
 if(!object(renderer))return false;
 const expected='Sign in for better recommendations';
 let endpoint=false,text=false,visited=0;
 function inspect(value,depth=0) {
  if(!value||typeof value!=='object'||depth>8||++visited>200)return;
  if(object(value.signInEndpoint))endpoint=true;
  if(value.simpleText===expected||value.text===expected)text=true;
  for(const key of Object.keys(value))inspect(value[key],depth+1);
 }
 inspect(renderer);
 // Generic alert/nudge renderers also carry errors and consent prompts.
 return text||Boolean(item.feedNudgeRenderer&&endpoint);
}
export function applyDisplayFilters(value,flags) {
 if(!object(value)||!flags)return false;
 const player=Boolean(value.videoDetails&&value.playabilityStatus)||object(value.playerResponse);
 const browse=Boolean(value.contents||value.continuationContents||value.onResponseReceivedActions||value.onResponseReceivedEndpoints);
 if(!player&&!browse)return false;
 let changed=false;
 if(flags.hideEndScreens&&player) {
  for(const response of [value,value.playerResponse]) {
   if(object(response?.endscreen?.endscreenRenderer)){delete response.endscreen;changed=true;}
  }
 }
 if(!(browse&&flags.hideGuestPrompts)&&!flags.enhanceThumbnails)return changed;
 let visited=0;
 function walk(node,depth=0) {
  if(!node||typeof node!=='object'||depth>32||++visited>12000)return;
  if(Array.isArray(node)) {
   for(let i=node.length-1;i>=0&&visited<12000;i--) {
    if(browse&&flags.hideGuestPrompts&&recommendationPrompt(node[i])){node.splice(i,1);changed=true;}
    else walk(node[i],depth+1);
   }
   return;
  }
  for(const key of Object.keys(node)) {
   if(visited>=12000)break;
   // Limit artwork changes to thumbnail arrays; avatars, URLs outside those
   // arrays, custom crops and DeArrow images retain their original values.
   if(key==='thumbnails'&&Array.isArray(node[key])&&flags.enhanceThumbnails) {
    const entries=node[key];
    if(entries.some(e=>Number(e?.width)>480))continue;
    for(const entry of entries)if(object(entry)) {
     const url=sharperThumbnail(entry.url);
     if(url!==entry.url){entry.url=url;changed=true;}
    }
   }else walk(node[key],depth+1);
  }
 }
 walk(value);return changed;
}
export function installDisplayPreferences(doc,read) {
 function refresh(){const classes=doc.documentElement?.classList;if(!classes)return;
  if(read('hideYouTubeLogo'))classes.add('ytaf-hide-youtube-logo');else classes.remove('ytaf-hide-youtube-logo');}
 refresh();doc.addEventListener('ytaf-config-changed',event=>{if(event.detail?.key==='hideYouTubeLogo')refresh();});
}
export function createDisplaySettings(doc,checkbox,read,write) {
 const panel=doc.createElement('div');panel.dataset.ytafSection='general';
 for(const [key,label] of [['hideEndScreens','Hide end-screen recommendations'],['enhanceThumbnails','Sharper video thumbnails'],['hideGuestPrompts','Hide recommendation sign-in prompts'],['hideYouTubeLogo','Hide YouTube logo']])
  panel.appendChild(checkbox.add('__'+key,label,read(key),value=>write(key,value)));
 const hint=doc.createElement('div');hint.className='ytaf-setting-help';
 hint.textContent='Logo changes apply immediately. Other options apply when a page or video loads next. Refresh Home to update its cards. YouTube sign-in stays available; DeArrow artwork stays unchanged.';
 panel.appendChild(hint);return panel;
}
