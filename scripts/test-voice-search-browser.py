"""Real settings/cursor/persistence and mocked voice requests; sends no audio online."""
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('settings', ROOT / 'scripts/test-settings-browser.py')
settings = importlib.util.module_from_spec(spec)
spec.loader.exec_module(settings)
HTML = settings.HTML.replace('</script><script src=', '''</script><script>
window.nativeReports=0;
h5vcc.system.getYtafMediaReport=()=>{
  nativeReports++;
  return 'Audio decoder: Bundled FDK-AAC (AAC)\\nMagic Remote microphone: Not started\\n';
};
</script><script src=''')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(1280, 720), (1920, 1080)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, locale='en-US')
        requests, errors = [], []

        def route(r):
            url = urlparse(r.request.url)
            if url.netloc != 'test.invalid':
                return r.abort()
            if url.path.startswith('/youtubei/v1/voice/'):
                requests.append({'query': url.query, 'headers': r.request.headers,
                                 'body': json.loads(r.request.post_data)})
                return r.fulfill(body='{}', content_type='application/json')
            if url.path in ['/adblockMain.js', '/adblockMain.css']:
                return r.fulfill(body=(ROOT / 'webapp/output' / url.path[1:]).read_bytes(),
                                 content_type='text/javascript' if url.path.endswith('.js') else 'text/css')
            if url.path.startswith('/fonts/'):
                return r.fulfill(body=(ROOT / 'webapp/output/fonts' / Path(url.path).name).read_bytes(),
                                 content_type='font/woff2')
            return r.fulfill(body=HTML, content_type='text/html')

        context.route('**/*', route)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://test.invalid/tv#/')
        page.wait_for_function('window.__ytafUiInitialized')
        assert page.evaluate('nativeReports') == 0, 'Hidden voice settings must not collect startup reports'
        page.keyboard.press('=')
        page.locator('#__voice_language').focus()
        page.wait_for_timeout(60)
        page.locator('#__voice_language').click()
        page.get_by_role('option', name='Hungarian / Magyar', exact=True).click()
        assert page.locator('.ytaf-choice-popup').count() == 0
        assert 'Hungarian' in page.locator('#__voice_language').inner_text()
        assert json.loads(page.evaluate('h5vcc.system.getYtafUiPreferences()'))['voiceSearchLanguage'] == 'hu-HU'
        assert page.evaluate('navigator.language') == 'en-US'
        page.keyboard.press('Escape')
        page.evaluate("""fetch('/youtubei/v1/voice/search?hl=en&key=test-key',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({context:{client:{hl:'en'}},audio:'test-fixture'})
        }).then(r=>r.text())""")
        assert requests[-1]['query'] == 'hl=hu&key=test-key'
        assert requests[-1]['body']['context']['client']['hl'] == 'hu'
        assert requests[-1]['body']['audio'] == 'test-fixture'
        assert requests[-1]['headers']['accept-language'] == 'hu-HU,hu;q=0.9'
        page.reload()
        page.wait_for_function('window.__ytafUiInitialized')
        page.keyboard.press('=')
        assert 'Hungarian' in page.locator('#__voice_language').inner_text()
        assert page.evaluate('navigator.language') == 'en-US'
        assert not errors, errors
        print(f'{width}x{height}: cursor chooses Hungarian, save survives reload, English locale and audio preserved; no startup report', flush=True)
        context.close()
    browser.close()
