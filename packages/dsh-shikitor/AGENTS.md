# dsh-shikitor Agent Guide

这个包是 Shikitor 面向 DeepSeek Harness 的外部 Bundle。DSH 接入清单和 Host 入口位于 `index.js` 与 `cordis.patch.yml`；浏览器侧的 sender、文件编辑器、设置页、消息渲染和注册服务位于 `src/client/`。面向使用者的能力和插件接入方式维护在 `README.md` 与 `README.zh-CN.md`，开发、发布和截图流程只写在本文件。

## 运行时边界

- 这个包位于 Shikitor 仓库中，作为外部 Bundle 接入 DSH，不修改 DeepSeek Harness 源码。
- DSH 继续拥有 composer、textarea、草稿状态、键盘策略、sender 控件、命令和引用执行管线。Shikitor 负责编辑表面及补全渲染。
- Sender Contribution 通过 `conversation.input.right` 获取 textarea 挂载生命周期。生产 Bundle 只保留隐藏 DOM 锚点；`pnpm --filter dsh-shikitor build:dev` 才显示原生/Shikitor 模式切换入口。
- DSH 内置触发菜单继续作为 Adapter 背后的状态机，但启用 Shikitor sender 时隐藏其 UI。选择补全项后必须回到 DSH 原始 pick transaction，不能在 Shikitor 侧复制命令认领或执行语义。
- 文件目录由 Bundle Host 端根据 session cwd 扫描；需要排除生成的依赖树并限制目录规模。文件引用的草稿源保留带绝对路径的 Markdown 链接，编辑表面只显示标题。
- Sender 文件补全使用 Host 的有界、广度优先快照，按相对路径深度从浅到深排序，并通过 Shikitor `CompletionList.loadMore` 分页追加。Sender 设置中的包含/排除目录 glob 只过滤消息补全和引用词典，不改变文件编辑器目录树。
- 文件保存通过 `shikitorCatalog/write` 回到 Host：只允许覆盖 session cwd 内已经存在的 UTF-8 普通文件，保留 2 MiB 上限并使用 DSH atomic-write 原子替换。同一会话的浏览器保存请求必须串行；旧请求完成时，只有本次文档快照仍然是当前快照才能清除 dirty。文件编辑器默认在停止输入后自动保存；用户可以在编辑器设置中关闭，关闭后保留工具栏与 `Cmd/Ctrl+S` 手动保存入口。
- Skill 发现通过 DSH `ctx.skills` Provider 注册，使 `$`、`/`、模型目录和 Skill 正文加载共享条目和调用策略。
- 默认文件名映射、Glyph、字体和颜色来自固定版本的 Atom File Icons 浏览器 Adapter。工作区图片读取必须保留路径穿越、文件类型和 1 MiB 大小检查。
- Shikitor 设置页复用 DSH 的标签页和 Popup Menu 交互模式；不要为插件设置另造原生 `<select>` 或独立视觉体系。
- DSH 的浏览器插件加载器只接受注册到 `window.__ModuleLoader__` 的单文件入口。`tsdown.config.ts` 必须把 Shiki 的语言和主题表收敛到本包的最小 facade，并内联动态 import；`pnpm build` 会通过 `scripts/verify-client-bundle.mjs` 拒绝任何相对 `require()` 或额外 JavaScript 分片。

## 市场截图

`scripts/capture-screenshots.mjs` 负责生成中英文、亮暗色截图矩阵。先启动已安装当前 Bundle 的 DSH Web，再从 Shikitor 仓库根目录运行：

```bash
pnpm install
pnpm --filter dsh-shikitor screenshots:install
pnpm --filter dsh-shikitor screenshots -- \
  --base-url http://127.0.0.1:3080 \
  --session-title "Shikitor demo"
```

默认以 1440 × 960 分辨率分别截取 `#` 会话、`@` 文件与 Provider、`$` Skill、`/` 命令四类 sender 补全菜单，以及文件编辑器和「编辑器」设置页，并将 `zh,en` × `light,dark` 的 24 张 PNG 写入 `assets/screenshots/`。脚本通过 DSH 的真实语言和主题控件切换状态，退出前恢复原始偏好。

截图必须使用经过脱敏的演示会话，因为成品可能包含会话标题、工作区路径、文件与对话内容。限制矩阵或选择编辑器文件时使用：

```bash
pnpm --filter dsh-shikitor screenshots -- \
  --locales zh,en \
  --themes light,dark \
  --surfaces completions,editor,settings \
  --file README.md
```
