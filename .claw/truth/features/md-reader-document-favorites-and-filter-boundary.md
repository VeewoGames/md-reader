# md-reader 文档与目录收藏、收藏过滤边界

## 结论

`favoritePaths` 是当前项目 profile 下的持久化导航偏好，可记录当前 Markdown 文件树中可见的文档或目录路径。`showFavoritesOnly` 仍只属于 `App` 的会话态；刷新、切换 profile 或没有 activeProject 时都会回到 `false`。

收藏过滤固定发生在隐藏可见性派生之后、搜索过滤之前。收藏目录时，结果保留该目录完整的可见子树；隐藏后代不会因祖先被收藏而绕过隐藏规则，只有 `showHiddenItems = true` 时才进入该目录的收藏投影。收藏文档时，结果仍只保留该文档及其必要目录上下文。

目录与文档共用收藏星标和切换动作；目录右键菜单提供收藏/取消收藏入口。刷新项目树及加载工作区时，已不存在于当前文件树的收藏路径必须从 profile 中清除。本轮不处理目录改名、移动或删除后的路径改写。

## 长期规则

1. `favoritePaths` 记录当前项目 profile 下的文件树节点路径，节点可为文档或目录。
2. `showFavoritesOnly` 仅是 `App` 会话态，不写入 profile。
3. 收藏投影顺序固定为：隐藏可见性派生 -> 收藏过滤 -> 搜索过滤。
4. 已收藏目录保留完整可见子树；已收藏文档保留自身及必要目录上下文。
5. 收藏不能反转隐藏规则：目录的隐藏后代仅在 `showHiddenItems = true` 时进入收藏投影，并保留隐藏弱化语义。
6. 目录和文档共用收藏操作与星标；点击目录星标不得触发展开/折叠。
7. 刷新或加载工作区时，`favoritePaths` 中不存在于当前文件树的路径必须被去重并清除后持久化。
8. 目录改名、移动、删除后的收藏路径改写不属于本轮范围；该边界需要后续单独接入路径变更链路。

## 真实状态与渲染链路

1. `src/workspace/profile-store.ts` 将 `favoritePaths: string[]` 置于 `WorkspaceProfile.navigation`。
2. `src/App.tsx` 的 `pruneFavoritePaths()` 以当前构建的完整文件树为准，去重并移除不存在的收藏路径；`loadLocalServiceProject()` 与 `refreshProjectTree()` 都在建树后调用它，并将变化写回 profile。
3. `src/App.tsx` 先以 `createVisibleFileTree()` 派生隐藏可见树，再由 `filterFileTreeByFavorites()` 投影收藏结果，之后才应用搜索过滤。
4. `src/workspace/file-tree.ts` 的 `filterFileTreeByFavorites()` 遇到已收藏目录时直接保留该可见节点及其全部可见后代；非收藏目录只保留包含收藏后代的必要上下文。
5. `src/app/WorkspaceLayout.tsx` 在文档行、目录行和目录右键菜单中调用同一 `onToggleFavoriteDocument(path)` 回调；目录星标点击会阻止事件冒泡，因此不会改变目录展开态。

## 验证锚点

- `tests/workspace/file-tree.test.ts` 固化收藏目录保留完整可见子树，且不恢复隐藏后代。
- `tests/app/workspace-file-tree-hidden-items.test.tsx` 固化目录星标可收藏且不触发展开。

## 已知边界

- 目录收藏保存的是目录路径，不展开保存其所有后代路径。
- `showHiddenItems` 不是持久化偏好，刷新后不应保留为 `true`。
- 本轮不对目录改名、移动或删除执行收藏路径迁移；只有刷新/加载的不存在路径清理已纳入范围。

## 关键检索词

- `favoritePaths`
- `pruneFavoritePaths`
- `filterFileTreeByFavorites`
- `showFavoritesOnly`
- `showHiddenItems`
- `onToggleFavoriteDocument`
- `收藏文件夹`