import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {spawn,fork} from 'node:child_process';
const require=createRequire(import.meta.url),project=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.HIVE_EDITOR_BUG_EVIDENCE||'D:/CodexWork/hive-015-bugs-20261118/editor';
async function browserChecks(){
  const checks=[],check=(name,ok,detail)=>{checks.push({name,passed:!!ok,detail});window.editorBugChecks=checks;if(!ok)throw Error(name+' '+JSON.stringify(detail));};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(fn,label)=>{for(let i=0;i<180;i++){if(fn())return;await pause(50);}throw Error('Timeout '+label);};
  const {React,createRoot,EditorView,EditorState,StateEffect,undo,redo}=await import('/__editor_imports.js');



  const {makeState,default:Editor}=await import('/src/features/editor/Editor.tsx');
  const {previewPlan,visibleReplacements}=await import('/src/features/editor/markdownPresentation.ts');
  const {setPreviewFocus}=await import('/src/features/editor/markdownDisplay.ts');
  const {WorkspaceProvider}=await import('/src/features/files/WorkspaceContext.tsx');
  await import('/src/app/styles.css');
  const el=React.createElement,info={id:'test',root:'isolated',autoSave:false,revision:0,repositories:[]};
  const mount=document.createElement('div');mount.style.cssText='position:absolute;inset:0;height:750px;width:900px;display:flex;flex-direction:column';document.body.append(mount);const root=createRoot(mount);
  let view,opened=[];
  const source='# 开头\n\n[文件](目标.md)\n\n| 甲 | 乙 |\n| --- | --- |\n| 原文 | 内容 |\n\n```powershell\nnpm test\nnpm run build\n```\n\n```mermaid\nflowchart LR\n  A[开始] --> B[完成]\n```\n\n**中文加粗** 和 普通文字 与 *中文斜体*\n';
  const props={initialState:makeState(source,()=>{}),onReady:v=>{view=v;},onUpdate:()=>{},documentFile:'测试.md',onOpenLink:target=>opened.push(target),onMarkSelection:()=>{}};
  const renderEditor=(extra={})=>root.render(el(WorkspaceProvider,{info,onChange:()=>{}},el(Editor,{...props,...extra})));
  renderEditor();await wait(()=>view?.dom.isConnected,'editor mount');await pause(250);
  const table=()=>view.dom.querySelector('[data-table-widget]');
  const preview=table().querySelector('[data-cell="1:0"] .cm-table-cell-preview');
  document.getSelection()?.removeAllRanges();preview.click();await pause(50);let input=table().querySelector('textarea[data-row="1"][data-col="0"]');
  check('BUG-002 single click enters a table cell',!input.hidden);
  input.value='编辑后';input.dispatchEvent(new Event('input',{bubbles:true}));await pause(50);
  check('BUG-002 editing writes cell and preserves table',view.state.doc.toString().includes('| 编辑后 | 内容 |'));
  undo(view);await pause(50);check('BUG-002 undo restores source',view.state.doc.toString()===source,{actual:view.state.doc.toString(),expected:source});redo(view);await pause(50);check('BUG-002 redo restores cell',view.state.doc.toString().includes('编辑后'));
  for(const [action,shape] of [['column-after','th'],['row-after','tr']]){
    const before=table().querySelectorAll(shape).length,button=table().querySelector('[data-table-action="'+action+'"]'),r=button.getBoundingClientRect(),clip=table().getBoundingClientRect();
    check('BUG-009 '+action+' button is inside scrollable bounds',r.top>=clip.top&&r.bottom<=clip.bottom&&r.left>=clip.left&&r.right<=clip.right,{button:r.toJSON(),clip:clip.toJSON()});
    button.click();await pause(80);check('BUG-009 '+action+' changes shape',table().querySelectorAll(shape).length===before+1);
    undo(view);await pause(80);check('BUG-009 '+action+' undo restores shape',table().querySelectorAll(shape).length===before);
  }
  mount.style.width='320px';await pause(100);
  for(const handle of table().querySelectorAll('th .cm-table-resize-col')){const rect=handle.getBoundingClientRect();handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,pointerId:7,button:0,clientX:rect.left,clientY:rect.top}));window.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,clientX:rect.left+250,clientY:rect.top}));window.dispatchEvent(new PointerEvent('pointerup',{pointerId:7}));}
  await pause(80);table().scrollLeft=table().scrollWidth;await pause(80);
  for(const action of ['column-after','row-after']){
    const buttons=[...table().querySelectorAll('[data-table-action="'+action+'"]')],button=buttons.at(-1),r=button.getBoundingClientRect(),clip=table().getBoundingClientRect();
    check('BUG-009 wide table '+action+' remains reachable after horizontal scroll',r.left>=clip.left&&r.right<=clip.right&&r.top>=clip.top&&r.bottom<=clip.bottom,{button:r.toJSON(),clip:clip.toJSON(),scroll:table().scrollLeft});
    const before=previewPlan(view.state).replacements.find(item=>item.kind==='table'),rows=before.rows.length,cols=before.columns;
    button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,pointerId:8,button:0,clientX:r.left+9,clientY:r.top+9}));button.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,isPrimary:true,pointerId:8,button:0}));button.click();await pause(80);const after=previewPlan(view.state).replacements.find(item=>item.kind==='table');check('BUG-009 wide table '+action+' pointer sequence changes shape',action==='row-after'?after.rows.length===rows+1:after.columns===cols+1);undo(view);await pause(80);
  }
  mount.style.width='900px';await pause(100);
  view.dispatch({selection:{anchor:0}});view.contentDOM.blur();await pause(80);
  const link=view.dom.querySelector('.cm-preview-link'),r=link.getBoundingClientRect();link.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
  check('BUG-006 ordinary rendered file link opens destination',opened.at(-1)==='目标.md',opened);
  renderEditor({displayMode:'source'});await wait(()=>view.dom.dataset.displayMode==='source','source mode link');const count=opened.length,point=view.coordsAtPos(view.state.doc.toString().indexOf('文件')+1),lineNode=view.domAtPos(view.state.doc.toString().indexOf('文件')).node,sourceTarget=lineNode.nodeType===1?lineNode:lineNode.parentElement;
  sourceTarget.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:point.left,clientY:(point.top+point.bottom)/2}));check('BUG-006 plain source click keeps editing',opened.length===count);sourceTarget.dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true,clientX:point.left,clientY:(point.top+point.bottom)/2}));check('BUG-006 source Ctrl-click opens file link',opened.length===count+1);renderEditor();await wait(()=>view.dom.dataset.displayMode==='live','return live mode');
  const fence=view.state.doc.toString().indexOf('npm test');view.dispatch({effects:EditorView.scrollIntoView(fence,{y:'center'})});await pause(200);const codeLine=[...view.dom.querySelectorAll('.cm-line')].find(node=>node.textContent.includes('npm test')),cr=codeLine.getBoundingClientRect();codeLine.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,detail:1,button:0,buttons:1,clientX:cr.left+25,clientY:cr.top+cr.height/2}));document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0,clientX:cr.left+25,clientY:cr.top+cr.height/2}));await pause(60);
  // A nonfocusable hidden window cannot receive native focus. Deliver the same
  // focus effect separately after verifying the synthetic mouse selection.
  check('BUG-007 mouse selection enters code body',view.state.selection.main.from>=fence&&view.state.selection.main.from<=fence+8);view.dispatch({effects:setPreviewFocus.of(true)});check('BUG-007 clicked code under simulated focus reveals language opening',view.dom.textContent.includes('```powershell'));
  view.dispatch({selection:{anchor:fence},effects:setPreviewFocus.of(true)});
  const hidden=visibleReplacements(view.state,true);check('BUG-007 selecting code reveals opening language fence',!hidden.some(item=>item.from<=view.state.doc.toString().indexOf('```powershell')&&item.to>view.state.doc.toString().indexOf('```powershell')));
  view.dispatch({selection:{anchor:fence,head:fence+'npm test\nnpm run build'.length},effects:setPreviewFocus.of(true)});check('BUG-007 multiline selection retains language opening',!visibleReplacements(view.state,true).some(item=>item.from===view.state.doc.toString().indexOf('```powershell')));
  view.dispatch({selection:{anchor:fence+2},effects:setPreviewFocus.of(true),userEvent:'select.keyboard'});check('BUG-007 keyboard selection retains language opening',!visibleReplacements(view.state,true).some(item=>item.from===view.state.doc.toString().indexOf('```powershell')));
  view.dispatch({effects:setPreviewFocus.of(false)});check('BUG-007 blur hides inactive opening fence',visibleReplacements(view.state,false).some(item=>item.from===view.state.doc.toString().indexOf('```powershell')));
  view.dispatch({selection:{anchor:0},effects:setPreviewFocus.of(false)});await wait(()=>view.dom.querySelector('.cm-mermaid-widget svg'),'mermaid SVG');check('BUG-008 real Mermaid generates an SVG',view.dom.querySelector('.cm-mermaid-widget svg').textContent.includes('开始'));
  const invalid='```mermaid\nthis is not a diagram\n```';view.dispatch({changes:{from:0,to:view.state.doc.length,insert:invalid},selection:{anchor:0},effects:setPreviewFocus.of(false)});await wait(()=>view.dom.querySelector('.cm-mermaid-widget [role=status]'),'mermaid invalid fallback');check('BUG-008 invalid diagram preserves source and exposes edit button',view.state.doc.toString()===invalid&&!!view.dom.querySelector('.cm-mermaid-widget button'));
  const oversized='```mermaid\n'+('x'.repeat(50001))+'\n```';view.dispatch({changes:{from:0,to:view.state.doc.length,insert:oversized},effects:setPreviewFocus.of(false)});await wait(()=>view.dom.querySelector('.cm-mermaid-widget [role=status]'),'mermaid oversized fallback');check('BUG-008 oversized diagram fails safely',view.dom.querySelector('.cm-mermaid-widget [role=status]').textContent.includes('50000'));
  const stale='```mermaid\nflowchart LR\n A[旧图] --> B\n```',fresh='```mermaid\nflowchart LR\n A[新图] --> B\n```';
  view.dispatch({changes:{from:0,to:view.state.doc.length,insert:stale},effects:setPreviewFocus.of(false)});view.dispatch({changes:{from:0,to:view.state.doc.length,insert:fresh},effects:setPreviewFocus.of(false)});await wait(()=>view.dom.querySelector('.cm-mermaid-widget svg'),'latest Mermaid after replacement');check('BUG-008 late render cannot overwrite a newer document',view.dom.querySelector('.cm-mermaid-widget svg').textContent.includes('新图')&&!view.dom.textContent.includes('旧图'));
  const unsafe='```mermaid\nflowchart LR\n A["<img src=x onerror=alert(1)>"] --> B\n click A "javascript:alert(1)"\n```';view.dispatch({changes:{from:0,to:view.state.doc.length,insert:unsafe},effects:setPreviewFocus.of(false)});await wait(()=>view.dom.querySelector('.cm-mermaid-widget svg'),'strict Mermaid');check('BUG-008 strict mode disables diagram links and executable HTML',!view.dom.querySelector('.cm-mermaid-widget svg script,.cm-mermaid-widget svg img,.cm-mermaid-widget svg a[href^="javascript:"]'));
  const {MermaidWidget}=await import('/src/features/editor/mermaidWidget.ts');let lateMeasures=0,disposed=false;const disposal=new MermaidWidget({from:0,to:1,reveal:{from:0,to:1},kind:'mermaid',text:'flowchart LR\n'+Array.from({length:30},(_,i)=>'A'+i+' --> A'+(i+1)).join('\n')}),detached=disposal.toDOM({dom:view.dom,state:view.state,requestMeasure:()=>lateMeasures++,dispatch:()=>{},focus:()=>{}});document.body.append(detached);const initial=detached.innerHTML;
  const observeRender=new MutationObserver(()=>{if(document.querySelector('[style*="left: -100000px"]')){disposal.destroy(detached);detached.remove();disposed=true;observeRender.disconnect();}});observeRender.observe(document.body,{childList:true});await wait(()=>disposed&&!document.querySelector('[style*="left: -100000px"]'),'disposed Mermaid staging cleanup');check('BUG-008 disposal ignores an in-flight render and releases staging DOM',detached.innerHTML===initial&&lateMeasures===0);
  renderEditor({displayMode:'split'});await wait(()=>mount.querySelector('.split-source .cm-editor'),'split mode');view.dispatch({changes:{from:0,to:view.state.doc.length,insert:source},selection:{anchor:0},effects:setPreviewFocus.of(false)});await wait(()=>view.dom.querySelector('.cm-mermaid-widget svg'),'split mermaid');await pause(500);check('BUG-008 split view keeps rendered Mermaid',!!mount.querySelector('.split-main .cm-mermaid-widget svg'));
  const long='每个实际宿主保存请求内容矩形和首次观察到的系统矩形；重新查询时只合入实际移动缩放的差量，防止 Windows 边框在收纳/重开时累计。原生最小尺寸在恢复边界统一约束。`hive:panel-rect` 仅接受主窗口查询登记中的宿主；`NativeHostRuntime.rect()` 通过宿主编号读取同一份规范化结果，成员收纳、组迁移、视图保存及关闭回接不再读取浏览器 `outerWidth` / `screenX`。 **WorkspaceLayout 格式保持不变。**';
  for(const width of [900,650,420]){
    mount.style.width=width+'px';view.dispatch({changes:{from:0,to:view.state.doc.length,insert:long},selection:{anchor:0}});await pause(1200);
    const left=mount.querySelector('.split-source .cm-editor'),bounds=left.querySelector('.cm-scroller').getBoundingClientRect(),walker=document.createTreeWalker(left.querySelector('.cm-content'),NodeFilter.SHOW_TEXT);let maxRight=0;
    for(let node;node=walker.nextNode();){const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects())maxRight=Math.max(maxRight,rect.right);}
    check('BUG-003 source inline formatting stays within '+width+'px split',maxRight<=bounds.right+1,{maxRight,right:bounds.right});
  }
  mount.style.width='900px';mount.querySelector('.split-source').style.flex='0 0 35%';
  view.dispatch({changes:{from:0,to:view.state.doc.length,insert:Array(18).fill(long).join('\n\n')},selection:{anchor:0}});await pause(1000);
  const leftView=EditorView.findFromDOM(mount.querySelector('.split-source .cm-editor'));leftView.scrollDOM.scrollTop=420;await pause(500);check('BUG-003 unequal panes synchronize source to preview scroll',view.scrollDOM.scrollTop>100,{source:leftView.scrollDOM.scrollTop,preview:view.scrollDOM.scrollTop});view.scrollDOM.scrollTop=0;await pause(500);check('BUG-003 unequal panes synchronize preview back to source',leftView.scrollDOM.scrollTop<5,{source:leftView.scrollDOM.scrollTop});
  const code='```js\n'+('const value = "abcdefghijklmnop"; '.repeat(80))+'\n```';view.dispatch({changes:{from:0,to:view.state.doc.length,insert:code},selection:{anchor:0},effects:setPreviewFocus.of(false)});await pause(800);const beforeX=leftView.scrollDOM.scrollLeft;leftView.dom.querySelector('.cm-code-nowrap').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,shiftKey:true,deltaY:120}));check('BUG-003 code keeps Shift-wheel horizontal scrolling',leftView.scrollDOM.scrollWidth>leftView.scrollDOM.clientWidth&&leftView.scrollDOM.scrollLeft>beforeX,{client:leftView.scrollDOM.clientWidth,scroll:leftView.scrollDOM.scrollWidth,left:leftView.scrollDOM.scrollLeft,beforeX,classes:[...leftView.dom.querySelectorAll('.cm-line')].map(node=>({class:node.className,whiteSpace:getComputedStyle(node).whiteSpace}))});
  root.unmount();mount.remove();
  // Exercise each writing-outline management action without a real model call.
  const {default:Outline}=await import('/src/features/outline/WritingOutlineV2.tsx');
  const outlineMount=document.createElement('div');outlineMount.className='writing-outline-test';document.body.append(outlineMount);const outlineRoot=createRoot(outlineMount);let nodes=[{id:'a',title:'甲',description:'要求',level:2,targetHeading:null},{id:'b',title:'乙',description:'',level:2,targetHeading:null}],selected=null,written=null;
  const outlineProps=()=>({items:[{title:'标题',level:1,from:0,to:4}],nodes,selectedId:selected,onSelect:id=>{selected=id;drawOutline();},onLocate:()=>{},onWrite:id=>{written=id;},onSave:async next=>{nodes=next;drawOutline();},busy:false,ready:true,onRetry:()=>{}});
  const drawOutline=()=>outlineRoot.render(el(Outline,outlineProps()));drawOutline();await pause(80);
  const click=async label=>{const button=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label);if(!button)throw Error('Missing button '+label);button.click();await pause(80);};
  const editorTitle=()=>document.querySelector('[aria-label="大纲节点标题"]');
  const submitOutline=()=>document.querySelector('.outline-node-editor').requestSubmit();
  const outlineTitles=()=>[...document.querySelectorAll('.outline-row-title')].map(button=>button.textContent);
  check('BUG-050 compact outline rows contain four controls or values',Array.from(document.querySelectorAll('.writing-outline-row')).every(row=>row.children.length===4));
  document.querySelector('.writing-outline-row').dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:5,clientY:5}));
  await pause(100);
  check('BUG-050 hovering a node no longer opens the old requirements tooltip',!document.querySelector('.outline-description-tooltip'));
  check('BUG-049 the outline has no embedded table-of-contents tab',!Array.from(document.querySelectorAll('.outline-view-switch button')).some(button=>button.textContent.trim()==='目录')&&!!document.querySelector('.writing-nodes'));
  await click('编辑大纲节点：甲');
  check('BUG-019 title opens a child dialog with saved writing requirements',!!document.querySelector('dialog[open] .outline-node-editor')&&document.querySelector('[aria-label="大纲节点写作要求"]').value==='要求');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(editorTitle(),'修订');editorTitle().dispatchEvent(new Event('input',{bubbles:true}));
  await pause(50);submitOutline();await wait(()=>!editorTitle(),'outline edit saved');
  check('BUG-019 edit saves existing node',nodes.length===2&&nodes[0].title==='修订');
  const firstHandle=document.querySelector('.outline-sort-handle'),targetRow=document.querySelectorAll('.writing-outline-row')[1],transfer=new DataTransfer();
  firstHandle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  targetRow.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  targetRow.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  firstHandle.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
  await wait(()=>outlineTitles()[1]==='修订','outline drag order');
  check('BUG-050 drag handle persists new order and renumbers rows',nodes[1].id==='a'&&[...document.querySelectorAll('.outline-row-number')].map(node=>node.textContent).join(',')==='01,02');
  await click('删除大纲节点：修订');check('BUG-019 delete preserves other node',nodes.length===1&&nodes[0].id==='b');
  await click('撤回删除大纲节点');check('BUG-019 undo delete restores position',nodes.length===2&&nodes[1].id==='a');
  await click('新建大纲节点');check('BUG-019 create opens empty form',editorTitle().value==='');
  await click('关闭新建大纲节点');await click('编辑大纲节点：修订');
  document.querySelector('.outline-node-actions button').click();await pause(80);
  check('BUG-019 write action routes selected node without calling AI',written==='a');
    outlineRoot.unmount();outlineMount.remove();
  return checks;
}
async function appChecks(){
  const checks=[],check=(name,ok,detail)=>{checks.push({name,passed:!!ok,detail});window.editorBugChecks=checks;if(!ok)throw Error(name+' '+JSON.stringify(detail));};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),wait=async(fn,label)=>{for(let i=0;i<180;i++){if(fn())return;await pause(50);}throw Error('Timeout '+label);};
  const {EditorView,undo}=await import('/__editor_imports.js');
  const get=s=>document.querySelector(s),editor=()=>EditorView.findFromDOM(get('.document-pane .split-main .cm-editor'));
  const click=async label=>{const b=get('[aria-label="'+label+'"]');if(!b)throw Error('Missing '+label);b.click();await pause(90);};
  const input=(selector,value)=>{const node=get(selector);Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));};
  const outline=async()=>(await(await fetch('/api/writing-outline?file='+encodeURIComponent('验收.md'))).json()).nodes;
  await wait(()=>get('.explorer-row[data-path="验收.md"]'),'App files');get('.explorer-row[data-path="验收.md"]').click();await wait(()=>get('.document-pane .cm-content')?.textContent.includes('验收正文'),'App file open');await pause(200);
  const link=get('.document-pane .cm-preview-link'),r=link.getBoundingClientRect();link.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));await wait(()=>get('.document-pane .cm-content')?.textContent.includes('中文空格目标内容'),'file navigation');
  check('BUG-006 actual App opens Chinese relative path with spaces',get('.document-pane .cm-content').textContent.includes('中文空格目标内容'));
  get('.explorer-row[data-path="验收.md"]').click();await wait(()=>get('.document-pane .cm-content')?.textContent.includes('验收正文'),'return main file');
  await click('面板');await click('大纲显示');await click('关闭面板管理');await wait(()=>get('[aria-label="新建大纲节点"]')&&!get('[aria-label="新建大纲节点"]').disabled,'outline ready');
  const originalCount=(await outline()).length;
  await click('新建大纲节点');input('[aria-label="大纲节点标题"]','测试新增');input('[aria-label="大纲节点写作要求"]','隔离资料写作要求');get('.outline-node-editor').requestSubmit();await wait(()=>!get('.outline-node-editor'),'outline create save');
  check('BUG-019 actual App creates and persists a new node',(await outline()).length===originalCount+1&&(await outline()).at(-1).title==='测试新增');
  await click('编辑大纲节点：测试新增');input('[aria-label="大纲节点标题"]','测试修改');input('[aria-label="大纲节点写作要求"]','修改后的写作要求');get('.outline-node-editor').requestSubmit();await wait(()=>!get('.outline-node-editor'),'outline edit save');
  check('BUG-019 actual App edits title and requirements',(await outline()).at(-1).title==='测试修改'&&(await outline()).at(-1).description==='修改后的写作要求');
  get('[aria-label="调整大纲节点顺序：测试修改"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));await pause(120);check('BUG-019 actual App reorders persisted nodes',(await outline()).at(-2).title==='测试修改');
  await click('删除大纲节点：测试修改');await pause(120);check('BUG-019 actual App deletes node without deleting body',!(await outline()).some(node=>node.title==='测试修改')&&editor().state.doc.toString().includes('验收正文'));
  await click('撤回删除大纲节点');await pause(120);check('BUG-019 actual App undo restores persisted node',(await outline()).some(node=>node.title==='测试修改'));
  const view=editor(),source=view.state.doc.toString();
  async function markSelection(text){
    const from=source.indexOf(text),count=new Set([...view.dom.querySelectorAll('[data-annotation-id]')].map(node=>node.dataset.annotationId)).size;
    view.dispatch({selection:{anchor:from,head:from+text.length}});
    const box=view.coordsAtPos(from+1),node=view.domAtPos(from+1).node,target=node.nodeType===1?node:node.parentElement;
    const coordinates={button:0,ctrlKey:true,clientX:box.left,clientY:(box.top+box.bottom)/2,bubbles:true,cancelable:true,detail:1};
    target.dispatchEvent(new PointerEvent('pointerdown',{...coordinates,pointerId:1,isPrimary:true}));
    target.dispatchEvent(new MouseEvent('click',coordinates));
    await wait(()=>new Set([...view.dom.querySelectorAll('[data-annotation-id]')].map(node=>node.dataset.annotationId)).size>count,'create text annotation '+text);
  }
  for(const text of ['第一节','用于实际','写作大纲','验收正文'])await markSelection(text);
  await wait(()=>[...document.querySelectorAll('.annotation-bubble')].some(button=>button.title==='标注：验收正文'),'annotation bubble');
  const annotation=[...document.querySelectorAll('.annotation-bubble')].find(button=>button.title==='标注：验收正文');
  if(get('.inline-annotation-editor')){annotation.click();await wait(()=>!get('.inline-annotation-editor'),'close existing local annotation popup');}
  annotation.click();await wait(()=>get('.inline-annotation-editor'),'annotation bubble opens local requirements');
  check('BUG-046 bubble opens local requirements while the global panel stays closed',!get('[data-panel-id="annotations"] .annotation-title-list')?.checkVisibility());
  await click('打开全局标注栏');await wait(()=>get('[data-panel-id="annotations"] [aria-current="true"]'),'explicit global annotation action');
  const focused=get('[data-panel-id="annotations"] [aria-current="true"]');
  check('BUG-011 explicit global annotation action selects its entry',focused.dataset.annotationListId===annotation.dataset.annotationKey);
  const list=focused.closest('.annotation-title-list');
  list.style.cssText='height:64px;max-height:64px;overflow:auto';list.scrollTop=0;
  annotation.click();await wait(()=>list.scrollTop>0,'open panel follows the selected annotation');
  const fr=focused.getBoundingClientRect(),lr=list.getBoundingClientRect();
  check('BUG-011 clicking a bubble scrolls the already open list to the selected entry',fr.top>=lr.top-1&&fr.bottom<=lr.bottom+1,{entry:fr.toJSON(),list:lr.toJSON(),scrollTop:list.scrollTop});
  await wait(()=>get('[aria-label="删除此标注"]'),'inline delete entry');
  const removed=focused.dataset.annotationListId;view.dispatch({changes:{from:view.state.doc.length,insert:'撤销测试'},userEvent:'input.type'});await click('删除此标注');await wait(()=>![...document.querySelectorAll('[data-annotation-list-id]')].some(node=>node.dataset.annotationListId===removed),'annotation removal');
  check('BUG-013 inline delete removes annotation without changing text',view.state.doc.toString()===source+'撤销测试');undo(view);check('BUG-013 annotation deletion preserves editor undo history',view.state.doc.toString()===source);
  await pause(600);const data=await(await fetch('/api/annotations?source=document&file='+encodeURIComponent('验收.md'))).json();check('BUG-013 deletion persists and preserves other annotations',data.items.length===3&&!data.items.some(item=>item.id===removed),data);
  return checks;
}
async function recoveryChecks(){
  const checks=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),get=s=>document.querySelector(s),wait=async(fn,label)=>{for(let i=0;i<180;i++){if(fn())return;await pause(50);}throw Error('Timeout '+label);};
  const check=(name,ok)=>{checks.push({name,passed:!!ok});if(!ok)throw Error(name);};
  await wait(()=>get('.explorer-row[data-path="验收.md"]'),'reloaded App');get('.explorer-row[data-path="验收.md"]').click();await wait(()=>get('.document-pane .cm-content')?.textContent.includes('验收正文'),'reloaded document');get('[aria-label="面板"]').click();await pause(70);get('[aria-label="大纲显示"]').click();get('[aria-label="关闭面板管理"]').click();await wait(()=>get('[aria-label="编辑大纲节点：测试修改"]'),'restored outline');get('[aria-label="编辑大纲节点：测试修改"]').click();await wait(()=>get('[aria-label="大纲节点写作要求"]'),'restored outline editor');
  check('BUG-019 reloading App restores saved outline node and requirements',get('[aria-label="大纲节点写作要求"]').value==='修改后的写作要求');
  const annotations=await(await fetch('/api/annotations?source=document&file='+encodeURIComponent('验收.md'))).json();check('BUG-013 reloading preserves other saved annotations after deletion',annotations.items.length===3);
  return checks;
}
async function worker(){
  console.log('Editor worker starting');
  const {app,BrowserWindow}=require('electron');app.setPath('userData',path.join(process.argv.at(-1),'profile'));app.disableHardwareAcceleration();await app.whenReady();
  const win=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,width:1100,height:900,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});let checks;
  try{const url='http://127.0.0.1:'+process.argv.at(-2);await win.loadURL(url+'/__editor_harness');checks=await win.webContents.executeJavaScript('('+browserChecks.toString()+')()');await win.loadURL(url+'/');const integration=await win.webContents.executeJavaScript('('+appChecks.toString()+')()');await fs.writeFile(path.join(output,'app-success.png'),(await win.webContents.capturePage()).toPNG());await win.loadURL(url+'/');const recovery=await win.webContents.executeJavaScript('('+recoveryChecks.toString()+')()');await fs.writeFile(path.join(output,'validation.json'),JSON.stringify({passed:true,method:'Hidden nonfocusable Electron, synthetic component fixtures and complete App with isolated real backend; no desktop input or real model',checks,integration,recovery},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,integration:integration.length,recovery:recovery.length}));app.exit(0);}catch(error){await fs.writeFile(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG());const partial=await win.webContents.executeJavaScript('window.editorBugChecks').catch(()=>[]);await fs.writeFile(path.join(output,'partial.json'),JSON.stringify({checks,partial,error:String(error)},null,2));console.error(error);app.exit(1);}
}
if(process.argv.includes('--editor-bugs-worker'))void worker().catch(error=>{console.error(error);require('electron').app.exit(1);});
else{
  await fs.mkdir(output,{recursive:true});const profile=await fs.mkdtemp(path.join(output,'profile-'));
  const docs=path.join(profile,'documents');await fs.mkdir(path.join(docs,'中文 目录'),{recursive:true});await fs.writeFile(path.join(docs,'验收.md'),'# 验收正文\n\n[文件链接](中文%20目录/目标%20文稿.md)\n\n## 第一节\n\n用于实际应用标注与写作大纲验收。\n');await fs.writeFile(path.join(docs,'中文 目录/目标 文稿.md'),'# 中文空格目标内容\n');
  const backend=fork(path.join(project,'server/index.mjs'),[],{cwd:project,silent:true,windowsHide:true,env:{...process.env,HIVE_PORT:'0',HIVE_DOCUMENTS:docs,HIVE_STATE_DIR:path.join(profile,'state'),HIVE_API_KEY:''}});let serverLog='';backend.stdout.on('data',v=>serverLog+=v);backend.stderr.on('data',v=>serverLog+=v);const backendPort=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Isolated backend timeout')),15000);backend.on('message',m=>{if(m?.type==='hive-ready'){clearTimeout(timer);resolve(m.port);}});backend.once('error',reject);});
  const {createServer}=await import('vite');const server=await createServer({root:project,optimizeDeps:{entries:['src/main.tsx'],include:['react','react-dom/client','@codemirror/view','@codemirror/state','@codemirror/commands']},server:{port:0,host:'127.0.0.1',proxy:{'/api':{target:'http://127.0.0.1:'+backendPort,changeOrigin:true,configure(proxy){proxy.on('proxyReq',request=>request.setHeader('origin','http://127.0.0.1:'+backendPort));}}}},plugins:[{name:'editor-harness',resolveId(id){if(id==='/__editor_imports.js')return '\0editor-imports';},load(id){if(id==='\0editor-imports')return "export {default as React} from 'react';export {createRoot} from 'react-dom/client';export {EditorView} from '@codemirror/view';export {EditorState,StateEffect} from '@codemirror/state';export {undo,redo} from '@codemirror/commands';";},configureServer(server){server.middlewares.use('/__editor_harness',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__editor_harness','<!doctype html><html><head></head><body></body></html>'));});}}]});
  try{await server.listen();const url=String(server.httpServer.address().port),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn((await import('electron')).default,[fileURLToPath(import.meta.url),'--editor-bugs-worker',url,profile],{cwd:project,env,windowsHide:true,stdio:'pipe'});let log='';child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v);const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Editor checks timed out'));},120000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});await fs.writeFile(path.join(output,'run.log'),log);console.log({code,log});if(code!==0)process.exitCode=1;}finally{await server.close();await fs.writeFile(path.join(output,'backend.log'),serverLog);if(backend.exitCode===null)await new Promise(resolve=>{backend.once('exit',resolve);backend.kill();});const resolved=path.resolve(profile);if(path.dirname(resolved)!==path.resolve(output)||!path.basename(resolved).startsWith('profile-'))throw Error('Unexpected profile path');await fs.rm(resolved,{recursive:true,force:true});}
}













