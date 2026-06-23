<template>
  <div
    v-if="visible"
    ref="menuRef"
    class="context-menu"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
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
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ContextMenuItem } from '@/types'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}>()

defineEmits<{
  select: [id: string]
}>()

const VIEWPORT_MARGIN = 8

const menuRef = ref<HTMLElement | null>(null)
const position = reactive({
  x: 0,
  y: 0
})

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

async function updatePosition(): Promise<void> {
  if (!props.visible) return

  position.x = props.x
  position.y = props.y

  await nextTick()

  const menu = menuRef.value
  if (!menu) return

  const rect = menu.getBoundingClientRect()
  const maxX = window.innerWidth - rect.width - VIEWPORT_MARGIN
  const maxY = window.innerHeight - rect.height - VIEWPORT_MARGIN

  position.x = clamp(props.x, VIEWPORT_MARGIN, maxX)
  position.y = clamp(props.y, VIEWPORT_MARGIN, maxY)
}

function handleResize(): void {
  void updatePosition()
}

watch(
  () => [props.visible, props.x, props.y, props.items.length],
  () => {
    void updatePosition()
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>
