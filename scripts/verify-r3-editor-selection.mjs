import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {fork,spawn} from 'node:child_process';

const project=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const workerFlag='--hive-r3-selection-worker';
const output=path.resolve(process.env.HIVE_EDITOR_SELECTION_EVIDENCE||path.join(project,'.runtime/checks/r3-editor-selection'));
const file='selection-fixture.md';
const matrix=String.raw`\begin{pmatrix}a & b \\ c & d\end{pmatrix}`;
const inline='$E=mc^2$';
const upper='前一段起点 First paragraph starts here. 普通正文应该跟随可见字形。';
const long='长段起点 '+Array.from({length:23},(_,i)=>`第${i+1}组中文与 **English text** 交替， \\ 示例甲乙丙丁。`).join('');
const close='表格上方末段 Near table boundary. 最后一行只选择正文内容。';
const cells=Array.from({length:12},(_,i)=>'表列标记'+i);
const table=[cells,cells.map(()=>':---'),cells.map((_,i)=>'TABLE_ONLY_'+i)].map(row=>'| '+row.join(' | ')+' |');
const outside='离开矩阵后的普通正文，供鼠标拖选后验证恢复渲染。';
const sameLine='行内公式之外的普通正文，拖选此处应恢复行内公式。';
const doc=['# 拖选验收','',upper,'',long,'',close,'',...table,'','$$',matrix,'$$','',outside,'',inline+' '+sameLine,'',...Array.from({length:30},(_,i)=>'补齐滚动区域 '+i)].join('\n');

async function browserSetup(file){
  const {EditorView}=await import('/__r3_selection_view.js');
  const pane=()=>[...document.querySelectorAll('.document-pane')].find(el=>el.checkVisibility({checkVisibilityCSS:true})&&el.querySelector('.split-main .cm-editor'));
  const view=side=>EditorView.findFromDOM(pane().querySelector(`.split-${side} .cm-editor`));
  const targetPoint=(element,x=.5,y=.5)=>{
    const box=element.getBoundingClientRect();
    return {x:box.left+box.width*x,y:box.top+box.height*y};
  };
  function point(side,position,blank=false){
    const editor=view(side),char=blank?editor.coordsAtPos(position):editor.coordsForChar(position);
    if(!char)throw Error('No rendered character at '+position);
    const x=blank?char.left+4:char.left+(char.right-char.left)*.22;
    const xy={x,y:(char.top+char.bottom)/2};
    const target=document.elementFromPoint(xy.x,xy.y);
    if(!target||!editor.contentDOM.contains(target))throw Error('Character outside editor at '+position+' '+JSON.stringify(xy));
    return {position,...xy,line:editor.state.doc.lineAt(position).number,hit:editor.posAtCoords(xy),target:target.className};
  }
  const boxes=(dom,selector)=>[...dom.querySelectorAll(selector)].map(node=>node.getBoundingClientRect().toJSON());
  window.selectionCheck={
    open:()=>document.querySelector(`.explorer-row[data-path="${file}"]`)?.click(),
    ready:()=>!!pane(),
    menu(){
      pane().querySelector('.display-mode-button').click();
    },
    mode(name){
      const button=[...document.querySelectorAll('.display-mode-menu button')].find(button=>button.textContent.trim()===name);
      button?.click();
      return !!button;
    },
    reset(side){
      pane().querySelector('.display-mode-button').focus();
      const editor=view(side);
      editor.dispatch({selection:{anchor:0}});
      editor.scrollDOM.scrollTop=0;
      editor.scrollDOM.scrollLeft=0;
    },
    point,
    wrapped(side,text){
      const editor=view(side),from=editor.state.sliceDoc().indexOf(text),rows=new Map();
      for(let pos=from;pos<from+text.length;pos++){
        const char=editor.coordsForChar(pos);
        if(char&&char.width>5&&char.left>editor.contentDOM.getBoundingClientRect().left+61){
          const row=Math.round(char.top/5)*5;
          if(!rows.has(row))rows.set(row,pos);
        }
      }
      return [...rows.values()];
    },
    scrollPoint(side){return targetPoint(view(side).scrollDOM,.6,.45);},
    scrollTo(side,position){view(side).dispatch({effects:EditorView.scrollIntoView(position,{y:'center'})});},
    tablePoint(side){return targetPoint(view(side).dom.querySelector('[data-table-widget]'),.45,.6);},
    mathPoint(side,kind){return targetPoint(view(side).dom.querySelector(kind+'.cm-math-widget'));},
    mathState(side,kind,raw){
      const dom=view(side).contentDOM,widget=dom.querySelector(kind+'.cm-math-widget');
      return {rendered:widget?.dataset.mathState==='rendered'&&!!widget.querySelector('.katex'),raw:[...dom.querySelectorAll('.cm-line')].some(line=>line.textContent.includes(raw)&&!line.querySelector('.cm-math-widget'))};
    },
    async trackLine(side,position){
      const editor=view(side),frames=[];
      for(let index=0;index<18;index++){
        await new Promise(requestAnimationFrame);
        const top=editor.coordsForChar(position)?.top??null;
        frames.push({top,scrollTop:editor.scrollDOM.scrollTop});
      }
      return frames;
    },
    sample(side,xy,copy=false){
      const editor=view(side),{anchor,head,from,to}=editor.state.selection.main,table=editor.dom.querySelector('[data-table-widget]');
      const native=window.getSelection();
      const data={anchor,head,from,to,hit:xy?editor.posAtCoords(xy):null,documentText:editor.state.sliceDoc(from,to),nativeText:native?.toString(),
        selectionRects:boxes(editor.dom,'.cm-selectionBackground'),tableRects:boxes(editor.dom,'[data-table-widget]'),
        scroll:{top:editor.scrollDOM.scrollTop,left:editor.scrollDOM.scrollLeft,tableLeft:table?.scrollLeft??null},
        focus:editor.hasFocus,mode:editor.dom.dataset.displayMode};
      if(copy){
        // Exercise CodeMirror's clipboard handler without touching the user's OS clipboard.
        const clipboardData=new DataTransfer(),event=new ClipboardEvent('copy',{clipboardData,bubbles:true,cancelable:true});
        editor.contentDOM.dispatchEvent(event);
        data.copy={text:clipboardData.getData('text/plain'),handled:event.defaultPrevented};
      }
      return data;
    },
  };
}

async function worker(port,profile){
  const {app,BrowserWindow}=require('electron');
  app.setPath('userData',path.join(profile,'electron'));
  app.disableHardwareAcceleration();
  await app.whenReady();
  const win=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,width:1420,height:1060,
    webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const cd=win.webContents.debugger;
  cd.attach('1.3');
  const evidence={method:'Hidden Electron, isolated fixtures, DevTools mouse and wheel input, copy through a local DataTransfer',viewport:[1420,1060],checks:[]};
  win.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});
  const evaluate=async expression=>{
    const result=await win.webContents.executeJavaScript(`(async()=>{try{return {value:await (${expression})};}catch(error){return {error:String(error.stack||error)};}})()`);
    if(result.error)throw Error(result.error);
    return result.value;
  };
  const call=(method,...args)=>evaluate('selectionCheck.'+method+'('+args.map(arg=>JSON.stringify(arg)).join(',')+')');
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function wait(predicate,label){
    for(let i=0;i<80;i++){const result=await predicate();if(result)return result;await pause(35);}
    throw Error('Waiting for '+label);
  }
  const mouse=(type,xy,options)=>cd.sendCommand('Input.dispatchMouseEvent',{type,x:xy.x,y:xy.y,...options});
  const press=xy=>mouse('mousePressed',xy,{button:'left',buttons:1,clickCount:1});
  const release=xy=>mouse('mouseReleased',xy,{button:'left',buttons:0,clickCount:1});
  const wheel=(xy,deltaX,deltaY)=>mouse('mouseWheel',xy,{deltaX,deltaY});
  const check=(bug,name,pass,detail)=>{
    evidence.checks.push({bug,name,passed:!!pass,detail});
    console.log((pass?'PASS ':'FAIL ')+bug+' '+name);
  };
  async function setMode(name){
    await call('menu');
    await wait(()=>call('mode',name),name);
    await pause(350);
  }
  async function drag(side,positions,{steps=8}={}){
    const points=await Promise.all(positions.map(pos=>call('point',side,pos,doc[pos]==='\n')));
    const start=points[0],end=points.at(-1),startSample=await call('sample',side,start),moves=[];
    await press(start);
    const pressed=await call('sample',side,start);
    for(let s=1;s<points.length;s++){
      const from=points[s-1],to=points[s];
      for(let i=1;i<=steps;i++){
        const xy={x:from.x+(to.x-from.x)*i/steps,y:from.y+(to.y-from.y)*i/steps};
        await mouse('mouseMoved',xy,{buttons:1});
        if(i===steps)moves.push({xy,...await call('sample',side,xy)});
        await pause(12);
      }
    }
    await release(end);
    await pause(65);
    return {points,startSample,pressed,moves,final:await call('sample',side,end,true)};
  }
  function correct(dragged){
    const {points,pressed,moves,final}=dragged,start=points[0].position,end=points.at(-1).position;
    const expected=doc.slice(Math.min(start,end),Math.max(start,end));
    return points.every(point=>point.hit===point.position)&&pressed.anchor===start&&pressed.hit===start&&
      moves.every((sample,i)=>sample.anchor===start&&sample.head===points[i+1].position)&&
      final.anchor===start&&final.head===end&&final.copy.handled&&final.copy.text===expected&&final.documentText===expected;
  }
  function outsideTable(sample){
    return !sample.tableRects.some(table=>sample.selectionRects.some(rect=>
      rect.bottom>table.top+1&&rect.top<table.bottom-1&&rect.right>table.left&&rect.left<table.right));
  }
  try{
    await win.loadURL('http://127.0.0.1:'+port);
    await evaluate('('+browserSetup.toString()+')('+JSON.stringify(file)+')');
    await wait(()=>evaluate('!!document.querySelector('+JSON.stringify(`.explorer-row[data-path="${file}"]`)+')'),'fixture file');
    await call('open');
    await wait(()=>call('ready'),'editor');
    for(const [mode,sides] of [['实时编辑',['main']],['实时预览',['main']],['代码模式',['main']],['左右分栏',['main','source']]]){
      await setMode(mode);
      for(const side of sides){
        const afterScroll=mode==='左右分栏'?125:58;
        for(const scrolled of [false,true]){
          await call('reset',side);
          const tableFrom=doc.indexOf(table[0]),closeFrom=doc.indexOf(close);
          if(scrolled){
            await wheel(await call('scrollPoint',side),0,afterScroll);
            await call('scrollTo',side,closeFrom);
            await pause(450);
          }else{
            await pause(100);
            const closePoint=await call('point',side,closeFrom+close.length-3).catch(()=>null);
            if(!closePoint){await call('scrollTo',side,closeFrom);await pause(480);}
          }
          if(scrolled&&side==='main'&&mode!=='代码模式'){
            const tablePoint=await call('tablePoint',side).catch(()=>null);
            if(tablePoint){await wheel(tablePoint,223,0);await pause(100);}
          }
          const closeEnd=closeFrom+close.length-2;
          for(const [kind,positions] of [['正文末行向上', [closeEnd,closeFrom+6]],['表格前空行向上',[tableFrom-1,closeFrom+8]]]){
            const d=await drag(side,positions);
            check('BUG-075',`${mode}/${side} ${scrolled?'滚动后':'初始视口'} ${kind}`,correct(d)&&d.final.to<tableFrom&&outsideTable(d.final),d);
            await call('reset',side);
            if(scrolled||d.startSample.scroll.top>0){await call('scrollTo',side,closeFrom);await pause(380);}
          }
        }
        await call('reset',side);
        await pause(350);
        const rows=await call('wrapped',side,long);
        assert.ok(rows.length>=4,mode+'/'+side+' needs four wrapped rows');
        const upperPos=doc.indexOf(upper)+7;
        for(const [kind,positions] of [['自动换行向下',[rows[0],rows[2]]],['同段反向拖选',[rows[2],rows[3],rows[0]]],['跨段向上',[rows[2],upperPos]],['跨段向下',[upperPos,rows[2]]]]){
          await call('reset',side);await pause(125);
          const d=await drag(side,positions);
          check('BUG-076',`${mode}/${side} ${kind}`,correct(d),d);
        }
      }
    }
    for(const mode of ['实时编辑','左右分栏']){
      const side='main';
      await setMode(mode);
      for(const [kind,formula,following] of [['div',matrix,outside],['span',inline,sameLine]]){
        const target=doc.indexOf(formula),other=doc.indexOf(following);
        await call('reset',side);
        await call('scrollTo',side,target);
        await wait(async()=>!!(await call('mathState',side,kind,formula)).rendered,mode+' '+kind+' formula');
        await pause(250);
        const before=await call('mathState',side,kind,formula),widget=await call('mathPoint',side,kind);
        await press(widget);await release(widget);await pause(350);
        const opened=await call('mathState',side,kind,formula);
        if(mode==='左右分栏'&&kind==='span'){
          const frames=await call('trackLine',side,target+1),tops=frames.map(frame=>frame.top);
          const movement=tops.every(top=>top!==null)?Math.max(...tops)-Math.min(...tops):null;
          check('BUG-076','分栏中重新渲染上方矩阵后，行内公式源码位置不抖动',movement!==null&&movement<=2,{movement,frames});
        }
        const selected=await drag(side,[target+1,target+formula.length-1]);
        const inside=await call('mathState',side,kind,formula);
        await call('scrollTo',side,other);
        await pause(350);
        const moved=await drag(side,[other+2,other+11]);
        await pause(500);
        const restored=await call('mathState',side,kind,formula);
        check('BUG-077',`${mode} ${kind==='div'?'块级矩阵':'同一行内公式'}`,before.rendered&&opened.raw&&correct(selected)&&inside.raw&&correct(moved)&&restored.rendered,{before,widget,opened,selected,inside,moved,restored});
      }
    }
  }catch(error){
    evidence.error=String(error.stack||error);
    console.error(error);
  }finally{
    await fs.writeFile(path.join(output,'validation.json'),JSON.stringify(evidence,null,2));
    const failed=!!evidence.error||evidence.checks.some(item=>!item.passed);
    win.destroy();app.exit(failed?1:0);
  }
}

async function run(){
  await fs.mkdir(output,{recursive:true});
  const profile=await fs.mkdtemp(path.join(output,'selection-profile-'));
  const documents=path.join(profile,'documents'),state=path.join(profile,'state');
  await Promise.all([fs.mkdir(documents),fs.mkdir(state)]);
  await Promise.all([fs.writeFile(path.join(documents,file),doc),fs.writeFile(path.join(state,'workspace.json'),JSON.stringify({root:documents,autoSave:false,revision:0}))]);
  const backend=fork(path.join(project,'server/index.mjs'),[],{cwd:project,silent:true,windowsHide:true,
    env:{...process.env,HIVE_PORT:'0',HIVE_STATE_DIR:state,HIVE_DOCUMENTS:documents,HIVE_API_KEY:''}});
  backend.stdout.resume();backend.stderr.resume();
  let server;
  try{
    const backendPort=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Backend did not report ready')),15000);
      backend.once('error',reject);
      backend.on('message',msg=>{if(msg?.type==='hive-ready'){clearTimeout(timeout);resolve(msg.port);}});
    });
    const {createServer}=await import('vite');
    server=await createServer({root:project,cacheDir:path.join(profile,'vite-cache'),optimizeDeps:{entries:['src/main.tsx'],include:['@codemirror/view','katex']},server:{host:'127.0.0.1',port:0,hmr:false,
      proxy:{'/api':{target:'http://127.0.0.1:'+backendPort,changeOrigin:true,configure(proxy){proxy.on('proxyReq',request=>request.setHeader('origin','http://127.0.0.1:'+backendPort));}}}},
      plugins:[{name:'r3-selection-harness',resolveId(id){if(id==='/__r3_selection_view.js')return '\0r3-selection-view';},load(id){if(id==='\0r3-selection-view')return "export {EditorView} from '@codemirror/view';";}}]});
    await server.listen();
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const flags=process.env.HIVE_VERIFY_NO_SANDBOX==='1'?['--no-sandbox']:[];
    const child=spawn((await import('electron')).default,[...flags,fileURLToPath(import.meta.url),workerFlag,String(server.httpServer.address().port),profile],{cwd:project,env,windowsHide:true,stdio:'inherit'});
    process.exitCode=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{child.kill();reject(Error('Hidden editor selection verification timed out'));},150000);
      child.once('exit',(code,signal)=>{
        clearTimeout(timeout);
        if(code!==0)console.error('Hidden Electron exit:',code??signal);
        resolve(code===0?0:1);
      });child.once('error',reject);
    });
  }finally{
    if(server)await server.close();
    if(backend.exitCode===null&&backend.signalCode===null)await new Promise(resolve=>{backend.once('exit',resolve);backend.kill();});
    const [resolvedProfile,resolvedOutput]=await Promise.all([fs.realpath(profile),fs.realpath(output)]);
    assert.equal(path.dirname(resolvedProfile),resolvedOutput);
    assert.ok(path.basename(resolvedProfile).startsWith('selection-profile-'));
    await fs.rm(resolvedProfile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
}

const workerIndex=process.argv.indexOf(workerFlag);
if(workerIndex!==-1)void worker(process.argv[workerIndex+1],process.argv[workerIndex+2]).catch(error=>{console.error(error);require('electron').app.exit(1);});
else await run();
