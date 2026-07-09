import { baseName, extensionName } from './path'
import type { EditorTabKind } from '@/types'

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.avif',
  '.ico'
])

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.ogg',
  '.oga',
  '.flac',
  '.m4a',
  '.aac',
  '.opus',
  '.webm'
])

const DEFAULT_APP_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.mov',
  '.mkv',
  '.avi',
  '.wmv',
  '.flv',
  '.webm',
  '.mpeg',
  '.mpg',
  '.3gp',
  '.3g2',
  '.ts',
  '.mts',
  '.m2ts'
])

export function isSupportedTextFile(path: string): boolean {
  return !isSupportedImageFile(path) && !isSupportedAudioFile(path) && !isDefaultAppVideoFile(path)
}

export function isSupportedImageFile(path: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.has(extensionName(path))
}

export function isSupportedAudioFile(path: string): boolean {
  return SUPPORTED_AUDIO_EXTENSIONS.has(extensionName(path))
}

export function isDefaultAppVideoFile(path: string): boolean {
  return DEFAULT_APP_VIDEO_EXTENSIONS.has(extensionName(path))
}

export function getSupportedFileKind(path: string): EditorTabKind {
  if (isSupportedImageFile(path)) return 'image'
  if (isSupportedAudioFile(path)) return 'audio'
  return 'text'
}

export function getMediaMimeType(path: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.opus': 'audio/ogg',
    '.webm': 'audio/webm'
  }

  return map[extensionName(path)] || 'application/octet-stream'
}

export function getLanguageFromPath(path: string): string {
  const name = baseName(path).toLowerCase()
  const ext = extensionName(path)

  if (name === '.env' || name.startsWith('.env.')) return 'dotenv'
  if (name === '.gitignore' || name === '.gitkeep') return 'ignore'
  if (name === '.gitattributes') return 'properties'
  if (name === '.editorconfig' || name === '.gitconfig') return 'properties'
  if (name === '.python-version') return 'plaintext-config'
  if (name === 'uv.lock') return 'toml'

  const map: Record<string, string> = {
    '.txt': 'plaintext',
    '.md': 'markdown',
    '.json': 'json',
    '.jsonc': 'json',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
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
    '.toml': 'toml',
    '.lock': 'plaintext-config',
    '.ini': 'properties',
    '.cfg': 'properties',
    '.conf': 'properties',
    '.properties': 'properties',
    '.csv': 'plaintext',
    '.tsv': 'plaintext',
    '.log': 'plaintext',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.java': 'java',
    '.kt': 'plaintext',
    '.kts': 'plaintext',
    '.c': 'plaintext',
    '.h': 'plaintext',
    '.cpp': 'plaintext',
    '.cc': 'plaintext',
    '.cxx': 'plaintext',
    '.hpp': 'plaintext',
    '.cs': 'plaintext',
    '.swift': 'plaintext',
    '.dart': 'plaintext',
    '.lua': 'plaintext',
    '.rb': 'plaintext',
    '.pl': 'plaintext',
    '.pm': 'plaintext',
    '.r': 'plaintext',
    '.sh': 'plaintext',
    '.bash': 'plaintext',
    '.zsh': 'plaintext',
    '.fish': 'plaintext',
    '.bat': 'plaintext',
    '.cmd': 'plaintext',
    '.ps1': 'plaintext',
    '.psm1': 'plaintext',
    '.psd1': 'plaintext',
    '.xml': 'xml',
    '.sql': 'sql',
    '.gradle': 'plaintext-config',
    '.editorconfig': 'properties',
    '.gitconfig': 'properties'
  }

  return map[ext] || 'plaintext'
}
