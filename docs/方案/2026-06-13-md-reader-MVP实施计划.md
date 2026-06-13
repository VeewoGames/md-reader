# md-reader MVP实施计划

## 方案概述

### 1. 总体目标和范围

本计划用于把 `md-reader` 的完整方案拆解成可执行的 MVP 开发步骤。  
MVP 目标是在**纯浏览器 Web 应用**前提下，完成一个可用的 Markdown 工作区：

- 支持项目切换与显式 profile
- 支持左侧 Markdown 文件树
- 支持中间阅读/编辑/分栏工作区
- 支持右侧标题导航
- 支持 Markdown-first 阅读与编辑
- 支持最小 sidecar 能力：页面宽度、表格列宽、callout 类型

本计划不包含：

- 多彩字体持久化
- 数据库块、多列自由布局
- 协同编辑
- 桌面壳宿主适配

### 2. 各阶段任务概要

阶段一：工作区壳层与浏览器接入基础

- 主要工作：建立纯浏览器运行边界、项目注册表、profile 结构、三栏工作区外壳
- 预期成果：可以加载项目、切换文档、展示工作区框架
- 执行顺序：先做状态层和壳层，再接内容渲染

阶段二：阅读器 MVP

- 主要工作：接入 Markdown 渲染链、样式主题、文件树到正文的浏览闭环、阅读态标题导航
- 预期成果：Markdown 文档可在阅读态稳定查看，带基础导航体验
- 执行顺序：先渲染，再目录，再页面偏好

阶段三：编辑器 MVP

- 主要工作：接入 Milkdown、完成 Markdown round-trip、编辑态标题导航、模式切换
- 预期成果：可编辑并保存 Markdown，且与阅读态保持一致
- 执行顺序：先编辑器核心，再模式切换，再交互增强

阶段四：sidecar 最小实现

- 主要工作：定义 sidecar schema，打通文档增强状态读写
- 预期成果：支持页面宽度、表格列宽、callout 类型
- 执行顺序：先 schema，再读写，再 UI 接入

阶段五：质量与收尾

- 主要工作：fixture、回归验证、边界测试、文档补齐
- 预期成果：形成可持续迭代的 MVP 基线
- 执行顺序：功能完成后统一补测试和验证

### 3. 整体结构框架

MVP 落地时建议按这五个模块组织：

- `workspace`：项目注册表、profile、文件树、布局状态
- `renderer`：阅读态 Markdown 渲染
- `editor`：Milkdown 编辑器与编辑态交互
- `outline`：标题树抽取、目录导航、active 跟随
- `metadata`：sidecar schema、读写与容错

## 目标产物

MVP 完成后，用户应能完成以下主流程：

1. 在浏览器中打开 `md-reader`
2. 注册或恢复一个 Markdown 项目
3. 在左侧文件树选择 Markdown 文件
4. 在中间以阅读态查看内容
5. 在右侧通过标题导航快速跳转
6. 切换到编辑态或分栏模式修改 Markdown
7. 保存后重新打开，阅读与编辑状态保持一致
8. 对支持的增强状态，通过 sidecar 恢复页面宽度、表格列宽或 callout 类型

## 建议目录与文件落点

当前仓库仍为空，MVP 建议先采用轻量结构，再视增长抽成 `packages/`。

```text
src/
  app/
    AppShell.tsx
    TopBar.tsx
    WorkspaceLayout.tsx
  workspace/
    registry.ts
    project-config.ts
    profile-store.ts
    local-state.ts
    file-tree.ts
    file-tree-types.ts
  renderer/
    markdown-renderer.tsx
    markdown-pipeline.ts
    render-theme.css
  editor/
    editor-shell.tsx
    milkdown-setup.ts
    markdown-io.ts
    editor-mode.ts
  outline/
    outline-types.ts
    outline-from-markdown.ts
    outline-from-editor.ts
    outline-state.ts
    OutlineSidebar.tsx
  metadata/
    sidecar-schema.ts
    sidecar-store.ts
    sidecar-bindings.ts
  shared/
    types.ts
    paths.ts
    storage-keys.ts
  main.tsx
  styles.css
tests/
  workspace/
  renderer/
  editor/
  outline/
  metadata/
docs/
  方案/
```

## 关键决策落实

### 1. 纯浏览器前提

MVP 必须坚持：

- 不依赖 Electron / Tauri / 本地 Node 服务
- 项目注册表优先使用 `IndexedDB`
- 项目目录接入依赖浏览器文件系统授权

实施要求：

- 所有与项目根目录相关的状态都要能在没有桌面宿主 API 的前提下工作
- 文件树与文档读写都要围绕浏览器授权句柄设计
- 目录授权缺失或恢复失败时，必须进入受限模式并给出显式提示，而不是继续假装项目目录可读写
- 项目级配置无法落盘到项目目录时，只能保存在浏览器侧，并在 UI 上标明“未写回项目目录”

### 2. Profile 是显式概念

MVP 需要：

- 至少支持 `default` profile
- 顶栏提供 profile 切换入口
- 把标题导航折叠状态、文件树展开状态、侧栏宽度等落到 profile / local

### 3. 标题导航折叠状态不进 sidecar

MVP 必须坚持：

- sidecar 只负责文档增强状态
- 标题导航折叠状态属于个人导航偏好
- active heading、滚动位置属于 local 瞬时状态

## 分阶段实施计划

### 阶段一：工作区壳层与浏览器接入基础

**目标**

建立纯浏览器工作区基础，使项目切换、profile、左侧文件树和三栏布局先跑通。

**涉及文件**

- Create: `src/app/AppShell.tsx`
- Create: `src/app/TopBar.tsx`
- Create: `src/app/WorkspaceLayout.tsx`
- Create: `src/workspace/registry.ts`
- Create: `src/workspace/project-config.ts`
- Create: `src/workspace/profile-store.ts`
- Create: `src/workspace/local-state.ts`
- Create: `src/workspace/file-tree.ts`
- Create: `src/workspace/file-tree-types.ts`
- Create: `src/shared/storage-keys.ts`
- Modify: `src/main.tsx`
- Modify: `src/styles.css`

**任务**

1. 定义项目注册表、项目配置、profile、local state 的 TypeScript 类型。
2. 实现浏览器侧 registry 存储，优先 `IndexedDB`，并预留 JSON 导入导出接口。
3. 实现项目句柄接入与恢复流程，约束为“无授权时可识别失效状态”。
4. 实现 `AppShell` 三栏布局与基本样式骨架。
5. 实现 `TopBar` 的项目切换入口、profile 切换入口、模式切换占位。
6. 实现左侧文件树基础结构，支持目录展开/折叠与当前文档高亮。
7. 实现侧栏宽度与显隐状态的 profile/local 持久化。

**完成标准**

- 能在浏览器中注册一个项目
- 能恢复 `activeProject`
- 能浏览左侧文件树
- 能切换 profile
- 能渲染空的三栏工作区

**验证**

- 手动：首次授权项目目录后，刷新页面仍能恢复项目
- 手动：切换 profile 后，侧栏宽度与展开状态变化生效
- 自动：`tests/workspace/registry.test.ts`
- 自动：`tests/workspace/profile-store.test.ts`
- 自动：`tests/workspace/file-tree.test.ts`

### 阶段二：阅读器 MVP

**目标**

建立从文件树到阅读态正文的完整浏览闭环，并接入右侧标题导航。

**涉及文件**

- Create: `src/renderer/markdown-renderer.tsx`
- Create: `src/renderer/markdown-pipeline.ts`
- Create: `src/renderer/render-theme.css`
- Create: `src/outline/outline-types.ts`
- Create: `src/outline/outline-from-markdown.ts`
- Create: `src/outline/outline-state.ts`
- Create: `src/outline/OutlineSidebar.tsx`
- Modify: `src/app/WorkspaceLayout.tsx`
- Modify: `src/styles.css`

**任务**

1. 搭建 `remark-parse + remark-gfm + remark-rehype + rehype` 的阅读态渲染链。
2. 为标题、段落、列表、引用、代码块、表格、图片实现统一阅读组件或样式映射。
3. 实现右侧标题树数据结构和从 Markdown AST 抽取标题树的逻辑。
4. 实现 `OutlineSidebar`，支持目录树展示与基础高亮。
5. 打通左侧文件树到中间正文加载。
6. 实现阅读态 active heading 跟随与目录滚动保持可见。

**完成标准**

- 点击文件树可打开 Markdown 文档
- 阅读态样式稳定
- 右侧目录能自动根据 `h1-h6` 生成
- 滚动正文时目录高亮同步变化

**验证**

- 手动：长文档滚动时 active heading 正确更新
- 手动：无标题文档时右侧目录优雅降级
- 自动：`tests/renderer/markdown-pipeline.test.ts`
- 自动：`tests/outline/outline-from-markdown.test.ts`
- 自动：`tests/outline/outline-active.test.ts`

### 阶段三：编辑器 MVP

**目标**

接入 Milkdown，并完成编辑态、分栏模式和阅读编辑一致性。

**涉及文件**

- Create: `src/editor/editor-shell.tsx`
- Create: `src/editor/milkdown-setup.ts`
- Create: `src/editor/markdown-io.ts`
- Create: `src/editor/editor-mode.ts`
- Create: `src/outline/outline-from-editor.ts`
- Modify: `src/app/TopBar.tsx`
- Modify: `src/app/WorkspaceLayout.tsx`
- Modify: `src/outline/OutlineSidebar.tsx`

**任务**

1. 初始化 Milkdown 基础实例，打通 Markdown 输入输出。
2. 实现 `read / edit / split` 三种模式的状态切换。
3. 在编辑态从编辑器文档树提取标题树，复用现有 `OutlineSidebar`。
4. 实现点击目录跳转、程序滚动状态和 active 抑制逻辑。
5. 保证编辑保存后，阅读态重新渲染结果与预期一致。
6. 补充基础编辑交互：快捷键、slash menu 占位、块 hover 占位。

**完成标准**

- 可编辑 Markdown 并保存
- 分栏模式下阅读态与编辑态可共存
- 编辑态标题导航和阅读态交互一致
- round-trip 不引入明显结构漂移

**验证**

- 手动：切换 `read / edit / split` 时状态不丢
- 手动：点击右侧标题目录后编辑器平滑定位
- 自动：`tests/editor/markdown-io.test.ts`
- 自动：`tests/editor/mode-switch.test.ts`
- 自动：`tests/outline/outline-from-editor.test.ts`

### 阶段四：sidecar 最小实现

**目标**

在不污染 Markdown 正文的前提下，为 MVP 引入最小增强状态。

**涉及文件**

- Create: `src/metadata/sidecar-schema.ts`
- Create: `src/metadata/sidecar-store.ts`
- Create: `src/metadata/sidecar-bindings.ts`
- Modify: `src/renderer/markdown-renderer.tsx`
- Modify: `src/editor/editor-shell.tsx`
- Modify: `src/app/WorkspaceLayout.tsx`

**任务**

1. 定义 sidecar schema：`version / page / tables / blocks`。
2. 实现 sidecar 的读取、写入、缺失容错与损坏降级。
3. 支持页面宽度模式恢复。
4. 支持表格列宽恢复。
5. 支持 callout 类型恢复。
6. 明确标题导航折叠状态继续留在 profile / local，不进入 sidecar。

**完成标准**

- `.md` 独立存在时仍可正常工作
- `.md.meta.json` 存在时可恢复最小增强状态
- sidecar 损坏时仍可降级阅读

**验证**

- 手动：删除 sidecar 后正文仍可打开
- 手动：修改页面宽度和表格列宽后刷新仍能恢复
- 自动：`tests/metadata/sidecar-schema.test.ts`
- 自动：`tests/metadata/sidecar-store.test.ts`
- 自动：`tests/metadata/sidecar-fallback.test.ts`

### 阶段五：质量与收尾

**目标**

建立可持续迭代的 MVP 质量基线。

**涉及文件**

- Create: `tests/fixtures/*.md`
- Create: `tests/fixtures/*.md.meta.json`
- Modify: `README.md`
- Modify: `docs/方案/2026-06-13-md-reader-完整方案.md`

**任务**

1. 建立标准 Markdown fixture 文档集。
2. 覆盖空文档、深层标题、长文档、表格、blockquote、图片等场景。
3. 增加 round-trip 验证。
4. 补充 README 中的项目接入与浏览器授权说明。
5. 回填实现后的限制与后续方向。

**完成标准**

- 关键路径具备基础自动化验证
- 主要交互都能通过 fixture 回归
- 文档能说明如何启动、授权和测试 MVP

**验证**

- 自动：整套单元测试与集成测试通过
- 手动：新项目首次接入、重新打开、切换 profile、切换文档完整跑通

## 里程碑

### M1：工作区可打开

- 完成阶段一
- 用户可以在浏览器中接入项目并浏览文件树

### M2：可阅读

- 完成阶段二
- 用户可以稳定阅读 Markdown 并使用右侧标题导航

### M3：可编辑

- 完成阶段三
- 用户可以在编辑态修改 Markdown 并保持阅读态一致

### M4：可恢复增强状态

- 完成阶段四
- 页面宽度、表格列宽、callout 类型可通过 sidecar 恢复

### M5：可持续迭代

- 完成阶段五
- 具备基础测试、fixture 和文档支持

## 风险前置提醒

### 1. 纯浏览器文件系统授权

这是 MVP 首要外部约束。  
如果目标浏览器环境不支持稳定的目录授权能力，项目接入和持久化体验会明显受限。

应对策略：

- 首发正式支持 Chromium 系浏览器。
- 不支持稳定目录授权能力的浏览器只提供受限模式，不作为完整项目接入目标环境。
- 受限模式下允许恢复浏览器侧 registry / profile / local 状态，但不承诺项目目录读写与团队共享配置落盘。

### 2. Markdown round-trip 稳定性

编辑器接入后最容易出问题的是：

- 标题层级漂移
- 列表结构变形
- 表格序列化不稳定

阶段三必须把 round-trip 当主风险处理，而不是后补。

### 3. sidecar 绑定稳定性

表格列宽和 callout 类型对绑定稳定性敏感。  
第一版应限制支持范围，避免把弱绑定状态扩太多。

## 建议执行顺序

推荐严格按以下顺序推进：

1. 先做工作区壳层和项目接入
2. 再做阅读态和右侧标题导航
3. 再接编辑器
4. 最后补 sidecar 与统一验证

不要反过来先接编辑器，否则很容易在项目切换、文件接入、状态分层尚未稳定时返工。

## 验收清单

- [ ] 纯浏览器环境可注册并恢复项目
- [ ] 显式 profile 可切换
- [ ] 左侧文件树可浏览和高亮当前文档
- [ ] 中间工作区支持 `read / edit / split`
- [ ] 右侧标题导航支持生成、跳转、高亮、跟随
- [ ] Markdown round-trip 稳定
- [ ] sidecar 支持页面宽度、表格列宽、callout 类型
- [ ] 无 sidecar / 损坏 sidecar 可降级
- [ ] 基础测试与 fixture 建立完成
