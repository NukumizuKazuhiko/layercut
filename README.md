# LayerCut

> **面向多层实体视觉设计的非破坏性 2D 图层遮挡与分层导出工具。**

LayerCut 管理多图层的 Z 轴遮挡关系，并把视觉上的遮挡转换成真正可独立输出的图层结果：

```text
Layer[i]_visible = Layer[i] − Union(All Visible Layers Above i)
```

上层移动后，下层被遮挡区域实时恢复（非破坏性，源数据永不修改）。

## 功能（MVP 0.1 + 0.2）

- **导入**：PNG / SVG（工具栏按钮或拖入画布；SVG 第一阶段按浏览器栅格化参与遮挡，保留矢量原文供第二阶段 Vector Boolean 使用）
- **图层系统**：单选 / Shift、Ctrl 多选、拖拽或 ▲▼ 调整 Z 序、重命名（双击）、显示 / 隐藏、锁定 / 解锁、复制、删除、缩略图
- **变换**：画布拖拽 / 缩放 / 旋转（Konva Transformer）、属性面板数值输入 X / Y / W / H / 旋转 / 不透明度、重置变换
- **遮挡引擎**：Alpha 模式 `destination-out`，一次自顶向下扫描产出全部图层可见结果（预览与批量导出共享同一次计算）
- **双预览模式**：普通预览 / 遮挡预览（含爆炸视图滑杆，检查每层裁切后的实际输出）
- **导出**：当前层 / 选中层 / 全部图层 / 合成图；1x / 2x / 4x / 自定义倍率；命名 `{序号}_{图层名}.png`；透明背景；优先调用系统「选择文件夹」保存，不支持时自动回退 ZIP 下载
- **编辑体验**：Undo / Redo（一次拖拽 = 一步历史）、滚轮指向缩放、空格 / 中键平移、Fit（Ctrl+0）、对齐吸附（画布边缘 / 中心、其他图层边缘 / 中心）、快捷键
- **工程系统（MVP 0.3）**：**全屏工程控制台（起始页）**——启动软件默认进入，集中管理项目：新建工程（名称 + 画布预设 + 背景）、最近工程卡片墙（缩略图 / 打开 / 删除 / 从文件打开）、上次会话自动恢复横幅；编辑器中点击左上角 LayerCut 品牌返回控制台；保存 / 打开 `.layercut` 工程文件（JSON，全部素材以 base64 内嵌，跨设备可用）、自动保存（IndexedDB 防抖 1.5s）、导出配置记忆、标题栏与状态栏显示未保存状态（● / Ctrl+S 保存）
- **界面布局**：左右面板拖拽调宽（190–460px）、双击或箭头收起 / 展开，布局状态持久化；统一输入控件套件（`src/ui/controls`：文本 / 数字 / 滑杆 / 颜色拾取，焦点光晕、自绘滑杆填充、无原生 spinner），全部输入点共用一套视觉
- **矢量管线（v0.4–v0.6）**：导出对话框可选 **SVG 矢量** 格式——每层输出 `Layer[i] − Union(上方可见层)` 的真实矢量结果（Paper.js 路径布尔，曲线保留、viewBox 与画布一致、可按倍率缩放）。条件：所有可见图层均为 SVG 且不含暂不支持元素（text / image / filter / mask / clipPath / pattern / style / SMIL 会禁用该选项）；图层中存在 PNG 时不可用（§7.3）。已知限制：布尔只作用于填充几何，描边保留但不会被遮挡裁切。
- **中英双语**界面（右上角切换，记住偏好）

### 快捷键

| 按键 | 功能 |
| --- | --- |
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | 撤销 / 重做 |
| Delete / Backspace | 删除选中图层 |
| Ctrl+D / Ctrl+A | 复制 / 全选 |
| 方向键（+Shift） | 微调 1px（10px） |
| Ctrl+= / Ctrl+- / Ctrl+0 | 放大 / 缩小 / 适配窗口 |
| Space + 拖拽 / 中键拖拽 | 平移画布 |
| Esc | 取消选择 |

## 运行

```bash
npm install
npm run dev        # Web 版，http://localhost:5173
npm run build      # Web 版产物在 dist/

npm run app:dev    # 桌面版开发（Tauri，自动起 vite）
npm run app:build  # 桌面版构建
```

**桌面应用（Tauri 2）**：`npm run app:build` 产出

- 独立可执行文件 `src-tauri/target/release/layercut.exe`
- NSIS 安装包 `src-tauri/target/release/bundle/nsis/LayerCut_0.1.0_x64-setup.exe`（按用户级安装，中文/英文安装界面）

> 国内网络提示：Tauri 打包器首次会从 GitHub 下载 NSIS 工具包（`nsis-3.11.zip` 与 `nsis_tauri_utils-v0.5.3.dll`）。若 `github.com` 不可达，可经镜像（如 `https://ghfast.top/` 前缀）下载这两个文件，SHA1 分别为 `EF7FF767E5CBD9EDD22ADD3A32C9B8F4500BB10D`、`75197FEE3C6A814FE035788D1C34EAD39349B860`，将 zip 解压重命名为 `%LOCALAPPDATA%\tauri\NSIS`（makensis.exe 在其根目录），dll 放入 `NSIS\Plugins\x86-unicode\additional\` 后重新执行 `npm run app:build`。

桌面版使用系统 WebView2（Windows 11 自带），安装包体积小，无需打包 Chromium。窗口配置 `dragDropEnabled: false` 以保留 HTML5 原生拖放导入；导出的「选择文件夹」依赖 WebView2 的 File System Access API，不可用时自动回退 ZIP 下载。构建需要 Rust (MSVC) 工具链。

要求现代浏览器 / WebView2（Chrome / Edge 最佳）。

## 技术栈

Vite · React 18 · TypeScript · Konva.js（react-konva）· zustand · JSZip

## 目录结构

```text
src/
├─ editor/     画布编辑器（Stage、视口缩放平移、Transformer、吸附、快捷键）
├─ layers/     图层数据模型、store（含撤销历史）、图层面板
├─ assets/     源素材仓库（位图 / SVG 原文，独立于撤销历史）
├─ import/     PNG / SVG 导入
├─ renderer/   栅格化渲染
├─ occlusion/  遮挡引擎（destination-out + 累积 mask）、AlphaMask（预留 Binary 模式接口）
├─ export/     导出（命名、单层 / 批量 / 合成、文件夹选择 + ZIP 兜底）
├─ ui/         工具栏、属性面板、状态栏、对话框、图标
├─ i18n/       中英字典
└─ utils/
```

## 设计说明

- **非破坏性**：所有遮挡结果都是 Derived Data，源图层完整保留；移动上层后下层被挡区域实时重现。
- **性能**：第一版主线程 + Canvas 足够（文档 §15）；遮挡引擎接口已按 `computeOcclusion(layers, canvas, assets, scale)` 收敛，后续可平移到 Web Worker + OffscreenCanvas。
- **抗锯齿边缘**：Alpha 模式下，导出图层重新叠放时仅在形状抗锯齿边缘（半透明像素）与普通预览存在理论性差异，完全不透明区域像素级一致；实体制作场景可启用后续规划的 Binary 遮挡模式（接口已预留于 `occlusion/AlphaMask.ts`）。
- **SVG**：第一阶段栅格化参与遮挡（导出 PNG 时按倍率重新栅格化保持清晰）；SVG Vector Boolean 见原规划第二阶段。

## 测试素材

`scripts/make-fixtures.mjs` 生成 `fixtures/`（3 张带透明通道的 PNG + 1 个 SVG），可用于手工验收：导入 → 任意变换 → 遮挡预览 → 批量导出 → 将导出图层按原坐标叠放，与普通预览对比。
