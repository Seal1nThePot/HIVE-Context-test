import {useEffect,useRef} from 'react';
import {DockIntent,type DockGuide,type DockScene} from './dockInteraction';
import {railDropAt} from './nativeDocking';
import {latestGestureFrame,gestureFrameClock} from './gestureFrame';
import {dockingColors} from '../theme/dockingAppearance';
import {getThemeSnapshot,subscribeTheme} from '../theme/themeStore';

type Rail=NonNullable<ReturnType<typeof railDropAt>>;
type Actions={scene:(id:string)=>DockScene;allowed:(id:string)=>boolean;resolveId?:(host:string)=>string;drop:(id:string,guide:DockGuide|null,rail:Rail|null)=>void};
export function useNativePanelDocking(actions:Actions){
  const latest=useRef(actions);latest.current=actions;
  useEffect(()=>{
    const api=window.hiveDesktop;if(!api)return;
    type Feedback=NonNullable<Parameters<typeof api.dockOverlay>[0]>;
    let active:string|null=null,intent=new DockIntent(),shown:Feedback|null=null;
    const show=(feedback:Feedback)=>{shown=feedback;api.dockOverlay({...feedback,colors:dockingColors(getThemeSnapshot().preferences)});};
    const clear=()=>{active=null;intent.reset();shown=null;api.dockOverlay(null);};
    const unsubscribeTheme=subscribeTheme(()=>{if(shown)show(shown);});
    const process=(raw:Parameters<Parameters<typeof api.onPanelMove>[0]>[0])=>{
      const event={...raw,id:latest.current.resolveId?.(raw.id)||raw.id};
      if(event.phase==='cancel'){clear();return;}
      if(!latest.current.allowed(event.id)){clear();return;}
      if(active!==event.id){active=event.id;intent=new DockIntent();}
      const scene=latest.current.scene(event.id);
      const rail=event.free||scene.locked||scene.positionLockedPanels?.includes(event.id)?null:railDropAt(event,scene.bounds,scene.viewport.width);
      const feedback=rail?null:intent.step(event,scene);
      if(event.phase==='end'){
        const ready=feedback?.ready||null;clear();
        if(rail||ready)latest.current.drop(event.id,ready,rail);
      }else show(rail?{guides:[],ready:null,rail}:{guides:feedback?.guides||[],ready:feedback?.ready?{preview:feedback.ready.preview,button:feedback.ready.button}:null});
    };
    const movement=latestGestureFrame<Parameters<typeof process>[0]>(gestureFrameClock(window),process);
    const unsubscribe=api.onPanelMove(raw=>{if(raw.phase==='move')movement.push(raw);else{movement.cancel();process(raw);}});
    return()=>{unsubscribe();unsubscribeTheme();movement.cancel();clear();};
  },[]);
}
