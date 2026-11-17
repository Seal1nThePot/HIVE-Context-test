import {it,expect,vi} from 'vitest';
import path from 'node:path';
import {createRequire} from 'node:module';
const {createFileRevealHandler}=createRequire(import.meta.url)('./fileReveal.cjs');

it('uses the native shell with the exact validated Unicode path and rejects bad requests',async()=>{
  const shell={showItemInFolder:vi.fn()},stat=vi.fn(async()=>({isSymbolicLink:()=>false,isFile:()=>true,isDirectory:()=>false}));
  const handle=createFileRevealHandler({shell,stat}),message={type:'hive-reveal-file',id:'12345678-1234-1234-1234-123456789abc',path:path.resolve('中文 & 空格.md')};
  expect(await handle(message)).toMatchObject({ok:true,id:message.id});expect(shell.showItemInFolder).toHaveBeenCalledExactlyOnceWith(message.path);
  for(const change of [{path:'relative.md'},{path:message.path+'\0'},{id:'wrong'},{type:'renderer-request'}])expect(await handle({...message,...change})).toMatchObject({ok:false});
  expect(shell.showItemInFolder).toHaveBeenCalledTimes(1);
  stat.mockRejectedValueOnce(Error('private path'));expect(await handle(message)).toEqual({type:'hive-reveal-result',id:message.id,ok:false});
  shell.showItemInFolder.mockImplementationOnce(()=>{throw Error('native failure');});expect(await handle(message)).toMatchObject({ok:false});
});
