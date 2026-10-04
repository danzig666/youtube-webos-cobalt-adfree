#!/usr/bin/env python3
"""Exercise both actual HDR serializers without linking the vendor SDK."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('seek_helper', root / 'scripts/test-external-video-seek.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
fixture = r'''
#include <cassert>
#include <cmath>
#include <limits>
#include <sstream>
#include <string>
using SbMediaTransferId = int;
constexpr int kSbMediaTransferIdSmpteSt2084 = 16, kSbMediaTransferIdAribStdB67 = 18;
constexpr int kSbMediaRangeIdFull = 2;
struct SbMediaMasteringMetadata {
  float primary_r_chromaticity_x = 0, primary_r_chromaticity_y = 0;
  float primary_g_chromaticity_x = 0, primary_g_chromaticity_y = 0;
  float primary_b_chromaticity_x = 0, primary_b_chromaticity_y = 0;
  float white_point_chromaticity_x = 0, white_point_chromaticity_y = 0;
  float luminance_min = 0, luminance_max = 0;
};
struct SbMediaColorMetadata {
  SbMediaMasteringMetadata mastering_metadata;
  unsigned max_cll = 0, max_fall = 0;
  int transfer = kSbMediaTransferIdSmpteSt2084, primaries = 9, matrix = 9, range = 0;
};
// INSERT_REAL_METHODS
int main() {
  SbMediaColorMetadata metadata;
  assert(BuildHdrInfoPayload(metadata).empty()); // Never call firmware with empty SEI.
  metadata.mastering_metadata.luminance_min = .005f;
  metadata.mastering_metadata.luminance_max = 1000;
  metadata.max_cll = 1000; metadata.max_fall = 400;
  std::string result = BuildHdrInfoPayload(metadata);
  assert(result.find("\"minDisplayMasteringLuminance\":50") != std::string::npos);
  assert(result.find("\"maxDisplayMasteringLuminance\":10000000") != std::string::npos);
  assert(result.find("\"maxContentLightLevel\":1000") != std::string::npos);
  assert(result.find("\"maxPicAverageLightLevel\":400") != std::string::npos);
  metadata = {};
  auto& mastering = metadata.mastering_metadata;
  for (float invalid : {1e30f, std::numeric_limits<float>::infinity(),
                        std::numeric_limits<float>::quiet_NaN(), -1.0f}) {
    mastering.luminance_max = invalid;
    assert(BuildHdrInfoPayload(metadata).empty());
  }
  mastering.luminance_max = 1000; mastering.luminance_min = 1001;
  assert(BuildHdrInfoPayload(metadata).empty());
  mastering.luminance_min = 0; mastering.luminance_max = 9999.99f;
  assert(!BuildHdrInfoPayload(metadata).empty()); // Starboard13 documented upper boundary.
  mastering.luminance_max = 10000;
  assert(BuildHdrInfoPayload(metadata).empty());
  metadata = {};
  metadata.max_cll = std::numeric_limits<unsigned>::max();
  metadata.max_fall = std::numeric_limits<unsigned>::max();
  assert(BuildHdrInfoPayload(metadata).empty());
  metadata = {};
  mastering.primary_r_chromaticity_x = mastering.primary_r_chromaticity_y = .3f;
  mastering.primary_g_chromaticity_x = mastering.primary_g_chromaticity_y = .3f;
  mastering.primary_b_chromaticity_x = mastering.primary_b_chromaticity_y = .3f;
  mastering.white_point_chromaticity_x = mastering.white_point_chromaticity_y = .3f;
  assert(!BuildHdrInfoPayload(metadata).empty());
  mastering.primary_r_chromaticity_x = 1e30f;
  assert(BuildHdrInfoPayload(metadata).empty());
  metadata.max_cll = 1000; // Keep independent valid fields even with invalid mastering data.
  result = BuildHdrInfoPayload(metadata);
  assert(result.find("displayPrimaries") == std::string::npos);
  assert(result.find("\"maxContentLightLevel\":1000") != std::string::npos);
}
'''
with tempfile.TemporaryDirectory(prefix='ytaf-hdr-') as temp:
    for backend in ('starfish_video_decoder', 'starfish_av_components'):
        source = (root / f'cobalt-platform/webos/arm/{backend}.cc').read_text()
        signatures = ['bool IsFiniteAndPositive(', 'int ScaleAndRound(',
                      'void AppendJsonInteger(', 'std::string BuildHdrInfoPayload(']
        if backend == 'starfish_video_decoder':
            signatures.insert(0, 'const char* HdrType(')
        methods = '\n'.join(helper.method(source, name) for name in signatures)
        cpp, binary = Path(temp) / (backend + '.cc'), Path(temp) / backend
        cpp.write_text(fixture.replace('// INSERT_REAL_METHODS', methods))
        subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++14', '-Wall', '-Wextra', '-Werror',
                        '-fsanitize=undefined,float-cast-overflow', '-fno-sanitize-recover=all',
                        str(cpp), '-o', str(binary)], check=True)
        subprocess.run([str(binary)], check=True)
print('Both native HDR serializers reject invalid mastering/light metadata and retain valid fields')
