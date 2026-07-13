<template>
  <aside class="project-sidebar" :style="{ width: `${width}px` }">
    <nav class="sidebar-activity" aria-label="侧边栏">
      <button
        class="activity-button"
        :class="{ active: sidebarView === 'files' }"
        type="button"
        title="文件"
        @click="setSidebarView('files')"
      >
        <svg class="activity-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 6.5h6.1l1.7 2h9.2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11Z" />
          <path d="M3.5 8.5h17" />
        </svg>
      </button>
      <button
        class="activity-button"
        :class="{ active: sidebarView === 'search' }"
        type="button"
        title="搜索"
        @click="setSidebarView('search')"
      >
        <svg class="activity-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="m15 15 5 5" />
        </svg>
      </button>
      <button
        class="activity-button"
        :class="{ active: sidebarView === 'jump' }"
        type="button"
        title="路径"
        @click="setSidebarView('jump')"
      >
        <svg class="activity-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h14" />
          <path d="m14 8 4 4-4 4" />
          <path d="M5 5h5" />
          <path d="M5 19h5" />
        </svg>
      </button>
    </nav>

    <div class="sidebar-panel">
      <template v-if="sidebarView === 'search'">
        <div class="sidebar-title">搜索</div>

        <div v-if="projects.length === 0" class="sidebar-empty">
          点击顶部“添加项目”开始。
        </div>

        <template v-else>
          <div class="sidebar-tools search-view-tools">
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              class="sidebar-input"
              type="search"
              placeholder="搜索文件名或路径"
              @keydown.enter="runSearch"
            />

            <select v-model="searchScope" class="sidebar-select" title="搜索范围">
              <option value="all">全部项目</option>
              <option v-if="selectedFolderScope" value="folder">
                文件夹：{{ selectedFolderScope.label }}
              </option>
              <option v-for="project in projects" :key="project.id" :value="`project:${project.id}`">
                项目：{{ project.name }}
              </option>
            </select>

            <select class="sidebar-select" :value="sortMode" title="排序" @change="handleSortModeChange">
              <option value="name-asc">全局：名称</option>
              <option value="modified-desc">全局：最新时间</option>
              <option value="modified-asc">全局：最早时间</option>
            </select>

            <div class="sidebar-tool-row">
              <button class="sidebar-button primary" type="button" :disabled="!canRunSearch" @click="runSearch">
                搜索
              </button>
              <button class="sidebar-button" type="button" :disabled="!canClearSearch" @click="clearSearch">
                清除
              </button>
            </div>

            <div v-if="searchError" class="sidebar-search-error">{{ searchError }}</div>
          </div>

          <div v-if="isSearchMode" class="search-results">
            <div class="search-results-head">
              <span>搜索结果</span>
              <span v-if="searchResults.length > 0" class="search-count">{{ searchResults.length }}</span>
            </div>

            <div v-if="searching" class="tree-empty search-empty">搜索中</div>
            <div v-else-if="searchResults.length === 0" class="tree-empty search-empty">未找到匹配文件</div>

            <button
              v-for="result in searchResults"
              :key="`${result.projectId}-${result.path}`"
              class="search-result-row"
              :class="{ selected: selectedPath === result.path }"
              type="button"
              :title="result.path"
              @click="handleSearchResultClick(result)"
              @contextmenu.prevent="handleSearchResultContextMenu(result, $event)"
            >
              <span class="tree-icon">{{ result.type === 'directory' ? '📁' : '📄' }}</span>
              <span class="search-result-main">
                <span class="search-result-name">{{ result.name }}</span>
                <span class="search-result-path">{{ result.projectName }} / {{ result.relativePath }}</span>
              </span>
              <span class="search-result-time">{{ formatModifiedAt(result.modifiedAt) }}</span>
            </button>

            <div v-if="searchLimitReached" class="tree-empty search-empty">
              已显示前 {{ maxSearchResults }} 条，缩小关键词可继续查找。
            </div>
          </div>
        </template>
      </template>

      <template v-else-if="sidebarView === 'jump'">
        <div class="sidebar-title">路径</div>

        <div v-if="projects.length === 0" class="sidebar-empty">
          点击顶部“添加项目”开始。
        </div>

        <template v-else>
          <div class="sidebar-tools path-jump-tools">
            <input
              ref="pathJumpInputRef"
              v-model="pathJumpValue"
              class="sidebar-input"
              type="text"
              placeholder="D:\project\src\app.ts"
              @keydown.enter="runPathJump"
            />

            <div class="sidebar-tool-row">
              <button class="sidebar-button primary" type="button" :disabled="!canRunPathJump" @click="runPathJump">
                跳转
              </button>
              <button class="sidebar-button" type="button" :disabled="!pathJumpValue" @click="clearPathJump">
                清除
              </button>
            </div>

            <div v-if="pathJumpError" class="sidebar-search-error">{{ pathJumpError }}</div>
          </div>
        </template>
      </template>

      <template v-else>
        <div v-if="projects.length === 0" class="sidebar-empty">
          点击顶部“添加项目”开始。
        </div>

        <template v-else>
          <div class="project-tree-list">
            <FileTree
              v-for="root in rootNodes"
              :key="`${root.projectId}-${refreshKey}`"
              :node="root"
              :level="0"
              :selected-path="selectedPath"
              :refresh-key="refreshKey"
              :get-sort-mode="getFolderSortModeForPath"
              :get-directory-refresh-version="getDirectoryRefreshVersion"
              @open-file="$emit('open-file', $event)"
              @select-entry="$emit('select-entry', $event)"
              @context-menu="$emit('context-menu', $event)"
              @expanded-change="$emit('expanded-change', $event)"
            />
          </div>
        </template>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import FileTree from './FileTree.vue'
import type {
  DirectoryEntry,
  FileSortMode,
  ProjectItem,
  SelectedEntry,
  TreeNode
} from '@/types'
import { shouldDirectoryStartExpanded } from '@/stores/projectStore'
import { sortFileEntries } from '@/utils/fileSort'
import { baseName, dirName, isAbsolutePath, isSameOrChildPath, normalizeSlashes } from '@/utils/path'
import { nativeApi } from '@/utils/nativeApi'

const props = defineProps<{
  projects: ProjectItem[]
  selectedPath: string
  selectedEntry: SelectedEntry | null
  width: number
  refreshKey: number
  sortMode: FileSortMode
  folderSortModes: Record<string, FileSortMode>
  getDirectoryRefreshVersion: (path: string) => number
}>()

const emit = defineEmits<{
  'open-file': [entry: SelectedEntry]
  'select-entry': [entry: SelectedEntry]
  'context-menu': [payload: { entry: SelectedEntry; x: number; y: number }]
  'expanded-change': [payload: { path: string; expanded: boolean }]
  'sort-mode-change': [mode: FileSortMode]
  'jump-to-entry': [entry: SelectedEntry]
}>()

interface SearchRoot {
  project: ProjectItem
  rootPath: string
  label: string
}

interface SearchResult extends SelectedEntry {
  projectName: string
  relativePath: string
  size?: number
  createdAt?: number
  modifiedAt?: number
}

interface SearchContext {
  runId: number
  query: string
  results: SearchResult[]
  errors: string[]
  directoriesVisited: number
  limitReached: boolean
}

type SidebarView = 'files' | 'search' | 'jump'

const MAX_SEARCH_RESULTS = 300
const MAX_SEARCH_DIRECTORIES = 1500
const MAX_SEARCH_DEPTH = 40

const rootNodes = ref<TreeNode[]>([])
const sidebarView = ref<SidebarView>('files')
const searchInputRef = ref<HTMLInputElement | null>(null)
const pathJumpInputRef = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const searchScope = ref('all')
const searching = ref(false)
const searchSearched = ref(false)
const searchResults = ref<SearchResult[]>([])
const searchError = ref('')
const searchLimitReached = ref(false)
const pathJumpValue = ref('')
const pathJumpError = ref('')
const pathJumping = ref(false)
let searchRunId = 0

const maxSearchResults = MAX_SEARCH_RESULTS

const selectedFolderScope = computed<SearchRoot | null>(() => {
  const entry = props.selectedEntry
  if (!entry) return null

  const project = props.projects.find((item) => item.id === entry.projectId)
  if (!project) return null

  const rootPath = entry.type === 'directory' ? entry.path : dirName(entry.path)
  return {
    project,
    rootPath,
    label: entry.type === 'directory' ? entry.name : baseName(rootPath)
  }
})

const canRunSearch = computed(() => Boolean(searchQuery.value.trim()) && !searching.value)
const canClearSearch = computed(() => Boolean(searchQuery.value.trim()) || isSearchMode.value)
const isSearchMode = computed(() => searchSearched.value || searching.value)
const canRunPathJump = computed(() => Boolean(cleanPathJumpInput(pathJumpValue.value)) && !pathJumping.value)

async function setSidebarView(view: SidebarView): Promise<void> {
  sidebarView.value = view
  await nextTick()
  if (view === 'search') searchInputRef.value?.focus()
  if (view === 'jump') pathJumpInputRef.value?.focus()
}

function rebuildRoots(): void {
  rootNodes.value = props.projects.map((project) => ({
    name: project.name,
    path: project.path,
    type: 'directory',
    projectId: project.id,
    projectRoot: project.path,
    isProjectRoot: true,
    expanded: shouldDirectoryStartExpanded(project.path, true),
    loaded: false,
    loading: false,
    children: []
  }))
}

function resetSearchState(): void {
  searchRunId += 1
  searching.value = false
  searchSearched.value = false
  searchResults.value = []
  searchError.value = ''
  searchLimitReached.value = false
}

function clearSearch(): void {
  searchQuery.value = ''
  resetSearchState()
}

function cleanPathJumpInput(input: string): string {
  let value = input.trim()
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))

  if (quoted) value = value.slice(1, -1).trim()
  return value
}

function clearPathJump(): void {
  pathJumpValue.value = ''
  pathJumpError.value = ''
}

function findProjectForPath(path: string): ProjectItem | null {
  return props.projects.find((project) => isSameOrChildPath(project.path, path)) ?? null
}

function isProjectRootPath(project: ProjectItem, path: string): boolean {
  return normalizePathKey(project.path) === normalizePathKey(path)
}

async function runPathJump(): Promise<void> {
  const path = cleanPathJumpInput(pathJumpValue.value)
  if (!path || pathJumping.value) return

  if (!isAbsolutePath(path)) {
    pathJumpError.value = '请输入绝对路径。'
    return
  }

  const project = findProjectForPath(path)
  if (!project) {
    pathJumpError.value = '路径不在已添加项目中。'
    return
  }

  pathJumping.value = true
  pathJumpError.value = ''
  const result = await nativeApi.file.getPathInfo(path)
  pathJumping.value = false

  if (!result.ok) {
    pathJumpError.value = result.error
    return
  }

  const pathInfo = result.data
  if (!pathInfo.exists || (pathInfo.type !== 'file' && pathInfo.type !== 'directory')) {
    pathJumpError.value = '路径不存在。'
    return
  }

  emit('jump-to-entry', {
    name: pathInfo.name || baseName(pathInfo.path),
    path: pathInfo.path,
    type: pathInfo.type,
    projectId: project.id,
    projectRoot: project.path,
    isProjectRoot: isProjectRootPath(project, pathInfo.path)
  })
  sidebarView.value = 'files'
}

function handleSortModeChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  emit('sort-mode-change', target.value as FileSortMode)
}

function normalizePathKey(path: string): string {
  return normalizeSlashes(path).replace(/\/+$/, '').toLowerCase()
}

function getFolderSortModeForPath(path: string): FileSortMode {
  return props.folderSortModes[normalizePathKey(path)] || props.sortMode
}

function normalizeSearchQuery(input: string): string {
  return input.trim().toLowerCase()
}

function relativePathFromRoot(rootPath: string, targetPath: string): string {
  const root = normalizeSlashes(rootPath).replace(/\/+$/, '').toLowerCase()
  const target = normalizeSlashes(targetPath)
  const targetKey = target.toLowerCase()

  if (targetKey === root) return baseName(targetPath)
  if (targetKey.startsWith(`${root}/`)) return target.slice(root.length + 1)
  return target
}

function matchesSearch(entry: DirectoryEntry, relativePaths: string[], query: string): boolean {
  return `${entry.name} ${relativePaths.join(' ')}`.toLowerCase().includes(query)
}

function getSearchRoots(): SearchRoot[] {
  if (searchScope.value === 'folder' && selectedFolderScope.value) {
    return [selectedFolderScope.value]
  }

  if (searchScope.value.startsWith('project:')) {
    const projectId = searchScope.value.slice('project:'.length)
    const project = props.projects.find((item) => item.id === projectId)
    return project ? [{ project, rootPath: project.path, label: project.name }] : []
  }

  return props.projects.map((project) => ({
    project,
    rootPath: project.path,
    label: project.name
  }))
}

function toSearchResult(project: ProjectItem, entry: DirectoryEntry): SearchResult {
  return {
    name: entry.name,
    path: entry.path,
    type: entry.type,
    projectId: project.id,
    projectRoot: project.path,
    projectName: project.name,
    relativePath: relativePathFromRoot(project.path, entry.path),
    size: entry.size,
    createdAt: entry.createdAt,
    modifiedAt: entry.modifiedAt
  }
}

async function searchDirectory(root: SearchRoot, dirPath: string, context: SearchContext, depth = 0): Promise<void> {
  if (context.runId !== searchRunId || context.limitReached) return

  if (depth > MAX_SEARCH_DEPTH || context.directoriesVisited >= MAX_SEARCH_DIRECTORIES) {
    context.limitReached = true
    return
  }

  context.directoriesVisited += 1
  const result = await nativeApi.file.readDir(dirPath)
  if (context.runId !== searchRunId) return

  if (!result.ok) {
    if (depth === 0) context.errors.push(`${root.label}：${result.error}`)
    return
  }

  for (const entry of sortFileEntries(result.data, props.sortMode)) {
    if (context.runId !== searchRunId || context.limitReached) return

    const scopeRelativePath = relativePathFromRoot(root.rootPath, entry.path)
    const projectRelativePath = relativePathFromRoot(root.project.path, entry.path)
    if (matchesSearch(entry, [scopeRelativePath, projectRelativePath], context.query)) {
      context.results.push(toSearchResult(root.project, entry))
      if (context.results.length >= MAX_SEARCH_RESULTS) {
        context.limitReached = true
        return
      }
    }

    if (entry.type === 'directory') {
      await searchDirectory(root, entry.path, context, depth + 1)
    }
  }
}

async function runSearch(): Promise<void> {
  const query = normalizeSearchQuery(searchQuery.value)
  if (!query || searching.value) return

  const roots = getSearchRoots()
  if (roots.length === 0) {
    searchError.value = '没有可搜索的项目或文件夹。'
    return
  }

  const runId = searchRunId + 1
  searchRunId = runId
  searching.value = true
  searchSearched.value = true
  searchResults.value = []
  searchError.value = ''
  searchLimitReached.value = false

  const context: SearchContext = {
    runId,
    query,
    results: [],
    errors: [],
    directoriesVisited: 0,
    limitReached: false
  }

  for (const root of roots) {
    await searchDirectory(root, root.rootPath, context)
    if (context.runId !== searchRunId || context.limitReached) break
  }

  if (context.runId !== searchRunId) return

  searching.value = false
  searchResults.value = sortFileEntries(context.results, props.sortMode)
  searchLimitReached.value = context.limitReached
  searchError.value = context.errors.join('；')
}

function toSelectedEntry(result: SearchResult): SelectedEntry {
  return {
    name: result.name,
    path: result.path,
    type: result.type,
    projectId: result.projectId,
    projectRoot: result.projectRoot
  }
}

function handleSearchResultClick(result: SearchResult): void {
  const entry = toSelectedEntry(result)
  emit('select-entry', entry)
  if (entry.type === 'file') emit('open-file', entry)
}

function handleSearchResultContextMenu(result: SearchResult, event: MouseEvent): void {
  const entry = toSelectedEntry(result)
  emit('select-entry', entry)
  emit('context-menu', {
    entry,
    x: event.clientX,
    y: event.clientY
  })
}

function formatModifiedAt(value?: number): string {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

watch(
  () => [
    props.refreshKey,
    props.projects.map((project) => `${project.id}:${project.name}:${project.path}`).join('|')
  ],
  rebuildRoots,
  { immediate: true }
)

watch(
  () => props.sortMode,
  () => {
    searchResults.value = sortFileEntries(searchResults.value, props.sortMode)
  }
)

watch(searchQuery, (query) => {
  if (!query.trim()) resetSearchState()
})

watch(pathJumpValue, () => {
  pathJumpError.value = ''
})

watch(
  () => [
    props.projects.map((project) => project.id).join('|'),
    selectedFolderScope.value?.rootPath || ''
  ],
  () => {
    if (searchScope.value === 'folder' && !selectedFolderScope.value) searchScope.value = 'all'
    if (searchScope.value.startsWith('project:')) {
      const projectId = searchScope.value.slice('project:'.length)
      if (!props.projects.some((project) => project.id === projectId)) searchScope.value = 'all'
    }
  }
)
</script>
