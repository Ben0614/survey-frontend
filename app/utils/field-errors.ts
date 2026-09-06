import type { ApiError } from '~/composables/useMyService'

/**
 * 把後端的 `error.fields` 攤成「欄位路徑 → 一句人看得懂的話」。
 *
 * **這是後端 Ch15 輪 ③ 做的那個形狀第一次真的被用到。**
 * 在此之前它只是被 `stores/notification.ts` 換成一句通用訊息
 *（那裡留了一段註解說「等表單元件接上之後再做」——就是這裡）。
 *
 * 後端給的是**結構化的資料**，不是句子：
 *
 *     { field: "title",                rule: "maxLength" }
 *     { field: "questions.0.options",  rule: "singleChoiceNeedsOptions" }
 *
 * 兩半各有各的用途，而且**都不能直接顯示**：
 *   field  是路徑 —— 拿去對應輸入框（questions.0.options = 第 1 題的選項）
 *   rule   是 class-validator 的裝飾器名 —— 拿去查下面這張表
 *
 * 為什麼文案在前端不在後端（後端 Ch15 的決定，三個理由）：
 *   i18n     中文寫死在後端就鎖死了
 *   產品     文案改一次要重新部署後端
 *   本來就有 前端的即時驗證已經有一份規則與文案了
 *
 * 所以這張表是「後端的 rule」與「前端的文案」之間唯一的接縫。
 */
const RULE_MESSAGE: Record<string, string> = {
  isNotEmpty: '這一欄必填',
  isString: '格式不正確',
  isArray: '格式不正確',
  isEnum: '不是合法的選項',
  maxLength: '字數超過上限',
  minLength: '字數不足',
  isEmail: 'Email 格式不正確',
  arrayNotEmpty: '至少要有一項',
  unique: '這個值已經被使用了',
  singleChoiceNeedsOptions: '單選題至少要有兩個選項',
}

/**
 * 查不到就給一句通用的 —— **不要顯示 rule 本身**。
 *
 * 後端新增一條規則（或改了 @ValidatorConstraint 的 name）時，
 * 這裡會安靜地退回通用訊息。那是刻意的：使用者看到「格式不正確」
 * 比看到 `singleChoiceNeedsOptions` 好得多。
 *
 * 代價是「漏一條文案」沒有症狀。真正的偵測器是後端契約的 diff ——
 * 新規則會出現在 /docs 的說明裡（見 create-question.dto.ts 的 description）。
 */
export function ruleMessage(rule: string): string {
  return RULE_MESSAGE[rule] ?? '格式不正確'
}

/**
 * `ApiError` → `{ 欄位路徑: 訊息 }`，給 `:error-messages` 直接用。
 *
 * 只處理 VALIDATION_FAILED（400）。其他錯誤沒有 fields，
 * 而且它們的處置在別的地方：401 由 useMyService 清 session、
 * 其餘由 notification 跳 toast。
 *
 * 同一個欄位違反多條規則時只留第一句 —— 輸入框底下塞三行紅字沒有幫助，
 * 而修好第一條之後第二條自然會浮上來。
 */
export function toFieldErrors(error: ApiError | null): Record<string, string> {
  if (!error?.fields) return {}

  const out: Record<string, string> = {}
  for (const { field, rule } of error.fields) {
    if (!(field in out)) out[field] = ruleMessage(rule)
  }
  return out
}
