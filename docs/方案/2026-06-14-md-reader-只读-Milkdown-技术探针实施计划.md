# 方案概述

## 1. 总体目标和范围

本计划的目标是为 `md-reader` 执行第一阶段“只读 `Milkdown` 技术探针”，验证阅读态收敛到只读 `Milkdown renderer` 的路线在当前代码基线上是否成立。重点不是正式替换 `read`，而是先确认单内核路线是否具备真实可实施性。

本计划覆盖：

- 当前 `read/edit/split` 正文链路与目录导航链路的探针边界
- 只读 `Milkdown` 原型的最小接入方式
- 首批支持节点与行为验证项
- 通过标准、失败标准、后备路线和阶段验收

本计划不覆盖：

- 直接替换正式 `read` 默认链路
- 重构 autosave 主状态机
- 把表格、callout、frontmatter、HTML block、复杂嵌入内容纳入第一轮探针

## 2. 各阶段任务概要

### 阶段一：确认当前代码边界

- 主要工作：核实 `read`、`edit`、`split`、heading id、前导 HTML comments 和相关测试锚点的现状。
- 预期成果：确定探针真正要验证的接口和耦合点，而不是抽象空谈。
- 执行顺序：先读当前链路，再设计探针。

### 阶段二：设计只读 renderer 原型

- 主要工作：定义最小只读 `Milkdown` 原型的接入位置、输入输出、样式边界和目录导航配合方式。
- 预期成果：形成不替换正式阅读态的并行原型方案。
- 执行顺序：当前边界确认后再做原型设计。

### 阶段三：验证与判定

- 主要工作：围绕首批 6 类节点和 3 类行为建立验证清单，明确通过标准和失败切换条件。
- 预期成果：给出“路线成立 / 不成立 / 需要下沉路线 C”的明确结论。
- 执行顺序：原型方案确定后执行验证。

## 3. 整体结构框架

本轮探针的结构应保持三层：

1. 现有正式链路  
   `read` 继续保持 `react-markdown`，`edit` 继续保持 `Milkdown/Crepe`，不动正式入口。

2. 并行探针链路  
   新增只读 `Milkdown` 原型，只作为技术探针入口，不默认接管用户正式阅读流。

3. 结论沉淀层  
   把探针验证结果写回实施计划、truth 和 ADR，用于决定下一轮是否进入 shared core 抽象与正式替换。

---

# 1. 当前探针边界

当前真实边界已经明确：

- `read` 正文链路在 `src/app/WorkspaceLayout.tsx`，使用 `react-markdown + remark-gfm`
- `edit` 正文链路在 `src/editor/visual-markdown-editor-impl.tsx`，使用 `Milkdown/Crepe`
- 目录导航数据来自 Markdown 文本提取，但 `read` 和 `edit` 的目标定位机制并不相同
- 前导 HTML comments 由 `src/editor/visual-markdown-editor.tsx` 先剥离后写回，说明当前可视链路存在内容边界

因此这轮探针要验证的，不是“Milkdown 能不能显示 Markdown”，而是下面四件事能不能同时成立：

1. 只读态能否稳定覆盖首批节点  
2. 只读态和编辑态能否共享 heading id 注入策略  
3. 目录点击与滚动高亮能否不依赖双链路特判  
4. 内容边界能否继续保持 Markdown 原文保真

---

# 2. 探针实施范围

第一轮只允许验证以下 6 类节点：

- 标题
- 段落
- 列表
- 引用
- 代码块
- 链接

第一轮只允许验证以下 3 类行为：

- heading id 注入
- 目录点击跳转
- 滚动高亮同步

第一轮明确排除：

- 表格
- callout
- frontmatter
- HTML block
- 复杂嵌入内容
- 保存链路改造
- 模式切换交互重构

---

# 3. 实施步骤

## 第一步：锁定代码锚点

先围绕以下文件确认探针实现面：

- `src/app/WorkspaceLayout.tsx`
- `src/editor/visual-markdown-editor.tsx`
- `src/editor/visual-markdown-editor-impl.tsx`
- `src/markdown/heading-outline.ts`
- `tests/app/workspace-layout.test.tsx`

这一步的目的是锁定：

- 当前 `read` 正文入口
- 当前 `edit` 正文入口
- 当前目录导航与滚动定位实现
- 当前前导 comments 保真策略
- 当前可复用测试锚点

## 第二步：新增并行只读 renderer 原型

实现一个不替换正式 `read` 的只读 `Milkdown` 原型，要求：

- 输入仍然是 Markdown 文本
- 内部使用与编辑态同源的 `Milkdown` 文档能力
- 默认关闭编辑 chrome
- 只在探针路径中挂载

这里的关键约束是：它必须是“并行原型”，不是直接切主链路。

## 第三步：统一 heading id 探针

当前 `read` 依赖 `data-heading-id`，`edit` 依赖 DOM 顺序与 heading 列表按 index 对齐。探针必须先验证是否能收敛成统一方案：

- 标题数据继续来自 Markdown 文本
- 只读态和编辑态都显式注入同一套 heading id
- 后续 `getHeadingTargets()` 可以去掉 read/edit 双分支特判

如果这一点做不到，单内核路线就不能直接进入正式替换阶段。

## 第四步：验证 comments 保真边界

探针必须明确：

- 前导 HTML comments 不进入可视正文区
- 前导 HTML comments 不在只读态或编辑态中丢失
- 后续如果正式切换，也不能破坏现有 Markdown 原文回写边界

## 第五步：验证目录与滚动行为

要在探针路径中验证：

- 点击右侧目录能跳到对应标题
- 文档滚动时 active heading 能稳定更新
- 读态与编辑态不再依赖完全不同的 heading target 查找方式

## 第六步：验证样式与包体边界

探针阶段不追求最终视觉收敛，但必须确认：

- 只读态不会残留明显编辑器 chrome
- 只读 renderer 与可编辑 renderer 可以拆成独立 chunk
- `read` 默认首屏不会被整套编辑器能力阻塞

---

# 4. 通过标准

探针只有在以下条件全部满足时才算通过：

1. 同一份测试文档在只读态下能稳定渲染标题、段落、列表、引用、代码块、链接。  
2. heading id 可以在只读态与编辑态中保持同一套注入规则。  
3. 目录点击跳转和滚动高亮同步在探针链路中可用。  
4. 前导 HTML comments 不丢失，也不会误进入可视正文区。  
5. 只读态可关闭明显编辑 chrome。  
6. 只读 renderer 与可编辑 renderer 具备独立 chunk 拆分条件。  

---

# 5. 失败标准与后备路线

任一命中以下情况，就判定本轮探针不通过，不能直接推进正式替换：

1. 只读态无法稳定注入统一 heading id。  
2. 目录点击与滚动高亮无法在同一 heading target 语义下工作。  
3. 为了让只读态可用，不得不继续在 `Crepe` 外围堆积大量针对性样式补丁。  
4. 前导 HTML comments 或其他原文边界被破坏。  
5. 只读态无法去掉明显编辑器 UI。  

探针不通过时的后备路线：

- 不直接切正式 `read`
- 不继续扩大探针范围
- 进入更底层的 `Milkdown / ProseMirror` 自定义装配评估

---

# 6. 验证方式

建议把验证拆成三类：

## 代码验证

- 读态原型与编辑态是否共用 heading id 注入策略
- comments 保留逻辑是否仍可工作
- 只读 renderer 是否独立于可编辑 impl

## 测试验证

- 为只读探针补最小单测
- 扩 workspace-layout 相关回归测试
- 覆盖目录点击与滚动高亮场景

## 浏览器验证

- 打开真实文档
- 验证标题、列表、引用、代码块、链接的基础渲染
- 验证目录点击和滚动高亮
- 验证没有明显编辑 chrome

---

# 7. 非目标

本轮探针明确不做：

1. 不替换正式 `read` 默认入口
2. 不同时做 shared core 全量抽象
3. 不混入 autosave、冲突恢复、模式切换重构
4. 不把复杂 Markdown 结构一起拉进首轮验证
5. 不以“视觉完全像 Notion”作为探针通过条件

---

# 8. 下一步执行方式

如果这份实施计划确认执行，下一轮应严格按这个顺序推进：

1. 补当前代码边界证据
2. 新增并行只读 `Milkdown` 原型
3. 打通 heading id 探针链路
4. 补测试
5. 做浏览器验证
6. 给出“通过 / 不通过 / 转路线 C”的结论

这一步结束后，才决定是否进入“抽 Shared Document Core + 正式切阅读态”的下一轮。
