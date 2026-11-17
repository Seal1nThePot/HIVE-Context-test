import type {WritingDockAppearance} from '../chat/writingDockAppearance';
import type {SurfaceColors} from './surfaceAppearance';
import type {Palette} from './themePreferences';

/** Complete light variants of 青苔鎏金. All colors are explicit, including rails and popups. */
export const oliveGrayColors:Palette={
  accent:'#56451b',secondary:'#3d4e31',link:'#58451a',success:'#284f30',warning:'#634018',danger:'#7b302b',
};
export const oliveWhiteColors:Palette={
  accent:'#755f29',secondary:'#556746',link:'#755e25',success:'#356b42',warning:'#84551f',danger:'#a0433b',
};
export const oliveGraySurfaces:SurfaceColors={
  titleBar:'#929f87',ribbonTitleBackground:'#aab5a0',ribbonTitleText:'#263020',ribbon:'#e0e3d9',ribbonContentText:'#34402a',ribbonBorder:'#8c997f',
  leftRailBackground:'#a4b096',leftRailIcon:'#34432a',rightRailBackground:'#a4b096',rightRailIcon:'#34432a',
  workspace:'#b9c3ae',panel:'#c7cdc1',panelHeader:'#b2bca8',panelBorder:'#8c997f',panelInnerBorder:'#a3af96',
  document:'#f4f3ed',documentText:'#2a3326',selectedTab:'#f4f3ed',
  settingsBackground:'#d5dacf',settingsSidebar:'#b7c1ad',settingsCard:'#f0f1e9',settingsBorder:'#a5b296',
  popup:'#f7f6f0',popupBorder:'#98a588',input:'#f6f5ee',inputBorder:'#98a588',
  uiText:'#263020',mutedText:'#414d36',selection:'#e1d6b2',
};
export const oliveWhiteSurfaces:SurfaceColors={
  titleBar:'#d0d8c4',ribbonTitleBackground:'#e4e9db',ribbonTitleText:'#35402c',ribbon:'#f0f3e9',ribbonContentText:'#3b4633',ribbonBorder:'#b5c1a4',
  leftRailBackground:'#e1e7d6',leftRailIcon:'#526142',rightRailBackground:'#e1e7d6',rightRailIcon:'#526142',
  workspace:'#dde4d2',panel:'#eef1e7',panelHeader:'#e5eadb',panelBorder:'#bcc8ac',panelInnerBorder:'#d0d9c3',
  document:'#fdfdf8',documentText:'#293225',selectedTab:'#f8faf1',
  settingsBackground:'#f1f4eb',settingsSidebar:'#e3ead8',settingsCard:'#fdfdf8',settingsBorder:'#c4cfb6',
  popup:'#fafbf4',popupBorder:'#b4c29f',input:'#ffffff',inputBorder:'#acbc96',
  uiText:'#34402c',mutedText:'#5d6e50',selection:'#d7e2c5',
};
export const oliveGrayWritingDock:WritingDockAppearance={
  frame:{background:'#c4cbbbf2',border:'#869577',borderWidth:1,borderRadius:20,shadow:'#26301f2e'},
  aiButton:{background:'accent',icon:'#ffffff',hoverIcon:'#ffffff',border:'#77622e',borderWidth:1,borderRadius:26},
  sideButtons:{background:'#00000000',icon:'#3d4f30',border:'#00000000',borderWidth:1,borderRadius:10,activeIcon:'#514018',activeBackground:'#ddcca0ff',activeBorder:'#8d783fff',hoverIcon:'#263720',hoverBackground:'#acb99aff'},
};
export const oliveWhiteWritingDock:WritingDockAppearance={
  frame:{background:'#eff3e7f2',border:'#b3c29d',borderWidth:1,borderRadius:20,shadow:'#26301f1f'},
  aiButton:{background:'accent',icon:'#ffffff',hoverIcon:'#ffffff',border:'#75612a',borderWidth:1,borderRadius:26},
  sideButtons:{background:'#00000000',icon:'#566847',border:'#00000000',borderWidth:1,borderRadius:10,activeIcon:'#74602b',activeBackground:'#c2ad7133',activeBorder:'#9b864c55',hoverIcon:'#39492c',hoverBackground:'#bdcba340'},
};
