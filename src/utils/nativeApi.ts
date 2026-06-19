import { invoke } from '@tauri-apps/api/core'
import type {
  ApiResult,
  AppConfig,
  DirectoryEntry,
  PathInfo,
  ProjectFolderSelection
} from '@/types'

export interface NativeApi {
  project: {
    getConfig(): Promise<ApiResult<AppConfig>>
    saveConfig(config: AppConfig): Promise<ApiResult<void>>
    selectProjectFolder(): Promise<ApiResult<ProjectFolderSelection | null>>
  }
  file: {
    readDir(dirPath: string): Promise<ApiResult<DirectoryEntry[]>>
    readFile(filePath: string): Promise<ApiResult<string>>
    writeFile(filePath: string, content: string): Promise<ApiResult<void>>
    createFile(filePath: string): Promise<ApiResult<void>>
    createFolder(folderPath: string): Promise<ApiResult<void>>
    renamePath(oldPath: string, newPath: string): Promise<ApiResult<void>>
    deletePath(path: string): Promise<ApiResult<void>>
    openWithDefaultApp(path: string): Promise<ApiResult<void>>
    revealInExplorer(path: string): Promise<ApiResult<void>>
    copyToClipboard(text: string): Promise<ApiResult<void>>
    pathRelative(rootPath: string, targetPath: string): Promise<ApiResult<string>>
    getPathInfo(path: string): Promise<ApiResult<PathInfo>>
  }
}

declare global {
  interface Window {
    __PROJECT_BOX_TEST_NATIVE__?: NativeApi
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    const data = await invoke<T>(command, args)
    return { ok: true, data }
  } catch (error) {
    return {
      ok: false,
      error: typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)
    }
  }
}

function testApi(): NativeApi | undefined {
  return window.__PROJECT_BOX_TEST_NATIVE__
}

export const nativeApi: NativeApi = {
  project: {
    getConfig: () => testApi()?.project.getConfig() ?? call<AppConfig>('get_config'),
    saveConfig: (config) => testApi()?.project.saveConfig(config) ?? call<void>('save_config', { config }),
    selectProjectFolder: () =>
      testApi()?.project.selectProjectFolder() ??
      call<ProjectFolderSelection | null>('select_project_folder')
  },
  file: {
    readDir: (dirPath) => testApi()?.file.readDir(dirPath) ?? call<DirectoryEntry[]>('read_dir', { dirPath }),
    readFile: (filePath) => testApi()?.file.readFile(filePath) ?? call<string>('read_file', { filePath }),
    writeFile: (filePath, content) =>
      testApi()?.file.writeFile(filePath, content) ?? call<void>('write_file', { filePath, content }),
    createFile: (filePath) => testApi()?.file.createFile(filePath) ?? call<void>('create_file', { filePath }),
    createFolder: (folderPath) =>
      testApi()?.file.createFolder(folderPath) ?? call<void>('create_folder', { folderPath }),
    renamePath: (oldPath, newPath) =>
      testApi()?.file.renamePath(oldPath, newPath) ?? call<void>('rename_path', { oldPath, newPath }),
    deletePath: (path) => testApi()?.file.deletePath(path) ?? call<void>('delete_path', { path }),
    openWithDefaultApp: (path) =>
      testApi()?.file.openWithDefaultApp(path) ?? call<void>('open_with_default_app', { path }),
    revealInExplorer: (path) =>
      testApi()?.file.revealInExplorer(path) ?? call<void>('reveal_in_explorer', { path }),
    copyToClipboard: (text) =>
      testApi()?.file.copyToClipboard(text) ?? call<void>('copy_to_clipboard', { text }),
    pathRelative: (rootPath, targetPath) =>
      testApi()?.file.pathRelative(rootPath, targetPath) ??
      call<string>('path_relative', { rootPath, targetPath }),
    getPathInfo: (path) => testApi()?.file.getPathInfo(path) ?? call<PathInfo>('get_path_info', { path })
  }
}
