<template>
  <div class="editor-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.path"
      class="editor-tab"
      :class="{ active: tab.path === activePath, dirty: isDirty(tab) }"
      type="button"
      :title="tab.path"
      @click="$emit('select', tab.path)"
    >
      <span class="tab-name">{{ tab.name }}</span>
      <span v-if="isDirty(tab)" class="dirty-mark">*</span>
      <span class="tab-close" title="关闭" @click.stop="$emit('close', tab.path)">×</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { EditorTab } from '@/types'

defineProps<{
  tabs: EditorTab[]
  activePath: string
}>()

defineEmits<{
  select: [path: string]
  close: [path: string]
}>()

function isDirty(tab: EditorTab): boolean {
  return tab.content !== tab.savedContent
}
</script>
