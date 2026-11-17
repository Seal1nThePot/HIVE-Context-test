import {afterEach,describe,it,expect,vi} from 'vitest';
import {defaultTheme,normalizeTheme} from '../theme/themePreferences';
import {useNativePanelDocking} from './useNativePanelDocking';

const fixture=vi.hoisted(()=>({theme:null as unknown,notify:null as (()=>void)|null,cleanup:null as (()=>void)|null,unsubscribe:vi.fn()}));
vi.mock('react',()=>({useRef:(value:unknown)=>({current:value}),useEffect:(effect:()=>undefined|(()=>void))=>{fixture.cleanup=effect()||null;}}));
vi.mock('../theme/themeStore',()=>({getThemeSnapshot:()=>({preferences:fixture.theme}),subscribeTheme:(fn:()=>void)=>{fixture.notify=fn;return ()=>{fixture.notify=null;fixture.unsubscribe();};}}));
afterEach(()=>{fixture.cleanup?.();fixture.cleanup=null;vi.unstubAllGlobals();vi.clearAllMocks();});

describe('native docking appearance transport',()=>{
  it('uses the current palette for an active overlay and refreshes it when the theme changes',()=>{
    fixture.theme=normalizeTheme({...defaultTheme,dockingProfiles:{black:{guideIcon:'#123456',railActiveBackground:'#abcdef55'}}});
    let move:(event:unknown)=>void=()=>{};const frames:(()=>void)[]=[],dockOverlay=vi.fn();
    vi.stubGlobal('window',{hiveDesktop:{dockOverlay,onPanelMove:(fn:typeof move)=>{move=fn;return vi.fn();}},requestAnimationFrame:(fn:()=>void)=>{frames.push(fn);return frames.length;},cancelAnimationFrame:vi.fn()});
    useNativePanelDocking({allowed:()=>true,drop:vi.fn(),scene:()=>({panel:'files',scale:1,tree:{type:'panel',panel:'editor'},bounds:{x:36,y:0,width:600,height:400},viewport:{x:0,y:0,width:672,height:400},floating:[]})});
    move({id:'files',phase:'move',x:0,y:100});frames.shift()?.();
    expect(dockOverlay.mock.lastCall?.[0]).toMatchObject({rail:{edge:'left'},colors:{guideIcon:'#123456',railActiveBackground:'#abcdef55'}});
    fixture.theme=normalizeTheme({...defaultTheme,dockingProfiles:{black:{guideIcon:'#654321',railActiveBackground:'#fedcba77'}}});fixture.notify?.();
    expect(dockOverlay.mock.lastCall?.[0]).toMatchObject({colors:{guideIcon:'#654321',railActiveBackground:'#fedcba77'}});
    move({id:'files',phase:'cancel',x:0,y:100});expect(dockOverlay.mock.lastCall?.[0]).toBeNull();const count=dockOverlay.mock.calls.length;fixture.notify?.();expect(dockOverlay).toHaveBeenCalledTimes(count);
  });
});
