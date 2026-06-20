export type FileEntryType = 'file' | 'directory'

export interface ProjectItem {
  id: string
  name: string
  path: string
}

export interface OpenedFileRef {
  path: string
  projectId: string
}

export interface AppSettings {
  fontSize: number
  sidebarWidth: number
}

export interface AppConfig {
  projects: ProjectItem[]
  openedFiles: OpenedFileRef[]
  activeFilePath: string
  activeProjectId?: string
  expandedPaths: string[]
  treeStateInitialized: boolean
  settings: AppSettings
}

export interface DirectoryEntry {
  name: string
  path: string
  type: FileEntryType
  size?: number
  modifiedAt?: number
}

export interface PathInfo {
  path: string
  name: string
  extension: string
  exists: boolean
  type: FileEntryType | 'missing'
  size: number
  modifiedAt: number
}

export type ApiResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export interface ProjectFolderSelection {
  path: string
  name: string
}

export interface TreeNode {
  name: string
  path: string
  type: FileEntryType
  projectId: string
  projectRoot: string
  isProjectRoot?: boolean
  expanded?: boolean
  loaded?: boolean
  loading?: boolean
  error?: string
  children?: TreeNode[]
}

export interface SelectedEntry {
  name: string
  path: string
  type: FileEntryType
  projectId: string
  projectRoot: string
  isProjectRoot?: boolean
}

export type EditorTabKind = 'text' | 'image' | 'audio'

export interface EditorTab {
  path: string
  projectId: string
  projectRoot: string
  name: string
  kind: EditorTabKind
  language: string
  content: string
  savedContent: string
  mediaSrc?: string
}

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

export interface ContextMenuItem {
  id: string
  label: string
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

export type ShortcutAction =
  | 'save'
  | 'close-tab'
  | 'add-project'
  | 'rename-selected'
  | 'delete-selected'
  | 'copy-selected-absolute-path'
