# 项目盒子

项目盒子是一个本地多项目文件管理与编辑工具，基于 Vue 3、Tauri 和 CodeMirror 构建。

它适合用来快速浏览项目目录、打开文本文件、编辑代码或 Markdown，并在同一个窗口里管理多个本地项目。

## 功能

- 本地项目目录浏览
- 多标签文件编辑
- Markdown 预览
- 常见代码文件语法高亮
- Windows 桌面应用打包

## 下载

Windows 版本可以在 GitHub Releases 下载：

https://github.com/msgk239/hezi/releases

当前版本：`0.1.18`

## 本地开发

需要先安装 Node.js、Rust 和 Tauri 依赖。

```bash
npm install
npm run dev
```

只启动前端开发服务：

```bash
npm run web:dev
```

构建前端：

```bash
npm run build
```

打包桌面应用：

```bash
npm run dist
```

## 技术栈

- Vue 3
- TypeScript
- Vite
- Tauri 2
- CodeMirror 6
- markdown-it
