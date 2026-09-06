import type { components, operations } from '~/model/api/schema'

// 型別一律從產出來的契約取，不手寫（見 CLAUDE.md）。
//
// ⚠️ **列表回的不是 SurveyEntity。** 後端 Ch17 輪 ① 拆成兩個 entity：
//   SurveyListItemEntity  列表用，多了 questionCount / responseCount（**必填**）
//   SurveyEntity          詳情用，沒有那兩個
//
// 拆開的收益就在這一行型別上：兩個數字是必填的，前端不必寫 `?? 0`。
// 反過來，把詳情拿到的資料塞進期待 SurveyListItem 的地方會**編譯不過** ——
// 那比任何測試都早。
export type SurveyListItem = components['schemas']['SurveyListItemEntity']
export type Survey = components['schemas']['SurveyEntity']
export type PaginatedSurveys = components['schemas']['PaginatedSurveysEntity']
export type SurveyStatus = SurveyListItem['status']

/**
 * `GET /surveys` 的 query 參數。
 *
 * **連這個都從契約取**，不自己列一次 —— 後端加一個參數、或把 sort 的白名單
 * 從 `createdAt | title` 改掉，這裡就會跟著變。手寫的話它會安靜地過期，
 * 而那正是 Ch15 那個 `ApiError` 的教訓（手寫型別漂移了，typecheck 一個字都沒紅）。
 */
export type FindSurveysQuery = NonNullable<
  operations['SurveysController_findAll']['parameters']['query']
>

export const surveysApi = {
  /** 問卷列表（一頁）。四種分類都是同一支端點，只是參數不同。 */
  list: (query: FindSurveysQuery) =>
    useMyService.get<PaginatedSurveys>('/surveys', query),

  /**
   * 刪除問卷。**只有 ADMIN 能成功**（後端 @Roles(Role.ADMIN)）。
   *
   * 回的是「刪除前的那一筆」，不是 204 —— 所以呼叫端拿得到被刪掉的標題，
   * 可以拿去組訊息。
   */
  remove: (id: string) => useMyService.remove<Survey>(`/surveys/${id}`),
}
