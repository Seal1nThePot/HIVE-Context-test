# settings — 设置页与偏好存储

设置页是「纯 UI + 本地偏好」：所有偏好落 `localStorage`，只有模型配置走后端 `model.json`。

## 文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `SettingsPage.tsx` | 138 | 设置页容器：左侧分节导航（写作空间 / 外观 / 功能 / 写作 / 模型 / 快捷键，带搜索过滤）+ 右侧内容区、保存与关闭；`SettingsSection` 联合类型定在此处 |
| `modelConfig.ts` | 24 | 模型配置模型：`Config` / `ModelService` / `ModelSelection`、`normalizeConfig`、`modelChoice` / `parseModelChoice`、`activeModelLabel`、`initialConfig` |
| `AppearanceSettings.tsx` | 39 | 外观：缩放、字号、行距等 |
| `useAppearance.ts` | 34 | 外观偏好读写（`defaultAppearance`） |
| `AnnotationSettings.tsx` | 15 | 标注气泡位置偏好 |
| `useAnnotationPreferences.ts` | 17 | 标注偏好读写 |
| `usePanelIconDragPreferences.ts` | 14 | 图标条长按/拖拽偏好（`PanelIconHoldStyle`） |
| `SettingRow.tsx` | 4 | 设置行容器（标签 + 控件） |
| `settings.css` | 128 | 样式 |

## 想改 X → 改哪里

| 想改 | 改这里 |
| --- | --- |
| 加一个设置项 | `SettingsPage.tsx` 加一节 + 一个 `use*Preferences`（localStorage）+ `SettingRow` |
| 模型服务增删 | `SettingsPage.tsx` 调 `/api/model-services`；数据结构在 `modelConfig.ts` |
| 偏好默认值 | 各 `use*` 里的 `default*` 常量 |

## 不变量 / 坑

- 模型配置是**后端状态**（带 revision），其余偏好是**本地状态**，不要混。
- 偏好的 localStorage 键是稳定契约（`hive.*`），改名会让用户设置丢失。
- `normalizeConfig` 必须能接受旧结构（迁移逻辑在 `server/model-config.mjs`）。

## 验证

- `annotationPreferences.test.ts`、`panelIconDragPreferences.test.ts`；模型配置在 `server/model-config.test.mjs`