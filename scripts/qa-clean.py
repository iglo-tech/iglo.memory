"""Run the executable in a disposable Debian container without language runtimes."""
import os, json, pathlib, subprocess, tempfile, sys
binary=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'dist/iglo.mem').resolve()
image='debian@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171'
with tempfile.TemporaryDirectory(prefix='iglo-clean-',dir='/tmp') as temp:
    root=pathlib.Path(temp)
    (root/'.git/objects').mkdir(parents=True);(root/'.git/refs').mkdir();(root/'.git/HEAD').write_text('ref: refs/heads/main\n')
    script='''set -eu
for tool in bun node npm git; do if command -v "$tool" >/dev/null 2>&1; then exit 2; fi; done
mkdir /tmp/home
export HOME=/tmp/home OPENROUTER_API_KEY=dummy-fixture-key
/iglo.mem init
unset OPENROUTER_API_KEY
/iglo.mem prepare
/iglo.mem search "offline empty query"
/iglo.mem status
/iglo.mem gc
'''
    result=subprocess.run(['docker','run','--rm','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user',f'{os.getuid()}:{os.getgid()}','--tmpfs','/tmp:rw,exec,mode=1777','--mount',f'type=bind,src={binary},dst=/iglo.mem,readonly','--mount',f'type=bind,src={root},dst=/repo','--workdir','/repo',image,'sh','-c',script],capture_output=True,text=True,timeout=45)
    if result.returncode: raise RuntimeError(result.stdout + result.stderr)
    results=[json.loads(line) for line in result.stdout.splitlines()]
    assert len(results)==5 and results[0]['credentialSource']=='environment' and results[2]['results']==[]
    assert not any(b'dummy-fixture-key' in path.read_bytes() for path in root.rglob('*') if path.is_file())
    print(json.dumps({'status':'PASS','image':image,'commands':5,'network':'disabled','runtimes':'Bun/Node/npm/Git absent','sourceAddon':'not mounted','credentialRepositoryCopy':'absent','results':results,'cleanup':'container --rm and temporary directory'}))
