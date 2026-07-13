# Agent Notes

## 默认版本发布闭环（必须执行）

- 当用户要求“生成新版本”“打包新版本”或“发布新版本”时，除非用户明确说明只在本地打包、不要提交或不要推送，否则默认授权并必须一次完成以下全部流程：
  1. 按语义化版本升级版本号，并同步 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 和 `src-tauri/tauri.conf.json`。
  2. 运行与改动风险相称的检查，并执行 `npm run dist:release`。
  3. 确认 `release-tauri/` 中同时生成安装版与便携版两个成品。
  4. 只暂存本次发布相关的源码、配置、版本与说明文件，提交到当前发布分支（通常是 `main`）。
  5. 创建与版本一致的 `v<version>` 标签，推送发布分支和标签到 `origin`。
  6. 创建或更新同标签的 GitHub Release，并上传安装版和便携版两个成品。
  7. 使用 `gh release view` 核验 Release 不是草稿，并确认两个附件都已上传成功。
- 上述步骤是一个完整交付，不得只生成本地安装包后提前结束。
- 直接发布到当前发布分支和 GitHub Release；除非用户明确要求，否则不要创建 Pull Request。
- 发布前检查工作区、当前分支、远端、标签是否已存在，以及 GitHub CLI 登录状态；不得覆盖不明来源的标签或 Release。
- GitHub Release 的安装包附件优先使用 ASCII 文件名 `project-box-<version>-setup.exe`，避免中文文件名在上传后被截断；便携版使用 `project-box-<version>.exe`。
- Release 创建后必须核对标签、提交和两个附件；任何一步失败都应继续排查并完成闭环，不能把未完成的发布报告为成功。

## Release build

- Keep version fields aligned before packaging: `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
- Use `npm run dist:release` for local release packaging.
- The command builds Tauri once, then writes both release artifacts to `release-tauri/`:
  - installer: `项目盒子_<version>_x64-setup.exe`
  - portable standalone exe: `project-box-<version>.exe`
- `release-tauri/` is ignored and should stay out of Git; upload its two artifacts to the matching GitHub Release.
- If packaging fails with `failed to remove file ... project-box.exe` or Windows `拒绝访问`, close any running `project-box.exe` process and rerun `npm run dist:release`.
