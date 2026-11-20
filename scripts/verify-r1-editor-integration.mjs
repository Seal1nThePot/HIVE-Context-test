import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {fork,spawn} from 'node:child_process';

const project=fileURLToPath(new URL('../',import.meta.url));
const entry=fileURLToPath(import.meta.url);
const output=path.resolve(process.env.HIVE_R1_EVIDENCE||path.join(project,'.runtime/checks/r1'));
const require=createRequire(import.meta.url);
const sourceFile='r1-source.md',targetFile='目标 文稿.md',targetDirectory='中文 目录';
const mixed='正文首句。较长段落同时包含 English、**粗体**、路径与格式，用来测量宽窄变化之后各段在两栏的位置。';
const source=['# r1 验收正文','','[**本地链接**](中文%20目录/目标%20文稿.md)','','- [ ] 保持原状态','','---','',
  ...Array.from({length:42},(_,i)=>[
    '## 对齐标题 '+i,'',mixed.repeat(i%4+2),'',
    ...(i===12?['| 标题 | 内容 |','| --- | --- |',...Array.from({length:14},(_,j)=>'| 行 '+j+' | 测试内容 '+mixed+' |'),'']:[]),
    '> 引用段落用于确认前后内容的位置。','','---','',
  ].join('\n'))].join('\n');

function browserSetup(sourceFile){
  return import('/__r1_editor.js').then(({EditorView,undo})=>{
    const all=selector=>[...document.querySelectorAll(selector)];
    const shown=el=>el instanceof HTMLElement&&el.checkVisibility({checkVisibilityCSS:true});
    const pane=()=>all('.document-pane').find(el=>shown(el)&&el.querySelector('.split-main .cm-editor'));
    const editor=(container='.split-main')=>{
      const element=pane()?.querySelector(container+' .cm-editor');
      return element?EditorView.findFromDOM(element):null;
    };
    const tabs=()=>all('[role="tab"][data-panel-tab]');
    const clickText=(selector,text)=>{
      const button=all(selector).find(el=>el.textContent.trim()===text);
      if(!button)throw Error('Missing menu entry '+text);
      button.click();
    };
    window.r1={
      all,shown,pane,editor,tabs,undo,clickText,
      goTo(text,container='.split-main'){
        const view=editor(container),position=view.state.doc.toString().indexOf(text);
        if(position<0)throw Error('Missing fixture text '+text);
        view.dispatch({effects:EditorView.scrollIntoView(position,{y:'start',yMargin:36})});
      },
      splitFixture(text){
        const live=editor();
        live.dispatch({changes:{from:0,to:live.state.doc.length,insert:text},selection:{anchor:0},effects:EditorView.scrollIntoView(0,{y:'start'}),userEvent:'input.type'});
        live.contentDOM.blur();
      },
      splitCodeSamples(texts){
        const src=editor('.split-source'),live=editor(),doc=live.state.doc;
        const unpack=({from,to,top,bottom,type})=>({from,to,top,bottom,type:Array.isArray(type)?type.map(unpack):type});
        const blocks=view=>view.viewportLineBlocks.map(unpack);
        const lines=Array.from({length:doc.lines},(_,index)=>{
          const line=doc.line(index+1);
          return {text:line.text,from:line.from,to:line.to};
        });
        const samples=texts.map(text=>{
          const pos=doc.toString().indexOf(text),source=src.coordsForChar(pos),semantic=live.coordsForChar(pos);
          return {text,source:source?.top,semantic:semantic?.top,delta:source&&semantic?Math.abs(source.top-semantic.top):null};
        });
        const dom=Array.from(live.contentDOM.querySelectorAll('.cm-line'),el=>({text:el.textContent,style:el.getAttribute('style'),from:live.posAtDOM(el)}));
        return {samples,lines,source:blocks(src),semantic:blocks(live),dom,scroll:[src.scrollDOM.scrollTop,live.scrollDOM.scrollTop]};
      },
      splitHit(container,text){
        const view=editor(container),pos=view.state.doc.toString().indexOf(text);
        const char=view.coordsForChar(pos),bounds=view.scrollDOM.getBoundingClientRect();
        if(!char||char.top<bounds.top||char.bottom>bounds.bottom)return null;
        return {pos,point:{x:Math.round(char.left+1),y:Math.round((char.top+char.bottom)/2)}};
      },
      caret(container){
        const view=editor(container),other=editor(container==='.split-main'?'.split-source':'.split-main');
        return {head:view.state.selection.main.head,focus:view.hasFocus,otherFocus:other.hasFocus,same:other.state.selection.eq(view.state.selection)};
      },
      trackSplitEdit(text){
        const views=[editor('.split-source'),editor()];
        window.r1.editFrames=[];
        const sample=()=>window.r1.editFrames.push(views.map(view=>view.coordsForChar(view.state.doc.toString().indexOf(text))?.top));
        sample();
        const end=performance.now()+400;
        const tick=()=>{sample();if(performance.now()<end)requestAnimationFrame(tick);};
        requestAnimationFrame(tick);
      },
      clickSource:()=>document.querySelector('.explorer-row[data-path="'+sourceFile+'"]').click(),
      modeMenu:()=>pane().querySelector('.display-mode-button').click(),
      position(selector){
        const target=typeof selector==='string'?all(selector).find(shown):selector;
        if(!target)throw Error('Missing visible target '+selector);
        const rect=target.getBoundingClientRect();
        return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};
      },
      splitGeometry(){
        const root=pane().querySelector('.split-view'),source=root.querySelector('.split-source'),main=root.querySelector('.split-main'),divider=root.querySelector('.split-divider');
        return {sourceX:source.getBoundingClientRect().left,mainX:main.getBoundingClientRect().left,
          sourceWidth:source.clientWidth,mainWidth:main.clientWidth,percent:Number(divider.getAttribute('aria-valuenow'))};
      },
      splitSamples(side){
        const src=editor('.split-source'),live=editor(),driver=side==='source'?src:live;
        const bounds=driver.scrollDOM.getBoundingClientRect(),doc=driver.state.doc;
        const difference=[];
        for(const block of driver.viewportLineBlocks){
          const line=doc.lineAt(block.from),prefix=/^(## |正文首句)/.exec(line.text);
          if(!prefix)continue;
          const pos=line.from+(prefix[0]==='## '?3:0),driverRect=driver.coordsForChar(pos);
          if(!driverRect||driverRect.top<bounds.top+2||driverRect.bottom>bounds.bottom-2)continue;
          const a=src.coordsForChar(pos),b=live.coordsForChar(pos);
          difference.push({line:line.number,kind:prefix[0]==='## '?'title':'body',delta:a&&b?Math.abs(a.top-b.top):null});
        }
        return {top:driver.scrollDOM.scrollTop,difference};
      },
    };
  });
}

async function worker(port,profile){
  const {app,BrowserWindow}=require('electron');
  app.setPath('userData',path.join(profile,'electron'));
  app.disableHardwareAcceleration();
  await app.whenReady();
  const win=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,width:1600,height:1050,
    webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const cd=win.webContents.debugger;
  cd.attach('1.3');
  const evidence={'display-modes':[],'split-alignment':[],'link-navigation':[],'context-menus':[]};
  const evaluate=expression=>win.webContents.executeJavaScript(expression);
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(expression,label=expression,timeout=5000)=>{
    const deadline=Date.now()+timeout;
    do{const value=await evaluate(expression);if(value)return value;await pause(40);}while(Date.now()<deadline);
    throw Error('Timed out waiting for '+label);
  };
  function check(section,name,passed,detail){
    evidence[section].push({name,passed:!!passed,detail});
    assert.ok(passed,name+' '+JSON.stringify(detail??''));
    console.log(name);
  }
  async function setMode(mode){
    await evaluate('r1.modeMenu()');
    await wait('document.querySelector(".display-mode-menu")?.isConnected','display menu');
    await evaluate('r1.clickText(".display-mode-menu button",'+JSON.stringify(mode)+')');
    await pause(150);
  }
  const point=selector=>evaluate('r1.position('+JSON.stringify(selector)+')');
  async function mouse(type,xy,options={}){
    await cd.sendCommand('Input.dispatchMouseEvent',{type,...xy,...options});
  }
  async function click(xy,button='left'){
    await mouse('mousePressed',xy,{button,buttons:button==='right'?2:1,clickCount:1});
    await mouse('mouseReleased',xy,{button,buttons:0,clickCount:1});
  }
  async function dragDivider(percent){
    const start=await point('.split-divider'),end=await evaluate('(()=>{const r=r1.pane().querySelector(".split-view").getBoundingClientRect();return {x:Math.round(r.left+r.width*'+percent+'),y:'+start.y+'};})()');
    const hit=await evaluate('document.elementsFromPoint('+start.x+','+start.y+').slice(0,4).map(e=>e.className)');
    await mouse('mousePressed',start,{button:'left',buttons:1,clickCount:1});
    const grabbed=await evaluate('r1.pane().querySelector(".split-divider").dataset.dragging');
    for(let i=1;i<=7;i++){
      await mouse('mouseMoved',{x:Math.round(start.x+(end.x-start.x)*i/7),y:start.y},{buttons:1});
      await pause(16);
    }
    await mouse('mouseReleased',end,{button:'left',buttons:0,clickCount:1});
    await pause(550);
    return {...await evaluate('r1.splitGeometry()'),hit,grabbed,start,end};
  }
  try{
    console.log('Opening isolated App');
    await win.loadURL('http://127.0.0.1:'+port);
    await evaluate('('+browserSetup.toString()+')('+JSON.stringify(sourceFile)+')');
    await wait('!!document.querySelector('+JSON.stringify('.explorer-row[data-path="r1-source.md"]')+')','source fixture');
    await evaluate('r1.clickSource()');
    await wait('r1.editor()?.state.doc.toString().includes("r1 验收正文")','source editor');

    await evaluate('r1.modeMenu()');
    const labels=await evaluate('r1.all(".display-mode-menu button").slice(0,4).map(b=>b.textContent.trim())');
    check('display-modes','Mode menu exposes four choices in order',JSON.stringify(labels)===JSON.stringify(['实时预览','实时编辑','代码模式','左右分栏']),labels);
    await evaluate('r1.clickText(".display-mode-menu button","实时预览")');
    await wait('r1.editor()?.state.readOnly','read-only display');
    const readonly=await evaluate('(()=>{const e=r1.editor();e.contentDOM.focus();e.dispatch({changes:{from:0,insert:"BLOCKED"} ,userEvent:"input.type"});return e.contentDOM.contentEditable==="false"&&e.state.doc.toString().startsWith("# r1")&&e.dom.querySelector(".cm-preview-task").disabled;})()');
    await cd.sendCommand('Input.insertText',{text:'BLOCKED_NATIVE'});
    check('display-modes','Read-only preview blocks both dispatch and native insert; task is disabled',readonly&&await evaluate('!r1.editor().state.doc.toString().includes("BLOCKED")'));
    await setMode('实时编辑');
    await evaluate('(()=>{const e=r1.editor();e.dispatch({selection:{anchor:0}});e.focus();})()');
    await cd.sendCommand('Input.insertText',{text:'未保存草稿\n\n'});
    await wait('r1.editor().state.doc.toString().startsWith("未保存草稿")','editable native input');
    check('display-modes','Live editing accepts native input into the draft',true);
    await setMode('实时预览');

    const linkSelector='.document-pane .split-main [data-hive-link]';
    const link=await point(linkSelector);
    const color=()=>evaluate('(()=>{const e=r1.all('+JSON.stringify(linkSelector)+').find(r1.shown);return getComputedStyle(e.querySelector(".cm-preview-strong")||e.lastElementChild||e).color;})()');
    const plain=await color();await mouse('mouseMoved',link);await pause(70);const hovered=await color();
    await mouse('mouseMoved',{x:2,y:2});await pause(70);const restored=await color();
    check('link-navigation','Displayed characters change color on hover and restore after leave',plain!==hovered&&plain===restored,{plain,hovered,restored});
    await click(link);
    await wait('r1.editor()?.state.doc.toString().includes("新标签页目标内容")','link in a new tab');
    const opened=await evaluate('r1.tabs().map(t=>t.textContent.trim())');
    check('link-navigation','Plain click in preview opens a new tab beside the source',opened.some(label=>label.includes(sourceFile))&&opened.some(label=>label.includes(targetFile)),opened);
    check('display-modes','Source tab is marked dirty and disk remains unchanged',await evaluate('!!r1.tabs().find(t=>t.textContent.includes('+JSON.stringify(sourceFile)+')).querySelector(".dirty-dot")')&&await fs.readFile(path.join(profile,'documents',sourceFile),'utf8')===source);
    await evaluate('r1.tabs().find(t=>t.textContent.includes('+JSON.stringify(sourceFile)+')).click()');
    await wait('r1.editor()?.state.readOnly&&r1.editor().state.doc.toString().startsWith("未保存草稿")','source tab restored');
    await setMode('实时编辑');
    check('link-navigation','Draft and undo history survive navigation',await evaluate('r1.undo(r1.editor())&&r1.editor().state.doc.toString().startsWith("# r1")'));

    const row=await point('.explorer-row[data-path="r1-source.md"]');
    await click(row,'right');
    await wait('!!document.querySelector(".explorer-menu")','file context menu');
    const blocker=await evaluate('(()=>{const b=document.createElement("button");b.id="r1-pointer-blocker";b.style.cssText="position:fixed;top:80px;right:20px;z-index:50000";b.textContent="Block bubbling";b.addEventListener("pointerdown",e=>e.stopPropagation());document.body.append(b);return r1.position(b);})()');
    await click(blocker);
    await wait('!document.querySelector(".explorer-menu")','outside pointer closes menu');
    check('context-menus','File context menu closes through capture even if outside target stops bubbling',true);
    {
      await setMode('实时预览');
      await click(row,'right');
      await wait('!!document.querySelector(".explorer-menu")','file operation menu');
      const action=await evaluate('r1.position(r1.all(".explorer-menu button").find(b=>b.textContent.includes("在新标签页中打开")))');
      const previewId=await evaluate('r1.tabs().find(t=>t.getAttribute("aria-selected")==="true").dataset.panelTab');
      await click(action);
      await wait('r1.editor()&&!r1.editor().state.readOnly&&r1.editor().state.doc.toString().startsWith("# r1")','menu action new tab');
      check('context-menus','Pointer click inside file menu executes its action',true,{action});
      await wait('!document.querySelector("[data-panel-id="+JSON.stringify('+JSON.stringify(previewId)+')+"] .cm-editor")','inactive preview sleeps');
      await evaluate('r1.editor().dispatch({changes:{from:0,insert:"共享同步\\n\\n"},userEvent:"input.type"})');
      await evaluate('r1.tabs().find(t=>t.dataset.panelTab==='+JSON.stringify(previewId)+').click()');
      await wait('r1.editor()?.state.readOnly&&r1.editor().state.doc.toString().startsWith("共享同步")','shared update into sleeping preview');
      check('display-modes','Sleeping read-only preview receives shared source updates',true);
    }

    await click(await point(linkSelector),'right');
    await wait('!!document.querySelector(".editor-context-menu")','editor context menu');
    const menuLayout=await evaluate('(()=>{for(const b of r1.all(".editor-context-menu > button")){if(b.textContent==="跳转至文件"){const next=b.nextElementSibling,a=b.querySelector("span").getBoundingClientRect(),c=next.querySelector("span").getBoundingClientRect();return {icon:!!b.querySelector("svg"),x:Math.abs(a.left-c.left),height:Math.abs(b.offsetHeight-next.offsetHeight)};}}})()');
    check('context-menus','Jump row uses the same icon/text alignment and height as mark row',menuLayout?.icon&&menuLayout.x<1&&menuLayout.height<1,menuLayout);
    await click(blocker);
    await wait('!document.querySelector(".editor-context-menu")','text menu closes on outside pointer');
    await click(row,'right');
    await wait('!!document.querySelector(".explorer-menu")','file menu opens again');
    await evaluate('window.dispatchEvent(new Event("blur"))');
    await wait('!document.querySelector(".explorer-menu")','owner-window blur closes the menu');
    check('context-menus','File menu closes on its owner window blur event',true);
    await evaluate('document.getElementById("r1-pointer-blocker").remove()');

    await setMode('左右分栏');
    await wait('r1.pane().querySelector(".split-divider").isConnected','split divider');
    const initial=await evaluate('r1.splitGeometry()');
    check('split-alignment','Default split places source on left near 50%',initial.sourceX<initial.mainX&&Math.abs(initial.percent-50)<2,initial);
    async function verifyScrolling(side,label,direction=1){
      const pane=side==='source'?'.split-source':'.split-main',position=await point('.document-pane '+pane+' .cm-scroller');
      const before=await evaluate('r1.splitSamples("'+side+'")');
      const frames=[];
      for(let i=0;i<9;i++){
        await mouse('mouseWheel',position,{deltaY:(i%2===0?248:176)*direction,deltaX:0});
        await pause(55);frames.push(await evaluate('r1.splitSamples("'+side+'")'));
      }
      await pause(700);
      const settled=await evaluate('r1.splitSamples("'+side+'")');
      const samples=settled.difference.filter(sample=>sample.delta!==null);
      const during=frames.flatMap(frame=>frame.difference).filter(sample=>sample.delta!==null);
      const max=Math.max(0,...samples.map(sample=>sample.delta));
      const duringMax=Math.max(0,...during.map(sample=>sample.delta));
      check('split-alignment',label,samples.length>=1&&max<=3&&during.length>=6&&duringMax<=3&&new Set(during.map(sample=>sample.kind)).size===2&&Math.abs(settled.top-before.top)>100,{before:before.top,frames,settled,max,duringMax});
    }
    const narrow=await dragDivider(.35);
    check('split-alignment','Pointer drag left makes the physical left pane about 35%',narrow.percent>=33&&narrow.percent<=37,narrow);
    await verifyScrolling('source','Scroll down from narrow source with aligned heading/body starts');
    const wide=await dragDivider(.65);
    check('split-alignment','Pointer drag right makes the physical left pane about 65%',wide.percent>=63&&wide.percent<=67,wide);
    await verifyScrolling('live','Scroll down from narrow semantic pane after resizing');

    await evaluate('document.querySelector("[aria-label=设置]").click()');
    await wait('!!document.querySelector(".settings-page")','settings');
    await evaluate('r1.clickText(".settings-page nav button","界面")');
    await wait('!!document.getElementById("split-view-order")','split order setting');
    await evaluate('document.getElementById("split-view-order").click();document.querySelector("[aria-label=关闭设置]").click();');
    await pause(450);
    const reversed=await evaluate('r1.splitGeometry()');
    check('split-alignment','Setting swaps panes while preserving the physical divider position',reversed.mainX<reversed.sourceX&&reversed.percent===wide.percent,reversed);
    check('split-alignment','Setting is stored in local appearance',await evaluate('JSON.parse(localStorage.getItem("hive.appearance.v1")).splitOrder==="semantic-first"'));
    const reversedDrag=await dragDivider(.35);
    check('split-alignment','Pointer drag remains available after swapping panes',reversedDrag.mainX<reversedDrag.sourceX&&reversedDrag.percent>=33&&reversedDrag.percent<=37,reversedDrag);
    await verifyScrolling('source','Scroll down from the swapped, wider source');
    await verifyScrolling('live','Scroll back from the swapped, narrower semantic pane',-1);
    const keyboard=await evaluate('(()=>{const d=r1.pane().querySelector(".split-divider");d.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));})()');
    await pause(100);
    check('split-alignment','ArrowRight widens the physical left pane',await evaluate('r1.splitGeometry().percent')>reversedDrag.percent,keyboard);
    await dragDivider(.05);
    await evaluate('r1.pane().querySelector(".split-view").style.width="520px"');
    await pause(600);
    const narrowed=await evaluate('r1.splitGeometry()');
    check('split-alignment','Narrow pane keeps both columns usable and reports the actual separator value',narrowed.mainX<narrowed.sourceX&&narrowed.percent===25&&narrowed.mainWidth>=127&&narrowed.sourceWidth>=127,narrowed);
    const targetLine=await evaluate('(()=>{r1.pane().querySelector(".split-view").style.width="";r1.goTo("## 对齐标题 12");const doc=r1.editor().state.doc;return doc.lineAt(doc.toString().indexOf("## 对齐标题 12")).number;})()');
    await pause(800);
    const tableApproach=await evaluate('r1.splitSamples("live")');
    const nearTable=tableApproach.difference.filter(sample=>sample.delta!==null);
    check('split-alignment','Programmatic jump aligns the requested heading and next paragraph before a rendered table',nearTable.some(sample=>sample.line===targetLine&&sample.kind==='title')&&nearTable.some(sample=>sample.line===targetLine+2&&sample.kind==='body')&&nearTable.every(sample=>sample.delta<=3),{targetLine,...tableApproach});
    const proseFixture=['段首对齐 '+mixed.repeat(2),'段内软换行 '+mixed.repeat(2),'','下一段检查','',
      ...Array.from({length:16},(_,i)=>'滚动测试 '+i+'\n\n'+mixed.repeat(3)),
      '源码输入','', '语义输入','', '位置观测','',
      ...Array.from({length:16},()=>mixed.repeat(3)+'\n')].join('\n');
    await evaluate('r1.splitFixture('+JSON.stringify(proseFixture)+')');
    await dragDivider(.32);
    const prose=await evaluate('r1.splitCodeSamples(["段首对齐","段内软换行","下一段检查"])');
    const [first,soft,next]=prose.samples;
    check('split-alignment','Asymmetric panes wrap their own text and align paragraph starts',
      first.delta!==null&&first.delta<=3&&soft.delta!==null&&soft.delta>=10&&next.delta!==null&&next.delta<=3,prose.samples);
    for(const [pane,text] of [['.split-source','下一段检查'],['.split-main','段首对齐'],['.split-source','段首对齐'],['.split-main','下一段检查']]){
      const hit=await evaluate('r1.splitHit('+JSON.stringify(pane)+','+JSON.stringify(text)+')');
      if(!hit)throw Error('Caret target outside viewport: '+text);
      await mouse('mouseMoved',hit.point);
      await click(hit.point);
      await pause(95);
      const caret=await evaluate('r1.caret('+JSON.stringify(pane)+')');
      check('split-alignment','Pointer lands in '+pane+' at '+text,caret.focus&&!caret.otherFocus&&caret.same&&Math.abs(caret.head-hit.pos)<=1,{hit,caret});
    }
    for(const [pane,text,added] of [['.split-main','语义输入','甲'],['.split-source','源码输入','乙']]){
      await evaluate('r1.goTo('+JSON.stringify(text)+','+JSON.stringify(pane)+')');
      await pause(450);
      const hit=await evaluate('r1.splitHit('+JSON.stringify(pane)+','+JSON.stringify(text)+')');
      if(!hit)throw Error('Edit target outside viewport: '+text);
      await click(hit.point);
      await pause(150);
      await evaluate('r1.trackSplitEdit("位置观测")');
      await cd.sendCommand('Input.insertText',{text:added});
      await pause(500);
      const frames=await evaluate('r1.editFrames');
      const movement=frames.reduce((max,frame)=>Math.max(max,...frame.map((top,i)=>top==null||frames[0][i]==null?Infinity:Math.abs(top-frames[0][i]))),0);
      const shared=await evaluate('r1.editor().state.doc.eq(r1.editor(".split-source").state.doc)&&r1.editor().state.doc.toString().includes('+JSON.stringify(added+text)+')');
      check('split-alignment','Typing in '+pane+' keeps the surrounding paragraph on screen',frames.length>=10&&movement<=3&&shared,{movement,frameCount:frames.length,first:frames[0],last:frames.at(-1),shared});
    }
    const fence=String.fromCharCode(96).repeat(3);
    const codeFixture=['',fence+'Csharp','log 1',fence,'','','<div style="text-align: left;">','',fence,'114151',fence,'','下面的正文','', '</div>','','结束正文'].join('\n');
    await evaluate('r1.splitFixture('+JSON.stringify(codeFixture)+')');
    await pause(700);
    const codeSamples=await evaluate('r1.splitCodeSamples(["log 1","114151","下面的正文","结束正文"])');
    check('split-alignment','Rendered code aligns to its actual source line across hidden fences and an alignment tag',codeSamples.samples.every(sample=>sample.delta!==null&&sample.delta<=3),codeSamples);
  }catch(error){
    console.error(error.stack);process.exitCode=1;
  }finally{
    for(const [name,checks] of Object.entries(evidence)){
      await fs.writeFile(path.join(output,name+'.json'),JSON.stringify({
        method:'Hidden Electron, Chromium DevTools mouse/wheel/text input and isolated local backend. No physical desktop pointer or native Chinese IME.',
        checks,
      },null,2));
    }
    win.destroy();app.exit(process.exitCode||0);
  }
}

async function run(){
  await fs.mkdir(output,{recursive:true});
  const profile=await fs.mkdtemp(path.join(output,'r1-profile-')),documents=path.join(profile,'documents');
  await fs.mkdir(path.join(documents,targetDirectory),{recursive:true});
  await fs.mkdir(path.join(profile,'state'));
  await fs.writeFile(path.join(profile,'state','workspace.json'),JSON.stringify({root:documents,autoSave:false,revision:0}));
  await fs.writeFile(path.join(documents,sourceFile),source);
  await fs.writeFile(path.join(documents,targetDirectory,targetFile),'# 新标签页目标内容\n');
  const backend=fork(path.join(project,'server/index.mjs'),[],{cwd:project,silent:true,windowsHide:true,
    env:{...process.env,HIVE_PORT:'0',HIVE_STATE_DIR:path.join(profile,'state'),HIVE_DOCUMENTS:documents,HIVE_API_KEY:''}});
  backend.stdout.resume();backend.stderr.resume();
  let server;
  try{
    const backendPort=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Backend did not report ready')),15000);
      backend.once('error',reject);
      backend.on('message',msg=>{if(msg?.type==='hive-ready'){clearTimeout(timeout);resolve(msg.port);}});
    });
    const {createServer}=await import('vite');
    server=await createServer({root:project,cacheDir:path.join(profile,'node_modules/.vite'),optimizeDeps:{entries:['src/main.tsx']},server:{host:'127.0.0.1',port:0,fs:{allow:[project,await fs.realpath(path.join(project,'node_modules'))]},
      proxy:{'/api':{target:'http://127.0.0.1:'+backendPort,changeOrigin:true,configure(proxy){proxy.on('proxyReq',request=>request.setHeader('origin','http://127.0.0.1:'+backendPort));}}}},
      plugins:[{name:'r1-editor-harness',resolveId(id){if(id==='/__r1_editor.js')return '\0r1-editor';},load(id){if(id==='\0r1-editor')return "export {EditorView} from '@codemirror/view';export {undo} from '@codemirror/commands';";}}]});
    await server.listen();
    const env={...process.env,HIVE_R1_EVIDENCE:output};delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn((await import('electron')).default,[entry,'--worker',String(server.httpServer.address().port),profile],{cwd:project,env,windowsHide:true,stdio:'inherit'});
    const code=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{child.kill();reject(Error('Hidden editor integration timed out'));},120000);
      child.once('exit',code=>{clearTimeout(timeout);resolve(code);});child.once('error',reject);
    });
    assert.equal(code,0);
  }finally{
    if(server)await server.close();
    if(backend.exitCode===null&&backend.signalCode===null)await new Promise(resolve=>{backend.once('exit',resolve);backend.kill();});
    const [resolvedProfile,resolvedOutput]=await Promise.all([fs.realpath(profile),fs.realpath(output)]);
    assert.equal(path.dirname(resolvedProfile),resolvedOutput);
    assert.ok(path.basename(resolvedProfile).startsWith('r1-profile-'));
    await fs.rm(resolvedProfile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
}
if(process.argv[2]==='--worker')void worker(process.argv[3],process.argv[4]).catch(error=>{console.error(error);require('electron').app.exit(1);});
else await run();
