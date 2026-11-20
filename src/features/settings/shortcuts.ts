export const shortcutGroups = [
  {label:'文件与仓库', items:[
    {id:'newNote', label:'新建笔记', scope:'global', keys:['Ctrl+N']},
    {id:'openFiles', label:'打开文档列表', scope:'global', keys:['Ctrl+O']},
    {id:'save', label:'保存正文', scope:'global', keys:['Ctrl+S']},
    {id:'newFolder', label:'新建文件夹', scope:'files', keys:['Ctrl+Shift+N']},
    {id:'renameFile', label:'重命名选中文件', scope:'files', keys:['F2']},
    {id:'trashFile', label:'删除到回收站', scope:'files', keys:['Delete']},
    {id:'openFileTab', label:'在新标签页打开文件', scope:'files', keys:['Ctrl+Enter']},
    {id:'copyFilePath', label:'复制文件路径', scope:'files', keys:['Ctrl+Shift+C']},
    {id:'findInFolder', label:'在文件夹中查找', scope:'files', keys:['Ctrl+Shift+F']},
    {id:'fileMenu', label:'文件右键菜单', scope:'files', keys:['Shift+F10','ContextMenu']},
  ]},
  {label:'正文编辑', items:[
    {id:'undo', label:'撤回', scope:'editor', keys:['Ctrl+Z']},
    {id:'redo', label:'重做', scope:'editor', keys:['Ctrl+Y','Ctrl+Shift+Z']},
    {id:'bold', label:'粗体', scope:'editor', keys:['Ctrl+B']},
    {id:'italic', label:'斜体', scope:'editor', keys:['Ctrl+I']},
    {id:'underline', label:'下划线', scope:'editor', keys:['Ctrl+U']},
    {id:'alignLeft', label:'左对齐', scope:'editor', keys:['Ctrl+Shift+L']},
    {id:'alignCenter', label:'居中对齐', scope:'editor', keys:['Ctrl+Shift+E']},
    {id:'alignRight', label:'右对齐', scope:'editor', keys:['Ctrl+Shift+R']},
  ]},
  {label:'查找替换', items:[
    {id:'find', label:'查找与替换', scope:'global', keys:['Ctrl+F']},
    {id:'replace', label:'聚焦替换内容', scope:'search', keys:['Ctrl+H']},
    {id:'findNext', label:'下一处匹配', scope:'search', keys:['F3','Ctrl+G']},
    {id:'findPrevious', label:'上一处匹配', scope:'search', keys:['Shift+F3','Ctrl+Shift+G']},
  ]},
  {label:'AI 对话', items:[
    {id:'callAI', label:'呼叫 AI', scope:'global', keys:['Ctrl+J']},
    {id:'sendMessage', label:'发送 AI 消息', scope:'composer', keys:['Enter','Ctrl+Enter']},
    {id:'stopGeneration', label:'停止 AI 生成', scope:'global', keys:['Escape']},
  ]},
] as const;

type Shortcut = typeof shortcutGroups[number]['items'][number];
export type ShortcutId = Shortcut['id'];
export type ShortcutBindings = Partial<Record<ShortcutId,string>>;
const shortcuts: readonly Shortcut[] = shortcutGroups.flatMap(group=>[...group.items]);
type KeyInput = Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'> & {isComposing?:boolean;keyCode?:number;getModifierState?:(name:string)=>boolean};

export function shortcutChord(event:KeyInput){
  if(event.isComposing||event.keyCode===229||event.getModifierState?.('AltGraph'))return '';
  const key = event.key===' '?'Space':event.key.length===1?event.key.toUpperCase():event.key;
  if(!key||['Alt','AltGraph','Control','Meta','Shift','Unidentified','Process','Dead'].includes(key))return '';
  const modifiers = [event.ctrlKey||event.metaKey?'Ctrl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':''].filter(Boolean);
  return [...modifiers,key].join('+');
}

export function shortcutKeys(bindings:ShortcutBindings,id:ShortcutId):readonly string[]{
  return bindings[id]?[bindings[id]]:shortcuts.find(item=>item.id===id)!.keys;
}

export function matchesShortcut(bindings:ShortcutBindings,id:ShortcutId,event:KeyInput){
  return shortcutKeys(bindings,id).includes(shortcutChord(event));
}

export function shortcutLabel(bindings:ShortcutBindings,id:ShortcutId){
  return shortcutKeys(bindings,id).map(key=>key.replace(/\+(?=.)/g,' + ')).join(' / ');
}

const reserved = new Set(['F5','Ctrl+R','Ctrl+A','Ctrl+C','Ctrl+V','Ctrl+X','Ctrl+Shift+V','Shift+Enter']);
const chordPattern = /^(?:(?:Ctrl|Alt|Shift)\+)*(?:[A-Z0-9`~!@#$%^&*()_+=\[\]{}\\|:;'"<>,.?/-]|F(?:[1-9]|1\d|2[0-4])|Escape|Enter|Delete|Space|ContextMenu)$/;

export function shortcutIssue(bindings:ShortcutBindings,id:ShortcutId,key:string):string|undefined{
  if(!chordPattern.test(key))return '请选择带 Ctrl 或 Alt 的组合键，或使用功能键。';
  if(reserved.has(key))return '该按键用于系统操作、剪贴板或聊天换行。';
  const action=shortcuts.find(item=>item.id===id)!;
  if(!/^(?:Ctrl\+|Alt\+)/.test(key)&&!/(?:^|\+)F(?:[1-9]|1\d|2[0-4])$/.test(key)&&!(key==='Enter'&&id==='sendMessage')&&!(key==='Delete'&&action.scope==='files')&&!(key==='ContextMenu'&&action.scope==='files')&&!(key==='Escape'&&id==='stopGeneration'))return '请选择带 Ctrl 或 Alt 的组合键，或使用功能键。';
  const conflict=shortcuts.find(other=>other.id!==id
    &&(other.scope===action.scope||other.scope==='global'||action.scope==='global'
      ||other.scope==='search'&&action.scope==='editor'||other.scope==='editor'&&action.scope==='search')
    &&shortcutKeys(bindings,other.id).includes(key));
  if(conflict)return `已分配给「${conflict.label}」。`;
}

export function readShortcutBindings(raw:string|null):ShortcutBindings {
  try {
    const parsed=JSON.parse(raw||'null');
    if(parsed?.version!==1||!parsed.bindings||typeof parsed.bindings!=='object')return {};
    const candidates:ShortcutBindings={};
    for(const {id} of shortcuts){
      const value:unknown=parsed.bindings[id];
      if(typeof value==='string')candidates[id]=value;
    }
    for(const {id} of shortcuts){
      const key=candidates[id];
      if(key&&shortcutIssue(candidates,id,key))delete candidates[id];
    }
    return candidates;
  }catch{return {};}
}
