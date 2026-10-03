export function ensureSettingsMounted(doc, container) {
  const parent=doc.body || doc.documentElement;
  if(parent && !doc.documentElement.contains(container))parent.appendChild(container);
}
