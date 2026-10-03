#!/usr/bin/env python3
"""Compile actual shared worker Step with deferred firmware and forced-reset scenarios."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
root=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('seek_helper',root/'scripts/test-external-video-seek.py')
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
source=(root/'cobalt-platform/webos/arm/starfish_av_components.cc').read_text()
method=helper.method(source,'  void Step(NativeSession& session)')
method=method.replace('void Step(', 'void Owner::Step(',1)
fixture=(root/'scripts/test-starfish-shared-rate-fixture.cc').read_text()
with tempfile.TemporaryDirectory(prefix='ytaf-shared-rate-') as temp:
 cpp,binary=Path(temp)/'test.cc',Path(temp)/'test'
 cpp.write_text(fixture.replace('// INSERT_REAL_STEP',method))
 subprocess.run([os.environ.get('CXX','c++'),'-std=c++14','-Wall','-Wextra','-Werror',
  '-fsanitize=undefined','-fno-sanitize-recover=all','-I'+str(root/'cobalt-platform/webos/arm'),
  str(cpp),str(root/'cobalt-platform/webos/arm/starfish_playback_rate.cc'),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
print('Actual shared Step: defer fractional startup, apply once, reset during buffering, preserve pause, recover rejected rate')
