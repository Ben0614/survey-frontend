// ============================================================
// contract-check.ts —— Ch13 的驗收檔
//
// 它不發任何 HTTP 請求，只做「編譯期斷言」：把後端契約裡
// 前端最在意的四種形狀各釘一行，讓 `pnpm typecheck` 變成契約的偵測器。
//
// 為什麼需要它：schema.d.ts 是機器產的，1200 行，沒有人會逐行看。
// 而「產出來的型別對不對」不是看它長什麼樣，是看**拿去用會不會過**。
// 這個檔案就是那個「拿去用」。
//
// 後端改了回應形狀 → 重跑 pnpm gen:api → 這裡紅燈。
// 那正是 LEARNING.md 說的「比測試更早叫的防線」。
//
// 用法：
//   cd ../survey-backend && pnpm start:dev     先讓 /docs-json 出得來
//   pnpm gen:api                               重產 schema.d.ts
//   pnpm typecheck                             綠 = 契約可用
// ============================================================

import type { components } from './schema'

type Survey = components['schemas']['SurveyEntity']
type ResponseDetail = components['schemas']['ResponseDetailEntity']
type ErrorBody = components['schemas']['ErrorBodyEntity']

// ---- 1. date-time 產出來必須是 string，不是 Date ----
// JSON 沒有日期型別。標成 Date 的話前端會直接 .getTime() 然後炸。
const createdAt: Survey['createdAt'] = '2026-09-05T10:30:00.000Z'

// ---- 2. enum 產出來必須是字面值聯集，不是 string ----
// 是聯集，打錯字才會編譯不過；是 string 的話 'DRAFTT' 也會過。
const status: Survey['status'] = 'DRAFT'
// @ts-expect-error 'ARCHIVED' 不是合法狀態 —— 這行不紅就代表 enum 沒產出來
const badStatus: Survey['status'] = 'ARCHIVED'

// ---- 3. optional 與 nullable 是兩件事 ----
// questions 是「可能沒有這個 key」（?includeQuestions=true 才出現）
const questions: Survey['questions'] = undefined
// ownerId 是「key 一定在，值可能是 null」，而且值必須是 string
const ownerId: Survey['ownerId'] = 'clx1a2b3c0000abcd1234efgh'
const noOwner: Survey['ownerId'] = null

// ---- 4. 巢狀的 $ref 要真的產出來，不能只到第一層 ----
// answer.question 若沒產出型別，前端畫「題目：答案」的畫面就沒有型別可依。
const questionTitle: string = ({} as ResponseDetail).answers[0]!.question.title

// ---- 5. 錯誤要能用 code 分支（不要解析 message）----
const code: ErrorBody['code'] = 'UNAUTHORIZED'

export type ContractCheck = {
  createdAt: typeof createdAt
  status: typeof status
  badStatus: typeof badStatus
  questions: typeof questions
  ownerId: typeof ownerId
  noOwner: typeof noOwner
  questionTitle: typeof questionTitle
  code: typeof code
}
