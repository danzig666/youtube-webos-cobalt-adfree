#!/usr/bin/env python3
"""Exercise the real container entrypoint with controlled compiler tools."""
import json,os,shutil,subprocess,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class CacheTests(unittest.TestCase):
 def run_build(self,cache='1',installed=True,gn_exit=0,ninja_exit=0,stale_assets=False,bundled_aac=False,ffmpeg_notice=False):
  with tempfile.TemporaryDirectory(prefix='ytaf-ccache-') as directory:
   root=Path(directory);log=root/'calls';commands=root/'bin';commands.mkdir()
   for name in ['rm','mkdir','cp']:(commands/name).symlink_to(shutil.which(name))
   if bundled_aac:
    (root/'bundle').mkdir()
    for name in ['libfdk-aac.so','fdk-aac-build.txt','fdk-aac.txt']:(root/'bundle'/name).write_text(name)
   if ffmpeg_notice:
    notice=root/'starboard/webos/arm/ffmpeg5/COPYING.LGPLv2.1'
    notice.parent.mkdir(parents=True);notice.write_text('FFmpeg header license')
   if stale_assets:
    source=root/'source.js';source.write_text('current web asset')
    generated=root/'out/test/content/web/adblock';generated.mkdir(parents=True)
    os.link(source,generated/'adblockMain.js')
   for name,exit_code in [('git',0),('gn',gn_exit),('ninja',ninja_exit)]+([('ccache',0)] if installed else []):
    p=commands/name;p.write_text('#!'+os.sys.executable+'\nimport os,json,sys\n'+
     'with open(os.environ["CALL_LOG"],"a") as f:f.write(json.dumps({"tool":'+repr(name)+',"args":sys.argv[1:],"sloppiness":os.getenv("CCACHE_SLOPPINESS"),"compiler":os.getenv("CCACHE_COMPILERCHECK"),"generated_asset":os.path.exists("out/test/content/web/adblock/adblockMain.js"),"source_asset":os.path.exists("source.js")})+"\\n")\n'+f'sys.exit({exit_code})\n');p.chmod(0o755)
   env=dict(os.environ,PATH=str(commands),CALL_LOG=str(log),OUT_DIR='out/test',BUILD_TYPE='gold',PARALLEL='4',YTAF_CCACHE=cache,CCACHE_SLOPPINESS='file_stat_matches')
   env.pop('FDK_BUNDLE',None)
   if bundled_aac:env['FDK_BUNDLE']=str(root/'bundle')
   result=subprocess.run([shutil.which('bash'),str(ROOT/'scripts/run-cobalt-compile.sh')],env=env,cwd=root,capture_output=True,text=True)
   if bundled_aac:
    for name,target in [('libfdk-aac.so','lib/libfdk-aac.so'),('fdk-aac-build.txt','lib/fdk-aac-build.txt'),('fdk-aac.txt','content/licenses/fdk-aac.txt')]:
     output=root/'out/test'/target
     if gn_exit or ninja_exit:self.assertFalse(output.exists())
     else:self.assertEqual(output.read_text(),name)
   if ffmpeg_notice:
    output=root/'out/test/content/licenses/ffmpeg5-headers.txt'
    if gn_exit or ninja_exit:self.assertFalse(output.exists())
    else:self.assertEqual(output.read_text(),'FFmpeg header license')
   return result,[json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
 def test_enabled_caches_compilation_with_content_checks_and_no_sloppiness(self):
  result,calls=self.run_build();self.assertEqual(result.returncode,0,result.stderr)
  gn=next(c for c in calls if c['tool']=='gn')
  self.assertIn('cc_wrapper="ccache"',gn['args'][-1]);self.assertEqual(gn['compiler'],'content');self.assertEqual(gn['sloppiness'],'')
  self.assertEqual([c['args'] for c in calls if c['tool']=='ccache'],[['--zero-stats'],['--show-stats']])
 def test_disabled_and_unavailable_keep_building_without_a_wrapper(self):
  for cache,installed in [('0',True),('1',False)]:
   result,calls=self.run_build(cache,installed);self.assertEqual(result.returncode,0,result.stderr)
   self.assertNotIn('cc_wrapper',next(c for c in calls if c['tool']=='gn')['args'][-1])
   self.assertFalse(any(c['tool']=='ccache' for c in calls))
 def test_generator_and_compiler_failures_survive_statistics_reporting(self):
  for gn_exit,ninja_exit in [(17,0),(0,23)]:
   result,calls=self.run_build(gn_exit=gn_exit,ninja_exit=ninja_exit);self.assertEqual(result.returncode,gn_exit or ninja_exit)
   if gn_exit:self.assertFalse(any(c['tool']=='ninja' for c in calls))
 def test_invalid_override_fails_before_invoking_build_tools(self):
  result,calls=self.run_build('oops');self.assertEqual(result.returncode,2);self.assertEqual(calls,[])
 def test_incremental_build_refreshes_hardlinked_assets_inside_container_entrypoint(self):
  result,calls=self.run_build(stale_assets=True);self.assertEqual(result.returncode,0,result.stderr)
  gn=next(c for c in calls if c['tool']=='gn')
  self.assertFalse(gn['generated_asset']);self.assertTrue(gn['source_asset'])
 def test_aac_dependency_and_notice_follow_only_a_successful_compile(self):
  for gn_exit in [0,17]:
   result,_=self.run_build(gn_exit=gn_exit,bundled_aac=True)
   self.assertEqual(result.returncode,gn_exit,result.stderr)
 def test_ffmpeg_header_notice_follows_only_successful_compile(self):
  for gn_exit,ninja_exit in [(0,0),(17,0),(0,23)]:
   result,_=self.run_build(gn_exit=gn_exit,ninja_exit=ninja_exit,ffmpeg_notice=True)
   self.assertEqual(result.returncode,gn_exit or ninja_exit,result.stderr)
if __name__=='__main__':unittest.main()
