import type { FileEntryType, FileSortMode } from '@/types'

interface SortableFileEntry {
  name: string
  type: FileEntryType
  createdAt?: number
  modifiedAt?: number
}

function compareEntryType(a: SortableFileEntry, b: SortableFileEntry): number {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
  return 0
}

function compareByName(a: SortableFileEntry, b: SortableFileEntry): number {
  const typeOrder = compareEntryType(a, b)
  if (typeOrder) return typeOrder

  return a.name.localeCompare(b.name, 'zh-CN', {
    numeric: true,
    sensitivity: 'base'
  })
}

function sortTime(entry: SortableFileEntry): number {
  return entry.type === 'directory'
    ? entry.createdAt ?? entry.modifiedAt ?? 0
    : entry.modifiedAt ?? 0
}

function compareByModifiedAt(a: SortableFileEntry, b: SortableFileEntry, direction: 'asc' | 'desc'): number {
  const typeOrder = compareEntryType(a, b)
  if (typeOrder) return typeOrder

  const aTime = sortTime(a)
  const bTime = sortTime(b)
  const timeOrder = direction === 'asc' ? aTime - bTime : bTime - aTime
  return timeOrder || compareByName(a, b)
}

export function sortFileEntries<T extends SortableFileEntry>(entries: T[], mode: FileSortMode): T[] {
  return [...entries].sort((a, b) => {
    if (mode === 'modified-desc') return compareByModifiedAt(a, b, 'desc')
    if (mode === 'modified-asc') return compareByModifiedAt(a, b, 'asc')
    return compareByName(a, b)
  })
}
