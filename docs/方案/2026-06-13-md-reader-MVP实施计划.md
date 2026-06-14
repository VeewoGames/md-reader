# md-reader MVP实施计划

## 方案概述

### 1. 总体目标和范围

本计划用于把 `md-reader` 的完整方案拆解成可执行的 MVP 开发步骤。  
MVP 目标是在**本地服务优先 + Web 前端**前提下，先完成一个可用的 Markdown 只读工作区：

- 支持项目切换与显式 profile
- 支持左侧 Markdown 文件树
- 支持中间阅读工作区
- 支持右侧标题导航
- 支持 Markdown-first 阅读
- 支持搜索与状态恢复

本计划不包含：

- Markdown 写回
- sidecar 写回
- 编辑器接入
- 多彩字体持久化
- 数据库块、多列自由布局
- 协同编辑
- 桌面壳宿主适配

### 2. 各阶段任务概要

阶段一：工作区壳层与本地服务接入基础

- 主要工作：建立本地服务运行边界、项目注册表、profile 结构、三栏工作区外壳，并对齐 `data-editor` 的 `open/stop/health` 运行器约定
- 预期成果：可以加载项目、切换文档、展示工作区框架
- 执行顺序：先做状态层和壳层，再接内容渲染

阶段二：阅读器 MVP

- 主要工作：接入 Markdown 渲染链、样式主题、文件树到正文的浏览闭环、阅读态标题导航和搜索入口
- 预期成果：Markdown 文档可在阅读态稳定查看，带基础导航体验
- 执行顺序：先渲染，再目录，再恢复和搜索

阶段三：质量与收尾

- 主要工作：fixture、回归验证、边界测试、文档补齐
- 预期成果：形成可持续迭代的 MVP 基线
- 执行顺序：功能完成后统一补测试和验证

### 3. 整体结构框架

MVP 落地时建议按这五个模块组织：

- `workspace`：项目注册表、profile、文件树、布局状态
- `renderer`：阅读态 Markdown 渲染
- `outline`：标题树抽取、目录导航、active 跟随
- `search`：搜索索引调用与结果模型
- `runner`：本地服务运行器与健康检查

## 目标产物

MVP 完成后，用户应能完成以下主流程：

1. 打开 `md-reader`
2. 通过本地服务注册或恢复一个 Markdown 项目
3. 在左侧文件树选择 Markdown 文件
4. 在中间以阅读态查看内容
5. 在右侧通过标题导航快速跳转
6. 通过搜索入口查找文档
7. 重新打开后恢复项目、文档位置和阅读进度

## 关键决策落实

### 1. 本地服务前提

MVP 必须坚持：

- 依赖本机 Node `22.13+`
- 前端通过本地服务访问项目
- 运行器约定优先复用 `data-editor` 的 `open/stop/health`

实施要求：

- 所有与项目根目录相关的状态都要能在没有桌面壳的前提下工作
- 文件树、文档读取、搜索都围绕本地服务 API 设计
- 服务不可达时，必须进入受限模式并给出显式提示，而不是继续假装项目目录可读写
- 本阶段不做任何写回，因此不承诺项目级配置落盘

### 2. Profile 是显式概念

MVP 需要：

- 至少支持 `default` profile
- 顶栏提供 profile 切换入口
- 把标题导航折叠状态、文件树展开状态、侧栏宽度等落到 profile / local

### 3. 标题导航折叠状态不进 sidecar

MVP 必须坚持：

- sidecar 只负责后续文档增强状态
- 标题导航折叠状态属于个人导航偏好
- active heading、滚动位置属于 local 瞬时状态

## 分阶段实施计划

### 阶段一：工作区壳层与本地服务接入基础

**目标**

建立本地服务优先工作区基础，使项目切换、profile、左侧文件树和三栏布局先跑通。

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
- Create: `src/workspace/workspace-provider.ts`
- Create: `src/workspace/local-bridge-access.ts`
- Create: `src/shared/storage-keys.ts`
- Create: `server/bridge-server.mjs`
- Create: `scripts/open.ps1`
- Create: `scripts/stop.ps1`
- Create: `scripts/health.ps1`
- Modify: `src/main.tsx`
- Modify: `src/styles.css`

**任务**

1. 定义项目注册表、项目配置、profile、local state 的 TypeScript 类型。
2. 实现本机 registry 存储，并预留 JSON 导入导出接口。
3. 实现项目接入与恢复流程，约束为“服务不可达时可识别失效状态”。
4. 实现 `AppShell` 三栏布局与基本样式骨架。
5. 实现 `TopBar` 的项目切换入口、profile 切换入口、模式切换占位。
6. 实现左侧文件树基础结构，支持目录展开/折叠与当前文档高亮。
7. 实现侧栏宽度与显隐状态的 profile/local 持久化。
8. 对齐 `open/stop/health` 运行器约定，保证 Codex 和 Chrome 走同一入口。

**完成标准**

- 能通过本地服务注册一个项目
- 能恢复 `activeProject`
- 能浏览左侧文件树
- 能切换 profile
- 能渲染空的三栏工作区

**验证**

- 手动：首次接入项目目录后，刷新页面仍能恢复项目
- 手动：切换 profile 后，侧栏宽度与展开状态变化生效
- 自动：`tests/workspace/registry.test.ts`
- 自动：`tests/workspace/profile-store.test.ts`
- 自动：`tests/workspace/file-tree.test.ts`

### 阶段二：阅读器 MVP

**目标**

建立从文件树到阅读态正文的完整浏览闭环，并接入右侧标题导航、搜索和状态恢复。

**涉及文件**

- Create: `src/renderer/markdown-renderer.tsx`
- Create: `src/renderer/markdown-pipeline.ts`
- Create: `src/renderer/render-theme.css`
- Create: `src/outline/outline-types.ts`
- Create: `src/outline/outline-from-markdown.ts`
- Create: `src/outline/outline-state.ts`
- Create: `src/outline/OutlineSidebar.tsx`
- Create: `src/search/search-api.ts`
- Create: `src/search/search-state.ts`
- Modify: `src/app/WorkspaceLayout.tsx`
- Modify: `src/styles.css`

**任务**

1. 搭建 `remark-parse + remark-gfm + remark-rehype + rehype` 的阅读态渲染链。
2. 为标题、段落、列表、引用、代码块、表格、图片实现统一阅读组件或样式映射。
3. 实现右侧标题树数据结构和从 Markdown AST 抽取标题树的逻辑。
4. 实现 `OutlineSidebar`，支持目录树展示与基础高亮。
5. 打通左侧文件树到中间正文加载。
6. 实现阅读态 active heading 跟随与目录滚动保持可见。
7. 实现文档搜索入口、搜索结果列表和结果跳转。
8. 实现当前文档、滚动位置与阅读进度恢复。

**完成标准**

- 点击文件树可打开 Markdown 文档
- 阅读态样式稳定
- 右侧目录能自动根据 `h1-h6` 生成
- 滚动正文时目录高亮同步变化
- 搜索可返回并打开目标文档
- 刷新后可恢复当前文档与阅读进度

**验证**

- 手动：长文档滚动时 active heading 正确更新
- 手动：无标题文档时右侧目录优雅降级
- 自动：`tests/renderer/markdown-pipeline.test.ts`
- 自动：`tests/outline/outline-from-markdown.test.ts`
- 自动：`tests/outline/outline-active.test.ts`

### 阶段三：质量与收尾

**目标**

建立可持续迭代的 MVP 质量基线。

**涉及文件**

- Create: `tests/fixtures/*.md`
- Modify: `README.md`
- Modify: `docs/方案/2026-06-13-md-reader-完整方案.md`

**任务**

1. 建立标准 Markdown fixture 文档集。
2. 覆盖空文档、深层标题、长文档、表格、blockquote、图片等场景。
3. 补充 README 中的项目接入与本地服务启动说明。
4. 回填实现后的限制与后续方向。

**完成标准**

- 关键路径具备基础自动化验证
- 主要交互都能通过 fixture 回归
- 文档能说明如何启动、接入和测试 MVP

## 里程碑

### M1：工作区可打开

- 完成阶段一
- 用户可以接入项目并浏览文件树

### M2：可阅读

- 完成阶段二
- 用户可以稳定阅读 Markdown、搜索文档并使用右侧标题导航

### M3：可持续迭代

- 完成阶段三
- 具备基础测试、fixture 和文档支持

## 风险前置提醒

### 1. 本地服务可用性

这是 MVP 首要外部约束。  
如果目标环境无法稳定启动或连接本地服务，项目接入和状态恢复体验会明显受限。

应对策略：

- 首发正式支持 Chromium 系浏览器 + Node `22.13+`。
- 无法连接本地服务的环境只提供受限模式，不作为完整项目接入目标环境。
- 受限模式下允许恢复前端本地状态，但不承诺项目目录读取与搜索。

### 2. 搜索索引实现复杂度

搜索功能首阶段需要，但不应该把搜索引擎细节扩散到整个系统。

阶段二必须把索引实现封装在独立模块内，避免后续替换代价过高。

## 建议执行顺序

推荐严格按以下顺序推进：

1. 先做工作区壳层和项目接入
2. 再做阅读态、右侧标题导航和搜索
3. 最后补统一验证

## 验收清单

- [ ] 本地服务环境可注册并恢复项目
- [ ] 显式 profile 可切换
- [ ] 左侧文件树可浏览和高亮当前文档
- [ ] 中间工作区支持稳定阅读
- [ ] 右侧标题导航支持生成、跳转、高亮、跟随
- [ ] 搜索可返回并打开目标文档
- [ ] 当前文档与阅读进度可恢复
- [ ] 基础测试与 fixture 建立完成
