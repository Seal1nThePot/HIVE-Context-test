import {describe,it,expect} from 'vitest';
import {decodedOffsets} from './EditorContextMenu';
describe('table text selection source mapping',()=>{
  it('maps decoded escaped pipes, backslashes and line breaks to original offsets',()=>{
    const raw=String.raw`a\|b\\c<br>d`;
    expect(decodedOffsets(raw)).toEqual([0,1,3,4,6,7,11,12]);
  });
  it('handles an empty cell',()=>expect(decodedOffsets('')).toEqual([0]));
});
