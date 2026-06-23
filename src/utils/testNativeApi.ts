import type { NativeApi } from '@/utils/nativeApi'
import type { ApiResult, AppConfig, DirectoryEntry, FileEntryType, PathInfo } from '@/types'
import { baseName, dirName, extensionName } from '@/utils/path'

const projectRoot = 'D:\\qa\\project-box'
const projectId = 'qa-project'
const srcDir = `${projectRoot}\\src`
const docsDir = `${projectRoot}\\docs`
const directories = new Set([projectRoot, srcDir, docsDir])
const now = Date.now()

const fileContents: Record<string, string> = {
  [`${projectRoot}\\.env`]: [
    '# dotenv comment should be highlighted',
    'APP_NAME=ProjectBox',
    'export VITE_API_URL="http://127.0.0.1:5173"',
    'DEBUG=true',
    'COUNT=42'
  ].join('\n'),
  [`${projectRoot}\\pyproject.toml`]: [
    '# TOML comment should be highlighted',
    '[project]',
    'name = "project-box"',
    'version = "0.1.16"'
  ].join('\n'),
  [`${projectRoot}\\uv.lock`]: [
    '# uv lock comment should be highlighted',
    'version = 1',
    'requires-python = ">=3.12"'
  ].join('\n'),
  [`${projectRoot}\\.gitignore`]: ['# ignore comment should be highlighted', 'dist/', 'release-tauri/'].join('\n'),
  [`${projectRoot}\\.gitattributes`]: ['# attributes comment should be highlighted', '* text=auto'].join('\n')
}

fileContents[`${srcDir}\\feature-search.ts`] = [
  'export const featureName = "file search"',
  'export const updatedAt = "2026-06-23"'
].join('\n')
fileContents[`${docsDir}\\search-notes.md`] = '# Search notes\n\nQA file for folder-scoped search.'

for (let index = 1; index <= 14; index += 1) {
  const name = `very_long_file_name_for_tab_overflow_check_${String(index).padStart(2, '0')}.md`
  fileContents[`${projectRoot}\\${name}`] = `# ${name}\n\nThis file exists to test tab overflow.`
}

const openedFiles = Object.keys(fileContents).map((path) => ({
  path,
  projectId
}))

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

function fileType(path: string): FileEntryType {
  return path in fileContents ? 'file' : 'directory'
}

function isDirectChild(parentPath: string, childPath: string): boolean {
  return dirName(childPath).toLowerCase() === parentPath.toLowerCase()
}

function directoryEntries(dirPath: string): DirectoryEntry[] {
  const entries: DirectoryEntry[] = []

  for (const directory of directories) {
    if (directory === dirPath || !isDirectChild(dirPath, directory)) continue
    entries.push({
      name: baseName(directory),
      path: directory,
      type: 'directory',
      size: 0,
      createdAt: directory === docsDir ? now - 180_000 : now - 60_000,
      modifiedAt: now - 30_000
    })
  }

  for (const path of Object.keys(fileContents)) {
    if (!isDirectChild(dirPath, path)) continue
    entries.push({
      name: baseName(path),
      path,
      type: 'file',
      size: fileContents[path].length,
      modifiedAt: path.includes('feature-search') ? now : now - 120_000
    })
  }

  return entries
}

function pathRelative(rootPath: string, targetPath: string): string {
  const root = rootPath.replace(/[\\/]+$/, '')
  return targetPath.toLowerCase().startsWith(`${root.toLowerCase()}\\`)
    ? targetPath.slice(root.length + 1)
    : targetPath
}

export function installProjectBoxTestNative(): void {
  const config: AppConfig = {
    projects: [
      {
        id: projectId,
        name: 'QA Project',
        path: projectRoot
      }
    ],
    openedFiles,
    activeFilePath: `${projectRoot}\\.env`,
    activeProjectId: projectId,
    expandedPaths: [projectRoot],
    treeStateInitialized: true,
    settings: {
      fontSize: 14,
      sidebarWidth: 520,
      fileSortMode: 'name-asc',
      folderSortModes: {}
    }
  }

  const api: NativeApi = {
    project: {
      getConfig: async () => ok(config),
      saveConfig: async () => ok(undefined),
      selectProjectFolder: async () => ok(null)
    },
    file: {
      readDir: async (dirPath) => ok(directoryEntries(dirPath)),
      readFile: async (filePath) => ok(fileContents[filePath] ?? ''),
      readMediaFile: async () => ok(''),
      writeFile: async (filePath, content) => {
        fileContents[filePath] = content
        return ok(undefined)
      },
      createFile: async (filePath) => {
        fileContents[filePath] = ''
        return ok(undefined)
      },
      createFolder: async () => ok(undefined),
      renamePath: async (oldPath, newPath) => {
        fileContents[newPath] = fileContents[oldPath] ?? ''
        delete fileContents[oldPath]
        return ok(undefined)
      },
      deletePath: async (path) => {
        delete fileContents[path]
        return ok(undefined)
      },
      openWithDefaultApp: async () => ok(undefined),
      revealInExplorer: async () => ok(undefined),
      copyToClipboard: async () => ok(undefined),
      setFileClipboard: async () => ok(undefined),
      pathRelative: async (rootPath, targetPath) => ok(pathRelative(rootPath, targetPath)),
      getPathInfo: async (path): Promise<ApiResult<PathInfo>> =>
        ok({
          path,
          name: baseName(path),
          extension: extensionName(path),
          exists: directories.has(path) || path in fileContents,
          type: directories.has(path) ? 'directory' : fileType(path),
          size: fileContents[path]?.length ?? 0,
          modifiedAt: Date.now()
        })
    }
  }

  window.__PROJECT_BOX_TEST_NATIVE__ = api
}
