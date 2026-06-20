<template>
  <div class="app-shell" @click="closeContextMenu">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">盒</div>
        <div>
          <div class="brand-title">项目盒子</div>
          <div class="brand-subtitle">本地项目文件管理与编辑</div>
        </div>
      </div>
      <div class="top-actions">
        <button class="top-button primary" type="button" @click.stop="handleAddProject">
          添加项目
        </button>
        <button class="top-button" type="button" @click.stop="handleSaveActive">
          保存
        </button>
        <button class="top-button" type="button" @click.stop="openSettings">
          设置
        </button>
      </div>
    </header>

    <main class="workspace">
      <ProjectSidebar
        :projects="projectState.projects"
        :selected-path="selectedPath"
        :width="projectState.settings.sidebarWidth"
        :refresh-key="treeRefreshKey"
        @open-file="handleOpenFile"
        @select-entry="setSelectedEntry"
        @context-menu="openContextMenu"
        @expanded-change="handleTreeExpandedChange"
      />

      <div class="sidebar-resizer" title="拖动调整左侧宽度" @mousedown="startSidebarResize" />

      <section class="editor-pane">
        <EditorTabs
          :tabs="editorState.tabs"
          :active-path="editorState.activePath"
          @select="handleSelectTab"
          @close="handleCloseTab"
          @context-menu="openTabContextMenu"
        />

        <div v-if="activeTab && isMarkdownActive" class="editor-modebar">
          <button
            class="mode-button"
            :class="{ active: markdownMode === 'edit' }"
            type="button"
            @click="markdownMode = 'edit'"
          >
            编辑
          </button>
          <button
            class="mode-button"
            :class="{ active: markdownMode === 'preview' }"
            type="button"
            @click="markdownMode = 'preview'"
          >
            预览
          </button>
        </div>

        <div class="editor-body">
          <MediaPreview
            v-if="activeTab && activeTab.kind !== 'text'"
            :tab="activeTab"
            @open-default="openDefaultApp"
          />

          <MarkdownPreview
            v-else-if="activeTab && isMarkdownActive && markdownMode === 'preview'"
            :content="activeTab.content"
          />

          <CodeEditor
            v-else-if="activeTab && activeTab.kind === 'text'"
            :key="activeTab.path"
            v-model="activeTab.content"
            :language="activeTab.language"
            :font-size="projectState.settings.fontSize"
            :file-path="activeTab.path"
            @save="handleSaveActive"
          />

          <div v-else-if="editorState.binaryNoticePath" class="empty-editor">
            <div class="empty-title">该文件暂不支持直接预览或编辑。</div>
            <div class="empty-text">可以使用默认应用打开。</div>
            <button class="top-button primary" type="button" @click="openBinaryWithDefaultApp">
              用默认应用打开
            </button>
          </div>

          <div v-else class="empty-editor">
            <div class="empty-title">选择左侧文件开始</div>
            <div class="empty-text">文本文件可编辑，图片和常见音频文件可直接预览。</div>
          </div>
        </div>
      </section>
    </main>

    <footer class="statusbar" aria-label="状态栏"></footer>

    <ContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @select="handleContextAction"
    />

    <ContextMenu
      :visible="tabContextMenu.visible"
      :x="tabContextMenu.x"
      :y="tabContextMenu.y"
      :items="tabContextMenu.items"
      @select="handleTabContextAction"
    />

    <div v-if="notice" class="toast">{{ notice }}</div>

    <div v-if="dialogState.visible" class="modal-backdrop" @mousedown.self="resolveDialog(null)">
      <div class="modal">
        <div class="modal-title">{{ dialogState.title }}</div>
        <div class="modal-message">{{ dialogState.message }}</div>

        <input
          v-if="dialogState.mode === 'input'"
          v-model="dialogState.inputValue"
          class="modal-input"
          :placeholder="dialogState.placeholder"
          autofocus
          @keydown.enter="confirmInputDialog"
          @keydown.esc="resolveDialog(null)"
        />

        <div v-if="dialogState.mode === 'input'" class="modal-actions">
          <button class="modal-button" type="button" @click="resolveDialog(null)">取消</button>
          <button class="modal-button primary" type="button" @click="confirmInputDialog">确定</button>
        </div>

        <div v-else-if="dialogState.mode === 'confirm'" class="modal-actions">
          <button class="modal-button" type="button" @click="resolveDialog(false)">取消</button>
          <button
            class="modal-button"
            :class="{ danger: dialogState.danger }"
            type="button"
            @click="resolveDialog(true)"
          >
            确定
          </button>
        </div>

        <div v-else-if="dialogState.mode === 'unsaved'" class="modal-actions">
          <button class="modal-button" type="button" @click="resolveDialog('cancel')">取消</button>
          <button class="modal-button" type="button" @click="resolveDialog('discard')">不保存</button>
          <button class="modal-button primary" type="button" @click="resolveDialog('save')">保存</button>
        </div>
      </div>
    </div>

    <div v-if="settingsVisible" class="modal-backdrop" @mousedown.self="settingsVisible = false">
      <div class="modal settings-modal">
        <div class="modal-title">设置</div>
        <label class="setting-row">
          <span>编辑器字号</span>
          <input v-model.number="settingsDraft.fontSize" class="setting-input" type="number" min="10" max="28" />
        </label>
        <label class="setting-row">
          <span>左侧栏宽度</span>
          <input v-model.number="settingsDraft.sidebarWidth" class="setting-input" type="number" min="220" max="520" />
        </label>

        <div class="setting-section-title">项目显示名称</div>
        <div v-if="settingsDraft.projects.length === 0" class="settings-empty">暂无项目。</div>
        <div v-for="project in settingsDraft.projects" :key="project.id" class="project-setting-row">
          <input v-model="project.name" class="setting-input project-name-input" />
          <span class="project-path-text" :title="project.path">{{ project.path }}</span>
        </div>

        <div class="modal-actions">
          <button class="modal-button" type="button" @click="settingsVisible = false">取消</button>
          <button class="modal-button primary" type="button" @click="applySettings">保存设置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import CodeEditor from '@/components/CodeEditor.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import EditorTabs from '@/components/EditorTabs.vue'
import MarkdownPreview from '@/components/MarkdownPreview.vue'
import MediaPreview from '@/components/MediaPreview.vue'
import ProjectSidebar from '@/components/ProjectSidebar.vue'
import {
  addProjectFromDialog,
  buildConfig,
  loadProjectConfig,
  projectState,
  removeExpandedPathsUnder,
  removeProject,
  replaceExpandedPathPrefix,
  renameProject,
  setSelectedEntry,
  setPathExpanded,
  updateSettings
} from '@/stores/projectStore'
import {
  activeTab,
  closeActiveTab,
  closeTab,
  closeTabsUnderPath,
  confirmAllDirty,
  editorState,
  findTab,
  getOpenedFileRefs,
  isTabDirty,
  openFile,
  removeTabsForProject,
  restoreOpenedFiles,
  saveActiveTab,
  setActiveTab,
  updateTabsForRenamedPath
} from '@/stores/editorStore'
import type { ContextMenuItem, EditorTab, ProjectItem, SelectedEntry, ShortcutAction, UnsavedChoice } from '@/types'
import { isSupportedTextFile } from '@/utils/fileType'
import { nativeApi } from '@/utils/nativeApi'
import { baseName, isUnsafeRelativeInput, joinPath, replaceBaseName } from '@/utils/path'

type DialogMode = 'input' | 'confirm' | 'unsaved' | null

const treeRefreshKey = ref(0)
const notice = ref('')
const settingsVisible = ref(false)
const allowWindowClose = ref(false)
const closeInProgress = ref(false)
const markdownMode = ref<'edit' | 'preview'>('edit')

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  entry: null as SelectedEntry | null,
  items: [] as ContextMenuItem[]
})

const tabContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  path: '',
  items: [] as ContextMenuItem[]
})

const dialogState = reactive({
  visible: false,
  mode: null as DialogMode,
  title: '',
  message: '',
  inputValue: '',
  placeholder: '',
  danger: false,
  resolve: null as ((value: unknown) => void) | null
})

const settingsDraft = reactive({
  fontSize: 14,
  sidebarWidth: 280,
  projects: [] as ProjectItem[]
})

const selectedPath = computed(() => projectState.selectedEntry?.path || editorState.activePath)
const isMarkdownActive = computed(() => activeTab.value?.kind === 'text' && activeTab.value.language === 'markdown')

let removeCloseListener: (() => void) | null = null
let noticeTimer: number | undefined
let resizingSidebar = false

function hasTauriRuntime(): boolean {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

async function closeCurrentWindow(): Promise<void> {
  if (hasTauriRuntime()) {
    await getCurrentWindow().close()
  } else {
    window.close()
  }
}

function showNotice(message: string): void {
  if (!message) return
  notice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
  }, 2600)
}

function getProject(projectId: string): ProjectItem | undefined {
  return projectState.projects.find((project) => project.id === projectId)
}

async function persistConfig(): Promise<void> {
  const config = buildConfig(getOpenedFileRefs(), editorState.activePath)
  const result = await nativeApi.project.saveConfig(config)
  if (!result.ok) showNotice(result.error)
}

async function handleTreeExpandedChange(payload: { path: string; expanded: boolean }): Promise<void> {
  setPathExpanded(payload.path, payload.expanded)
  await persistConfig()
}

async function handleAddProject(): Promise<void> {
  const project = await addProjectFromDialog()
  if (project) {
    treeRefreshKey.value += 1
    await persistConfig()
  }
}

async function handleOpenFile(entry: SelectedEntry): Promise<void> {
  setSelectedEntry(entry)
  const project = getProject(entry.projectId)
  if (!project) {
    showNotice('项目不存在，无法打开文件。')
    return
  }

  const opened = await openFile(project, entry.path)
  showNotice(editorState.notice)
  if (opened) await persistConfig()
}

async function handleSaveActive(): Promise<void> {
  const saved = await saveActiveTab()
  showNotice(editorState.notice)
  if (saved) await persistConfig()
}

async function handleSelectTab(path: string): Promise<void> {
  setActiveTab(path)
  const tab = findTab(path)
  if (tab) {
    editorState.binaryNoticePath = ''
    setSelectedEntry({
      name: tab.name,
      path: tab.path,
      type: 'file',
      projectId: tab.projectId,
      projectRoot: tab.projectRoot
    })
  }
  await persistConfig()
}

async function requestUnsavedChoice(tab: EditorTab): Promise<UnsavedChoice> {
  return askUnsaved(
    '文件未保存',
    `“${tab.name}”有未保存的修改。请选择保存、不保存或取消。`
  )
}

async function handleCloseTab(path: string): Promise<void> {
  const closed = await closeTab(path, requestUnsavedChoice)
  if (closed) await persistConfig()
}

function openContextMenu(payload: { entry: SelectedEntry; x: number; y: number }): void {
  tabContextMenu.visible = false
  contextMenu.visible = true
  contextMenu.x = Math.min(payload.x, window.innerWidth - 220)
  contextMenu.y = Math.min(payload.y, window.innerHeight - 320)
  contextMenu.entry = payload.entry
  contextMenu.items = buildContextItems(payload.entry)
}

function openTabContextMenu(payload: { path: string; x: number; y: number }): void {
  contextMenu.visible = false
  tabContextMenu.visible = true
  tabContextMenu.x = Math.min(payload.x, window.innerWidth - 220)
  tabContextMenu.y = Math.min(payload.y, window.innerHeight - 240)
  tabContextMenu.path = payload.path
  tabContextMenu.items = buildTabContextItems(payload.path)
}

function closeContextMenu(): void {
  contextMenu.visible = false
  tabContextMenu.visible = false
}

function buildTabContextItems(path: string): ContextMenuItem[] {
  const index = editorState.tabs.findIndex((tab) => tab.path === path)
  const tabCount = editorState.tabs.length

  return [
    { id: 'tab-close', label: '关闭' },
    { id: 'tab-close-others', label: '关闭其他文件', disabled: tabCount <= 1 },
    { id: 'tab-close-left', label: '关闭左侧所有', disabled: index <= 0 },
    { id: 'tab-close-right', label: '关闭右侧所有', disabled: index < 0 || index >= tabCount - 1 },
    { id: 'tab-close-all', label: '关闭所有文件', disabled: tabCount === 0 }
  ]
}

function buildContextItems(entry: SelectedEntry): ContextMenuItem[] {
  if (entry.type === 'file') {
    return [
      { id: 'open', label: '打开' },
      { id: 'open-default', label: '用默认应用打开' },
      { id: 'reveal', label: '在资源管理器中显示' },
      { id: 'separator-file-copy', label: '', separator: true },
      { id: 'copy-name', label: '复制文件名' },
      { id: 'copy-relative', label: '复制相对路径' },
      { id: 'copy-absolute', label: '复制绝对路径' },
      { id: 'copy-file', label: '复制文件' },
      { id: 'cut-file', label: '剪切文件' },
      { id: 'separator-file-edit', label: '', separator: true },
      { id: 'rename', label: '重命名' },
      { id: 'delete', label: '删除', danger: true }
    ]
  }

  const folderItems: ContextMenuItem[] = [
    { id: 'new-file', label: '新建文件' },
    { id: 'new-folder', label: '新建文件夹' },
    { id: 'open-default', label: '用默认应用打开' },
    { id: 'reveal', label: '在资源管理器中显示' },
    { id: 'separator-folder-copy', label: '', separator: true },
    { id: 'copy-name', label: '复制文件名' },
    { id: 'copy-relative', label: '复制相对路径' },
    { id: 'copy-absolute', label: '复制绝对路径' },
    { id: 'copy-file', label: '复制文件' },
    { id: 'cut-file', label: '剪切文件', disabled: entry.isProjectRoot },
    { id: 'separator-folder-edit', label: '', separator: true },
    { id: 'rename', label: '重命名' }
  ]

  if (entry.isProjectRoot) {
    folderItems.push({ id: 'project-remove', label: '从项目列表移除', danger: true })
  } else {
    folderItems.push({ id: 'delete', label: '删除', danger: true })
  }

  return folderItems
}

async function handleContextAction(action: string): Promise<void> {
  const entry = contextMenu.entry
  closeContextMenu()
  if (!entry) return

  if (action === 'open') await handleOpenFile(entry)
  if (action === 'open-default') await openDefaultApp(entry.path)
  if (action === 'reveal') await revealPath(entry.path)
  if (action === 'copy-name') await copyFileName(entry)
  if (action === 'copy-relative') await copyRelativePath(entry)
  if (action === 'copy-absolute') await copyAbsolutePath(entry)
  if (action === 'copy-file') await setFileClipboard(entry, 'copy')
  if (action === 'cut-file') await setFileClipboard(entry, 'cut')
  if (action === 'new-file') await createFileInFolder(entry)
  if (action === 'new-folder') await createFolderInFolder(entry)
  if (action === 'rename') await renameEntry(entry)
  if (action === 'delete') await deleteEntry(entry)
  if (action === 'project-remove') await removeProjectFromList(entry)
}

async function handleTabContextAction(action: string): Promise<void> {
  const path = tabContextMenu.path
  closeContextMenu()
  if (!path) return

  const paths = getTabPathsForAction(path, action)
  if (paths.length === 0) return

  const closed = await closeTabPaths(paths)
  if (closed) await persistConfig()
}

function getTabPathsForAction(path: string, action: string): string[] {
  const paths = editorState.tabs.map((tab) => tab.path)
  const index = paths.findIndex((item) => item === path)
  if (index < 0) return []

  if (action === 'tab-close') return [path]
  if (action === 'tab-close-others') return paths.filter((item) => item !== path)
  if (action === 'tab-close-left') return paths.slice(0, index)
  if (action === 'tab-close-right') return paths.slice(index + 1)
  if (action === 'tab-close-all') return paths
  return []
}

async function closeTabPaths(paths: string[]): Promise<boolean> {
  for (const path of paths) {
    const closed = await closeTab(path, requestUnsavedChoice)
    if (!closed) return false
  }

  return true
}

async function openDefaultApp(path: string): Promise<void> {
  const result = await nativeApi.file.openWithDefaultApp(path)
  if (!result.ok) showNotice(result.error)
}

async function revealPath(path: string): Promise<void> {
  const result = await nativeApi.file.revealInExplorer(path)
  showNotice(result.ok ? '已在资源管理器中显示。' : result.error)
}

async function copyText(text: string, successMessage: string): Promise<void> {
  const result = await nativeApi.file.copyToClipboard(text)
  showNotice(result.ok ? successMessage : result.error)
}

async function copyRelativePath(entry: SelectedEntry): Promise<void> {
  const result = await nativeApi.file.pathRelative(entry.projectRoot, entry.path)
  if (!result.ok) {
    showNotice(result.error)
    return
  }

  await copyText(result.data, '已复制相对路径。')
}

async function copyAbsolutePath(entry: SelectedEntry): Promise<void> {
  await copyText(entry.path, '已复制绝对路径。')
}

async function copyFileName(entry: SelectedEntry): Promise<void> {
  await copyText(entry.name, '已复制文件名。')
}

async function setFileClipboard(entry: SelectedEntry, operation: 'copy' | 'cut'): Promise<void> {
  if (operation === 'cut' && entry.isProjectRoot) return

  const result = await nativeApi.file.setFileClipboard([entry.path], operation)
  showNotice(result.ok ? (operation === 'cut' ? '已剪切文件。' : '已复制文件。') : result.error)
}

async function createFileInFolder(entry: SelectedEntry): Promise<void> {
  if (entry.type !== 'directory') return

  const input = await askInput('新建文件', '请输入文件名，可以包含相对路径，例如 test.js 或 src/a.ts。', '', 'test.js')
  if (input === null) return
  if (isUnsafeRelativeInput(input)) {
    showNotice('文件名必须是当前文件夹内的相对路径。')
    return
  }

  const filePath = joinPath(entry.path, input)
  const result = await nativeApi.file.createFile(filePath)
  if (!result.ok) {
    showNotice(result.error)
    return
  }

  treeRefreshKey.value += 1
  showNotice('文件已创建。')

  if (isSupportedTextFile(filePath)) {
    const project = getProject(entry.projectId)
    if (project) {
      await openFile(project, filePath)
      await persistConfig()
    }
  }
}

async function createFolderInFolder(entry: SelectedEntry): Promise<void> {
  if (entry.type !== 'directory') return

  const input = await askInput('新建文件夹', '请输入文件夹名，可以包含相对路径。', '', 'src/components')
  if (input === null) return
  if (isUnsafeRelativeInput(input)) {
    showNotice('文件夹名必须是当前文件夹内的相对路径。')
    return
  }

  const folderPath = joinPath(entry.path, input)
  const result = await nativeApi.file.createFolder(folderPath)
  if (!result.ok) {
    showNotice(result.error)
    return
  }

  treeRefreshKey.value += 1
  showNotice('文件夹已创建。')
}

async function renameEntry(entry: SelectedEntry): Promise<void> {
  if (entry.isProjectRoot) {
    const project = getProject(entry.projectId)
    if (!project) return
    const name = await askInput('重命名项目', '请输入项目显示名称。真实文件夹不会被重命名。', project.name)
    if (name === null) return
    renameProject(project.id, name)
    treeRefreshKey.value += 1
    await persistConfig()
    return
  }

  const nextName = await askInput('重命名', '请输入新的名称。', entry.name)
  if (nextName === null) return
  if (!nextName.trim() || /[\\/]/.test(nextName) || nextName.includes('..')) {
    showNotice('名称不能为空，且不能包含路径分隔符或 ..。')
    return
  }

  const newPath = replaceBaseName(entry.path, nextName.trim())
  const result = await nativeApi.file.renamePath(entry.path, newPath)
  if (!result.ok) {
    showNotice(result.error)
    return
  }

  updateTabsForRenamedPath(entry.path, newPath)
  replaceExpandedPathPrefix(entry.path, newPath)
  setSelectedEntry({
    ...entry,
    name: baseName(newPath),
    path: newPath
  })
  treeRefreshKey.value += 1
  showNotice('重命名完成。')
  await persistConfig()
}

async function deleteEntry(entry: SelectedEntry): Promise<void> {
  const confirmed = await askConfirm(
    '确认删除',
    `确定要将“${entry.name}”删除到回收站吗？`,
    true
  )
  if (!confirmed) return

  const closed = await closeTabsUnderPath(entry.path, requestUnsavedChoice)
  if (!closed) return

  const result = await nativeApi.file.deletePath(entry.path)
  if (!result.ok) {
    showNotice(result.error)
    return
  }

  if (projectState.selectedEntry?.path === entry.path) setSelectedEntry(null)
  removeExpandedPathsUnder(entry.path)
  treeRefreshKey.value += 1
  showNotice('已删除到回收站。')
  await persistConfig()
}

async function removeProjectFromList(entry: SelectedEntry): Promise<void> {
  const project = getProject(entry.projectId)
  if (!project) return

  const confirmed = await askConfirm(
    '移除项目',
    `只从项目列表移除“${project.name}”，不会删除真实文件。确定继续吗？`,
    true
  )
  if (!confirmed) return

  const closed = await closeTabsUnderPath(project.path, requestUnsavedChoice)
  if (!closed) return

  removeTabsForProject(project.id)
  removeProject(project.id)
  treeRefreshKey.value += 1
  await persistConfig()
}

function openSettings(): void {
  settingsDraft.fontSize = projectState.settings.fontSize
  settingsDraft.sidebarWidth = projectState.settings.sidebarWidth
  settingsDraft.projects = projectState.projects.map((project) => ({ ...project }))
  settingsVisible.value = true
}

async function applySettings(): Promise<void> {
  updateSettings({
    fontSize: clampNumber(settingsDraft.fontSize, 10, 28),
    sidebarWidth: clampNumber(settingsDraft.sidebarWidth, 220, 520)
  })

  for (const draft of settingsDraft.projects) {
    renameProject(draft.id, draft.name)
  }

  settingsVisible.value = false
  treeRefreshKey.value += 1
  await persistConfig()
  showNotice('设置已保存。')
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

async function openBinaryWithDefaultApp(): Promise<void> {
  if (!editorState.binaryNoticePath) return
  await openDefaultApp(editorState.binaryNoticePath)
}

function askInput(
  title: string,
  message: string,
  defaultValue = '',
  placeholder = ''
): Promise<string | null> {
  return new Promise((resolve) => {
    dialogState.visible = true
    dialogState.mode = 'input'
    dialogState.title = title
    dialogState.message = message
    dialogState.inputValue = defaultValue
    dialogState.placeholder = placeholder
    dialogState.danger = false
    dialogState.resolve = resolve as (value: unknown) => void
  })
}

function askConfirm(title: string, message: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    dialogState.visible = true
    dialogState.mode = 'confirm'
    dialogState.title = title
    dialogState.message = message
    dialogState.inputValue = ''
    dialogState.placeholder = ''
    dialogState.danger = danger
    dialogState.resolve = resolve as (value: unknown) => void
  })
}

function askUnsaved(title: string, message: string): Promise<UnsavedChoice> {
  return new Promise((resolve) => {
    dialogState.visible = true
    dialogState.mode = 'unsaved'
    dialogState.title = title
    dialogState.message = message
    dialogState.inputValue = ''
    dialogState.placeholder = ''
    dialogState.danger = false
    dialogState.resolve = resolve as (value: unknown) => void
  })
}

function confirmInputDialog(): void {
  resolveDialog(dialogState.inputValue.trim())
}

function resolveDialog(value: unknown): void {
  const resolve = dialogState.resolve
  dialogState.visible = false
  dialogState.mode = null
  dialogState.resolve = null
  if (resolve) resolve(value)
}

function startSidebarResize(event: MouseEvent): void {
  resizingSidebar = true
  event.preventDefault()
  document.body.classList.add('is-resizing')
  window.addEventListener('mousemove', handleSidebarResize)
  window.addEventListener('mouseup', stopSidebarResize)
}

function handleSidebarResize(event: MouseEvent): void {
  if (!resizingSidebar) return
  updateSettings({
    sidebarWidth: clampNumber(event.clientX, 220, 520)
  })
}

async function stopSidebarResize(): Promise<void> {
  resizingSidebar = false
  document.body.classList.remove('is-resizing')
  window.removeEventListener('mousemove', handleSidebarResize)
  window.removeEventListener('mouseup', stopSidebarResize)
  await persistConfig()
}

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], .cm-editor')
  )
}

async function handleShortcut(action: ShortcutAction): Promise<void> {
  if (dialogState.visible || settingsVisible.value) return

  if (action === 'save') await handleSaveActive()
  if (action === 'close-tab') {
    const closed = await closeActiveTab(requestUnsavedChoice)
    if (closed) await persistConfig()
  }
  if (action === 'add-project') await handleAddProject()
  if (action === 'rename-selected' && projectState.selectedEntry) await renameEntry(projectState.selectedEntry)
  if (action === 'delete-selected' && projectState.selectedEntry) {
    if (projectState.selectedEntry.isProjectRoot) await removeProjectFromList(projectState.selectedEntry)
    else await deleteEntry(projectState.selectedEntry)
  }
  if (action === 'copy-selected-absolute-path' && projectState.selectedEntry) {
    await copyAbsolutePath(projectState.selectedEntry)
  }
}

function handleRendererKeydown(event: KeyboardEvent): void {
  if (dialogState.visible || settingsVisible.value) return

  const key = event.key.toLowerCase()
  const ctrl = event.ctrlKey || event.metaKey

  if (ctrl && key === 's') {
    event.preventDefault()
    void handleShortcut('save')
    return
  }

  if (ctrl && key === 'w') {
    event.preventDefault()
    void handleShortcut('close-tab')
    return
  }

  if (ctrl && key === 'o') {
    event.preventDefault()
    void handleShortcut('add-project')
    return
  }

  if (key === 'f2' && !isEditingTarget(event.target)) {
    event.preventDefault()
    void handleShortcut('rename-selected')
    return
  }

  if (key === 'delete' && !isEditingTarget(event.target)) {
    event.preventDefault()
    void handleShortcut('delete-selected')
    return
  }

  if (ctrl && event.shiftKey && key === 'c' && !isEditingTarget(event.target)) {
    event.preventDefault()
    void handleShortcut('copy-selected-absolute-path')
  }
}

async function handleBeforeUnload(event: BeforeUnloadEvent): Promise<void> {
  if (allowWindowClose.value) return

  const hasDirtyTabs = editorState.tabs.some(isTabDirty)
  if (!hasDirtyTabs) {
    void persistConfig()
    return
  }

  event.preventDefault()
  event.returnValue = ''

  if (closeInProgress.value) return
  closeInProgress.value = true

  const confirmed = await confirmAllDirty(requestUnsavedChoice)
  if (confirmed) {
    await persistConfig()
    allowWindowClose.value = true
    await closeCurrentWindow()
  } else {
    closeInProgress.value = false
  }
}

async function handleTauriClose(event: { preventDefault: () => void }): Promise<void> {
  if (allowWindowClose.value) {
    await persistConfig()
    return
  }

  const hasDirtyTabs = editorState.tabs.some(isTabDirty)
  if (!hasDirtyTabs) {
    await persistConfig()
    return
  }

  event.preventDefault()
  if (closeInProgress.value) return
  closeInProgress.value = true

  const confirmed = await confirmAllDirty(requestUnsavedChoice)
  if (confirmed) {
    await persistConfig()
    allowWindowClose.value = true
    await closeCurrentWindow()
  } else {
    closeInProgress.value = false
  }
}

watch(
  () => projectState.notice,
  (message) => showNotice(message)
)

watch(
  () => editorState.notice,
  (message) => showNotice(message)
)

onMounted(async () => {
  const config = await loadProjectConfig()
  await restoreOpenedFiles(projectState.projects, config.openedFiles, config.activeFilePath)
  if (hasTauriRuntime()) {
    removeCloseListener = await getCurrentWindow().onCloseRequested((event) => {
      void handleTauriClose(event)
    })
  }
  window.addEventListener('keydown', handleRendererKeydown)
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  removeCloseListener?.()
  window.removeEventListener('keydown', handleRendererKeydown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('mousemove', handleSidebarResize)
  window.removeEventListener('mouseup', stopSidebarResize)
})
</script>
