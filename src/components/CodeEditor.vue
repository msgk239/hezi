<template>
  <div ref="containerRef" class="code-editor-host" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  LanguageDescription,
  StreamLanguage,
  syntaxHighlighting,
  type StringStream
} from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
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
let languageLoadToken = 0

const languageCompartment = new Compartment()

interface ConfigLanguageState {
  inValue: boolean
}

const configLanguage = StreamLanguage.define<ConfigLanguageState>({
  name: 'project-box-config',
  startState: () => ({ inValue: false }),
  token(stream: StringStream, state: ConfigLanguageState): string | null {
    if (stream.sol()) state.inValue = false
    if (stream.eatSpace()) return null

    const next = stream.peek()

    if (next === '#') {
      stream.skipToEnd()
      return 'comment'
    }

    if (!state.inValue && next === '[') {
      stream.next()
      while (!stream.eol() && stream.peek() !== ']') stream.next()
      if (stream.peek() === ']') stream.next()
      return 'tag'
    }

    if (!state.inValue && stream.match(/export\b/)) return 'keyword'

    if (!state.inValue && stream.match(/[A-Za-z0-9_.-]+(?=\s*[:=])/)) {
      return 'propertyName'
    }

    if (next === '=' || next === ':') {
      stream.next()
      state.inValue = true
      return 'operator'
    }

    if (next === '"' || next === "'") {
      const quote = stream.next()
      let escaped = false
      while (!stream.eol()) {
        const char = stream.next()
        if (char === quote && !escaped) break
        escaped = char === '\\' && !escaped
      }
      return 'string'
    }

    if (state.inValue && stream.match(/\b(true|false|null|yes|no|on|off)\b/i)) return 'atom'
    if (state.inValue && stream.match(/[-+]?(?:\d+\.\d+|\d+)/)) return 'number'

    stream.next()
    return null
  }
})

const editorHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: '#64748b', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#7c3aed', fontWeight: '600' },
  { tag: tags.string, color: '#047857' },
  { tag: tags.number, color: '#b45309' },
  { tag: tags.bool, color: '#b45309' },
  { tag: tags.atom, color: '#b45309' },
  { tag: tags.variableName, color: '#0f172a' },
  { tag: tags.definition(tags.variableName), color: '#1d4ed8', fontWeight: '600' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#2563eb' },
  { tag: [tags.className, tags.typeName], color: '#0e7490', fontWeight: '600' },
  { tag: tags.propertyName, color: '#1d4ed8' },
  { tag: tags.tagName, color: '#0e7490', fontWeight: '600' },
  { tag: tags.operator, color: '#dc2626', fontWeight: '600' },
  { tag: tags.invalid, color: '#dc2626' }
])

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

function isConfigLanguage(language: string): boolean {
  return ['dotenv', 'properties', 'toml', 'ignore', 'plaintext-config'].includes(language)
}

async function loadLanguageExtension(filePath: string, language: string): Promise<Extension> {
  if (isConfigLanguage(language)) return configLanguage

  const description = LanguageDescription.matchFilename(languages, fileNameFromPath(filePath))
  if (!description) return []

  try {
    return await description.load()
  } catch {
    return []
  }
}

async function applyLanguageExtension(): Promise<void> {
  const view = editor
  if (!view) return

  const token = ++languageLoadToken
  const extension = await loadLanguageExtension(props.filePath, props.language)
  if (token !== languageLoadToken || editor !== view) return

  view.dispatch({
    effects: languageCompartment.reconfigure(extension)
  })
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
    syntaxHighlighting(editorHighlightStyle),
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
    languageCompartment.of([])
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
  void applyLanguageExtension()
}

onMounted(() => {
  if (!containerRef.value) return
  editor = new EditorView({
    state: createState(props.modelValue),
    parent: containerRef.value
  })
  void applyLanguageExtension()
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
  () => [props.fontSize, props.filePath, props.language],
  () => rebuildEditor()
)

onBeforeUnmount(() => {
  editor?.destroy()
  editor = null
})
</script>
