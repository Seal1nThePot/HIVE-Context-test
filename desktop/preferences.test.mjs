import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import prefs from './preferences.cjs';

describe('desktop preference persistence', () => {
  it('rejects credentials, prototype keys, invalid values and oversized data', () => {
    for (const data of [JSON.parse('{"__proto__":"x"}'), {'hive.apiKey':'secret'}, {'hive.appearance.v1':3}, {'hive.appearance.v1':'x'.repeat(131073)}, {'hive.reasoning.["s","m"]':'secret'}])
      expect(() => prefs.normalize(data)).toThrow();
    expect(prefs.allowed('hive.explorer.v1:workspace')).toBe(true);
    expect(prefs.allowed('hive.views.v1:workspace')).toBe(true);
  });
  it('atomically saves changed snapshots, preserves deletions and skips repeated snapshots', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(),'hive-prefs-'));
    try {
      const file=path.join(dir,'preferences.json'), store=prefs.preferenceStore(file);
      expect({...await store.read()}).toEqual({});
      await store.save({'hive.appearance.v1':'dark','hive.views.v1:one':'views'});
      const before=await stat(file);
      await store.save({'hive.views.v1:one':'views','hive.appearance.v1':'dark'});
      expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
      await store.save({'hive.appearance.v1':'light'}); await store.flush();
      expect(JSON.parse(await readFile(file,'utf8'))).toEqual({'hive.appearance.v1':'light'});
      expect({...await prefs.preferenceStore(file).read()}).toEqual({'hive.appearance.v1':'light'});
    } finally { await rm(dir,{recursive:true,force:true}); }
  });
});
