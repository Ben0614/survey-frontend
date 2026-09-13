<script setup lang="ts">
/**
 * 問卷狀態的標籤（草稿 / 發布中）。
 *
 * 抽成元件而不是在每一頁放一份 `Record<SurveyStatus, string>`：
 * 列表頁與詳情頁顯示的是同一件事，而「標籤文字」與「配色」是一對 ——
 * 兩頁各一份的話遲早會有一頁寫「未發布」、另一頁寫「草稿」。
 *
 * 用 `Record<SurveyStatus, …>` 而不是 v-if / switch：後端哪天在 enum 加一個狀態，
 * 契約重產之後**這裡會編譯不過**，而不是安靜地顯示一個空白標籤。
 * 型別從契約來（`SurveyStatus` ← `schema.d.ts`），所以這個保護是免費的。
 */
import type { SurveyStatus } from '~/api/surveys'

defineProps<{ status: SurveyStatus }>()

const LABEL: Record<SurveyStatus, string> = {
  DRAFT: '草稿',
  PUBLISHED: '發布中',
}

// 用自訂的底色／文字色，而不是 Vuetify 的 color 名稱：這一版要的是低飽和的
// 柔和標籤（淡綠底＋深綠字），而 color="success" 會給整塊實心綠，在白卡上太搶。
const STYLE: Record<SurveyStatus, string> = {
  DRAFT: 'background: var(--app-fill); color: var(--app-ink-soft);',
  PUBLISHED: 'background: var(--app-success-soft); color: var(--app-success);',
}
</script>

<template>
  <span
    class="text-caption font-weight-bold px-3 py-1"
    style="border-radius: 999px"
    :style="STYLE[status]"
  >
    {{ LABEL[status] }}
  </span>
</template>
