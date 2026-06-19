<template>
  <div
    v-if="visible"
    class="context-menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @contextmenu.prevent
  >
    <template v-for="item in items" :key="item.id">
      <div v-if="item.separator" class="context-separator" />
      <button
        v-else
        class="context-item"
        :class="{ danger: item.danger }"
        :disabled="item.disabled"
        type="button"
        @click="$emit('select', item.id)"
      >
        {{ item.label }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ContextMenuItem } from '@/types'

defineProps<{
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}>()

defineEmits<{
  select: [id: string]
}>()
</script>
