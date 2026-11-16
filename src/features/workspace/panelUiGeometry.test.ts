import { describe, expect, it } from "vitest";
import { fitFloatingRect, placePanelActions, resizeFloatingRect } from "./panelUiGeometry";
describe('panel controls remain reachable',()=>{
  it('opens the actions as a vertical column beside the control',()=>{
    const rail=placePanelActions({x:20,y:170,width:27,height:27},{width:1280,height:720},3);
    expect(rail.orientation).toBe('vertical');expect(rail.x).toBe(47);expect(rail.y).toBe(170);
    expect(rail.width).toBe(158);expect(rail.height).toBe(92);
  });
  it('stacks actions on the right when a row cannot fit',()=>{
    const rail=placePanelActions({x:1040,y:170,width:27,height:27},{width:1280,height:720},3);
    expect(rail.orientation).toBe('vertical');expect(rail.x).toBe(1067);expect(rail.width).toBe(158);
    expect(rail.x+rail.width).toBeLessThanOrEqual(1272);
  });
  it('keeps a scaled menu reachable at the bottom-right corner',()=>{
    const rail=placePanelActions({x:1160,y:680,width:27,height:27},{width:1200,height:720},3,1.5);
    expect(rail.width).toBe(237);expect(rail.height).toBe(137);
    expect(rail.x+rail.width).toBeLessThanOrEqual(1192);
    expect(rail.y+rail.height).toBeLessThanOrEqual(712);
  });
  it('allows large menu text with compact UI controls without clipping the labels',()=>{
    const rail=placePanelActions({x:290,y:360,width:14.4,height:14.4},{width:320,height:480},3,.8,1.6);
    expect(rail.width).toBe(232);
    expect(rail.height).toBeCloseTo(112.4);
    expect(rail.x+rail.width).toBeLessThanOrEqual(312);
    expect(rail.y+rail.height).toBeLessThanOrEqual(472);
  });
  it('keeps all edge fallback action bars inside the viewport',()=>{
    for(const viewport of [{width:1280,height:720},{width:320,height:480},{width:180,height:100}]){
      for(const point of [{x:viewport.width-35,y:8},{x:viewport.width-35,y:viewport.height-35},{x:8,y:viewport.height-35}]){
        const rail=placePanelActions({...point,width:27,height:27},viewport,3);
        expect(rail.x).toBeGreaterThanOrEqual(8);expect(rail.y).toBeGreaterThanOrEqual(8);
        expect(rail.x+rail.width).toBeLessThanOrEqual(viewport.width-8);
        expect(rail.y+rail.height).toBeLessThanOrEqual(viewport.height-8);
      }
    }
  });
  it('recovers an old offscreen floating panel after a window shrinks',()=>{
    const rect=fitFloatingRect({x:1400,y:-500,width:900,height:1100},{width:800,height:600});
    expect(rect).toEqual({x:8,y:8,width:784,height:584});
  });
  it('keeps the opposite edges fixed during north-west resizing and clamps the title into view',()=>{
    const original={x:300,y:200,width:400,height:350};
    const rect=resizeFloatingRect(original,'nw',-1000,-1000,{width:1280,height:720});
    expect(rect.x).toBe(8);expect(rect.y).toBe(8);
    expect(rect.x+rect.width).toBe(700);expect(rect.y+rect.height).toBe(550);
    const minimum=resizeFloatingRect(original,'nw',1000,1000,{width:1280,height:720});
    expect(minimum.width).toBe(190);expect(minimum.height).toBe(180);
    expect(minimum.x+minimum.width).toBe(700);expect(minimum.y+minimum.height).toBe(550);
  });
  it('limits south-east resize to the visible screen while preserving the top-left control',()=>{
    const rect=resizeFloatingRect({x:300,y:200,width:400,height:350},'se',2000,2000,{width:1280,height:720});
    expect(rect.x).toBe(300);expect(rect.y).toBe(200);
    expect(rect.x+rect.width).toBe(1272);expect(rect.y+rect.height).toBe(712);
  });
});
