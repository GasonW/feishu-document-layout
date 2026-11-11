# Feishu Document Layout

为 Obsidian 提供接近飞书文档的阅读排版：清楚的标题层级、嵌套列表、任务状态、引用、高亮块，以及可调整列宽的表格。实时预览与阅读视图均支持。

An independent Obsidian plugin with document typography inspired by Feishu/Lark: nested lists, heading numbers, task styling, blockquotes and resizable tables.

这是独立开发的社区插件，与飞书、Lark 或 Obsidian 官方无关联。采用 [MIT 许可证](LICENSE)。

## 使用

1. 一级、二级、三级标题使用标准 `#`、`##`、`###`。默认在整个库显示 `1.`、`1.1`、`1.1.1`，并同步到大纲。新增、删除标题后自动重排。
2. 嵌套有序列表使用标准数字语法，显示为数字、字母、罗马数字。无序列表显示实心圆、空心圆、方形，每级缩进 24px。
3. 引用行前加 `>`，内部可以继续使用列表和逐级缩进。
4. 表格默认填满正文区域，最大 820px。拖动表头列分隔线调整相邻列比例；双击恢复默认。
5. 已完成的任务显示灰色文字、删除线及蓝色勾选。

```markdown
# 章节
## 小节
### 主题

> 引用说明
>
> - 一级项目
>   - 二级项目
>     - 三级项目
>
> 1. 第一步
>    1. 子步骤
>       1. 具体操作
```

标题编号由显示层生成，Markdown 内容与标题链接保持原来的名称。已有 `1.` 或 `1.1` 前缀的标题保持手动编号。标题跳级时按实际存在的父级连续编号；只有二、三级标题的笔记从 `1.`、`1.1` 开始。

在插件设置中调整全库默认值。单篇笔记的 YAML 属性优先于全库设置：

```yaml
heading-numbering: false
```

也可以运行命令 **Toggle heading numbers in this note** 切换该属性。光标所在列表行显示可编辑的 Markdown 标记；移开光标即可查看排版效果。

## 安装

从 [GitHub Releases](https://github.com/GasonW/feishu-document-layout/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`，放进库内 `.obsidian/plugins/feishu-document-layout/`，重新加载第三方插件并启用 **Feishu Document Layout**。所有样式随插件一起加载。

完整示例见 [example.md](example.md)。问题反馈请使用 [Issues](https://github.com/GasonW/feishu-document-layout/issues)。

## 本地构建与检查

需要 Node.js 20 或以上，构建使用 Node.js 内置库。

```sh
node --test layout.test.cjs
node build.mjs
node --check dist/main.js
```

运行时使用 Obsidian 提供的 API 与 CodeMirror。插件设置及列宽保存在库内的插件 `data.json`；正文仅在主动切换单篇标题编号属性时写入。插件不发送网络请求。

## 验证范围与边界

- 已在 macOS、Obsidian 1.12.7、Minimal 主题核对实时预览、阅读视图、大纲、三级列表与引用叠加。移动端尚待实机验证。
- 标题编号支持文档顶层一至三级 Markdown 标题；代码围栏、YAML 不参与编号。源码模式显示原始 Markdown。
- 列宽按笔记路径、表头内容与同表头表格的次序记录。修改表头或列数后需要重新调整。长文中多张同表头表格的虚拟滚动定位仍需专项验证。
- 大纲及列表样式依赖 Obsidian 的界面结构；应用或主题升级后需复验。其他主题或排版插件的同名样式可能需要协调。
- 在其他 Markdown 阅读器中，标题编号和列宽由对方的显示规则决定。

## 开发与发布

入口源码为 `plugin.js`，编辑器扩展为 `editor.js`，纯 Markdown 解析逻辑为 `layout.js`。`build.mjs` 生成 `dist/main.js`，并复制 manifest 与样式文件。

每个 Release 的标签与 manifest 版本一致，附件为 `dist/main.js`、`dist/manifest.json`、`dist/styles.css`。GitHub Actions 在提交及 Pull Request 上运行测试与构建检查。
