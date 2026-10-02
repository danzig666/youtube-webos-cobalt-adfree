#!/usr/bin/env python3
"""Render the selected release identity for both native builds and packaging."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
appinfo = json.loads((ROOT / 'starterless-cobalt/appinfo.json').read_text())
app_id = os.environ.get('YTAF_PACKAGE_ID', appinfo['id'])
titles = {
    'com.cobalt.youtube.adfree': 'YouTube Cobalt AdFree',
    'youtube.leanback.v4': 'YouTube AdFree (Original ID)',
}
if app_id not in titles:
    raise SystemExit('YTAF_PACKAGE_ID must be com.cobalt.youtube.adfree or youtube.leanback.v4')
appinfo.update(id=app_id, title=titles[app_id])
print(json.dumps(appinfo, indent=2))
