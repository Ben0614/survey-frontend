import { defineStore } from 'pinia'
import type { ApiError } from '~/composables/useMyService'

/**
 * 全域訊息列（app.vue 裡的 v-snackbar 讀它）。
 *
 * 存在的理由是「**錯誤 toast 只有一個來源**」：由 useMyService 統一觸發，
 * 呼叫端在 `if (!ok)` 分支裡就不要再跳一次。兩個地方都跳的話，
 * 使用者會看到同一個錯誤閃兩次，而那種重複很難在 review 時看出來。
 */
export const useNotificationStore = defineStore('notification', () => {
  const visible = ref(false)
  const text = ref('')
  const color = ref<'error' | 'success'>('error')

  function show(message: string, kind: 'error' | 'success') {
    text.value = message
    color.value = kind
    visible.value = true
  }

  const error = (message: string) => show(message, 'error')
  const success = (message: string) => show(message, 'success')

  /**
   * 把後端的錯誤轉成一句話。
   *
   * 分支一律看 `code`，不解析 `message` —— message 的內容會隨版本變動，
   * 而 code 是契約的一部分（型別是字面值聯集，打錯字編譯不過）。
   * 只有「顯示」可以用 message。
   */
  function fromApiError(err: ApiError) {
    switch (err.code) {
      case 'UNAUTHORIZED':
        return error('登入逾時，請重新登入')
      case 'FORBIDDEN':
        // 403 有兩種來源（角色不足／不是你的資源），但後端刻意讓它們對外一樣，
        // 前端不要試圖分辨。
        return error('權限不足')
      case 'VALIDATION_FAILED':
        // fields 是結構化的 [{ field, rule }]（後端 Ch15 輪 ③ 改的），
        // **不是可以直接顯示的句子** —— rule 是 class-validator 的裝飾器名。
        //
        // 這裡只顯示一句通用訊息，理由是分工：
        // 表單的即時回饋由前端的 rules 負責（它有完整的規則與文案），
        // 後端的 400 是**防守用的** —— 使用者繞過前端驗證才會走到這裡。
        //
        // fields 真正的用途是**標紅對應的輸入框**：
        //   err.fields?.forEach(f => markInvalid(f.field))
        // 等表單元件接上之後再做，那不是 toast 的事。
        return error('輸入的內容不正確，請檢查後再送出')
      default:
        return error(err.message)
    }
  }

  return { visible, text, color, error, success, fromApiError }
})
