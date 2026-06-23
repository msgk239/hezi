import { reactive } from 'vue'
import type { AppConfig, AppSettings, FileSortMode, ProjectItem, SelectedEntry } from '@/types'
import { nativeApi } from '@/utils/nativeApi'

const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 14,
  sidebarWidth: 280,
  fileSortMode: 'name-asc',
  folderSortModes: {}
}

const FILE_SORT_MODES: FileSortMode[] = ['name-asc', 'modified-desc', 'modified-asc']

function normalizeSettings(settings?: Partial<AppSettings>): AppSettings {
  const sortMode = settings?.fileSortMode
  const folderSortModes = Object.fromEntries(
    Object.entries(settings?.folderSortModes ?? {}).filter(([, mode]) => FILE_SORT_MODES.includes(mode))
  )

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    fileSortMode: sortMode && FILE_SORT_MODES.includes(sortMode) ? sortMode : DEFAULT_SETTINGS.fileSortMode,
    folderSortModes
  }
}

export const projectState = reactive({
  loaded: false,
  projects: [] as ProjectItem[],
  selectedProjectId: '',
  selectedEntry: null as SelectedEntry | null,
  expandedPaths: [] as string[],
  treeStateInitialized: false,
  settings: { ...DEFAULT_SETTINGS },
  notice: ''
})

export function buildConfig(openedFiles: AppConfig['openedFiles'], activeFilePath: string): AppConfig {
  return {
    projects: projectState.projects.map((project) => ({ ...project })),
    openedFiles: openedFiles.map((file) => ({ ...file })),
    activeFilePath,
    activeProjectId: projectState.selectedProjectId,
    expandedPaths: [...projectState.expandedPaths],
    treeStateInitialized: projectState.treeStateInitialized,
    settings: { ...projectState.settings }
  }
}

export async function loadProjectConfig(): Promise<AppConfig> {
  const result = await nativeApi.project.getConfig()

  if (!result.ok) {
    projectState.notice = result.error
    projectState.loaded = true
    return {
      projects: [],
      openedFiles: [],
      activeFilePath: '',
      activeProjectId: '',
      expandedPaths: [],
      treeStateInitialized: false,
      settings: { ...DEFAULT_SETTINGS }
    }
  }

  const config = result.data
  config.expandedPaths = Array.isArray(config.expandedPaths) ? config.expandedPaths : []
  config.treeStateInitialized = Boolean(config.treeStateInitialized)

  projectState.projects = config.projects
  projectState.expandedPaths = [...config.expandedPaths]
  projectState.treeStateInitialized = config.treeStateInitialized
  projectState.settings = normalizeSettings(config.settings)
  projectState.selectedProjectId =
    config.activeProjectId || config.projects[0]?.id || ''
  projectState.loaded = true
  return config
}

export async function addProjectFromDialog(): Promise<ProjectItem | null> {
  const selection = await nativeApi.project.selectProjectFolder()
  if (!selection.ok) {
    projectState.notice = selection.error
    return null
  }

  if (!selection.data) return null

  const existing = projectState.projects.find(
    (project) => project.path.toLowerCase() === selection.data?.path.toLowerCase()
  )

  if (existing) {
    projectState.selectedProjectId = existing.id
    projectState.notice = '该项目已经在列表中。'
    return existing
  }

  const project: ProjectItem = {
    id: crypto.randomUUID(),
    name: selection.data.name,
    path: selection.data.path
  }

  projectState.projects.push(project)
  projectState.selectedProjectId = project.id
  setPathExpanded(project.path, true)
  projectState.notice = `已添加项目：${project.name}`
  return project
}

export function removeProject(projectId: string): void {
  const index = projectState.projects.findIndex((project) => project.id === projectId)
  if (index < 0) return

  const [removed] = projectState.projects.splice(index, 1)
  removeExpandedPathsUnder(removed.path)

  if (projectState.selectedProjectId === projectId) {
    projectState.selectedProjectId = projectState.projects[0]?.id || ''
  }

  if (projectState.selectedEntry?.projectId === projectId) {
    projectState.selectedEntry = null
  }

  projectState.notice = `已从列表移除项目：${removed.name}`
}

export function renameProject(projectId: string, name: string): void {
  const project = projectState.projects.find((item) => item.id === projectId)
  if (!project) return

  project.name = name.trim() || project.name
  projectState.notice = `项目名称已更新：${project.name}`
}

export function setSelectedEntry(entry: SelectedEntry | null): void {
  projectState.selectedEntry = entry
  if (entry) projectState.selectedProjectId = entry.projectId
}

export function updateSettings(settings: Partial<AppSettings>): void {
  projectState.settings = {
    ...projectState.settings,
    ...settings,
    folderSortModes: {
      ...projectState.settings.folderSortModes,
      ...settings.folderSortModes
    }
  }
}

export function normalizePathKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isSameOrChildPath(path: string, rootPath: string): boolean {
  const key = normalizePathKey(path)
  const rootKey = normalizePathKey(rootPath)
  return key === rootKey || key.startsWith(`${rootKey}/`)
}

export function isPathExpanded(path: string): boolean {
  const key = normalizePathKey(path)
  return projectState.expandedPaths.some((expandedPath) => normalizePathKey(expandedPath) === key)
}

export function shouldDirectoryStartExpanded(path: string, isProjectRoot = false): boolean {
  if (projectState.treeStateInitialized) return isPathExpanded(path)
  return isProjectRoot
}

export function setPathExpanded(path: string, expanded: boolean): void {
  const key = normalizePathKey(path)
  projectState.treeStateInitialized = true
  projectState.expandedPaths = projectState.expandedPaths.filter(
    (expandedPath) => normalizePathKey(expandedPath) !== key
  )

  if (expanded) projectState.expandedPaths.push(path)
}

export function removeExpandedPathsUnder(rootPath: string): void {
  projectState.expandedPaths = projectState.expandedPaths.filter(
    (expandedPath) => !isSameOrChildPath(expandedPath, rootPath)
  )
  removeFolderSortModesUnder(rootPath)
}

export function replaceExpandedPathPrefix(oldRootPath: string, newRootPath: string): void {
  projectState.expandedPaths = projectState.expandedPaths.map((expandedPath) => {
    if (!isSameOrChildPath(expandedPath, oldRootPath)) return expandedPath
    return `${newRootPath}${expandedPath.slice(oldRootPath.length)}`
  })
  replaceFolderSortModePathPrefix(oldRootPath, newRootPath)
}

export function getFolderSortMode(path: string): FileSortMode {
  return projectState.settings.folderSortModes[normalizePathKey(path)] || projectState.settings.fileSortMode
}

export function getFolderSortOverride(path: string): FileSortMode | undefined {
  return projectState.settings.folderSortModes[normalizePathKey(path)]
}

export function setFolderSortMode(path: string, mode: FileSortMode | null): void {
  const key = normalizePathKey(path)
  const folderSortModes = { ...projectState.settings.folderSortModes }

  if (mode) {
    folderSortModes[key] = mode
  } else {
    delete folderSortModes[key]
  }

  projectState.settings = {
    ...projectState.settings,
    folderSortModes
  }
}

export function removeFolderSortModesUnder(rootPath: string): void {
  const folderSortModes = Object.fromEntries(
    Object.entries(projectState.settings.folderSortModes).filter(([path]) => !isSameOrChildPath(path, rootPath))
  )

  projectState.settings = {
    ...projectState.settings,
    folderSortModes
  }
}

export function replaceFolderSortModePathPrefix(oldRootPath: string, newRootPath: string): void {
  const folderSortModes = Object.fromEntries(
    Object.entries(projectState.settings.folderSortModes).map(([path, mode]) => {
      if (!isSameOrChildPath(path, oldRootPath)) return [path, mode]
      const suffix = path.slice(normalizePathKey(oldRootPath).length)
      return [normalizePathKey(`${newRootPath}${suffix}`), mode]
    })
  )

  projectState.settings = {
    ...projectState.settings,
    folderSortModes
  }
}
