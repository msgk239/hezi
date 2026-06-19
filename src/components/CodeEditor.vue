<template>
  <div ref="containerRef" class="code-editor-host" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'

const props = defineProps<{
  modelValue: string
  language: string
  fontSize: number
  filePath: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let editor: EditorView | null = null
let applyingExternalValue = false

function languageExtension(language: string): Extension[] {
  if (language === 'json') return [json()]
  if (language === 'javascript') return [javascript({ jsx: true })]
  if (language === 'typescript') return [javascript({ typescript: true, jsx: true })]
  if (language === 'html') return [html()]
  if (language === 'css' || language === 'scss' || language === 'less') return [css()]
  if (language === 'markdown') return [markdown()]
  if (language === 'python') return [python()]
  if (language === 'yaml') return [yaml()]
  if (language === 'xml') return [xml()]
  if (language === 'sql') return [sql()]
  return []
}

function buildExtensions(): Extension[] {
  return [
    keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          emit('save')
          return true
        }
      },
      indentWithTab
    ]),
    basicSetup,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || applyingExternalValue) return
      emit('update:modelValue', update.state.doc.toString())
    }),
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: `${props.fontSize}px`
      },
      '.cm-scroller': {
        fontFamily:
          'Consolas, "Cascadia Code", "JetBrains Mono", "Microsoft YaHei UI", monospace'
      },
      '.cm-content': {
        minHeight: '100%',
        paddingTop: '12px'
      },
      '.cm-gutters': {
        backgroundColor: '#f8fafc',
        borderRight: '1px solid #e5e7eb',
        color: '#94a3b8'
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#eaf1ff'
      }
    }),
    ...languageExtension(props.language)
  ]
}

function createState(content: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: buildExtensions()
  })
}

function rebuildEditor(): void {
  if (!editor) return
  const content = editor.state.doc.toString()
  editor.setState(createState(content))
}

onMounted(() => {
  if (!containerRef.value) return
  editor = new EditorView({
    state: createState(props.modelValue),
    parent: containerRef.value
  })
})

watch(
  () => props.modelValue,
  (value) => {
    if (!editor || editor.state.doc.toString() === value) return
    applyingExternalValue = true
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: value
      }
    })
    applyingExternalValue = false
  }
)

watch(
  () => [props.language, props.fontSize, props.filePath],
  () => rebuildEditor()
)

onBeforeUnmount(() => {
  editor?.destroy()
  editor = null
})
</script>
