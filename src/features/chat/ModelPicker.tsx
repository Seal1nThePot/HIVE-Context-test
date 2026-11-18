import {useTheme} from '../theme/themeStore';
import {accentForeground} from '../theme/themePreferences';
import {usePanelDocument} from '../../shared/panelDocument';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {Brain,Check,Search,Settings} from 'lucide-react';
import {activeModelLabel,modelChoice,effectiveReasoningLevels,type Config} from '../settings/modelConfig';
import {reasoningLevels,type ReasoningEffort} from './modelReasoning';
import './model-picker.css';
export default function ModelPicker({config,disabled,onModelChange,reasoningEffort='default',onReasoningChange}:{config:Config;disabled:boolean;onModelChange:(choice:string)=>void;reasoningEffort?:ReasoningEffort;onReasoningChange?:(effort:ReasoningEffort)=>void}){
  const document=usePanelDocument(),window=document.defaultView!;
 const {preferences}=useTheme();
 const [thumbHover,setThumbHover]=useState(false),[trailVisible,setTrailVisible]=useState(false),[documentVisible,setDocumentVisible]=useState(!document.hidden);
 const rangeRef=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[section,setSection]=useState(''),[position,setPosition]=useState<{left:number;top?:number;bottom?:number;maxHeight:number}>({left:8,top:8,maxHeight:380});
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null);
 const services=config.services.filter(s=>s.enabled&&s.models.length),models=services.flatMap(service=>service.models.map(model=>({value:modelChoice({serviceId:service.id,modelId:model.id}),service,model})));
 const current=!config.demo&&config.selection?modelChoice(config.selection):'',validCurrent=models.some(x=>x.value===current);
 const activeSection=services.some(s=>s.id===section)?section:(services.find(s=>s.id===config.selection?.serviceId)?.id||services[0]?.id||'');
 const filtered=models.filter(x=>(query.trim()||x.service.id===activeSection)&&`${x.model.id} ${x.model.name} ${x.service.name}`.toLowerCase().includes(query.trim().toLowerCase()));
 const trackColors=preferences.reasoningTrackProfiles?.[preferences.base];
 const selected=models.find(x=>x.value===current)?.model;
 const levels=selected?effectiveReasoningLevels(selected):[];
 const serviceDefault=reasoningEffort==='default';
 const index=serviceDefault?Math.max(0,levels.length-1):Math.max(0,levels.indexOf(reasoningEffort));
 const effectLevel=levels[index];
 const effect=effectLevel?preferences.reasoningEffects?.[effectLevel]:undefined;
 const particleColor=effect?.color??'#ffffff';
 const strength=serviceDefault?1:levels.length>1?(index+1)/levels.length:1;
 const particleCount=effectLevel?(effect?.particles??Math.max(1,Math.ceil(strength*8))):0;
 const trailSpeed=Math.round(1900-strength*1150);
 const thumbRatio=levels.length>1?index/(levels.length-1):1;
 const thumbPosition=`calc(10px + ${thumbRatio*100}% - ${thumbRatio*20}px)`;
 const rangeStyle={
   '--reasoning-progress':index===levels.length-1?'100%':thumbPosition,
   '--reasoning-strength':`var(--reasoning-${effectLevel}-glow, ${strength})`,
   '--thumb-position':thumbPosition,
   '--trail-speed':`${trailSpeed}ms`,
   '--reasoning-particle-color':particleColor,
   '--reasoning-particle-edge':accentForeground(particleColor),
   '--reasoning-color-end':`var(--reasoning-${effectLevel}-color, var(--gold))`,
   '--reasoning-duration':`var(--reasoning-${effectLevel}-duration,350ms)`,
   '--reasoning-easing':`var(--reasoning-${effectLevel}-easing,cubic-bezier(.22,1,.36,1))`,
 } as CSSProperties;
 useEffect(()=>{const changed=()=>setDocumentVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[document]);
 useEffect(()=>{setThumbHover(false);setTrailVisible(false);if(!open||!rangeRef.current)return;const observer=new IntersectionObserver(entries=>setTrailVisible(entries.some(x=>x.isIntersecting)),{root:panel.current,threshold:.01});observer.observe(rangeRef.current);return()=>observer.disconnect();},[open,levels.length]);
 const levelLabel=(value:string)=>reasoningLevels.find(x=>x.value===value)?.label||value;
 const levelText=validCurrent?(serviceDefault?'服务默认':levelLabel(effectLevel??reasoningEffort)):'未选择';
 const meterBars=levels.length&&effectLevel!=='off'?Math.max(1,Math.round(((index+1)/levels.length)*4)):0;
 useLayoutEffect(()=>{if(!open)return;const update=()=>{const r=trigger.current?.getBoundingClientRect();if(r){const left=Math.max(8,Math.min(r.left,window.innerWidth-Math.min(380,window.innerWidth-16)-8));const above=Math.max(0,r.top-14),below=Math.max(0,window.innerHeight-r.bottom-14);if(above>=320||above>=below){setPosition({left,bottom:Math.max(8,window.innerHeight-r.top+6),maxHeight:Math.max(0,Math.min(380,above,window.innerHeight-16))});}else{setPosition({left,top:Math.max(8,r.bottom+6),maxHeight:Math.max(0,Math.min(380,below,window.innerHeight-16))});}}};update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);search.current?.focus();return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};},[open,document,window]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[open,document,window]);
 const settings=()=>{setOpen(false);onModelChange('settings');};
 const choose=(value:string)=>{onModelChange(value);setOpen(false);};
 return <><button ref={trigger} type="button" className="model-picker-trigger" title={!validCurrent?'选择模型':levels.length?`${activeModelLabel(config)} · 推理强度：${levelText}`:activeModelLabel(config)} aria-label={!validCurrent?'选择模型':levels.length?`选择模型 · 推理强度：${levelText}`:`选择模型：${activeModelLabel(config)}`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>{setOpen(!open);setQuery('');setSection(services.find(s=>s.id===config.selection?.serviceId)?.id||services[0]?.id||'');}}><Brain size={15} aria-hidden="true"/>{!!levels.length&&<span className="model-picker-meter" aria-hidden="true">{Array.from({length:4},(_,i)=><i key={i} className={i<meterBars?'on':''}/>)}</span>}</button>
 {open&&createPortal(<div ref={panel} className="model-picker" style={{left:position.left,top:position.top,bottom:position.bottom,maxHeight:position.maxHeight}} role="dialog" aria-label="选择模型">
 <div className="model-picker-header"><div className="model-picker-search"><Search size={16}/><input ref={search} aria-label="搜索模型" placeholder="搜索模型" value={query} onChange={e=>setQuery(e.target.value)}/></div><button type="button" className="model-picker-settings" title="模型设置" aria-label="模型设置" onClick={settings}><Settings size={17}/></button></div>
 <div className="model-picker-body"><nav className="model-picker-nav" aria-label="模型服务">{services.map(s=><button type="button" key={s.id} className={activeSection===s.id?'active':''} onClick={()=>setSection(s.id)}>{s.name}</button>)}</nav><div className="model-picker-list">{filtered.length?filtered.map(x=><button type="button" key={x.value} className="model-picker-item" onClick={()=>choose(x.value)}><span><strong>{x.model.name}</strong><small>{x.service.name}</small></span>{current===x.value&&<Check size={16} aria-label="当前模型"/>}</button>):<div className="model-picker-empty">{models.length?(query?'没有找到匹配的模型':'该服务暂无可用模型'):<>暂无可用模型 <button type="button" onClick={settings}>前往模型设置</button></>}</div>}</div></div>
 <div className="model-picker-reasoning"><div className="model-picker-reasoning-head"><span>推理强度{!serviceDefault&&` · ${levelLabel(reasoningEffort)}`}</span>{!!levels.length&&<button type="button" className="model-picker-default" aria-label={serviceDefault?'关闭服务默认推理强度':'使用服务默认推理强度'} aria-pressed={serviceDefault} disabled={!validCurrent||!onReasoningChange} onClick={()=>{onReasoningChange?.(serviceDefault?(levels[0]??'default'):'default');}}><span className="model-picker-default-label">服务默认</span><span className="model-picker-default-short">默认</span><span role="tooltip">{serviceDefault?'关闭服务默认：回到初始档':'使用服务默认推理强度'}</span></button>}</div>
 {levels.length?<><div ref={rangeRef} className={"model-picker-range"+(thumbHover?" thumb-hover":"")+(trackColors?" custom-track":"")+((effectLevel==='off')?" reasoning-unfilled":"")} style={rangeStyle}><input type="range" aria-label="推理强度" onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect(),cx=r.left+10+(r.width-20)*(levels.length>1?index/(levels.length-1):1),cy=r.top+r.height/2;setThumbHover(Math.hypot(e.clientX-cx,e.clientY-cy)<=11);}} onPointerLeave={()=>setThumbHover(false)} aria-valuetext={reasoningEffort==='default'?'服务默认':levelLabel(levels[index])} min="0" max={Math.max(0,levels.length-1)} step="1" value={index} disabled={!validCurrent||!onReasoningChange} onChange={e=>{onReasoningChange?.(levels[Number(e.target.value)]);}}/>{trackColors&&<span className="reasoning-custom-fill" aria-hidden="true" style={{'--track-left':trackColors.left,'--track-middle':trackColors.middle,'--track-right':trackColors.right} as CSSProperties}/>}<span className="reasoning-thumb" aria-hidden="true"/><div className="reasoning-particles" aria-hidden="true">{trailVisible&&documentVisible&&Array.from({length:particleCount},(_,i)=><i key={i} style={{'--particle-delay':`${-i*trailSpeed/Math.max(1,particleCount)}ms`,'--particle-row':`${(i%3-1)*3}px`} as CSSProperties}/>)}</div><div className={'model-picker-dots'+(levels.length>1?'':' is-single')} aria-hidden="true">{levels.map(x=><span key={x}/>)}</div></div></>:<p className="model-picker-unknown">{validCurrent?'暂无可用档位，可在模型设置中添加。':'选择模型后查看推理强度。'}</p>}
 </div>
 </div>,document.body)}</>;
}




