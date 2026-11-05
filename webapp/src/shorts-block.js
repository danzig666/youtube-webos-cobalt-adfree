import { checkboxTools } from './checkboxTools.js';
import { configRead, configWrite } from './config.js';
import { text as languageText } from './languages/index.js';

export function userScriptStartShortsBlockUI() {
  const control = document.querySelector('#__shorts');
  if (!control) return;

  const wrapper = control.parentElement;
  const description = wrapper && wrapper.querySelector('.desc');
  const label = languageText('ui', 'shorts');
  if (description) {
    description.textContent = label;
  }

  // The switch means "Block Shorts", the inverse of the stored setting.
  const blocked = !configRead('enableShorts');
  if (blocked) {
    control.setAttribute('checked', 'checked');
  } else {
    control.removeAttribute('checked');
  }
  control.setAttribute('aria-checked', String(blocked));

  checkboxTools.setCallback('__shorts', (newState) => {
    configWrite('enableShorts', !newState);
  });
}
