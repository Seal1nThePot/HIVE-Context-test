import {createHistoryStore} from './history-store.mjs';

function preview(text){return text.length>2000?text.slice(0,2000)+'\n…':text;}
function entrySummary({changes,...entry}){
  const sections=[];
  if(changes.text)for(const patch of changes.text.slice(0,20))sections.push({title:'正文位置 '+(patch.from+1),before:preview(patch.before),after:preview(patch.after)});
  if(changes.outline)sections.push({title:'写作大纲',before:outlinePreview(changes.outline.before.nodes),after:outlinePreview(changes.outline.after.nodes)});
  if(changes.file)sections.push({title:'文件',...(changes.file.from?{before:changes.file.from,after:changes.file.path}:{text:changes.file.path})});
  const reversible=!!changes.text||!!changes.outline||['create','duplicate','trash','restore','move','rename'].includes(changes.file?.action);
  return {...entry,sections,reversible};
}
function outlinePreview(nodes){return preview(nodes.map(node=>'#'.repeat(node.level)+' '+node.title+(node.description?'\n'+node.description:'')).join('\n'));}
function summary({entries,snapshots,...state}){
  return {...state,entries:entries.map(entrySummary),snapshots:snapshots.map(({text,outline,...item})=>({...item,
    sections:[{title:'正文与属性',text:preview(text)},{title:'写作大纲',text:outlinePreview(outline.nodes)}],
  }))};
}

export function registerHistoryRoutes(app){
  const stores=new WeakMap();
  function store(workspace){
    if(!stores.has(workspace)){
      const load=createHistoryStore(workspace.state).catch(error=>{stores.delete(workspace);throw error;});
      stores.set(workspace,load);
    }
    return stores.get(workspace);
  }
  app.get('/api/history',async(req,res)=>res.json(summary((await store(req.workspace)).read())));
  for(const collection of ['entries','snapshots']){
    app.get('/api/history/'+collection+'/:id',async(req,res)=>{
      const item=(await store(req.workspace)).read()[collection].find(value=>value.id===req.params.id);
      if(!item)return res.status(404).json({error:'这条历史记录已不存在。'});
      res.json(item);
    });
  }
  for(const [route,method] of [['entries','append'],['snapshots','saveSnapshot'],['limits','setLimits'],['status','setStatus']]){
    app.post('/api/history/'+route,async(req,res)=>{
      const history=await store(req.workspace);
      res.json(summary(await history[method](req.body)));
    });
  }
}
