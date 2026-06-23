# Agent Notes

## Release build

- Keep version fields aligned before packaging: `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
- Use `npm run dist:release` for local release packaging.
- The command builds Tauri once, then writes both release artifacts to `release-tauri/`:
  - installer: `项目盒子_<version>_x64-setup.exe`
  - portable standalone exe: `project-box-<version>.exe`
- `release-tauri/` is ignored and should stay out of Git unless the user explicitly asks to publish or attach artifacts.
- If the user explicitly asks to push/publish/upload to the cloud or GitHub, upload both release artifacts to the matching GitHub Release as well as pushing the Git commit/tag.
- If packaging fails with `failed to remove file ... project-box.exe` or Windows `拒绝访问`, close any running `project-box.exe` process and rerun `npm run dist:release`.
