"""Exercise the compiled binary with disposable Git repositories and PTYs."""
import json, os, pathlib, pty, select, shutil, subprocess, sys, tempfile, termios, time
binary = pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'dist/iglo.mem').resolve()
with tempfile.TemporaryDirectory(prefix='iglo-terminal-',dir='/tmp') as temp:
    base=pathlib.Path(temp); home=base/'home';home.mkdir();repo=base/'repo';repo.mkdir()
    subprocess.run(['git','init','--quiet',str(repo)],check=True)
    env={**os.environ,'HOME':str(home),'PATH':'/nonexistent'};env.pop('OPENROUTER_API_KEY',None)
    def tty(args, entry, expected, secret=None):
        master,slave=pty.openpty();original=termios.tcgetattr(slave)
        proc=subprocess.Popen([str(binary),*args],cwd=repo,env=env,stdin=slave,stderr=slave,stdout=subprocess.PIPE)
        captured=b''
        try:
            deadline=time.monotonic()+10
            while b'OpenRouter API key:' not in captured:
                assert time.monotonic()<deadline, 'prompt timeout'
                ready,_,_=select.select([master],[],[],.1)
                if ready: captured+=os.read(master,65536)
                assert proc.poll() is None, captured.decode(errors='replace')
            while termios.tcgetattr(slave)[3]&termios.ECHO:
                assert time.monotonic()<deadline;time.sleep(.01)
            os.write(master,entry)
            output=proc.communicate(timeout=10)[0]
            while select.select([master],[],[],0)[0]:
                captured+=os.read(master,65536)
            value=json.loads(output)
            assert proc.returncode==expected,(value,captured)
            assert termios.tcgetattr(slave)==original,'terminal mode not restored'
            if secret: assert secret not in captured and secret not in output,'entered key echoed'
            return value
        finally:
            if proc.poll() is None: proc.kill();proc.wait()
            os.close(master);os.close(slave)
    first=tty(['init'],b'  dummy-shared-key  \r',0,b'dummy-shared-key')
    assert first['credentialSource']=='entered' and first['credentialsSaved'] is True
    saved=home/'.config/iglo.mem/credentials.json';old=saved.read_bytes()
    assert saved.stat().st_mode&0o777==0o600
    assert tty(['init','--reset-credentials'],b'partial\x03',1)['error']['code']=='SETUP_CANCELLED'
    assert saved.read_bytes()==old
    assert tty(['init','--reset-credentials'],b'\x04',1)['error']['code']=='SETUP_CANCELLED'
    assert saved.read_bytes()==old
    assert tty(['init','--reset-credentials'],b'\rreplacement-key\r',0,b'replacement-key')['credentialsSaved'] is True
    assert json.loads(saved.read_text())['openrouter']['apiKey']=='replacement-key'
    # Compiled startup ignores local dotenv/preload, and saved-key use needs no shell startup.
    (repo/'.env').write_text('OPENROUTER_API_KEY=REPO_KEY\n')
    (repo/'bunfig.toml').write_text('preload=["./evil.ts"]\n')
    (repo/'evil.ts').write_text('throw new Error("PRELOAD_EXECUTED")')
    result=subprocess.run([str(binary),'init'],cwd=repo,env=env,stdin=subprocess.DEVNULL,capture_output=True,check=True)
    assert json.loads(result.stdout)['credentialSource']=='saved'
    linked=base/'linked'
    subprocess.run(['git','-C',str(repo),'-c','user.name=QA','-c','user.email=qa@example.invalid','commit','--allow-empty','-qm','fixture'],check=True)
    subprocess.run(['git','-C',str(repo),'worktree','add','--quiet','-b','qa',str(linked)],check=True)
    result=subprocess.run([str(binary),'init'],cwd=linked,env=env,stdin=subprocess.DEVNULL,capture_output=True,check=True)
    assert json.loads(result.stdout)['credentialSource']=='saved'
    for root in [repo,linked]:
        for path in root.rglob('*'):
            if path.is_file() and '.git' not in path.parts:
                assert b'replacement-key' not in path.read_bytes(),'key copied to repository'
    for command in [['prepare'],['search','query'],['status'],['gc']]:
        result=subprocess.run([str(binary),*command],cwd=linked,env={**env,'OPENROUTER_API_KEY':''},stdin=subprocess.DEVNULL,capture_output=True,check=True)
        assert isinstance(json.loads(result.stdout),dict)
    print(json.dumps({'terminal':'PASS','hidden_entry':'PASS','cancel_eof_restore':'PASS','reset':'PASS','saved_reuse_linked_worktree':'PASS','startup_isolation':'PASS','five_commands_no_runtime_on_PATH':'PASS','cleanup':'temporary fixtures removed on exit'}))
