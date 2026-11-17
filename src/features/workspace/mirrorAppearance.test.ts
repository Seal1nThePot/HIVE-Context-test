import {afterEach,expect,it,vi} from 'vitest';
import {mirrorAppearance} from './nativeHostRuntime';

afterEach(()=>vi.unstubAllGlobals());
it('reuses unchanged styles, mirrors CSSOM updates and releases scheduled work',()=>{
  const callbacks:(()=>void)[]=[],observers:{callback:()=>void;disconnect:ReturnType<typeof vi.fn>}[]=[];
  vi.stubGlobal('MutationObserver',class{disconnect=vi.fn();constructor(callback:()=>void){observers.push({callback,disconnect:this.disconnect});}observe(){}});
  let scheduled:(()=>void)|undefined;
  const cancel=vi.fn(),request=vi.fn((callback:()=>void)=>{scheduled=callback;return 1;});
  vi.stubGlobal('window',{requestAnimationFrame:request,cancelAnimationFrame:cancel});
  const root={className:'dark',style:{cssText:'--x: 1'},lang:'zh-CN'},children:FakeNode[]=[];
  class FakeNode{
    dataset:Record<string,string>={};textContent='';
    constructor(public tagName:string,public attributes:{name:string;value:string}[]=[],public sheet?:{cssRules:{cssText:string}[]}){}
    cloneNode(){const copy=new FakeNode(this.tagName,this.attributes);copy.textContent=this.textContent;return copy;}
    get nextSibling(){return children[children.indexOf(this)+1]||null;}
    remove(){const index=children.indexOf(this);if(index>=0)children.splice(index,1);}
    replaceWith(node:FakeNode){children.splice(children.indexOf(this),1,node);}
  }
  const first=new FakeNode('STYLE',[],{cssRules:[{cssText:'.a { color: red; }'}]}),second=new FakeNode('STYLE',[],{cssRules:[{cssText:'.b { color: blue; }'}]});
  const sources=[first,second];
  const sourceHead={querySelectorAll:()=>sources,addEventListener:(_name:string,cb:()=>void)=>callbacks.push(cb),removeEventListener:vi.fn()};
  const targetHead={appendChild:(node:FakeNode)=>children.push(node),insertBefore:(node:FakeNode,before:FakeNode|null)=>{node.remove();const index=before?children.indexOf(before):children.length;children.splice(index,0,node);}};
  vi.stubGlobal('document',{head:sourceHead,documentElement:root});
  const target={head:targetHead,documentElement:{className:'',style:{cssText:''},lang:''}} as unknown as Document;
  const stop=mirrorAppearance(target),original=[...children];
  expect(children.map(node=>node.textContent)).toEqual(['.a { color: red; }','.b { color: blue; }']);
  root.className='light';observers[1].callback();observers[1].callback();expect(request).toHaveBeenCalledTimes(1);scheduled!();
  expect(target.documentElement.className).toBe('light');expect(children).toEqual(original);
  first.sheet!.cssRules.push({cssText:'.c { color: green; }'});observers[0].callback();scheduled!();
  expect(children[0]).not.toBe(original[0]);expect(children[0].textContent).toContain('.c');expect(children[1]).toBe(original[1]);
  sources.splice(0,1);observers[0].callback();scheduled!();expect(children).toEqual([original[1]]);
  const link=new FakeNode('LINK',[{name:'rel',value:'stylesheet'},{name:'href',value:'/theme.css'}]);
  const inaccessible=new FakeNode('STYLE');inaccessible.textContent='.fallback {}';Object.defineProperty(inaccessible,'sheet',{get:()=>{throw new Error('unavailable');}});
  sources.push(link,inaccessible);callbacks[0]();scheduled!();expect(children[1].tagName).toBe('LINK');expect(children[2].textContent).toBe('.fallback {}');
  const linked=children[1];callbacks[0]();scheduled!();expect(children[1]).toBe(linked);
  sources.splice(1,1);observers[0].callback();scheduled!();expect(children).not.toContain(linked);
  callbacks[0]();stop();expect(cancel).toHaveBeenCalledWith(1);expect(children).toEqual([]);expect(observers.every(observer=>observer.disconnect.mock.calls.length===1)).toBe(true);expect(sourceHead.removeEventListener).toHaveBeenCalledOnce();
});
