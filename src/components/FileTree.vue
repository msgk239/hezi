<template>
  <div class="tree-node">
    <button
      class="tree-row"
      :class="{ selected: selectedPath === node.path, root: node.isProjectRoot }"
      :style="{ paddingLeft: `${10 + level * 16}px` }"
      type="button"
      :title="node.path"
      @click="handleClick"
      @contextmenu.prevent="handleContextMenu"
    >
      <span class="tree-caret" :class="{ invisible: node.type === 'file' }">
        {{ node.expanded ? '▾' : '▸' }}
      </span>
      <span class="tree-icon">{{ node.type === 'directory' ? '📁' : '📄' }}</span>
      <span class="tree-name">{{ node.name }}</span>
      <span v-if="node.loading" class="tree-loading">读取中</span>
    </button>

    <div v-if="node.error" class="tree-error" :style="{ paddingLeft: `${34 + level * 16}px` }">
      {{ node.error }}
    </div>

    <div v-if="node.type === 'directory' && node.expanded" class="tree-children">
      <div v-if="node.loaded && node.children?.length === 0" class="tree-empty" :style="{ paddingLeft: `${34 + level * 16}px` }">
        空文件夹
      </div>
      <FileTree
        v-for="child in sortedChildren"
        :key="child.path"
        :node="child"
        :level="level + 1"
        :selected-path="selectedPath"
        :refresh-key="refreshKey"
        :get-sort-mode="getSortMode"
        @open-file="$emit('open-file', $event)"
        @select-entry="$emit('select-entry', $event)"
        @context-menu="$emit('context-menu', $event)"
        @expanded-change="$emit('expanded-change', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import type { DirectoryEntry, FileSortMode, SelectedEntry, TreeNode } from '@/types'
import { shouldDirectoryStartExpanded } from '@/stores/projectStore'
import { sortFileEntries } from '@/utils/fileSort'
import { nativeApi } from '@/utils/nativeApi'

const props = defineProps<{
  node: TreeNode
  level: number
  selectedPath: string
  refreshKey: number
  getSortMode: (path: string) => FileSortMode
}>()

const emit = defineEmits<{
  'open-file': [entry: SelectedEntry]
  'select-entry': [entry: SelectedEntry]
  'context-menu': [payload: { entry: SelectedEntry; x: number; y: number }]
  'expanded-change': [payload: { path: string; expanded: boolean }]
}>()

const sortedChildren = computed(() => sortFileEntries(props.node.children ?? [], props.getSortMode(props.node.path)))

let disposed = false
let loadInProgress = false
let refreshQueued = false

function toSelectedEntry(): SelectedEntry {
  return {
    name: props.node.name,
    path: props.node.path,
    type: props.node.type,
    projectId: props.node.projectId,
    projectRoot: props.node.projectRoot,
    isProjectRoot: props.node.isProjectRoot
  }
}

function normalizeNodePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function createTreeNode(entry: DirectoryEntry): TreeNode {
  return {
    ...entry,
    projectId: props.node.projectId,
    projectRoot: props.node.projectRoot,
    expanded: shouldDirectoryStartExpanded(entry.path, false),
    loaded: false,
    loading: false,
    children: []
  }
}

function reconcileChildren(entries: DirectoryEntry[]): TreeNode[] {
  const existingByPath = new Map(
    (props.node.children ?? []).map((child) => [normalizeNodePath(child.path), child])
  )

  return entries.map((entry) => {
    const existing = existingByPath.get(normalizeNodePath(entry.path))
    if (!existing || existing.type !== entry.type) return createTreeNode(entry)

    existing.name = entry.name
    existing.path = entry.path
    existing.size = entry.size
    existing.createdAt = entry.createdAt
    existing.modifiedAt = entry.modifiedAt
    existing.projectId = props.node.projectId
    existing.projectRoot = props.node.projectRoot
    return existing
  })
}

async function loadChildren(force = false): Promise<void> {
  if (props.node.type !== 'directory' || (!force && props.node.loaded)) return

  if (loadInProgress) {
    if (force) refreshQueued = true
    return
  }

  loadInProgress = true
  const initialLoad = !props.node.loaded
  if (initialLoad) props.node.loading = true
  props.node.error = ''
  const requestedPath = props.node.path
  const result = await nativeApi.file.readDir(requestedPath)
  loadInProgress = false
  if (initialLoad) props.node.loading = false

  if (disposed || normalizeNodePath(props.node.path) !== normalizeNodePath(requestedPath)) return

  if (!result.ok) {
    props.node.error = result.error
  } else {
    props.node.children = reconcileChildren(result.data)
    props.node.loaded = true
  }

  if (!refreshQueued) return

  refreshQueued = false
  if (props.node.expanded) {
    await loadChildren(true)
  } else {
    props.node.loaded = false
  }
}

async function toggleDirectory(): Promise<void> {
  if (props.node.type !== 'directory') return

  props.node.expanded = !props.node.expanded
  emit('expanded-change', {
    path: props.node.path,
    expanded: Boolean(props.node.expanded)
  })

  if (props.node.expanded) await loadChildren(true)
}

async function handleClick(): Promise<void> {
  const entry = toSelectedEntry()
  emit('select-entry', entry)

  if (props.node.type === 'directory') {
    await toggleDirectory()
    return
  }

  emit('open-file', entry)
}

function handleContextMenu(event: MouseEvent): void {
  const entry = toSelectedEntry()
  emit('select-entry', entry)
  emit('context-menu', {
    entry,
    x: event.clientX,
    y: event.clientY
  })
}

onMounted(() => {
  if (props.node.type === 'directory' && props.node.expanded) {
    void loadChildren()
  }
})

onBeforeUnmount(() => {
  disposed = true
})

watch(
  () => props.refreshKey,
  () => {
    if (props.node.type !== 'directory') return
    props.node.error = ''
    if (props.node.expanded) {
      void loadChildren(true)
    } else {
      props.node.loaded = false
    }
  }
)
</script>
