import SettingRow from './SettingRow';
import WorkspaceSettings from "../files/WorkspaceSettings";
import {StatusBarSettings,type StatusPreferences} from "../editor/EditorStatusBar";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowDown, ArrowUp, Bot, Check, ChevronRight, Keyboard, Palette, PencilLine, Plus, Search, Server, SlidersHorizontal, Trash2, X } from 'lucide-react';
import AppearanceSettings from './AppearanceSettings';
import AnnotationSettings from './AnnotationSettings';
import type {usePanelIconDragPreferences} from './usePanelIconDragPreferences';
import type {useAnnotationPreferences} from './useAnnotationPreferences';
import { useAppearance } from './useAppearance';
import { activeModelLabel, modelOptions, modelChoice, parseModelChoice, type Config, type ModelService } from './modelConfig';
import './settings.css';

export type SettingsSection='appearance'|'features'|'writing'|'models'|'shortcuts'|'workspace';
type Props={panelIconDragPreferences:ReturnType<typeof usePanelIconDragPreferences>;annotationPreferences:ReturnType<typeof useAnnotationPreferences>;statusPreferences:StatusPreferences;onSwitchWorkspace:(root:string)=>Promise<void>;config:Config;initialSection:SettingsSection;appearance:ReturnType<typeof useAppearance>;busy:boolean;
  onRequest:(route:string,body:unknown)=>Promise<void>;onReload:()=>Promise<void>;onClose:()=>void};
type ServiceDraft=Omit<ModelService,'id'|'hasKey'>&{id?:string;key:string;clearKey:boolean};
const sections=[{id:'workspace' as const,label:'写作空间',description:'文件夹与文件同步',Icon:Server},{id:'appearance' as const,label:'外观',description:'界面、文字与底部栏',Icon:Palette},
  {id:'features' as const,label:'功能',description:'悬浮工具与面板',Icon:SlidersHorizontal},
  {id:'writing' as const,label:'写作',description:'续写与写作节奏',Icon:PencilLine},
  {id:'models' as const,label:'模型',description:'AI 服务与模型管理',Icon:Bot},
  {id:'shortcuts' as const,label:'快捷键',description:'编辑与面板操作',Icon:Keyboard}];

export default function SettingsPage({panelIconDragPreferences,annotationPreferences,statusPreferences,onSwitchWorkspace,config,initialSection,appearance,busy,onRequest,onReload,onClose}:Props){
  const [section,setSection]=useState(initialSection),[search,setSearch]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [draft,setDraft]=useState<ServiceDraft|null>(null),[modelId,setModelId]=useState(''),[modelName,setModelName]=useState(''),[filter,setFilter]=useState(''),[removeId,setRemoveId]=useState<string|null>(null),[discard,setDiscard]=useState(false);
  const [limit,setLimit]=useState(String(config.continuationLimit));
  const closeButton=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),returnFocus=useRef<HTMLElement|null>(null);
  const editing=!!draft,sectionInfo=sections.find(item=>item.id===section)!;
  useEffect(()=>{setLimit(String(config.continuationLimit));},[config.continuationLimit]);
  useEffect(()=>{
    returnFocus.current=document.activeElement as HTMLElement;
    const siblings=Array.from(panel.current?.parentElement?.children||[]).filter(element=>element!==panel.current&&element instanceof HTMLElement) as HTMLElement[];
    const previous=siblings.map(element=>element.inert);siblings.forEach(element=>{element.inert=true;});
    closeButton.current?.focus();
    return()=>{siblings.forEach((element,index)=>{element.inert=previous[index];});returnFocus.current?.focus();};
  },[]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){if(panel.current?.querySelector('[data-status-dragging="true"]'))return;event.preventDefault();event.stopPropagation();if(busy)return;if(removeId){setRemoveId(null);return;}if(editing){setDiscard(true);return;}onClose();}
      if(event.key==='Tab'){
        const nodes=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')||[]).filter(el=>el.getBoundingClientRect().height>0);
        const first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[busy,editing,removeId,onClose]);
  async function run(route:string,body:unknown,success?:string){
    setError('');setNotice('');try{await onRequest(route,body);if(success)setNotice(success);return true;}
    catch(error){setError((error as Error).message);return false;}
  }
  function edit(service?:ModelService){
    setError('');setNotice('');setRemoveId(null);setDiscard(false);setModelId('');setModelName('');setFilter('');
    setDraft(service?{id:service.id,name:service.name,endpoint:service.endpoint,enabled:service.enabled,models:service.models.map(item=>({...item})),key:'',clearKey:false}:
      {name:'',endpoint:'',enabled:true,models:[],key:'',clearKey:false});
  }
  function addModel(){
    if(!draft)return;const id=modelId.trim();
    if(!id){setError('请填写模型 ID。');return;}
    if(draft.models.some(item=>item.id===id)){setError('这个模型 ID 已添加。');return;}
    setDraft({...draft,models:[...draft.models,{id,name:modelName.trim()||id}]});setModelId('');setModelName('');setError('');
  }
  async function saveService(event:FormEvent){
    event.preventDefault();if(!draft)return;
    if(modelId.trim()){setError('还有未添加的模型，请先点击「添加模型」。');return;}
    const {key,clearKey,...service}=draft;
    if(await run('/model-services',{revision:config.revision,service,key,clearKey},'服务已保存。')){setDraft(null);setDiscard(false);}
  }
  function navigate(id:SettingsSection){if(draft)return;setSection(id);setSearch('');setError('');setNotice('');}
  const currentService=draft?.id?config.services.find(item=>item.id===draft.id):undefined;
  const shownServices=config.services.filter(item=>(item.name+' '+item.endpoint+' '+item.models.map(model=>model.name+' '+model.id).join(' ')).toLowerCase().includes(filter.toLowerCase()));
  const options=modelOptions(config);
  return <div ref={panel} className="settings-page" role="dialog" aria-modal="true" aria-label="设置">
    <aside className="settings-sidebar">
      <div className="settings-brand"><span>H</span><b>HIVE</b><small>设置</small></div>
      <label className="settings-search"><Search size={15}/><input aria-label="搜索设置" placeholder="搜索设置…" value={search} disabled={editing} onChange={event=>setSearch(event.target.value)}/></label>
      <nav aria-label="设置分类">{sections.filter(item=>(item.label+item.description).includes(search)).map(({id,label,description,Icon})=><button key={id} type="button" className={section===id?'active':''} title={description} aria-current={section===id?'page':undefined} disabled={editing} onClick={()=>navigate(id)}><Icon size={16}/><span>{label}</span></button>)}</nav>
      {search&&!sections.some(item=>(item.label+item.description).includes(search))&&<p className="settings-nav-empty">没有匹配的设置分类</p>}
      <button ref={closeButton} type="button" className="settings-return" onClick={()=>{if(draft)setDiscard(true);else onClose();}} disabled={busy}><ArrowLeft size={16}/>返回写作</button>
    </aside>
    <main className="settings-content">
      <header className="settings-page-heading"><div className="settings-title-icon"><sectionInfo.Icon size={22}/></div><div><h1>{draft?(draft.id?'编辑 AI 服务':'添加 AI 服务'):sectionInfo.label==='模型'?'模型配置':sectionInfo.label}</h1><p>{draft?'设置连接方式，并手动管理这个服务下的模型。':sectionInfo.description}</p></div><button type="button" className="settings-close" aria-label="关闭设置" disabled={busy} onClick={()=>{if(draft)setDiscard(true);else onClose();}}><X size={20}/></button></header>
      {error&&<div className="settings-feedback error" role="alert"><span>{error}</span>{(error.includes('其他窗口')||error.includes('重新载入'))&&<button type="button" disabled={busy} onClick={async()=>{try{await onReload();setError('');setNotice('已重新载入配置。');}catch(error){setError((error as Error).message);}}}>重新载入配置</button>}</div>}
      {notice&&<p className="settings-feedback" role="status"><Check size={14}/>{notice}</p>}
      {section==='appearance'&&<section className="settings-card"><AppearanceSettings {...appearance}/></section>}
      {section==='appearance'&&<StatusBarSettings preferences={statusPreferences}/>}
      {section==='features'&&<><section className="settings-card feature-settings"><h2>悬浮工具</h2><SettingRow title="显示底部悬浮工具栏" description="显示标注工具、写作模式和 AI 开关。关闭后仍可通过右上角面板按钮或 Ctrl+J 打开 AI。"><input className="setting-switch" aria-label="显示底部悬浮工具栏" type="checkbox" checked={appearance.appearance.floatingToolbarVisible!==false} onChange={event=>appearance.setAppearance(old=>({...old,floatingToolbarVisible:event.target.checked}))}/></SettingRow></section>
      <section className="settings-card feature-settings"><h2>面板位置</h2><SettingRow title="锁定与解锁手势" description="在面板标题栏操作。锁定后仍可打开、关闭和收纳；标签组共享位置。"><select aria-label="面板锁定手势" value={appearance.appearance.panelLockGesture||'doubleClick'} onChange={event=>appearance.setAppearance(old=>({...old,panelLockGesture:event.target.value==='longPress'?'longPress':'doubleClick'}))}><option value="doubleClick">双击标题栏</option><option value="longPress">长按标题栏（0.6 秒）</option></select></SettingRow><SettingRow title="图标拖动标识" description="长按侧栏图标拖动时，选择跟随指针的标识样式。"><select aria-label="图标拖动标识" value={panelIconDragPreferences.preferences.holdStyle} onChange={event=>panelIconDragPreferences.setPreferences(old=>({...old,holdStyle:event.target.value==='bar'?'bar':'circle'}))}><option value="circle">圆形</option><option value="bar">长条</option></select></SettingRow><SettingRow title="图标长按时间" description="设置 0.05–3 秒；短按仍然展开或收起面板。"><PanelIconDelay label="图标长按时间" value={panelIconDragPreferences.preferences.holdDelayMs} onChange={holdDelayMs=>panelIconDragPreferences.setPreferences(old=>({...old,holdDelayMs}))}/></SettingRow><SettingRow title="最短触发时间" description="设置 0.05–3 秒；实际触发时间取长按时间与最短触发时间中较大的值。"><PanelIconDelay label="最短触发时间" value={panelIconDragPreferences.preferences.minimumTriggerMs} onChange={minimumTriggerMs=>panelIconDragPreferences.setPreferences(old=>({...old,minimumTriggerMs}))}/></SettingRow>{panelIconDragPreferences.saveError&&<p role="status">{panelIconDragPreferences.saveError}</p>}</section>{appearance.saveError&&<p role="status">{appearance.saveError}</p>}</>}
      {section==='features'&&<AnnotationSettings {...annotationPreferences}/>}
      {section==='workspace'&&<WorkspaceSettings onSwitch={onSwitchWorkspace}/>}
      {section==='writing'&&<form className="settings-card writing-settings" onSubmit={async event=>{event.preventDefault();await run('/config',{revision:config.revision,continuationLimit:Number(limit)},'写作设置已保存。');}}><h2>续写长度</h2><p>每次续写生成一个完整段落，先审阅，再决定是否采纳。</p><SettingRow title={<label htmlFor="writing-limit">续写最大字数</label>} description="允许 1–10000 个可见字符，默认 100。"><div className="settings-inline-field"><input id="writing-limit" type="number" min={1} max={10000} step={1} required value={limit} onChange={event=>setLimit(event.target.value)}/><span>字</span></div></SettingRow><small>含标点，不计空白与 Markdown 标记；超限或多段输出会阻止应用。</small><button type="submit" className="settings-primary" disabled={busy}>{busy?'保存中…':'保存写作设置'}</button></form>}
      {section==='shortcuts'&&<section className="settings-card shortcut-settings"><h2>常用操作</h2>{[
        ['锁定 / 解锁面板位置',appearance.appearance.panelLockGesture==='longPress'?'长按标题栏 0.6 秒':'双击标题栏'],
        ['新建笔记（文档列表或新标签页内）','Ctrl + N'],['打开文件（新标签页内）','Ctrl + O'],['新建文件夹（文档列表内）','Ctrl + Shift + N'],['重命名选中文件','F2'],['删除到回收站（文档列表内）','Delete'],['新标签页打开（文档列表内）','Ctrl + Enter'],['复制路径（文档列表内）','Ctrl + Shift + C'],['文件夹中查找（文档列表内）','Ctrl + Shift + F'],['文件右键菜单','Shift + F10'],['保存正文','Ctrl + S'],['查找与替换','Ctrl + F'],['呼叫 AI','Ctrl + J'],['标注选区','Ctrl + Alt + M'],['发送消息','Ctrl + Enter'],['撤回 / 重做','Ctrl + Z / Ctrl + Y'],['停止生成 / 取消拖动','Escape'],['拖动时保持浮动','Alt + 拖动'],
        ['下一处 / 上一处匹配','F3 / Shift + F3'],['打开替换（编辑区内）','Ctrl + H'],['粗体 / 斜体 / 下划线（编辑区内）','Ctrl + B / I / U'],['左对齐 / 居中 / 右对齐（编辑区内）','Ctrl + Shift + L / E / R'],
      ].map(([label,key])=><div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</section>}
      {section==='models'&&!draft&&<>
        <section className="settings-card model-runtime"><div><h2>当前使用</h2><p>{activeModelLabel(config)}</p></div><select aria-label="当前使用的模型" disabled={busy} value={config.demo?'demo':config.selection?modelChoice(config.selection):'demo'} onChange={event=>void run('/config',{revision:config.revision,demo:event.target.value==='demo',...(event.target.value==='demo'?{}:{selection:parseModelChoice(event.target.value)})})}><option value="demo">演示模式</option>{config.services.filter(item=>item.enabled&&item.models.length).map(service=><optgroup label={service.name} key={service.id}>{options.filter(item=>item.serviceId===service.id).map(item=><option key={item.value} value={item.value}>{service.models.find(model=>model.id===item.modelId)?.name}</option>)}</optgroup>)}</select></section>
        <div className="settings-section-heading"><h2>AI 服务 <span>{config.services.length}</span></h2><button type="button" className="settings-primary" disabled={busy} onClick={()=>edit()}><Plus size={16}/>添加服务</button></div>
        {!!config.services.length&&<label className="settings-service-search"><Search size={15}/><input aria-label="搜索服务或模型" placeholder="搜索服务或模型…" value={filter} onChange={event=>setFilter(event.target.value)}/></label>}
        <div className="model-service-list">{shownServices.map(service=><article className={'model-service-card '+(!service.enabled?'disabled-service':'')} key={service.id}>
          <button className="model-service-open" type="button" onClick={()=>edit(service)} disabled={busy}><span className="model-service-avatar">{service.name.charAt(0).toUpperCase()}</span><span><b>{service.name}</b><small>{new URL(service.endpoint).host} · {service.models.length} 个模型</small></span><ChevronRight size={16}/></button>
          <span className="model-service-key-state">{service.hasKey?'密钥已设置':'未设置密钥'}</span>
          <button type="button" role="switch" aria-checked={service.enabled} aria-label={`启用${service.name}`} className="settings-toggle" disabled={busy} onClick={()=>void run('/model-services',{revision:config.revision,service:{...service,enabled:!service.enabled}},service.enabled?'服务已停用。':'服务已启用。')}><span/></button>
        </article>)}</div>
        {!config.services.length&&<section className="settings-empty"><Server size={28}/><h2>添加你的 AI 服务</h2><p>填写服务名称、接口地址和密钥，再手动添加模型 ID。</p><button type="button" className="settings-secondary" onClick={()=>edit()}><Plus size={15}/>添加第一个服务</button></section>}
        {!!config.services.length&&!shownServices.length&&<p className="settings-empty">没有匹配的服务或模型</p>}
        <p className="settings-page-note">支持 OpenAI Chat Completions 兼容接口。当前手动管理模型，不会自动获取模型列表。</p>
      </>}
      {section==='models'&&draft&&<form className="service-editor" onSubmit={saveService}><fieldset disabled={busy}>
        <div className="service-editor-actions"><button type="button" className="settings-secondary" disabled={busy} onClick={()=>{setDraft(null);setDiscard(false);setError('');}}>取消</button><button type="submit" className="settings-primary" disabled={busy}>{busy?'保存中…':'保存服务'}<Check size={14}/></button></div>
        {discard&&<div className="settings-discard" role="alert"><span>放弃这次尚未保存的编辑？</span><button type="button" disabled={busy} onClick={()=>{setDraft(null);setDiscard(false);setError('');}}>放弃编辑</button><button type="button" onClick={()=>setDiscard(false)}>继续编辑</button></div>}
        <section className="settings-card service-connection"><div className="service-protocol"><Server size={17}/><b>自定义服务</b><span>OpenAI Chat Completions</span></div>
          <div className="service-form-grid"><label>服务名称<input aria-label="服务名称" required maxLength={120} placeholder="例如：我的本地模型" value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label><label>接口地址<input aria-label="接口地址" type="url" required placeholder="http://localhost:4000/v1" value={draft.endpoint} onChange={event=>setDraft({...draft,endpoint:event.target.value})}/></label></div>
          <label>API 密钥 <small>本地服务可留空</small><input aria-label="API 密钥" type="password" autoComplete="off" placeholder={currentService?.hasKey?'已设置；留空保留当前密钥':'可选，仅在本机服务内存中保留'} value={draft.key} onChange={event=>setDraft({...draft,key:event.target.value,clearKey:false})}/></label>
          {currentService?.hasKey&&<label className="service-clear-key"><input type="checkbox" checked={draft.clearKey} onChange={event=>setDraft({...draft,clearKey:event.target.checked,key:''})}/>清除当前服务的密钥</label>}
          <p className="settings-field-note">填写到 /v1，或完整的 /chat/completions 地址。密钥不会写入配置文件；重启服务后需重新填写。修改接口地址时请重新填写密钥。</p>
        </section>
        <section className="settings-card service-models"><div className="settings-section-heading"><h2>模型 <span>{draft.models.length}</span></h2><span className="settings-field-note">手动添加</span></div>
          <div className="add-model-fields"><label>模型 ID<input aria-label="模型 ID" placeholder="端点实际提供的模型 ID" maxLength={200} value={modelId} onChange={event=>setModelId(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addModel();}}}/></label><label>显示名称<input aria-label="模型显示名称" placeholder="可选，默认使用模型 ID" maxLength={200} value={modelName} onChange={event=>setModelName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addModel();}}}/></label><button type="button" className="settings-secondary" onClick={addModel}><Plus size={15}/>添加模型</button></div>
          {!draft.models.length&&<p className="service-model-empty">还没有模型。添加后可在聊天输入框下方选择。</p>}
          <div className="service-model-list">{draft.models.map((model,index)=><div className="service-model-row" key={model.id}><span className="service-model-id" title={model.id}>{model.id}</span><input aria-label={`显示名称：${model.id}`} value={model.name} maxLength={200} onChange={event=>setDraft({...draft,models:draft.models.map(item=>item.id===model.id?{...item,name:event.target.value}:item)})}/><button type="button" className="settings-small-action" disabled={index===0} aria-label={`上移模型${model.id}`} onClick={()=>{const models=[...draft.models];[models[index-1],models[index]]=[models[index],models[index-1]];setDraft({...draft,models});}}><ArrowUp size={14}/></button><button type="button" className="settings-small-action" disabled={index===draft.models.length-1} aria-label={`下移模型${model.id}`} onClick={()=>{const models=[...draft.models];[models[index],models[index+1]]=[models[index+1],models[index]];setDraft({...draft,models});}}><ArrowDown size={14}/></button><button type="button" className="settings-small-action" aria-label={`移除模型${model.id}`} onClick={()=>setDraft({...draft,models:draft.models.filter(item=>item.id!==model.id)})}><X size={15}/></button></div>)}</div>
        </section>
        {draft.id&&<div className="service-danger-zone"><div><b>移除服务</b><p>移除连接配置和模型，不影响写作内容。</p></div><button type="button" className="settings-danger" disabled={busy} onClick={()=>setRemoveId(draft.id!)}><Trash2 size={14}/>移除服务</button></div>}
        {removeId&&<div className="settings-discard" role="alert"><span>确认移除「{draft.name}」及其模型配置？</span><button type="button" disabled={busy} onClick={async()=>{if(await run('/model-services/remove',{id:removeId,revision:config.revision},'服务已移除。')){setDraft(null);setRemoveId(null);}}}>确认移除</button><button type="button" onClick={()=>setRemoveId(null)}>保留服务</button></div>}
      </fieldset></form>}
    </main>
  </div>;
}

function PanelIconDelay({value,onChange,label}:{value:number;onChange:(value:number)=>void;label:string}){
  const [draft,setDraft]=useState(String(value/1000));
  useEffect(()=>setDraft(String(value/1000)),[value]);
  const apply=()=>{const seconds=Number(draft);if(!draft.trim()||!Number.isFinite(seconds)||seconds<.05||seconds>3){setDraft(String(value/1000));return;}const ms=Math.round(seconds*20)*50;setDraft(String(ms/1000));onChange(ms);};
  return <><input type="number" aria-label={label} min="0.05" max="3" step="0.05" value={draft} onChange={event=>setDraft(event.target.value)} onBlur={apply} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/><span>秒</span></>;
}
