import { describe, expect, it } from "vitest";
import { dockedPanels, dockResizeEdges, initialDockTree, insertDockPanel, leaf, measureDockTree, mergeDockPanel, removeDockPanel, resizeDockSplit } from "./panelLayout";
describe("free panel composition", () => {
  it("finds the adjacent split for every inside edge of a nested pane", () => {
    const tree=insertDockPanel(initialDockTree(),'editor:2','editor','bottom','editors');
    expect(dockResizeEdges(tree,'editor')).toEqual({bottom:'editors',right:'initial-chat',left:'initial-files'});
    expect(dockResizeEdges(tree,'editor:2')).toEqual({top:'editors',right:'initial-chat',left:'initial-files'});
    expect(dockResizeEdges(tree,'files')).toEqual({right:'initial-files'});
    expect(dockResizeEdges(tree,'missing')).toBeNull();
  });
  it("combines independent panes above, below and beside any existing pane", () => {
    let tree = insertDockPanel(initialDockTree(), "outline", "files", "bottom", "outline-split");
    tree = insertDockPanel(tree, "scratch", "editor", "top", "scratch-split");
    tree = insertDockPanel(tree, "annotations", "conversation", "left", "annotation-split");
    expect(dockedPanels(tree).sort()).toEqual(["annotations","conversation","editor","files","outline","scratch"]);
    const {panels} = measureDockTree(tree,{x:0,y:0,width:1500,height:900});
    expect(panels.outline.y).toBeGreaterThan(panels.files.y);
    expect(panels.scratch.y).toBeLessThan(panels.editor.y);
    expect(panels.annotations.x).toBeLessThan(panels.conversation.x);
    expect(panels.scratch.height+panels.editor.height+5).toBe(900);
  });
  it("moves an already docked pane without leaving duplicates or empty divisions", () => {
    const moved=insertDockPanel(initialDockTree(),"files","conversation","bottom","move");
    expect(dockedPanels(moved)).toEqual(["editor","conversation","files"]);
    expect(new Set(dockedPanels(moved)).size).toBe(3);
    const measured=measureDockTree(moved,{x:0,y:0,width:1000,height:600});
    expect(measured.panels.editor.height).toBe(600);
    expect(measured.panels.files.y).toBeGreaterThan(measured.panels.conversation.y);
  });
  it("closes all panes and supports docking back into an empty workspace", () => {
    let tree=removeDockPanel(initialDockTree(),"files");
    tree=removeDockPanel(tree,"conversation");
    expect(tree).toEqual(leaf("editor"));
    tree=removeDockPanel(tree,"editor");
    expect(tree).toBeNull();
    expect(insertDockPanel(tree,"scratch","","right")).toEqual(leaf("scratch"));
  });
  it("adds multiple editor identities and preserves nested split proportions", () => {
    const tree=insertDockPanel(initialDockTree(),"editor:second","editor","bottom","editors");
    const resized=resizeDockSplit(tree,"editors",.7);
    const measured=measureDockTree(resized,{x:0,y:0,width:1300,height:705});
    expect(measured.panels.editor.height).toBeCloseTo(490);
    expect(measured.panels['editor:second'].height).toBeCloseTo(210);
    expect(measured.panels.files.height).toBe(705);
    expect(dockedPanels(resized).filter(id=>id.startsWith('editor'))).toHaveLength(2);
  });
  it("keeps geometry inside the workspace after viewport changes", () => {
    const tree=insertDockPanel(initialDockTree(),"annotations","editor","bottom","ann");
    for(const width of [900,1600]){
      const {panels}=measureDockTree(tree,{x:0,y:0,width,height:700});
      for(const rect of Object.values(panels)){
        expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x+rect.width).toBeLessThanOrEqual(width+.001);
        expect(rect.y+rect.height).toBeLessThanOrEqual(700.001);
      }
    }
  });
});
