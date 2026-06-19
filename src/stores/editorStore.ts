import { computed, reactive } from 'vue'
import type { EditorTab, OpenedFileRef, ProjectItem, UnsavedChoice } from '@/types'
import { getLanguageFromPath, isSupportedTextFile } from '@/utils/fileType'
import { nativeApi } from '@/utils/nativeApi'
import { baseName, isSameOrChildPath, replacePathPrefix } from '@/utils/path'

export const editorState = reactive({
  tabs: [] as EditorTab[],
  activePath: '',
  binaryNoticePath: '',
  notice: ''
})

export const activeTab = computed(() =>
  editorState.tabs.find((tab) => tab.path === editorState.activePath) || null
)

export function isTabDirty(tab: EditorTab): boolean {
  return tab.content !== tab.savedContent
}

export function findTab(path: string): EditorTab | undefined {
  return editorState.tabs.find((tab) => tab.path.toLowerCase() === path.toLowerCase())
}

export function getOpenedFileRefs(): OpenedFileRef[] {
  return editorState.tabs.map((tab) => ({
    path: tab.path,
    projectId: tab.projectId
  }))
}

export async function openFile(project: ProjectItem, filePath: string): Promise<boolean> {
  const existing = findTab(filePath)
  if (existing) {
    editorState.activePath = existing.path
    return true
  }

  if (!isSupportedTextFile(filePath)) {
    editorState.binaryNoticePath = filePath
    editorState.activePath = ''
    editorState.notice = '该文件不是文本文件，无法直接编辑。可以使用默认应用打开。'
    return false
  }

  const result = await nativeApi.file.readFile(filePath)
  if (!result.ok) {
    editorState.notice = result.error
    return false
  }

  const tab: EditorTab = {
    path: filePath,
    projectId: project.id,
    projectRoot: project.path,
    name: baseName(filePath),
    language: getLanguageFromPath(filePath),
    content: result.data,
    savedContent: result.data
  }

  editorState.tabs.push(tab)
  editorState.activePath = tab.path
  editorState.binaryNoticePath = ''
  editorState.notice = `已打开：${tab.name}`
  return true
}

export async function restoreOpenedFiles(
  projects: ProjectItem[],
  openedFiles: OpenedFileRef[],
  activeFilePath: string
): Promise<void> {
  for (const file of openedFiles) {
    const project = projects.find((item) => item.id === file.projectId)
    if (!project) continue
    await openFile(project, file.path)
  }

  if (activeFilePath && findTab(activeFilePath)) {
    editorState.activePath = activeFilePath
  } else if (!editorState.activePath && editorState.tabs[0]) {
    editorState.activePath = editorState.tabs[0].path
  }
}

export function setActiveTab(path: string): void {
  if (findTab(path)) editorState.activePath = path
}

export function updateActiveContent(content: string): void {
  const tab = activeTab.value
  if (!tab) return
  tab.content = content
}

export async function saveTab(tab: EditorTab): Promise<boolean> {
  const result = await nativeApi.file.writeFile(tab.path, tab.content)
  if (!result.ok) {
    editorState.notice = result.error
    return false
  }

  tab.savedContent = tab.content
  editorState.notice = `已保存：${tab.name}`
  return true
}

export async function saveActiveTab(): Promise<boolean> {
  if (!activeTab.value) {
    editorState.notice = '当前没有打开的文件。'
    return false
  }

  return saveTab(activeTab.value)
}

export async function closeTab(
  path: string,
  chooseUnsaved: (tab: EditorTab) => Promise<UnsavedChoice>
): Promise<boolean> {
  const index = editorState.tabs.findIndex((tab) => tab.path === path)
  if (index < 0) return true

  const tab = editorState.tabs[index]
  if (isTabDirty(tab)) {
    const choice = await chooseUnsaved(tab)
    if (choice === 'cancel') return false
    if (choice === 'save') {
      const saved = await saveTab(tab)
      if (!saved) return false
    }
  }

  editorState.tabs.splice(index, 1)

  if (editorState.activePath === path) {
    const nextTab = editorState.tabs[index] || editorState.tabs[index - 1] || null
    editorState.activePath = nextTab?.path || ''
  }

  return true
}

export async function closeActiveTab(
  chooseUnsaved: (tab: EditorTab) => Promise<UnsavedChoice>
): Promise<boolean> {
  if (!editorState.activePath) return true
  return closeTab(editorState.activePath, chooseUnsaved)
}

export async function confirmAllDirty(
  chooseUnsaved: (tab: EditorTab) => Promise<UnsavedChoice>
): Promise<boolean> {
  const dirtyTabs = editorState.tabs.filter(isTabDirty)

  for (const tab of dirtyTabs) {
    editorState.activePath = tab.path
    const choice = await chooseUnsaved(tab)
    if (choice === 'cancel') return false
    if (choice === 'save') {
      const saved = await saveTab(tab)
      if (!saved) return false
    }
  }

  return true
}

export async function closeTabsUnderPath(
  targetPath: string,
  chooseUnsaved: (tab: EditorTab) => Promise<UnsavedChoice>
): Promise<boolean> {
  const affected = editorState.tabs.filter((tab) => isSameOrChildPath(targetPath, tab.path))

  for (const tab of affected) {
    const closed = await closeTab(tab.path, chooseUnsaved)
    if (!closed) return false
  }

  return true
}

export function updateTabsForRenamedPath(oldPath: string, newPath: string): void {
  for (const tab of editorState.tabs) {
    if (!isSameOrChildPath(oldPath, tab.path)) continue

    tab.path = replacePathPrefix(tab.path, oldPath, newPath)
    tab.name = baseName(tab.path)
    tab.language = getLanguageFromPath(tab.path)
    if (editorState.activePath && isSameOrChildPath(oldPath, editorState.activePath)) {
      editorState.activePath = replacePathPrefix(editorState.activePath, oldPath, newPath)
    }
  }
}

export function removeTabsForProject(projectId: string): void {
  editorState.tabs = editorState.tabs.filter((tab) => tab.projectId !== projectId)
  if (!findTab(editorState.activePath)) {
    editorState.activePath = editorState.tabs[0]?.path || ''
  }
}
