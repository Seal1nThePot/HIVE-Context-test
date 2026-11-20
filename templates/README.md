# 模板外观

## 图标包

在「设置 → 外观 → 管理」打开当前模板文件夹，把自定义 `icons.json` 放在 `template.json` 和 `colors.json` 旁边。若要让几套模板共用覆盖，可把 `icons.json` 放在这些模板文件夹的上一级。图标可只写需要改变的语义键。

同一语义键依次取用户模板子目录、外部模板源的同名子目录、随应用发布的同名子目录，再查用户模板根、外部模板源根和随应用发布的模板根。相同路径只读取一次。没有有效定义时使用程序内置图标。应用启动和切换模板时读取图标，此后自动检查变化。删除覆盖文件会恢复该层之下的造型。格式损坏或某些定义无效时，外观设置显示提示，其余有效定义和配色照常使用。

可从本目录的 [`icons.json`](icons.json) 复制要修改的语义键。版本 1 的部分覆盖示例修改顶栏的历史记录图标。

```json
{
  "version": 1,
  "icons": {
    "history.open": {
      "viewBox": "0 0 24 24",
      "shapes": [
        { "tag": "circle", "attrs": { "cx": "12", "cy": "12", "r": "8" } },
        { "tag": "path", "attrs": { "d": "M12 7v5l3 2", "stroke": "var(--icon-accent,currentColor)" } }
      ]
    }
  }
}
```

定义使用已登记的语义键、有效的 `viewBox` 和 `path`、`circle`、`ellipse`、`rect`、`line`、`polyline` 或 `polygon`。图元属性值使用字符串。主色使用 `currentColor`，强调色和危险色使用 `var(--icon-accent,currentColor)` 和 `var(--icon-danger,currentColor)`，透明填充使用 `none`。每份文件最大 1 MiB。模板管理中的「保存到模板」只保存配色，图标可直接编辑文件。

## 推理轨道外观

模板 `colors.json` 可选添加 `reasoningEffects`，按 `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max` 声明各档效果；未声明的字段使用当前主题强调色和内置值。档位是否可选仍由模型实际能力与模型设置决定。

```json
"reasoningEffects": {
  "high": { "color": "#c3b57d", "glow": 0.7, "particles": 4, "duration": 350, "easing": "cubic-bezier(.22,1,.36,1)" },
  "max": { "color": "#e0c66f", "glow": 1, "particles": 8, "duration": 450, "easing": "cubic-bezier(.22,1,.36,1)" }
}
```

`color` 为六位十六进制颜色；`glow` 范围 0–1；`particles` 0–8；`duration` 0–2000 毫秒；`easing` 使用 CSS cubic-bezier。无效值回退，超出范围的数值会被限制。系统要求减少动态效果时关闭粒子、光晕动画和过渡。选择“默认”显示当前最高可见档的效果，但请求仍使用服务默认参数。

轨道尾迹使用各档现有颜色、`glow` 和 `particles` 数量，随可见档位增加自动加快；默认显示最高档效果。尾迹最多 8 粒，离开视野、关闭弹窗或窗口隐藏时停止；系统设置减少动态效果时隐藏尾迹并关闭动画。

模板可按基础颜色在 `reasoningTrackProfiles` 中选填三色，例如 `"white": {"left":"#123456","middle":"#789abc","right":"#def012"}`。左、中、右依次固定在完整轨道 0%、50%、100%；个人外观设置按模板及基础颜色分别保存，不会自动写回模板。未配置时保留原模板的轨道与档位效果；恢复轨道颜色会回到当前模板基准。
