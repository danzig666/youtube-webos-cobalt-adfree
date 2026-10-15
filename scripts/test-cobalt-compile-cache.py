#!/usr/bin/env python3
"""Exercise the real container entrypoint with controlled compiler tools."""
import json,os,shutil,subprocess,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class CacheTests(unittest.TestCase):
 def run_build(self,cache='1',installed=True,gn_exit=0,ninja_exit=0):
  with tempfile.TemporaryDirectory(prefix='ytaf-ccache-') as directory:
   root=Path(directory);log=root/'calls';commands=root/'bin';commands.mkdir()
   for name,exit_code in [('git',0),('gn',gn_exit),('ninja',ninja_exit)]+([('ccache',0)] if installed else []):
    p=commands/name;p.write_text('#!'+os.sys.executable+'\nimport os,json,sys\n'+
     'with open(os.environ["CALL_LOG"],"a") as f:f.write(json.dumps({"tool":'+repr(name)+',"args":sys.argv[1:],"sloppiness":os.getenv("CCACHE_SLOPPINESS"),"compiler":os.getenv("CCACHE_COMPILERCHECK")})+"\\n")\n'+f'sys.exit({exit_code})\n');p.chmod(0o755)
   env=dict(os.environ,PATH=str(commands),CALL_LOG=str(log),OUT_DIR='out/test',BUILD_TYPE='gold',PARALLEL='4',YTAF_CCACHE=cache,CCACHE_SLOPPINESS='file_stat_matches')
   result=subprocess.run([shutil.which('bash'),str(ROOT/'scripts/run-cobalt-compile.sh')],env=env,capture_output=True,text=True)
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
if __name__=='__main__':unittest.main()
