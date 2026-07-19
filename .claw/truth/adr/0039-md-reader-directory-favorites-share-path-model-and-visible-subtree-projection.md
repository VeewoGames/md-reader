# ADR 0039: 目录收藏复用 `favoritePaths` 路径模型，并按可见子树投影

- 状态：accepted
- 日期：2026-07-18

## 背景

ADR 0029 将收藏限定为文档，并明确目录收藏需要另起决策。本轮已完成的计划把收藏对象扩展到当前 Markdown 文件树中的可见目录，同时保持既有项目/profile 持久化与会话态筛选边界。

目录收藏不能仅按目录自身路径过滤：在“只看收藏”视图中，用户需要继续浏览该目录下的完整可见内容；单个文件收藏则仍需要保留其祖先目录作为树形上下文。该投影还必须与隐藏规则、搜索和既有手工排序分层组合。

## 决策

1. `WorkspaceProfile.navigation.favoritePaths` 统一保存文档路径与当前 Markdown 文件树可见目录路径；不新增目录收藏字段或第二套收藏模型。
2. 收藏投影固定发生在隐藏可见性派生之后、搜索过滤之前，并消费已完成手工排序的文件树投影。
3. 已收藏目录在“只看收藏”视图中保留其完整可见子树；隐藏规则仍优先，隐藏子节点不会因目录被收藏而自动出现。
4. 已收藏文件保留到根的祖先目录链，仅作为树形上下文，不将未收藏的同级文件带入结果。
5. 工作区水合与文件树刷新后，应用必须从 `favoritePaths` 清理已不在当前文件树中的路径；目录改名、移动、删除不在本轮路径改写范围内。
6. 目录行星标与右键菜单复用既有路径收藏回调；触发收藏不得同时展开或折叠目录。

## 备选方案

- 为目录收藏新增独立字段：不采用，因为收藏对象的持久化、恢复和动作入口仍是同一条路径语义，拆分字段会增加同步与修剪成本。
- 只展示被收藏目录节点本身：不采用，因为目录收藏的玩法目标是快速进入该目录内容，而不是只保留一个无法浏览的入口。
- 在文件树刷新时改写目录改名或移动后的收藏路径：不采用，因为本轮只承诺清理失效路径；完整路径迁移需要另行定义文件系统变更事件与歧义处理规则。

## 后果

- 文档与目录收藏共享稳定的项目/profile 持久化、恢复和失效修剪链路。
- “只看收藏”成为树投影规则，而非平铺路径列表，目录与文件收藏能够保持各自必要的可浏览上下文。
- 隐藏、手工排序、收藏和搜索具有固定叠加顺序，后续新增筛选条件不得绕过前序可见性与结构投影。
- 若要支持目录路径迁移、收藏分组或不同类型收藏的独立权限/元数据，必须另起 ADR。

## 相关代码

- [`src/workspace/file-tree.ts`](../../src/workspace/file-tree.ts)
- [`src/App.tsx`](../../src/App.tsx)
- [`src/app/WorkspaceLayout.tsx`](../../src/app/WorkspaceLayout.tsx)
- [`src/workspace/profile-store.ts`](../../src/workspace/profile-store.ts)
- [`tests/workspace/file-tree.test.ts`](../../tests/workspace/file-tree.test.ts)
- [`tests/app/app-session-restore.test.tsx`](../../tests/app/app-session-restore.test.tsx)
- [`tests/app/workspace-layout.test.tsx`](../../tests/app/workspace-layout.test.tsx)
- 计划来源：`.claw/tasks/增加收藏文件夹功能/plan.json`

## 搜索词

- `favoritePaths`
- `directory favorites`
- `showFavoritesOnly`
- `visible subtree`
- `favorite tree projection`
- `prune missing favorite paths`
