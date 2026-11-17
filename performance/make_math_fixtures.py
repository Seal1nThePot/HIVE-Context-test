"""Deterministic, local-only math acceptance files, separate from frozen baseline fixtures."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent / 'math-fixtures'
root.mkdir(exist_ok=True)
targets = [root / name for name in ['01-公式功能验收.md', '02-密集独立公式.md', '03-异常和超限公式.md']]
if any(p.exists() for p in targets):
    raise SystemExit('Refusing to overwrite existing math acceptance files')

smoke = r'''# 数学公式功能验收

行内质能方程：$E=mc^2$。行内分式：$\frac{a+b}{c}$。

$$
\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}
$$

$$\int_0^1 x^2\,dx = \frac{1}{3}$$

$$
\begin{pmatrix}a & b \\ c & d\end{pmatrix}
$$

## 源码排除与普通金额

`$E=mc^2$` 是行内代码；\$E=mc^2\$ 是转义文本。

价格从 $5 到 $10；这些金额不应拼成一个公式。

```latex
$$\frac{1}{2}$$
$E=mc^2$
```

| 普通表格 | 公式源文 |
| --- | --- |
| 保持原有单元格编辑 | $E=mc^2$ |

## 编辑检查

在源码模式把公式中的 n 改成 m，再撤销；实时预览应随文档更新，Markdown 原文不得被渲染结果替换。
'''
targets[0].write_text(smoke, encoding='utf-8')

units = 0
with targets[1].open('wb') as stream:
    stream.write('# 密集独立数学公式\n\n每组数值各异，用于区分重复公式缓存和持续滚动负载。\n\n'.encode())
    while stream.tell() < 1_800_000:
        units += 1
        text = (f'第 {units:06d} 组，行内 $x_{{{units}}}^2 + {units} = y_{{{units}}}$。\n\n'
                '$$\n' + rf'\sum_{{k=1}}^{{{units}}} k = \frac{{{units}({units}+1)}}{{2}}' + '\n$$\n\n')
        stream.write(text.encode())

bad = ('# 异常和资源预算验收\n\n未知命令应保留可读原文或明确报错：$\\NomoInvalidCommand{x}$。\n\n'
       '递归宏不得卡住界面：$\\def\\a{\\a}\\a$。\n\n'
       '超长单公式应受预算约束：\n\n$$\n' + 'x+' * 3000 + '1\n$$\n\n'
       '未闭合内容应保留：$x + y\n\n末尾仍然可以编辑。\n')
targets[2].write_text(bad, encoding='utf-8')

entries = []
for p in targets:
    raw = p.read_bytes()
    if len(raw) > 2_000_000:
        raise RuntimeError('Math fixture exceeds the existing application read limit')
    entries.append({'path': p.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                    'baselineSizeCompatible': True})
report = {'purpose': 'Math feature acceptance and viewport stress; not a performance result',
          'denseGroups': units, 'denseInlineFormulas': units, 'denseDisplayFormulas': units,
          'externalImageRequests': 0, 'files': entries}
(root / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'files': len(entries), 'denseGroups': units, 'bytes': sum(e['bytes'] for e in entries)}))
