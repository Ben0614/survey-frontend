import type { components, operations } from '~/model/api/schema'

/** 送出後拿到的那一筆作答。**不含 answers** —— 後端的 create 沒有 include。 */
export type Response = components['schemas']['ResponseEntity']

/** 一題的答案。`content` 一律是字串，單選題放的是**選項的文字本身**，不是索引。 */
export type Answer = components['schemas']['AnswerDto']

export type CreateResponseBody = components['schemas']['CreateResponseDto']

/**
 * 一份問卷的填答摘要（後端 Ch17 輪 ⑤a 新增的端點）。
 *
 * **這一支刻意不分頁** —— 那是這一章對「分頁參數好不好用」的回答：
 * 分頁是為了「不給你全部」而設計的，統計卻需要全部，兩者是相反的需求。
 * 不分頁不代表把全部資料搬回來：後端用 GROUP BY 算完才回，
 * 回傳量只跟「有幾題、幾個選項」有關，跟填答數無關。
 */
export type SurveySummary = components['schemas']['SurveySummaryEntity']
export type QuestionSummary = components['schemas']['QuestionSummaryEntity']

/**
 * 逐筆填答（後端 Ch17 輪 ⑤b）。
 *
 * ⚠️ **列表回的不是 ResponseEntity。** 後端拆成兩個 entity（同輪 ① 的問卷列表）：
 *   ResponseListItemEntity  列表用，多了 answers（**必填**）
 *   ResponseDetailEntity    GET /responses/:id 用，answers 裡還帶著完整的 question
 *
 * 列表那份的 answers **刻意不含 question** —— 題目屬於問卷，不屬於每一筆填答。
 * 帶著的話 10 筆 × 4 題 = 40 份題目文字。呼叫端拿一次題目（摘要那支已經有），
 * 自己用 questionId 對起來。
 */
export type PaginatedResponses =
  components['schemas']['PaginatedResponsesEntity']
export type ResponseListItem =
  components['schemas']['ResponseListItemEntity']

/** `GET /surveys/:surveyId/responses` 的 query 參數，**連這個都從契約取**。 */
export type FindResponsesQuery = NonNullable<
  operations['SurveyResponsesController_findAll']['parameters']['query']
>

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

  /**
   * 填答摘要。**只有問卷的擁有者與 ADMIN 看得到**（別人的已發布問卷是 403）。
   *
   * 後端只回原始數字、**不回百分比** —— 四捨五入之後加總不等於 100% 是常見的事，
   * 而那是「怎麼呈現」的問題。分母要用**每一題自己的 `answerCount`**，
   * 不是 `responseCount`：Ch17 輪 ④ 之前存進去的填答可以只答一題，兩者會不一樣。
   */
  summary: (surveyId: string) =>
    useMyService.get<SurveySummary>(`/surveys/${surveyId}/responses/summary`),

  /**
   * 逐筆填答（分頁）。**只有擁有者與 ADMIN 看得到。**
   *
   * 這是這一章唯一真的把 Ch4 那組分頁參數用在 UI 上的地方 ——
   * 對照 summary 那一支刻意不分頁（統計需要全部，分頁是為了不給全部）。
   */
  list: (surveyId: string, query: FindResponsesQuery) =>
    useMyService.get<PaginatedResponses>(
      `/surveys/${surveyId}/responses`,
      query,
    ),
}
