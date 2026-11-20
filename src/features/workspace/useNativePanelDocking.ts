import {useEffect,useRef} from 'react';
import {DockIntent,type DockGuide,type DockScene} from './dockInteraction';
import {railDropAt} from './nativeDocking';
import {latestGestureFrame,gestureFrameClock} from './gestureFrame';
import {dockingColors} from '../theme/dockingAppearance';
import {getThemeSnapshot,subscribeTheme} from '../theme/themeStore';
import {themeRoleColor,themeTokens,type ThemePreferences} from '../theme/themePreferences';
import {getDockIconOverrides,subscribeIconOverrides} from '../../shared/icons';

type Rail=NonNullable<ReturnType<typeof railDropAt>>;
type Actions={scene:(id:string)=>DockScene;allowed:(id:string)=>boolean;resolveId?:(host:string)=>string;drop:(id:string,guide:DockGuide|null,rail:Rail|null)=>void};
export function useNativePanelDocking(actions:Actions){
  const latest=useRef(actions);latest.current=actions;
  useEffect(()=>{
    const api=window.hiveDesktop;if(!api)return;
    type Feedback=NonNullable<Parameters<typeof api.dockOverlay>[0]>;
    let active:string|null=null,intent=new DockIntent(),shown:Feedback|null=null;
    let sendIcons=true,previousTheme:ThemePreferences|undefined,iconColors:Feedback['iconColors'];
    const show=(feedback:Feedback)=>{
      shown=feedback;
      const theme=getThemeSnapshot().preferences;
      if(theme!==previousTheme){
        const {rawAccent,light}=themeTokens(theme);
        iconColors={accent:rawAccent,danger:themeRoleColor(theme.colors.danger,light)};
        previousTheme=theme;
      }
      const icons=sendIcons?{iconOverrides:getDockIconOverrides()}:{};
      sendIcons=false;
      api.dockOverlay({...feedback,colors:dockingColors(theme),iconColors,...icons});
    };
    const clear=()=>{active=null;intent.reset();shown=null;api.dockOverlay(null);};
    const unsubscribeTheme=subscribeTheme(()=>{if(shown)show(shown);});
    const unsubscribeIcons=subscribeIconOverrides(()=>{sendIcons=true;if(shown)show(shown);});
    const process=(raw:Parameters<Parameters<typeof api.onPanelMove>[0]>[0])=>{
      const event={...raw,id:latest.current.resolveId?.(raw.id)||raw.id};
      if(event.phase==='cancel'){clear();return;}
      if(!latest.current.allowed(event.id)){clear();return;}
      if(active!==event.id){active=event.id;intent=new DockIntent();}
      const scene=latest.current.scene(event.id);
      const feedback=intent.step(event,scene);
      const rail=feedback.target?.host||event.free||scene.locked||scene.positionLockedPanels?.includes(event.id)?null:railDropAt(event,scene.bounds,scene.viewport.width);
      if(event.phase==='end'){
        const ready=feedback?.ready||null;clear();
        if(rail||ready)latest.current.drop(event.id,ready,rail);
      }else show(rail?{guides:[],ready:null,rail}:{host:feedback.target?.host,guides:feedback?.guides||[],ready:feedback?.ready?{preview:feedback.ready.preview,button:feedback.ready.button}:null});
    };
    const movement=latestGestureFrame<Parameters<typeof process>[0]>(gestureFrameClock(window),process);
    const unsubscribe=api.onPanelMove(raw=>{if(raw.phase==='move')movement.push(raw);else{movement.cancel();process(raw);}});
    return()=>{unsubscribe();unsubscribeTheme();unsubscribeIcons();movement.cancel();clear();};
  },[]);
}
