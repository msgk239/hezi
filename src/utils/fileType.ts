import { baseName, extensionName } from './path'

const SUPPORTED_TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.vue',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.yml',
  '.yaml',
  '.py',
  '.go',
  '.rs',
  '.php',
  '.java',
  '.xml',
  '.sql'
])

export function isSupportedTextFile(path: string): boolean {
  const name = baseName(path).toLowerCase()
  if (name === '.env' || name.startsWith('.env.')) return true
  return SUPPORTED_TEXT_EXTENSIONS.has(extensionName(path))
}

export function getLanguageFromPath(path: string): string {
  const name = baseName(path).toLowerCase()
  const ext = extensionName(path)

  if (name === '.env' || name.startsWith('.env.')) return 'plaintext'

  const map: Record<string, string> = {
    '.txt': 'plaintext',
    '.md': 'markdown',
    '.json': 'json',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.vue': 'html',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.java': 'java',
    '.xml': 'xml',
    '.sql': 'sql'
  }

  return map[ext] || 'plaintext'
}
