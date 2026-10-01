# LayerCut v0.4.0

非破坏性多图层遮挡 · 分层导出的轻量 2D 编辑器。
A lightweight 2D editor for non-destructive layer occlusion & layered export.

## 下载 / Downloads

| 文件 | 说明 |
| --- | --- |
| `LayerCut_0.4.0_x64-setup.exe` | Windows 安装包（推荐 / recommended installer） |
| `LayerCut_0.4.0_x64_portable.exe` | 免安装绿色版 / portable, no install needed |

系统要求 / Requirements: Windows 10/11（自带 WebView2 / WebView2 preinstalled）。安装包约 1.7 MB。

## 功能亮点 / Highlights

- **遮挡引擎** `Layer[i] − Union(上方可见层)`：非破坏性、实时更新，一次自顶向下扫描产出全部图层结果（数学上精确，见 README 验证）
- **PNG / SVG 导入**，**SVG 矢量布尔导出**（Paper.js 路径布尔，曲线保留，`Layer[i] − Union(上方)` 逐层真实矢量输出）
- **双预览模式**：普通合成 / 遮挡预览（含爆炸视图滑杆，检查每层裁切后实际输出）
- **导出**：当前层 / 选中层 / 全部图层 / 合成图；PNG 1x–4x 与矢量 SVG；命名 `{序号}_{图层名}.ext`；优先「选择文件夹」保存，自动回退 ZIP
- **全屏工程控制台（起始页）**：新建工程、最近工程卡片墙（缩略图）、上次会话自动恢复
- **工程文件** `.layercut`（素材 base64 内嵌）+ 自动保存（IndexedDB 防抖）+ 导出配置记忆
- **编辑体验**：Undo/Redo、滚轮指向缩放、空格/中键平移、对齐吸附、多选、锁定/隐藏、可拖拽收放面板、统一输入控件、中英双语

## 已知限制 / Known limitations

- SVG 矢量布尔只作用于填充几何，描边保留但不会被遮挡裁切
- 含 text / filter / mask / clipPath / pattern 的 SVG 暂不可矢量导出（PNG 导出不受影响）

## 开发 / Development

```bash
npm install
npm run dev        # Web
npm run app:dev    # Tauri desktop
npm run app:build  # 打包 / package
```

详见 [README](https://github.com/NukumizuKazuhiko/layercut#readme)。
