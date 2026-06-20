<template>
  <div ref="tabsRef" class="editor-tabs" @wheel="handleWheel">
    <button
      v-for="tab in tabs"
      :key="tab.path"
      class="editor-tab"
      :class="{ active: tab.path === activePath, dirty: isDirty(tab) }"
      type="button"
      :title="tab.path"
      @click="$emit('select', tab.path)"
      @contextmenu.prevent="$emit('context-menu', { path: tab.path, x: $event.clientX, y: $event.clientY })"
    >
      <span class="tab-name">{{ tab.name }}</span>
      <span v-if="isDirty(tab)" class="dirty-mark">*</span>
      <span class="tab-close" title="关闭" @click.stop="$emit('close', tab.path)">×</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { EditorTab } from '@/types'

defineProps<{
  tabs: EditorTab[]
  activePath: string
}>()

defineEmits<{
  select: [path: string]
  close: [path: string]
  'context-menu': [payload: { path: string; x: number; y: number }]
}>()

const tabsRef = ref<HTMLDivElement | null>(null)

function isDirty(tab: EditorTab): boolean {
  return tab.kind === 'text' && tab.content !== tab.savedContent
}

function handleWheel(event: WheelEvent): void {
  const element = tabsRef.value
  if (!element || element.scrollWidth <= element.clientWidth) return

  const horizontalDelta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (horizontalDelta === 0) return

  element.scrollLeft += horizontalDelta
  event.preventDefault()
}
</script>
