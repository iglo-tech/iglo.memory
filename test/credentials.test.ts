import { afterEach, expect, test } from 'bun:test';
import { chmodSync, linkSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveCredential, resolveCredential } from '../src/credentials';
import { cleanup, cli, fixture, repository } from './helpers';
afterEach(cleanup);

test('shared saved credentials, override precedence and explicit replacement', () => {
  const home = fixture(); saveCredential(' first-dummy ', home);
  const path = join(home, '.config/iglo.mem/credentials.json');
  expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(statSync(join(home, '.config/iglo.mem')).mode & 0o777).toBe(0o700);
  expect(resolveCredential(home, '')).toEqual({ source: 'saved', key: 'first-dummy' });
  expect(resolveCredential(home, ' override-dummy ')).toEqual({ source: 'environment', key: 'override-dummy' });
  expect(readFileSync(path, 'utf8')).toContain('first-dummy');
  saveCredential('second-dummy', home); expect(resolveCredential(home, '')?.key).toBe('second-dummy');
  chmodSync(path, 0o644); expect(() => resolveCredential(home, '')).toThrow('Saved credentials');
  expect(resolveCredential(home, 'override-dummy')?.source).toBe('environment');
  expect(() => saveCredential('third-dummy', home)).toThrow();
  expect(readFileSync(path, 'utf8')).toContain('second-dummy');
});

test('reject repository-contained storage and symlinks; reset may replace malformed safe contents', () => {
  const home = repository(); expect(() => saveCredential('dummy', home)).toThrow();
  const safe = fixture(); mkdirSync(join(safe, '.config')); symlinkSync(fixture(), join(safe, '.config/iglo.mem'));
  expect(() => saveCredential('dummy', safe)).toThrow();
  const other = fixture(); saveCredential('dummy', other); const path = join(other, '.config/iglo.mem/credentials.json');
  writeFileSync(path, '{'); expect(() => resolveCredential(other, '')).toThrow();
  saveCredential('replacement', other); expect(resolveCredential(other, '')?.key).toBe('replacement');
});

test('real init JSON, saved reuse across repositories, preservation and noninteractive failure', async () => {
  const home = fixture(); const first = repository(); const second = repository();
  const missing = await cli(first, home, ['init']); expect(missing.exit).toBe(1); expect(missing.value.error.code).toBe('API_KEY_MISSING');
  const path = join(first, '.agent/memory.json'); const config = readFileSync(path, 'utf8');
  const env = await cli(first, home, ['init'], 'dummy-override');
  expect(env.exit).toBe(0); expect(env.value.credentialSource).toBe('environment'); expect(env.value.credentialsSaved).toBe(false);
  expect(env.stdout + env.stderr).not.toContain('dummy-override'); expect(readFileSync(path, 'utf8')).toBe(config);
  saveCredential('shared-dummy', home);
  for (const root of [first, second]) {
    const result = await cli(root, home, ['init']); expect(result.exit).toBe(0); expect(result.value.credentialSource).toBe('saved');
    expect(result.stdout + result.stderr).not.toContain('shared-dummy');
  }
  const reset = await cli(first, home, ['init', '--reset-credentials'], 'override');
  expect(reset.exit).toBe(1); expect(reset.value.error.code).toBe('SETUP_REQUIRES_TTY');
  expect(resolveCredential(home, '')?.key).toBe('shared-dummy');
  writeFileSync(join(first, '.env'), 'OPENROUTER_API_KEY=repository-dummy');
  writeFileSync(join(first, 'bunfig.toml'), 'preload=["./evil.ts"]');
  writeFileSync(join(first, 'evil.ts'), 'throw new Error("PRELOAD_EXECUTED")');
  const isolated = await cli(first, home, ['init']); expect(isolated.exit).toBe(0); expect(isolated.value.credentialSource).toBe('saved');
  expect(isolated.stdout + isolated.stderr).not.toContain('PRELOAD_EXECUTED');
});

test('concurrent successful saves leave one complete value and last completed save wins',async()=>{
  const home=fixture();saveCredential('initial',home);
  const module=join(import.meta.dir,'../src/credentials.ts');const trusted=join(home,'trusted.toml');writeFileSync(trusted,'');
  const start=(key:string)=>Bun.spawn([process.execPath,'--no-env-file',`--config=${trusted}`,'-e',`import {saveCredential} from ${JSON.stringify(module)};for(let i=0;i<500;i++)saveCredential(${JSON.stringify(key)},${JSON.stringify(home)});`],{stdout:'pipe',stderr:'pipe'});
  const children=[start('dummy-A'),start('dummy-B'),start('dummy-A'),start('dummy-B')];
  const exits=await Promise.all(children.map(child=>child.exited));
  expect(exits).toEqual([0,0,0,0]);
  expect(['dummy-A','dummy-B']).toContain(resolveCredential(home,'')!.key);
  saveCredential('final-dummy',home);expect(resolveCredential(home,'')?.key).toBe('final-dummy');
});

test('ordinary dotfiles repositories below home reject saved credential reads and writes',async()=>{
  for(const relative of ['.config','.config/iglo.mem']) {
    for(const gitfile of [false,true]) {
      const home=fixture();saveCredential('existing-dummy',home);
      const repo=join(home,relative);const marker=join(repo,'.git');
      if(gitfile)writeFileSync(marker,'gitdir: /fixture/administration\n');
      else{mkdirSync(join(marker,'objects'),{recursive:true});mkdirSync(join(marker,'refs'));writeFileSync(join(marker,'HEAD'),'ref: refs/heads/main\n');}
      const file=join(home,'.config/iglo.mem/credentials.json');const old=readFileSync(file);
      expect(()=>resolveCredential(home,'')).toThrow('Saved credentials');
      expect(()=>saveCredential('replacement-dummy',home)).toThrow('Saved credentials');
      expect(readFileSync(file)).toEqual(old);
      const result=await cli(repository(),home,['init']);
      expect(result.exit).toBe(1);expect(result.value.error.code).toBe('CREDENTIALS_INVALID');
      expect(readFileSync(file)).toEqual(old);
      expect(resolveCredential(home,'override-dummy')?.source).toBe('environment');
    }
  }
});

test('hard-linked credential files are rejected without replacing either link', () => {
  const home=fixture();saveCredential('dummy',home);
  const path=join(home,'.config/iglo.mem/credentials.json');const alias=join(home,'alias');
  linkSync(path,alias);const original=readFileSync(path);
  expect(()=>resolveCredential(home,'')).toThrow('Saved credentials');
  expect(()=>saveCredential('replacement',home)).toThrow('Saved credentials');
  expect(readFileSync(path)).toEqual(original);expect(readFileSync(alias)).toEqual(original);
});
