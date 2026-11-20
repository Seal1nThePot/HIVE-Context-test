import { mkdir, writeFile } from 'node:fs/promises';

const accent = 'var(--icon-accent,currentColor)';
const danger = 'var(--icon-danger,currentColor)';
const tone = color => color ? ` stroke="${color}"` : '';
const path = (d, color, weight) => `<path d="${d}"${tone(color)}${weight ? ` stroke-width="${weight}"` : ''}/>`;
const fill = (d, color = 'currentColor') => `<path d="${d}" fill="${color}" stroke="none"/>`;
const rect = (x, y, w, h, r = 1.5, color) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"${tone(color)}/>`;
const circle = (cx, cy, r, filled = false, color = 'currentColor') => `<circle cx="${cx}" cy="${cy}" r="${r}" ${filled ? `fill="${color}" stroke="none"` : `stroke="${color}"`}/>`;
const plus = (x, y, r, color = accent) => path(`M${x-r} ${y}h${2*r}M${x} ${y-r}v${2*r}`, color, 2.3);
const cross = (x, y, r, color) => path(`M${x-r} ${y-r}l${2*r} ${2*r}m0 ${-2*r}l${-2*r} ${2*r}`, color, 2.3);
const lens = (x, y, r) => circle(x, y, r) + path(`M${x+r*.72} ${y+r*.72}l${r*.65} ${r*.65}`);
const arrow = (x, y, down, color = accent) => {
  const d = down ? 1 : -1;
  return path(`M${x} ${y-6*d}v${12*d}m-2.7 ${-3*d}l2.7 ${3*d} 2.7 ${-3*d}`, color);
};
const cursor = fill('M15 12.4 22.7 16l-3.2 1 2.2 3-1.5 1.1-2.2-3-2 2z');

const page = path('M14 2.9H6a2 2 0 0 0-2 2v14.2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.9z')
  + path('M14 2.9V7a1.9 1.9 0 0 0 1.9 1.9H20');
const pageWithOpenCorner = tail => path(`M12.6 21.1H6a2 2 0 0 1-2-2V4.9a2 2 0 0 1 2-2h8l6 6v${tail}M14 2.9V7a1.9 1.9 0 0 0 1.9 1.9H20`);
const pageCorner = pageWithOpenCorner(4);
const writing = path('M7.5 12h8M7.5 15h7');
const folder = path('M3.7 6h5l2 2.3h9.6a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H3.7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z');
const folderWithOpenCorner = tail => path(`M13 20.7H3.7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5l2 2.3h9a2 2 0 0 1 2 2v${tail}`);
const folderCorner = folderWithOpenCorner(2.3);
const newNoteCorner = path('M8.5 21.1H5.7a1.9 1.9 0 0 1-1.9-1.9V4.4a1.9 1.9 0 0 1 1.9-1.9H12l4.7 4.7M12 2.5v3.2a1.5 1.5 0 0 0 1.5 1.5h3.2M7 11.8h4');
const newFolderCorner = path('M8.5 20.7H3.7a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h5L10.7 7h9a2 2 0 0 1 2 2v2.2');
const createMark = plus(16, 16, 6.25);
const clock = circle(8.7, 12, 6.3) + path('M8.7 8.6V12l2.3 1.7');
const upperA = (x, y) => path(`M${x} ${y+4.7}l2.1-4.7 2.1 4.7m-3.5-1.6h2.8`, '', 1.45);
const upperZ = (x, y) => path(`M${x} ${y}h4.2l-4.2 4.7h4.2`, '', 1.45);
const lowerA = (x, y) => path(`M${x} ${y+1}c1.5-1.4 4.2-1.1 4.2.8v4m0-3.1C${x+2} ${y+2.1} ${x-.8} ${y+3.2} ${x+.1} ${y+4.7}c.8 1.3 3.2 1 4.1-.7`, '', 1.5);

const repository = '<rect x="2" y="2" width="20" height="8" rx="2" ry="2" stroke-width="2"/>'
  + '<rect x="2" y="14" width="20" height="8" rx="2" ry="2" stroke-width="2"/>'
  + '<line x1="6" y1="6" x2="6.01" y2="6" stroke-width="2"/><line x1="6" y1="18" x2="6.01" y2="18" stroke-width="2"/>';
const rackCorner = path('M4 15.8V7.2h2l1.7-2h2.9a1 1 0 0 1 1 1v10H5a1 1 0 0 1-1-1Zm9.3-.8V7.2h1.8l1.7-2h2.7a1 1 0 0 1 1 1V12M2 15.9v2.7A1.4 1.4 0 0 0 3.4 20H13');
const minusDot = fill('M18.7 13.7a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Zm-2 4.1h4a.7.7 0 0 1 0 1.4h-4a.7.7 0 0 1 0-1.4Z').replace('/>', ' fill-rule="evenodd"/>');
const bin = path('M7 6V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V6M3 6h18M5 6l1.6 13.3A2 2 0 0 0 8.6 21h6.8a2 2 0 0 0 2-1.7L19 6');
const binCorner = path('M7 6V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V6M3 6h18M5 6l1.4 13.3A2 2 0 0 0 8.4 21h3.5M19 6l-.6 5.4');

const codeWindow = rect(2.8, 3, 18.4, 18) + path('M3 7.2h18m-13 4.2 3 2.6-3 2.6m5.3 0h3.7');
const eraser = path('m14.15 19.4 4.7-5.8a1.1 1.1 0 0 1 1.5-.1l2.2 1.9a1 1 0 0 1 .1 1.5l-4.7 5.7a1.1 1.1 0 0 1-1.6.1l-2.1-1.8a1.1 1.1 0 0 1-.1-1.5Zm1.25-1.45 3.8 3.2');
const marker = path('m5.3 17.3-.9 3.2h3.1l2.1-2.2M8.4 14.9l7.4-9.6a1.8 1.8 0 0 1 2.5-.3l2.3 1.8a1.8 1.8 0 0 1 .3 2.5l-7.5 9.6a1.3 1.3 0 0 1-1.8.2l-3-2.4a1.3 1.3 0 0 1-.2-1.8Zm3-3.9 5 3.9')
  + path('M2.3 21h10.3', accent, 2.8);

const historyHead = path('M4.3 4.2v4.4h4.4');
const historyFull = historyHead + path('M3.5 13.8a8.7 8.7 0 1 0 1.2-5.7');
const historyAcross = historyHead + path('M3.5 13.8a8.7 8.7 0 0 0 12.2 6m4.4-12a8.7 8.7 0 0 0-15.4.3');
const historyPencil = historyHead + path('M3.5 13.8a8.7 8.7 0 0 0 16.8-4.1m-3.2-4.6a8.7 8.7 0 0 0-12.4 3');
const camera = path('M12.6 9.5h2l1.1-1.7h3.2l1 1.7h1.8a1.3 1.3 0 0 1 1.3 1.3v5.4a1.3 1.3 0 0 1-1.3 1.3h-9.1a1.3 1.3 0 0 1-1.3-1.3v-5.4a1.3 1.3 0 0 1 1.3-1.3Z') + circle(17.1, 13.3, 2.05);
const pencil = path('m10.1 16 7.8-9.6a1.8 1.8 0 0 1 2.5-.2l.7.6a1.8 1.8 0 0 1 .2 2.5l-7.8 9.4-4.9 1.9zM10.3 16.1l3.3 2.7');
const chip = rect(12.7, 9, 8.4, 8.4, 1.15) + path('M14.8 7.3V9m3.6-1.7V9m-3.6 8.4v1.7m3.6-1.7v1.7m-7.4-7.7h1.7m-1.7 3.6h1.7m8.4-3.6h1.7m-1.7 3.6h1.7', '', 1.45) + fill('M15.7 11.7h2.5v2.7h-2.5z');

const referenceCard = rect(3, 4, 18, 16, 2) + path('M7 9.5h5M7 14h9') + fill('M15 4h4v7l-2-1.5-2 1.5z');
const referenceCardCorner = path('M8.8 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4M6.7 9.5h5');
const viewReference = path('M8.2 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2M6.8 9.5h4.2')
  + path('M9 16c2.3-3.1 4.4-4.5 6.8-4.5s4.5 1.4 6.8 4.5c-2.3 3.1-4.4 4.5-6.8 4.5S11.3 19.1 9 16Z')
  + circle(15.8, 16, 1.8, true);
const chain = (x, y, color = accent) => path(`M${x} ${y}l1.7-1.7a2.4 2.4 0 0 1 3.4 3.4l-2.2 2.2a2.3 2.3 0 0 1-3.1.2m.1-1.9a2.3 2.3 0 0 0-3.1.2l-2.2 2.2a2.4 2.4 0 0 0 3.4 3.4l1.7-1.7`, color);
const clip = (x, y, color) => path(`M${x} ${y}l4.8-4.8a2.4 2.4 0 0 1 3.4 3.4l-5.4 5.4a2.9 2.9 0 0 1-4.1-4.1l4.1-4.1a1.1 1.1 0 0 1 1.6 1.6L${x+.3} ${y+1.9}`, color);
const book = path('M12 7c-3.5-2.5-7.3-2.3-10-1v12c3-1.5 6.7-1.6 10 1 1-.7 2.2-1.2 3.3-1.4M12 7c3.5-2.5 7.3-2.3 10-1v6M12 7v12', accent);
const bulb = path('M10.2 7V6c-2.4-1.8-1.2-5 1.8-5s4.2 3.2 1.8 5v1', '', 1.65);
const bot = bulb + rect(3.6, 7, 16.8, 13.5, 4.2) + path('M3.6 12h-1a1 1 0 0 0-1 1v1.2a1 1 0 0 0 1 1h1m16.8-3.2h1a1 1 0 0 1 1 1v1.2a1 1 0 0 1-1 1h-1');
const sliders = (x, y, w, r) => path(`M${x} ${y}h${w}m${-w} 4h${w}`, '', 1.45)
  + circle(x+w*.33, y, r, true, accent) + circle(x+w*.73, y+4, r, true, accent);

const groups = [
  ['文件模块', '文件模块图标-定稿.png', [
    ['file.text', '文本文件', page + writing],
    ['file.newNote', '新建文档', newNoteCorner + createMark, '小尺寸修订'],
    ['file.newFolder', '新建文件夹', newFolderCorner + createMark, '小尺寸修订'],
    ['file.sortManual', '自由排序', path('M3 6.3h13M3 17.7h9.2') + path('M6 12h12', accent, 2.2) + cursor],
    ['file.sortNewest', '从新到旧', clock + arrow(20.2, 12, true)],
    ['file.sortOldest', '从旧到新', clock + arrow(20.2, 12, false)],
    ['file.sortAToZ', 'A 到 Z', upperA(5.1, 4.8) + upperZ(5.1, 14.3) + arrow(16.7, 12, true)],
    ['file.sortZToA', 'Z 到 A', upperZ(5.1, 4.8) + upperA(5.1, 14.3) + arrow(16.7, 12, true)],
  ]],
  ['仓库与回收站', 'drafts/仓库与回收站图标-v3.png', [
    ['panel.repositories', '仓库管理', repository, '恢复原版'],
    ['repository.add', '添加仓库', rackCorner + plus(18.5, 18.3, 3.1)],
    ['repository.remove', '移除仓库', rackCorner + cross(18.5, 18.3, 2.55), '确认方向'],
    ['trash.deletedFolder', '已删除的文件夹', folderCorner + minusDot],
    ['trash.deletedFile', '已删除的文件', pageCorner + path('M7.4 12h7.5m-7.5 3h5.5') + minusDot],
    ['trash.deletePermanently', '永久删除', bin + cross(12, 13.5, 2.8, danger)],
    ['trash.filter', '筛选回收站', binCorner + lens(17.2, 16.9, 3.4)],
    ['repository.noResults', '仓库搜索无结果', rackCorner + lens(18, 17, 3.4)],
  ]],
  ['编辑器', '编辑器图标-定稿.png', [
    ['format.inlineCode', '行内代码', path('m7 7-5 5 5 5m10-10 5 5-5 5M14.5 5 9.5 19')],
    ['insert.codeBlock', '插入代码块', rect(2, 6, 20, 12, 2) + path('m8 9.5-2.6 2.5 2.6 2.5m8-5 2.6 2.5-2.6 2.5') + plus(12, 12, 1.8)],
    ['editor.mode.source', '代码模式', codeWindow],
    ['insert.details', '插入折叠块', rect(2.3, 5.8, 19.4, 13, 2) + path('m5.7 8.7 2.4 2.1-2.4 2.1', accent) + path('M11 10.8h7.3M5.7 15.4h10.4')],
    ['format.highlight', '正文高亮', marker],
    ['annotation.markSelection', '标注选区', rect(2.3, 6, 19.4, 12, 2, accent) + path('M6 10h11.8M6 14h8.2')],
    ['annotation.unmarkSelection', '取消标注', path('M13 18.3H4.3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h15.5a2 2 0 0 1 2 2v4M6 10h11.8M6 14h7.3') + eraser],
    ['editor.findReplace', '查找替换', lens(10.4, 10.4, 7.3) + lowerA(8.4, 7.65)],
  ]],
  ['显示模式', '显示模式图标-定稿.png', [
    ['editor.mode.menu', '打开显示模式菜单', path('M2 12s3.6-5.4 10-5.4 10 5.4 10 5.4-3.6 5.4-10 5.4S2 12 2 12Z') + circle(12, 12, 2.3, true)],
    ['editor.mode.preview', '实时预览', rect(4.5, 2.6, 15, 18.8, 1.65) + upperA(7.5, 6.3) + lowerA(13, 6.1) + path('M7.4 15h9.2M7.4 18h7.4')],
    ['editor.mode.live', '实时编辑', path('M2.5 8h13M2.5 14h13') + path('M19.6 10v8m-2.1-8h4.2m-4.2 8h4.2', accent)],
    ['editor.mode.source', '代码显示模式', codeWindow],
    ['editor.mode.split', '代码–预览双栏模式', rect(1.5, 5, 21, 14, 1.8) + path('M12 5v14m-8-9 2.4 2L4 14m3.7 0h2.3', '', 1.4) + path('M13.8 13.5l1.55-3.9 1.55 3.9m-2.6-1.3h2.1M18.3 11.1c.7-.6 2.4-.7 2.4.7v1.9m0-1.6c-1.3-.6-3.1.1-2.5 1.1.5.8 2 .6 2.5-.1', '', 1.1) + path('M14.2 16h5.5', '', 1.4)],
    ['editor.mode.typewriter', '打字机模式', path('M6 10V3h12v7m-13 3-2.7 6a1 1 0 0 0 .9 1.4h17.6a1 1 0 0 0 .9-1.4L19 13M2 11h1.8m16.4 0H22') + rect(3.8, 9.4, 16.4, 3.1, 1.4) + path('M9 6.3h6', accent) + circle(8.3, 16.4, .9, true) + circle(12, 16.4, .9, true) + circle(15.7, 16.4, .9, true)],
  ]],
  ['历史记录', '历史记录图标-定稿.png', [
    ['history.open', '历史记录', historyFull + path('M12 7.2v5.1h4.4')],
    ['history.tab.snapshot', '文件快照', historyAcross + camera],
    ['history.tab.human', '人工操作历史', historyPencil + pencil],
    ['history.tab.ai', 'AI 操作历史', historyAcross + chip],
  ]],
  ['AI 参考资料', 'AI参考资料图标-定稿.png', [
    ['panel.basis', '查看依据', referenceCard, '造型修订'],
    ['basis.referenceFolder', '参考资料文件夹', folderWithOpenCorner(.75) + chain(17.1, 14, accent)],
    ['basis.referenceFile', '参考资料文件', pageWithOpenCorner(2.15) + path('M7.5 12h7') + chain(17.1, 14, accent)],
    ['basis.attachment', '外部附件', pageCorner + path('M7.4 12h7.4m-7.4 3h5.4') + clip(13.9, 18)],
    ['basis.reorderReference', '拖动调整顺序', path('M5 6.7h14M5 12h14M5 17.3h14', '', 2.25)],
  ]],
  ['AI 参考资料操作', 'AI参考资料添加与移除-定稿.png', [
    ['basis.addReference', '添加参考资料', referenceCardCorner + plus(16.8, 16.7, 4.8, 'currentColor'), '造型修订'],
    ['basis.removeReference', '移除参考资料', referenceCardCorner + path('M12 16.7h9.6', '', 2.3), '造型修订'],
  ]],
  ['AI 参考资料搜索', 'AI搜索参考资料-定稿.png', [
    ['basis.search', '搜索参考资料', referenceCardCorner + lens(16.9, 15.7, 4.4), '造型修订'],
  ]],
  ['AI 对话栏', '查看依据与待审文档图标-定稿.png', [
    ['conversation.viewBasis', '查看依据', viewReference, '造型修订'],
    ['document.pendingProposal', '待审建议所属文档', pageCorner + path('M7.2 12.2h7.4m-7.4 3h5.6') + path('M16.3 14.4h6m-6 7.1h6m-5.2-7c0 2 1 2.7 2.2 3.5-1.2.8-2.2 1.6-2.2 3.4m4.4-6.9c0 2-1 2.7-2.2 3.5 1.2.8 2.2 1.6 2.2 3.4', accent, 1.4)],
  ]],
  ['标注与笔记属性', '标注与笔记属性图标-定稿.png', [
    ['annotation.showLocal', '查看文本标注', book + path('M4.8 10h4.2M15 10h4.2') + rect(14.4, 13.1, 8.1, 7.8, 1.35) + path('M16.2 15.8h4.5m-4.5 2.3h3.4', '', 1.35)],
    ['properties.add', '添加笔记属性', rect(2, 5.5, 20, 13, 2) + path('M5.2 9.5h2.5m2.3 0h7.9m-12.7 4h2.5m2.3 0h5.6') + plus(18.5, 14.8, 1.7)],
  ]],
  ['设置', '设置图标-定稿.png', [
    ['model.choose', '模型', bot + circle(8.4, 12.8, 1.45, true) + circle(15.6, 12.8, 1.45, true) + path('M10.2 16.2q1.8 1.5 3.6 0', '', 1.45)],
    ['model.settings', '模型配置', bot + sliders(7.2, 11.8, 9.6, 1.45)],
    ['settings.search', '搜索设置', lens(10.3, 10.3, 7.6) + sliders(5.8, 8.2, 8.9, 1.25)],
    ['settings.searchServiceModel', '搜索服务或模型', bulb + path('M12.3 20H7.5a3.9 3.9 0 0 1-3.9-3.9V11a4 4 0 0 1 4-4h8.8a4 4 0 0 1 4 4v1m-16.8 0h-1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1m16.8-3h1a1 1 0 0 1 1 1v.5') + circle(8.5, 12.7, 1.25, true) + circle(15.5, 11.2, 1.2, true) + lens(17.1, 17.7, 3.75)],
  ]],
  ['模型选择器', '推理强度自动模式-定稿.png', [
    ['model.reasoning.serviceDefault', '服务默认',
      path('M12 1.9a7.4 7.4 0 0 0-7.4 7.4c0 2.8 1.4 4.6 2.8 6.2.9 1 1.4 2.1 1.4 3.3a1.3 1.3 0 0 0 1.3 1.3h3.8a1.3 1.3 0 0 0 1.3-1.3c0-1.2.5-2.3 1.4-3.3 1.4-1.6 2.8-3.4 2.8-6.2A7.4 7.4 0 0 0 12 1.9ZM8.55 17.2h6.9M9.65 22.5h4.7')
      + fill('M12 4.85l1.27 2.2h2.54l-1.27 2.2 1.27 2.2h-2.54L12 13.65l-1.27-2.2H8.19l1.27-2.2-1.27-2.2h2.54Z', accent)],
  ]],
  ['面板功能菜单', '整组收纳图标-定稿.png', [
    ['panel.stashGroup', '整组收纳',
      path('M6.1 5.1q.7-1 2-1h11.4a2.4 2.4 0 0 1 2.4 2.4v10.4')
      + rect(2.1, 7.6, 16.1, 12.3, 2.25) + path('M2.1 11.5h16.1')],
  ], [14, 24, 40]],
];

function render(drawing) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${drawing}</svg>`;
}

const output = new URL('./svg/', import.meta.url);
const definitions = new Map();
const manifest = groups.flatMap(([group, source, icons]) => icons.map(([id, label, drawing, status = '定稿'], index) => {
  if (definitions.has(id) && definitions.get(id) !== drawing) throw new Error(`同一语义使用了不同图形：${id}`);
  definitions.set(id, drawing);
  return { id, label, group, source, position: index + 1, status, asset: `svg/${id}.svg` };
}));

if (manifest.length !== 52 || definitions.size !== 51) throw new Error('图稿位置或独立 SVG 数量不匹配');
await mkdir(output, { recursive: true });
await Promise.all([...definitions].map(([id, drawing]) => writeFile(new URL(`${id}.svg`, output), render(drawing) + '\n')));
await writeFile(new URL('./icons.manifest.json', import.meta.url), JSON.stringify({ version: 1, entries: manifest }, null, 2) + '\n');

const htmlEscape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const sections = groups.map(([name, source, , sizes = [16, 24, 40]]) => {
  const items = manifest.filter(entry => entry.group === name).map(entry => {
    const svg = render(definitions.get(entry.id));
    const samples = ['light', 'dark'].map(theme => `<div class="sample ${theme}">${sizes.map(size => `<span class="glyph" style="--size:${size}px" aria-label="${size} 像素">${svg}</span>`).join('')}</div>`).join('');
    return `<article data-id="${entry.id}"><h3>${htmlEscape(entry.label)}</h3>${samples}<a href="${entry.asset}">${entry.id}</a>${entry.status === '定稿' ? '' : `<small>${entry.status}</small>`}</article>`;
  }).join('\n');
  return `<section><h2>${htmlEscape(name)}</h2><a class="source" href="${encodeURI(source)}">查看定稿参考图</a><div class="grid">${items}</div></section>`;
}).join('\n');
const preview = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HIVE SVG 图标预览</title>
<style>
:root{font-family:system-ui,sans-serif;color:#232a2d;background:#f8f7f4}body{max-width:1190px;margin:0 auto;padding:24px}h1{margin:0 0 8px}h2{display:inline-block;margin:24px 12px 10px 0;font-size:18px}h3{font-size:14px;margin:0 0 9px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,178px),1fr));gap:9px}article{padding:9px;background:white;border:1px solid #e0ded8;border-radius:6px}a{color:#38586c}article a,small,.source{display:inline-block;margin:5px 6px 0 0;font-size:11px;overflow-wrap:anywhere}.sample{display:flex;align-items:center;justify-content:space-evenly;height:50px;gap:5px;margin-bottom:3px;border-radius:3px;color:#232a2d;--icon-accent:#9c6511;--icon-danger:#a23226;background:#fff}.sample.dark{background:#24282c;color:#f3f0e9;--icon-accent:#e5b45b;--icon-danger:#ff9480}.glyph{width:var(--size);height:var(--size);display:inline-flex}.glyph svg{width:100%;height:100%}label{display:block;margin-top:10px}html.mono .sample{--icon-accent:currentColor;--icon-danger:currentColor}
</style>
<h1>HIVE SVG 图标预览</h1><p>${manifest.length} 个图稿位置 · ${definitions.size} 枚独立 SVG。每组从左到右为 16、24、40 px，整组收纳的第一列为菜单使用的 14 px。</p>
<label><input type="checkbox" id="mono"> 单色预览</label>
${sections}
<script>document.getElementById('mono').addEventListener('change',event=>document.documentElement.classList.toggle('mono',event.target.checked));</script>
</html>\n`;
await writeFile(new URL('./SVG图标预览.html', import.meta.url), preview);
process.stdout.write(`Exported ${definitions.size} SVGs for ${manifest.length} reference positions.\n`);
