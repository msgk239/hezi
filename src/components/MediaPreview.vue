<template>
  <div class="media-preview">
    <div class="media-preview-toolbar">
      <div class="media-preview-title">
        <span>{{ tab.kind === 'image' ? '图片预览' : '音频播放' }}</span>
        <strong :title="tab.path">{{ tab.name }}</strong>
      </div>
      <div class="media-preview-actions">
        <button
          v-if="tab.kind === 'image'"
          class="mode-button"
          :class="{ active: imageMode === 'fit' }"
          type="button"
          @click="imageMode = 'fit'"
        >
          适合窗口
        </button>
        <button
          v-if="tab.kind === 'image'"
          class="mode-button"
          :class="{ active: imageMode === 'actual' }"
          type="button"
          @click="imageMode = 'actual'"
        >
          原始大小
        </button>
        <button class="mode-button" type="button" @click="$emit('open-default', tab.path)">
          默认应用
        </button>
      </div>
    </div>

    <div v-if="loadFailed || !mediaSrc" class="media-preview-error">
      <div class="empty-title">无法加载该媒体文件</div>
      <div class="empty-text">可以尝试使用系统默认应用打开。</div>
      <div class="media-debug-text" :title="tab.path">{{ tab.path }}</div>
      <div v-if="mediaSrc" class="media-debug-text">{{ mediaSrcPreview }}</div>
      <button class="top-button primary" type="button" @click="$emit('open-default', tab.path)">
        用默认应用打开
      </button>
    </div>

    <div v-else-if="tab.kind === 'image'" class="image-preview-stage">
      <img
        class="image-preview"
        :class="{ actual: imageMode === 'actual' }"
        :src="mediaSrc"
        :alt="tab.name"
        @error="loadFailed = true"
      />
    </div>

    <div v-else class="audio-preview-stage">
      <div class="audio-preview-panel">
        <div class="audio-file-name" :title="tab.path">{{ tab.name }}</div>
        <audio :src="mediaSrc" controls preload="metadata" @error="loadFailed = true" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { EditorTab } from '@/types'

const props = defineProps<{
  tab: EditorTab
}>()

defineEmits<{
  'open-default': [path: string]
}>()

const imageMode = ref<'fit' | 'actual'>('fit')
const loadFailed = ref(false)
const mediaSrc = computed(() => props.tab.mediaSrc || '')
const mediaSrcPreview = computed(() =>
  mediaSrc.value.startsWith('data:')
    ? `${mediaSrc.value.slice(0, 80)}...`
    : mediaSrc.value
)

watch(
  () => props.tab.path,
  () => {
    imageMode.value = 'fit'
    loadFailed.value = false
  }
)
</script>
