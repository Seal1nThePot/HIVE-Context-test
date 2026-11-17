import {describe,expect,it,vi} from 'vitest';
import {defaultWritingDock,normalizeWritingDock,writingDockTokens} from './writingDockAppearance';
import {defaultTheme,normalizeTheme,readTheme} from '../theme/themePreferences';

describe('independent writing dock appearance',()=>{
  it('upgrades legacy themes once and preserves independent groups after global changes',()=>{
    const old={...defaultTheme,writingDock:undefined,colors:{...defaultTheme.colors,accent:'#b4aa83'}},upgraded=normalizeTheme(old);
    expect(upgraded.writingDock.frame.background).toBe(defaultWritingDock.frame.background);
    expect(upgraded.writingDock.aiButton.icon).toBe('#edf0e7');expect(upgraded.writingDock.aiButton.border).toBe('#edf0e7');
    const changed=normalizeTheme({...upgraded,base:'white',colors:{...upgraded.colors,accent:'#ff6600'}});
    expect(changed.writingDock.frame.background).not.toBe(upgraded.writingDock.frame.background);
    expect(writingDockTokens(changed.writingDock,changed.colors.accent)['--hive-dock-ai-bg']).toBe('#ff6600');
    expect(readTheme(JSON.stringify(changed)).writingDock).toEqual(changed.writingDock);
  });
  it('keeps frame, AI and side-button colors and geometry independent',()=>{
    const dock=normalizeWritingDock({frame:{border:'#112233',borderRadius:3},aiButton:{background:'#445566',icon:'#ffffff',border:'#abcdef',borderWidth:2},sideButtons:{icon:'#778899',border:'#334455',borderRadius:7}});
    const tokens=writingDockTokens(dock,'#ff6600');
    expect(tokens['--hive-dock-frame-border']).toBe('#112233');expect(tokens['--hive-dock-ai-border']).toBe('#abcdef');expect(tokens['--hive-dock-side-border']).toBe('#334455');
    expect(tokens['--hive-dock-ai-bg']).toBe('#445566');expect(tokens['--hive-dock-ai-icon']).toBe('#ffffff');expect(tokens['--hive-dock-side-icon']).toBe('#778899');
    expect(tokens['--hive-dock-frame-radius']).not.toBe(tokens['--hive-dock-side-radius']);
  });
  it('adds an independent hover color without changing existing dock colors',()=>{
    const previous={frame:{background:'#27301faa',border:'#556644'},aiButton:{background:'#445566',icon:'#27301f',border:'#aabbcc'}};
    const dock=normalizeWritingDock(previous);
    expect(dock.frame.background).toBe('#27301faa');expect(dock.aiButton.icon).toBe('#27301f');expect(dock.aiButton.border).toBe('#aabbcc');expect(dock.aiButton.hoverIcon).toBe('#edf0e7');
    const customized=normalizeWritingDock({...dock,aiButton:{...dock.aiButton,hoverIcon:'#123456'}});
    expect(writingDockTokens(customized,'#ffffff')['--hive-dock-ai-hover-icon']).toBe('#123456');
    expect(normalizeWritingDock(customized)).toEqual(customized);
  });
  it('validates stored colors and clamps geometry without sharing mutable defaults',()=>{
    const dock=normalizeWritingDock({frame:{background:'url(x)',borderWidth:999,borderRadius:-3},aiButton:{icon:'#fff',background:'red'},sideButtons:{icon:'#aabbcc',borderWidth:NaN}});
    expect(dock.frame.background).toBe(defaultWritingDock.frame.background);expect(dock.frame.borderWidth).toBe(8);expect(dock.frame.borderRadius).toBe(0);expect(dock.aiButton.icon).toBe('#edf0e7');expect(dock.aiButton.background).toBe('accent');expect(dock.sideButtons.borderWidth).toBe(1);
    dock.frame.border='#abcdef';expect(defaultWritingDock.frame.border).toBe('#667044');
  });
  it('does not remap already stored groups during live color previews',()=>{
    const remap=vi.fn((value:string)=>value);expect(normalizeWritingDock(defaultWritingDock,remap)).toEqual(defaultWritingDock);expect(remap).not.toHaveBeenCalled();
  });
});
