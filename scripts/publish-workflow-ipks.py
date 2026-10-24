#!/usr/bin/env python3
"""Publish checked prerelease IPKs from a completed native workflow run."""
import argparse, hashlib, importlib.util, json, os, re, subprocess, tempfile
from pathlib import Path

def api(repo, endpoint, payload=None, method='GET'):
    cmd=['gh','api',f'repos/{repo}/{endpoint}']
    if payload is not None: cmd += ['--method',method,'--input','-']
    return json.loads(subprocess.check_output(cmd,input=None if payload is None else json.dumps(payload).encode()))

def validate_manifest(m):
    assert re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',m['repository'])
    assert re.fullmatch(r'[0-9a-f]{40}',m['source_sha'])
    assert re.fullmatch(r'\d+\.\d+\.\d+',m['version'])
    assert re.fullmatch('v'+re.escape(m['version'])+r'-beta\.\d+',m['tag'])
    assert all(isinstance(m[k],int) and m[k]>0 for k in ['native_run','ci_run','artifact_id'])

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('manifest',type=Path);p.add_argument('--verify-only',action='store_true');a=p.parse_args()
    folder=a.manifest.resolve().parent;m=json.loads(a.manifest.read_text());validate_manifest(m)
    repo=m['repository'];assert repo==os.environ['GITHUB_REPOSITORY']
    source=m['source_sha'];version=m['version'];tag=m['tag']
    for key,path in [('native_run','.github/workflows/build-starterless-cobalt.yml'),('ci_run','.github/workflows/ci.yml')]:
        run=api(repo,f'actions/runs/{m[key]}')
        assert (run['status'],run['conclusion'],run['head_sha'],run['path'])==('completed','success',source,path)
    artifact_name='nightly-ipk-'+source[:12]
    artifacts=api(repo,f'actions/runs/{m["native_run"]}/artifacts')['artifacts']
    matches=[x for x in artifacts if x['name']==artifact_name and not x['expired']]
    assert len(matches)==1 and matches[0]['id']==m['artifact_id']
    spec=importlib.util.spec_from_file_location('catalog',Path(__file__).with_name('update-homebrew-catalog.py'))
    catalog=importlib.util.module_from_spec(spec);spec.loader.exec_module(catalog)
    with tempfile.TemporaryDirectory(prefix='ytaf-workflow-release-') as tmp:
        root=Path(tmp)
        subprocess.run(['gh','run','download',str(m['native_run']),'--repo',repo,'--name',artifact_name,'--dir',str(root)],check=True)
        metadata=dict(line.split('=',1) for line in (root/'cobalt-build.txt').read_text().splitlines())
        assert metadata['source_sha']==source and metadata['repository']==repo and metadata['build_type']=='gold'
        digests={}
        for line in (folder/'SHA256SUMS').read_text().splitlines():
            match=re.fullmatch(r'([0-9a-f]{64})  ([A-Za-z0-9_.-]+)',line)
            assert match and match[2] not in digests
            digests[match[2]]=match[1]
        expected={f'{app}{suffix}' for app in catalog.APP_IDS for suffix in [f'_{version}_arm.ipk','-build.json']}
        assert set(digests)==expected
        for name in digests:
            if name.endswith('.json'): (root/name).write_bytes((folder/name).read_bytes())
            data=(root/name).read_bytes();assert hashlib.sha256(data).hexdigest()==digests[name]
        for app in catalog.APP_IDS:
            record=json.loads((root/(app+'-build.json')).read_text());name=f'{app}_{version}_arm.ipk'
            assert all(record[k]==v for k,v in {'source_sha':source,'release_tag':tag,'app_id':app,'package_version':version,'ipk':name,'ipk_sha256':digests[name],'native_build_run_id':m['native_run'],'source_ci_run_id':m['ci_run']}.items())
            catalog.inspect_package(root/name,app,version,record)
        (root/'SHA256SUMS').write_bytes((folder/'SHA256SUMS').read_bytes())
        digests['SHA256SUMS']=hashlib.sha256((root/'SHA256SUMS').read_bytes()).hexdigest()
        print('Verified both exact native payloads and package hashes against successful native/source CI runs.',flush=True)
        if a.verify_only:return
        refs=api(repo,'git/matching-refs/tags/'+tag)
        exact=[x for x in refs if x['ref']=='refs/tags/'+tag]
        if exact: assert exact[0]['object']['type']=='commit' and exact[0]['object']['sha']==source
        else: api(repo,'git/refs',{'ref':'refs/tags/'+tag,'sha':source},'POST')
        releases=api(repo,'releases?per_page=100');existing=[r for r in releases if r['tag_name']==tag]
        assert len(existing)<=1
        release=existing[0] if existing else api(repo,'releases',{'tag_name':tag,'target_commitish':source,'name':m['title'],'body':(folder/'release-body.md').read_text(),'draft':True,'prerelease':True},'POST')
        assert release['prerelease'] and release['target_commitish']==source
        assets={x['name']:x for x in release['assets']}
        assert set(assets)<=set(digests)
        for name,digest in digests.items():
            if name in assets: assert assets[name]['digest']=='sha256:'+digest and assets[name]['size']==(root/name).stat().st_size
            else: subprocess.run(['gh','release','upload',tag,'--repo',repo,str(root/name)],check=True)
        after=api(repo,f'releases/{release["id"]}')
        assert {x['name'] for x in after['assets']}==set(digests)
        for asset in after['assets']:
            assert asset['digest']=='sha256:'+digests[asset['name']] and asset['size']==(root/asset['name']).stat().st_size
        if after['draft']: api(repo,f'releases/{release["id"]}',{'draft':False},'PATCH')
        print('Published verified prerelease:',tag,flush=True)
        subprocess.run(['python3',str(Path(__file__).with_name('update-homebrew-catalog.py')),'--tag',tag,'--output',str(root/'repo.json'),'--skip-draft','--publish'],check=True)
if __name__=='__main__': main()
