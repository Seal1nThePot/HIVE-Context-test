import {createUiIcon} from '../../shared/icons';
import {getMermaidZoomGesture} from '../settings/shortcutStorage';
import './mermaidViewer.css';

type ViewPosition = {scale:number; fit:boolean; left:number; top:number};

export function mountMermaidViewer(slot:HTMLElement, svg:SVGSVGElement, editorScroller:HTMLElement) {
  const doc=slot.ownerDocument, win=doc.defaultView!;
  const box=svg.viewBox.baseVal;
  const width=box.width || svg.getBoundingClientRect().width || 1;
  const height=box.height || svg.getBoundingClientRect().height || 1;
  const viewer=doc.createElement('section'), toolbar=doc.createElement('div'), viewport=doc.createElement('div');
  const canvas=doc.createElement('div'), percent=doc.createElement('span'), board=doc.createElement('dialog');
  viewer.className='mermaid-viewer';
  viewer.setAttribute('aria-label','Mermaid 图表查看器');
  toolbar.className='mermaid-controls';
  viewport.className='mermaid-viewport';
  viewport.tabIndex=0;
  viewport.setAttribute('role','region');
  viewport.setAttribute('aria-label','Mermaid 图表，拖动平移');
  viewport.style.setProperty('--diagram-height',height+'px');
  canvas.className='mermaid-canvas';
  board.className='mermaid-board';
  board.setAttribute('aria-label','Mermaid 看板');
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Mermaid 图表');
  // Mermaid assigns a max-width in the SVG's own style. The viewer now owns its size.
  svg.style.maxWidth='none';
  slot.removeAttribute('role');
  slot.removeAttribute('aria-label');
  canvas.append(svg);
  viewport.append(canvas);
  viewer.append(toolbar,viewport);
  slot.replaceChildren(viewer);

  let scale=1, fit=true, saved:ViewPosition|undefined;
  let drag:{pointer:number;x:number;y:number;left:number;top:number}|undefined;
  function button(label:string, content:string|SVGElement, run:()=>void) {
    const el=doc.createElement('button');
    el.type='button';el.append(content);el.title=label;el.setAttribute('aria-label',label);
    el.addEventListener('click',run);toolbar.append(el);
    return el;
  }
  function fitScale(){
    // offsetWidth/Height include traditional scrollbars. Once fitted, both go away.
    return Math.min(1,Math.max(1,viewport.offsetWidth-2)/width,Math.max(1,viewport.offsetHeight-2)/height);
  }
  function resize(next:number){
    scale=next;
    svg.style.width=width*scale+'px';svg.style.height=height*scale+'px';
    percent.textContent=Math.round(scale*100)+'%';
  }
  function fitImage(){fit=true;resize(fitScale());viewport.scrollTo(0,0);}
  function zoom(next:number, clientX?:number, clientY?:number){
    const bounds=viewport.getBoundingClientRect(), before=svg.getBoundingClientRect();
    if(!before.width||!before.height)return;
    const x=clientX??(bounds.left+viewport.clientWidth/2), y=clientY??(bounds.top+viewport.clientHeight/2);
    const relativeX=(x-before.left)/before.width, relativeY=(y-before.top)/before.height;
    // Keep the fitted view reachable even for diagrams much bigger than the normal zoom range.
    const limit=Math.min(.1,fitScale());
    fit=false;resize(Math.min(8,Math.max(limit,next)));
    const after=svg.getBoundingClientRect();
    viewport.scrollBy(after.left+relativeX*after.width-x,after.top+relativeY*after.height-y);
  }
  button('缩小 Mermaid 图表',createUiIcon(doc,'Minus',12),()=>zoom(scale/1.25));
  percent.className='mermaid-zoom-value';toolbar.append(percent);
  button('放大 Mermaid 图表',createUiIcon(doc,'Plus',12),()=>zoom(scale*1.25));
  button('适应窗口','适应窗口',fitImage);
  button('按实际大小显示','原大',()=>zoom(1));
  const expand=button('展开 Mermaid 看板','展开看板',()=>{
    saved={scale,fit,left:viewport.scrollLeft,top:viewport.scrollTop};
    slot.style.height=slot.getBoundingClientRect().height+'px';
    doc.body.append(board);board.append(viewer);expand.hidden=true;close.hidden=false;
    board.showModal();fitImage();close.focus({preventScroll:true});
  });
  const close=button('关闭 Mermaid 看板','关闭看板',()=>board.close());
  close.hidden=true;
  board.addEventListener('close',()=>{
    if(!saved)return;
    slot.append(viewer);slot.style.removeProperty('height');board.remove();
    expand.hidden=false;close.hidden=true;
    fit=saved.fit;resize(fit?fitScale():saved.scale);viewport.scrollTo(saved.left,saved.top);
    saved=undefined;expand.focus({preventScroll:true});
  });
  board.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();board.close();}
  });
  viewport.addEventListener('wheel',event=>{
    const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;
    if(event.ctrlKey||getMermaidZoomGesture()==='wheel'){
      if(!event.deltaY)return;
      event.preventDefault();event.stopPropagation();
      zoom(scale*Math.exp(-Math.max(-400,Math.min(400,event.deltaY*unit))*.002),event.clientX,event.clientY);
    }else if(!board.open&&(viewport.scrollHeight>viewport.clientHeight||viewport.scrollWidth>viewport.clientWidth)){
      // A scrollable diagram would otherwise consume normal manuscript wheel scrolling.
      event.preventDefault();event.stopPropagation();
      editorScroller.scrollBy(event.deltaX*unit,event.deltaY*unit);
    }
  },{passive:false});
  // Only the picture surface starts a drag. Both viewport scrollbars retain native hit testing.
  canvas.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0||event.ctrlKey)return;
    event.preventDefault();event.stopPropagation();
    drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
    canvas.setPointerCapture(event.pointerId);canvas.classList.add('is-panning');
    viewport.focus({preventScroll:true});
  });
  canvas.addEventListener('pointermove',event=>{
    if(drag?.pointer===event.pointerId)viewport.scrollTo(drag.left+drag.x-event.clientX,drag.top+drag.y-event.clientY);
  });
  canvas.addEventListener('lostpointercapture',()=>{drag=undefined;canvas.classList.remove('is-panning');});
  const observer=new win.ResizeObserver(()=>{if(fit)fitImage();});
  observer.observe(viewport);
  fitImage();
  return ()=>{
    observer.disconnect();
    saved=undefined;
    if(board.open)board.close();
    board.remove();
  };
}
