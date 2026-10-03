export function startConfiguredFeatures(doc, read, hooks, report) {
  const started=new Set();
  function start(key) {
    if(started.has(key) || !read(key))return;
    try {hooks[key]();started.add(key);}
    catch (_) {report(key);}
  }
  doc.addEventListener('ytaf-config-changed',event=>{
    if(Object.prototype.hasOwnProperty.call(hooks,event.detail?.key))start(event.detail.key);
  });
  Object.keys(hooks).forEach(start);
}
