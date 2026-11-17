# 本地性能测试件

运行软件本身不需要这些生成件。它们仅用于大文件和公式压力验证；约 503 MiB 的完整极限集默认被 Git 忽略。仓库仅保留 `math-fixtures/` 中三份纯合成公式验收文档及清单（合计约 1.8 MB），供现有自动化测试直接读取。

## 通用极限件

使用 Python 3.12 或更新版本及 Pillow，在仓库根目录执行：

```powershell
python -m pip install Pillow
python performance/scripts/generate.py generate
python performance/scripts/generate.py validate
```

生成文字、表格、代码加公式和图片件，并记录清单与 SHA。完整输出约 503 MiB，包含超出软件读取限额的文件；大于 2,000,000 字节的 Markdown 应正常拒绝，不能把文件存在当作成功渲染。脚本保护已存在且未知或改动过的文件，不自动覆盖用户文件。

## 独立公式件

```powershell
python performance/make_math_fixtures.py
```

输出 `performance/math-fixtures/`，包含基础公式、密集独立公式、异常和超限表达式；已有输出时拒绝覆盖。干净检出已经包含这四个验收文件，正常运行 `npm test` 无需再次生成。

## 口径

使用生产构建、独立用户目录和合成副本，分别记录编辑响应、文档哈希、应用完整进程树私有提交和工作集。不要把开发工具进程算入软件，也不要把含共享页工作集合计称为独占 RAM。具体代码和当前结果见 [0.1.2 性能记录](../docs/performance-0.1.2.md)。
