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
 * 建立問卷的 body。`questions` 是選填 —— 不給就是一份空草稿。
 *
 * 後端 Ch17 輪 ② 之前只收 `{ title }`，題目要一題一題 POST：
 * 建一份 5 題的問卷 = 6 次請求，而且**中途失敗會留下半成品**
 * （前兩題寫進去了，問卷也建了，但使用者以為失敗）。
 * 現在是一次請求、一個交易 —— 要嘛整份建好，要嘛一個字都不留。
 */
export type CreateSurveyBody = components['schemas']['CreateSurveyDto']
export type CreateQuestion = components['schemas']['CreateQuestionDto']
export type QuestionType = CreateQuestion['type']

/** 後端回來的題目（含 id / order / surveyId），對照 CreateQuestion 是「要送過去的」。 */
export type Question = components['schemas']['QuestionEntity']

/**
 * `PATCH /surveys/:id` 的 body。
 *
 * ⚠️ 它是 `PartialType(CreateSurveyDto)`，所以型別上**也有 `questions`** ——
 * 但那條路是不通的：service 的 update 只寫 `data: { title: dto.title }`，
 * 送 questions 過去會被無聲忽略。改題目要走下面的 replaceQuestions。
 */
export type UpdateSurveyBody = components['schemas']['UpdateSurveyDto']

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
   * 建立問卷（可以一次帶題目）。回的是建好的那一份，**含 questions**。
   *
   * 三種失敗要分開處理：
   *   400 VALIDATION_FAILED  哪個欄位不合格，看 error.fields
   *   401 UNAUTHORIZED       useMyService 已經清 session 並導頁
   *   其他                   toast 顯示 message
   */
  create: (body: CreateSurveyBody) =>
    useMyService.post<Survey>('/surveys', body),

  /**
   * 刪除問卷。**擁有者或 ADMIN**（後端 Ch17 輪 ② 從「只有 ADMIN」放寬的），
   * 而且**已經有人填答就不能刪**（409）。
   *
   * 回的是「刪除前的那一筆」，不是 204 —— 所以呼叫端拿得到被刪掉的標題，
   * 可以拿去組訊息。
   */
  remove: (id: string) => useMyService.remove<Survey>(`/surveys/${id}`),

  /**
   * 查一份問卷，**一定帶題目**。
   *
   * 這裡把 `includeQuestions=true` 寫死，不做成參數：目前唯一的呼叫端是編輯頁，
   * 而它沒有「只要標題」的情境。等真的出現第二種用法再開參數 ——
   * 現在開等於先造一個沒人用的分支。
   */
  get: (id: string) =>
    useMyService.get<Survey>(`/surveys/${id}`, { includeQuestions: true }),

  /** 改問卷本身（實際上只有 title 會生效，見 UpdateSurveyBody 的說明）。 */
  update: (id: string, body: UpdateSurveyBody) =>
    useMyService.patch<Survey>(`/surveys/${id}`, body),

  /**
   * **整份取代**一份問卷的題目（後端 Ch17 輪 ③ 新增的）。
   *
   * 三件事要記得：
   *   1. 順序就是陣列的順序 —— 後端拿 index 當 order，沒有別的排序欄位
   *   2. 回來的題目 **id 全是新的**（舊的被刪掉重建），呼叫端必須拿回傳值
   *      取代本地狀態，不能繼續用手上那些舊 id
   *   3. 只有 DRAFT 能用。已發布的問卷會回 409，那是後端的規則，前端不複製
   */
  replaceQuestions: (id: string, questions: CreateQuestion[]) =>
    useMyService.put<Question[]>(`/surveys/${id}/questions`, { questions }),

  /** 發布。**一題都沒有會回 409**（後端 Ch17 輪 ③ 補的規則）。 */
  publish: (id: string) => useMyService.patch<Survey>(`/surveys/${id}/publish`),

  /** 撤回發布。**已經有人填答會回 409** —— 撤回之後題目就能改，舊答案會對不起來。 */
  unpublish: (id: string) =>
    useMyService.patch<Survey>(`/surveys/${id}/unpublish`),
}
