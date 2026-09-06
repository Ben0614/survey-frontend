import type { components } from '~/model/api/schema'

/** 送出後拿到的那一筆作答。**不含 answers** —— 後端的 create 沒有 include。 */
export type Response = components['schemas']['ResponseEntity']

/** 一題的答案。`content` 一律是字串，單選題放的是**選項的文字本身**，不是索引。 */
export type Answer = components['schemas']['AnswerDto']

export type CreateResponseBody = components['schemas']['CreateResponseDto']

export const responsesApi = {
  /**
   * 送出填寫。
   *
   * ⚠️ **必須把這份問卷的每一題都送上去**（後端 Ch17 輪 ④ 的規則）：
   * 少一題是 400、多送一個別份問卷的題目也是 400、單選題的答案不在選項裡還是 400。
   *
   * 而這幾條 400 是 **service 丟的，不是 ValidationPipe 丟的** ——
   * 所以回應**沒有 `fields`**，`toFieldErrors` 對它們是空的。
   * 前端只拿得到一句 message，由 useMyService 跳成 toast。
   * 正常不會走到那裡：這一頁用 radio + 必填，三種情況都在送出前就擋住了。
   */
  submit: (surveyId: string, answers: Answer[]) =>
    useMyService.post<Response>(`/surveys/${surveyId}/responses`, { answers }),
}
