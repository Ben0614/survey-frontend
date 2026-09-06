import type { CreateQuestion, Question } from '~/api/surveys'

/**
 * 編輯中的題目。
 *
 * 比送去後端的 `CreateQuestion` 多一個 `key`，**只給 `v-for` 當識別用**，
 * 送出前一定要拿掉（見 `toCreatePayload`）。
 *
 * ⚠️ **不能用陣列索引當 key。** 刪掉第 2 題時，第 3 題會頂上索引 2，
 * Vue 會把它當成「同一個節點只是內容變了」而重用 DOM ——
 * 游標位置、打到一半的字都會錯位。
 *
 * 這裡也**刻意不保留後端的 `id`**。編輯是走 `PUT /surveys/:id/questions`
 * 整份取代的，後端會把舊題目全刪再重建，回來的 id 全是新的 ——
 * 留著舊 id 只會讓人以為它還有意義（後端 e2e 有一條測試把這件事寫成規格）。
 */
export type DraftQuestion = CreateQuestion & { key: number }

// module 層的計數器：整個 app 共用一條遞增序列。
// 不會歸零，也不需要 —— 它只要在同一個 v-for 裡彼此不同就夠了。
let nextKey = 0

/** 一題全新的空題目（預設簡答，選項先備兩格給切成單選時用）。 */
export function newDraftQuestion(): DraftQuestion {
  return {
    key: nextKey++,
    title: '',
    type: 'TEXT',
    options: ['', ''],
  }
}

/**
 * 後端回來的題目 → 編輯中的題目。
 *
 * `options` 用 `[...]` 複製一份而不是直接指過去：不複製的話，編輯畫面上改選項
 * 會同時改到 `useAsyncData` 那份「伺服器原始資料」，於是「有沒有改過」永遠是 false
 * —— 儲存鈕會一直是灰的，而且沒有任何錯誤。
 *
 * TEXT 題補上兩格空選項，是為了「切換成單選」時有東西可填；
 * 送出時 TEXT 一律送 `[]`（見 `toCreatePayload`），所以這兩格不會被存進去。
 */
export function toDraftQuestions(questions: Question[]): DraftQuestion[] {
  return questions.map((question) => ({
    key: nextKey++,
    title: question.title,
    type: question.type,
    options:
      question.type === 'SINGLE_CHOICE' && question.options.length > 0
        ? [...question.options]
        : ['', ''],
  }))
}

/**
 * 編輯中的題目 → 送去後端的 payload。順序就是陣列的順序（後端用 index 當 order）。
 *
 * 兩件事在這裡發生，兩件都不能少：
 *   1. **拿掉 `key`** —— 後端的 whitelist 會無聲丟掉它，但依賴那個行為
 *      等於把「多送沒關係」寫進前端
 *   2. **TEXT 題一律送 `[]`** —— 使用者可能先填了選項才改成簡答，
 *      那些殘留的字不該被存進去
 */
export function toCreatePayload(questions: DraftQuestion[]): CreateQuestion[] {
  return questions.map((question) => ({
    title: question.title.trim(),
    type: question.type,
    options:
      question.type === 'SINGLE_CHOICE'
        ? question.options.map((option) => option.trim())
        : [],
  }))
}
