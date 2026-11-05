"""Capture README settings screenshots from the actual production bundle.

Requires `npm --prefix webapp run build -- --env production`, Python
Playwright and Chromium. Synthetic native responses only; no TV or account.
Usage: python3 scripts/capture-settings-screenshots.py <app version>
"""

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "screenshots/current"
VERSION = sys.argv[1]
LABEL = f"Browser preview · v{VERSION} · Sample data · No TV connected"
HTML = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/adblockMain.css">
<style>body{margin:0;background:#0b1320}
#label{position:fixed;right:32px;bottom:24px;padding:8px 16px;font:18px Arial,sans-serif;color:#eef4ff;
background:#101e30;border:1px solid #45658b;z-index:2147483647}</style></head><body>
<div id="label">LABEL</div>
<script>
let prefs='';
window.h5vcc={system:{
  getYtafUiPreferences:()=>prefs, setYtafUiPreferences:value=>{prefs=value;return true;},
  getYtafVideoCapabilitySetting:()=>JSON.stringify({saved:0,active:0,overridden:false}),
  setYtafVideoCapabilitySetting:()=>true,
  getYtafMediaReport:()=>['BROWSER PREVIEW SAMPLE - no TV connected',
    ...Array.from({length:40},(_,i)=>'Sample playback event '+i)].join('\\n')
}};
</script><script src="/adblockMain.js"></script></body></html>""".replace("LABEL", LABEL)


def main():
    with sync_playwright() as playwright:
        options = {"args": ["--no-sandbox"]}
        if Path("/usr/bin/chromium").is_file():
            options["executable_path"] = "/usr/bin/chromium"
        browser = playwright.chromium.launch(**options)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})

        def route(request):
            url = urlparse(request.request.url)
            if url.netloc != "test.invalid":
                request.abort()
            elif url.path.startswith("/fonts/"):
                request.fulfill(body=(ROOT / "webapp/output/fonts" / Path(url.path).name).read_bytes(),
                                content_type="font/woff2")
            elif url.path in ["/adblockMain.js", "/adblockMain.css"]:
                kind = "text/javascript" if url.path.endswith(".js") else "text/css"
                request.fulfill(body=(ROOT / "webapp/output" / url.path.lstrip("/")).read_bytes(),
                                content_type=kind + "; charset=utf-8")
            else:
                request.fulfill(body=HTML, content_type="text/html; charset=utf-8")

        context.route("**/*", route)
        page = context.new_page()
        page.goto("http://test.invalid/tv#/")
        page.wait_for_function("window.__ytafUiInitialized")
        page.keyboard.press("=")
        page.locator(".ytaf-ui-container").wait_for(state="visible")
        shots = []
        for category in ["general", "playback", "captions", "remote", "sponsorblock", "diagnostics"]:
            page.locator("#__settings_" + category).hover()
            page.wait_for_timeout(200)
            path = OUT / f"{category}.png"
            page.screenshot(path=str(path))
            shots.append({"file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        browser.close()
    bundle = (ROOT / "webapp/output/adblockMain.js").read_bytes()
    manifest = {
        "app_version": VERSION,
        "source_commit": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                                        text=True, check=True).stdout.strip(),
        "capture": "Chromium browser preview of actual app settings code",
        "viewport": {"width": 1920, "height": 1080},
        "tv_capture": False,
        "native_apis": "Synthetic quality, preference and diagnostics responses; labelled on every screenshot",
        "backdrop": "Neutral preview fixture; not YouTube content",
        "ui_bundle_sha256": hashlib.sha256(bundle).hexdigest(),
        "screenshots": shots,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("Captured", len(shots), "screenshots for", VERSION)


if __name__ == "__main__":
    main()
