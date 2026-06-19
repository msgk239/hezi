<template>
  <article class="markdown-preview" v-html="html" />
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'

const props = defineProps<{
  content: string
}>()

const renderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false
})

function normalizeMarkdownForPreview(content: string): string {
  let inFence = false

  return content
    .split(/\r?\n/)
    .map((line) => {
      if (/^[\s\u00a0\u3000\u200b\ufeff]*(```|~~~)/.test(line)) {
        inFence = !inFence
        return line
      }

      if (inFence) return line

      return line.replace(
        /^[\s\u00a0\u3000\u200b\ufeff]*(#{1,6}|＃{1,6})[\s\u00a0\u3000]*(.+)$/u,
        (_match, marks: string, text: string) => `${marks.replace(/＃/g, '#')} ${text.trimStart()}`
      )
    })
    .join('\n')
}

const html = computed(() => renderer.render(normalizeMarkdownForPreview(props.content)))
</script>
