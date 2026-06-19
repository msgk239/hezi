export function normalizeSlashes(input: string): string {
  return input.replace(/\\/g, '/')
}

export function baseName(input: string): string {
  const normalized = normalizeSlashes(input)
  return normalized.split('/').filter(Boolean).pop() || input
}

export function dirName(input: string): string {
  const separator = input.includes('\\') ? '\\' : '/'
  const parts = input.split(/[\\/]/)
  parts.pop()
  const joined = parts.join(separator)
  return joined || separator
}

export function extensionName(input: string): string {
  const name = baseName(input)
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) return ''
  return name.slice(dotIndex).toLowerCase()
}

export function joinPath(parent: string, child: string): string {
  const separator = parent.includes('\\') ? '\\' : '/'
  const cleanParent = parent.replace(/[\\/]+$/, '')
  const cleanChild = child.replace(/^[\\/]+/, '')
  const parts = cleanChild.split(/[\\/]+/).filter(Boolean)
  return [cleanParent, ...parts].join(separator)
}

export function replaceBaseName(path: string, newName: string): string {
  return joinPath(dirName(path), newName)
}

export function isAbsolutePath(input: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(input) || input.startsWith('\\\\') || input.startsWith('/')
}

export function isUnsafeRelativeInput(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return true
  if (isAbsolutePath(trimmed)) return true
  return trimmed.split(/[\\/]+/).some((part) => part === '..')
}

export function isSameOrChildPath(parent: string, target: string): boolean {
  const parentNorm = normalizeSlashes(parent).replace(/\/+$/, '').toLowerCase()
  const targetNorm = normalizeSlashes(target).replace(/\/+$/, '').toLowerCase()
  return targetNorm === parentNorm || targetNorm.startsWith(`${parentNorm}/`)
}

export function replacePathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  const separator = newPrefix.includes('\\') ? '\\' : '/'
  const pathNorm = normalizeSlashes(path)
  const oldNorm = normalizeSlashes(oldPrefix).replace(/\/+$/, '')
  const rest = pathNorm.slice(oldNorm.length).replace(/^\/+/, '')
  return rest ? `${newPrefix.replace(/[\\/]+$/, '')}${separator}${rest.split('/').join(separator)}` : newPrefix
}
