function installTextDataGuard() {
  if (
    typeof Text === 'undefined' ||
    !Text.prototype ||
    Text.prototype.__ytafTextDataGuardInstalled
  ) {
    return;
  }

  try {
    // Cobalt 23 already implements CharacterData.data, including layout
    // invalidation and character-data mutations. Do not replace that inherited
    // native accessor with synthetic child insertions on every text update.
    for(let prototype=Text.prototype;prototype;prototype=Object.getPrototypeOf(prototype)) {
      const descriptor=Object.getOwnPropertyDescriptor(prototype,'data');
      if(descriptor && ((descriptor.get && descriptor.set) || descriptor.writable))return;
    }

    Object.defineProperty(Text.prototype, '__ytafTextDataGuardInstalled', {
      value: true,
      configurable: true
    });

    Object.defineProperty(Text.prototype, 'data', {
      get() {
        return this.textContent;
      },
      set(value) {
        const text=value==null?'':String(value);
        if(this.textContent!==text)this.textContent=text;
      },
      configurable: true
    });
  } catch (err) {
    console.warn('[ytaf] Text.prototype.data guard skipped:', err);
  }
}

installTextDataGuard();
