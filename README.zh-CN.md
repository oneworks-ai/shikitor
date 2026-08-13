<p align="center">
  <img src="./playground/public/favicon.svg" width='256' alt='Shikitor Logo'>
</p>

<h1 align="center">四季多(Shikitor)</h1>

## 介绍

轻量化、可扩展的 web 代码编辑器。

| [en-US](./README.md) | 中文 |

## 如何使用

### CDN

对于很多想体验一下工具的用户来说，CDN 是一个很好的选择，你可以直接在你的项目中引入该工具，然后开始使用。
你可能有不同的使用习惯，在这里我向你提供了几种简单的方法来引入该工具。下面是一些简单的例子的链接，你可以点击到对应的文件进行查看。

- [esm](./examples/static/esm.html)

  esm 是一个很好的选择，它可以让你在项目中使用 import 语法来引入该工具。这也是 shiki 的默认导出方式，相对使用起来会方便许多。
- [esm + plugins](./examples/static/esm+plugins.html)

  功能的可插拔一直是我代码设计理念中很重要的一个部分，这里你可以看到如何引入功能扩展插件。
- [umd](./examples/static/umd.html)

  如果你不想使用 esm，那么 umd 可能是一个不错的选择。它可以让你在项目中使用 script 标签来引入该工具。
  （但是实际上来说，对于 shiki 可能也不是一个很好的例子，我需要一些时间让他体现的更加去体现 umd 的优势）

### Node.js

对于一些想要在编译过程中使用该工具的用户来说，通过包管理安装依赖，然后在代码中引入该工具可能是一个更好的选择。

- 安装依赖

```bash
npm install @shikitor/core
# 如果你使用的是 yarn
yarn add @shikitor/core
```

- 在代码中引入

```javascript
import '@shikitor/core/index.css'

import { create } from '@shikitor/core'

const shikitor = create(document.getElementById('editor'), {
  value: 'console.log("Hello, Shikitor!")',
  language: 'javascript',
  theme: 'github-light'
})
```

## 功能

### 键盘快捷键

#### `Tab`/`Shift + Tab`: 锁进控制

通过 `Tab` 可以缩进当前行或选中的行，通过 `Shift + Tab` 可以取消缩进。

- 插件: `@shikitor/core/plugins/code-styler`
- 演示
  ![tab](./.readme-res/Export-1711914834555.gif)

#### 快速跳转

- 插件: `@shikitor/core/plugins/code-styler`
- `Cmd/Ctrl + ⬅️/➡️`: 跳转到行首/行尾
  - 演示
    ![jump](./.readme-res/Export-1711915118741.gif)

### 光标交互

#### 高亮光标所在行

- 插件: 已集成
- 演示
  ![highlight](./.readme-res/Export-1711915476496.gif)

#### 高亮闭合括号

- 插件: `@shikitor/core/plugins/bracket-matcher`
- 演示
  ![bracket](./.readme-res/Export-1711915650863.gif)

## 插件系统

Shikitor 使用 [Cordis](https://github.com/cordiverse/cordis) 作为插件运行时。每个编辑器拥有独立的 Cordis Context，并通过 `shikitor.context` 暴露。插件通过 `shikitor` 服务获取编辑器实例；插件 Fiber 销毁时，监听器和其他副作用会自动回收。

```ts
import { create, definePlugin } from '@shikitor/core'

const wordCounter = definePlugin({
  name: 'word-counter',
  inject: ['shikitor'],
  apply(ctx, config: { report(count: number): void }) {
    ctx.on('shikitor/change', value => {
      config.report(value.trim().split(/\s+/).filter(Boolean).length)
    })
  }
})

const shikitor = await create(document.querySelector('#app')!, {
  plugins: [[wordCounter, { report: console.log }]]
})

// 也可以直接使用 Cordis API 动态安装插件或服务。
await shikitor.context.plugin(wordCounter, { report: console.log })
```

内置生命周期事件统一使用 `shikitor/*` 命名空间，包括 `change`、`cursor-change`、`selection-change`、`focus`、`blur`、键盘事件和 `dispose`。功能插件通过依赖注入提供 `shikitorPopup`、`shikitorCompletions`、`shikitorSelectionTools` 等服务。

## License

MIT
