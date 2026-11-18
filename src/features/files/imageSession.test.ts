import {it,expect} from 'vitest';
import {retireDeletedImage} from './imageSession';
import type {EditorSession} from '../editor/editorSessionTypes';
it('retires a deleted image during a blocked host return without making it an unsavable draft or touching another manuscript',()=>{
  const context={prompt:'unsent',proposal:null,undo:[],messages:[],lastRequest:null,writingNodeId:null},image:EditorSession={id:'editor:image',imagePath:'图.png',disk:null,state:null,view:null,dirty:false,context};
  const text={id:'editor',disk:{path:'稿.md'},state:{doc:'composing manuscript'},dirty:true},before=structuredClone(text);
  expect(retireDeletedImage(image)).toBe(true);expect(image).toMatchObject({disk:null,state:null,view:null,dirty:false,landing:true});expect(image.imagePath).toBeUndefined();expect(image.context).toBe(context);expect(text).toEqual(before);
});
