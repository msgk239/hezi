<template>
  <div class="csv-preview">
    <div class="csv-preview-summary">
      <span>共 {{ dataRowCount }} 行数据，{{ columnCount }} 列</span>
      <span v-if="isTruncated">当前显示前 {{ visibleRows.length }} 行、{{ visibleColumnCount }} 列</span>
      <span v-if="parsed.warning" class="csv-preview-warning">{{ parsed.warning }}</span>
    </div>

    <div v-if="parsed.rows.length === 0" class="csv-preview-empty">CSV 文件为空。</div>

    <div v-else class="csv-table-scroll">
      <table class="csv-table">
        <thead>
          <tr>
            <th class="csv-row-number">#</th>
            <th v-for="columnIndex in visibleColumnCount" :key="columnIndex">
              {{ headerLabel(columnIndex - 1) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in visibleRows" :key="rowIndex">
            <th class="csv-row-number">{{ rowIndex + 1 }}</th>
            <td
              v-for="columnIndex in visibleColumnCount"
              :key="columnIndex"
              :title="row[columnIndex - 1] || ''"
            >
              {{ row[columnIndex - 1] || '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { parseCsv } from '@/utils/csv'

const MAX_VISIBLE_ROWS = 2000
const MAX_VISIBLE_COLUMNS = 120

const props = defineProps<{
  content: string
}>()

const parsed = computed(() => parseCsv(props.content))
const header = computed(() => parsed.value.rows[0] ?? [])
const dataRows = computed(() => parsed.value.rows.slice(1))
const dataRowCount = computed(() => dataRows.value.length)
const columnCount = computed(() =>
  parsed.value.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0)
)
const visibleColumnCount = computed(() => Math.min(columnCount.value, MAX_VISIBLE_COLUMNS))
const visibleRows = computed(() => dataRows.value.slice(0, MAX_VISIBLE_ROWS))
const isTruncated = computed(
  () => dataRowCount.value > MAX_VISIBLE_ROWS || columnCount.value > MAX_VISIBLE_COLUMNS
)

function headerLabel(index: number): string {
  return header.value[index]?.trim() || `第 ${index + 1} 列`
}
</script>
