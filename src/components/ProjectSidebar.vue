<template>
  <aside class="project-sidebar" :style="{ width: `${width}px` }">
    <div class="sidebar-title">常用项目</div>
    <div v-if="projects.length === 0" class="sidebar-empty">
      点击顶部“添加项目”开始。
    </div>

    <div v-else class="project-tree-list">
      <FileTree
        v-for="root in rootNodes"
        :key="`${root.projectId}-${refreshKey}`"
        :node="root"
        :level="0"
        :selected-path="selectedPath"
        :refresh-key="refreshKey"
        @open-file="$emit('open-file', $event)"
        @select-entry="$emit('select-entry', $event)"
        @context-menu="$emit('context-menu', $event)"
        @expanded-change="$emit('expanded-change', $event)"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import FileTree from './FileTree.vue'
import type { ProjectItem, SelectedEntry, TreeNode } from '@/types'
import { shouldDirectoryStartExpanded } from '@/stores/projectStore'

const props = defineProps<{
  projects: ProjectItem[]
  selectedPath: string
  width: number
  refreshKey: number
}>()

defineEmits<{
  'open-file': [entry: SelectedEntry]
  'select-entry': [entry: SelectedEntry]
  'context-menu': [payload: { entry: SelectedEntry; x: number; y: number }]
  'expanded-change': [payload: { path: string; expanded: boolean }]
}>()

const rootNodes = ref<TreeNode[]>([])

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

watch(
  () => [
    props.refreshKey,
    props.projects.map((project) => `${project.id}:${project.name}:${project.path}`).join('|')
  ],
  rebuildRoots,
  { immediate: true }
)
</script>
