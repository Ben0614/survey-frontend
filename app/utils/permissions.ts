import type { UserEntity } from '~/api/auth'

/**
 * 「這份問卷我能不能管」的唯一一份前端判準。
 *
 * ⚠️ **它必須跟後端的 `canManageSurvey` 一致，而沒有任何工具會在它們不一致時叫。**
 * （`../survey-backend/src/surveys/survey.rules.ts:116`）
 *
 * ```ts
 * // 後端
 * return ownerId === user.id || user.role === Role.ADMIN;
 * ```
 *
 * **函式名與參數順序刻意跟後端一樣**（`(ownerId, user)`）—— 改那條後端規則的人
 * grep `canManageSurvey` 就會看到這一處。那是目前唯一能連結兩個 repo 的機制：
 * 型別能從 Swagger 產，**權限規則不能**。
 *
 * ## 為什麼是一個純函式，而不是 store 的 getter 或頁面裡的 computed
 *
 * 這個判準在這個 repo 已經漂移過三次，而**每一次都是「同一個判準各寫一次」造成的**：
 *
 * ```
 * Ch17 輪 ①  列表頁寫 v-if="auth.isAdmin"（當時後端真的是 @Roles(Role.ADMIN)）
 * Ch17 輪 ②  後端放寬成「擁有者或 ADMIN」，前端**只修好了刪除那一行**
 *            → 擁有者看不到自己問卷的編輯與結果鈕
 * 2026-09   列表頁三個鈕合成一個區域函式，修好了 ADMIN 那一份
 *            → 但它是**區域的**，詳情頁一出現就又要抄第二份
 * ```
 *
 * 前兩次都不是「忘了改」，是**它有兩份可以忘**。所以這裡的重點不是寫對，
 * 是讓「寫第二份」變得沒有理由 —— 放在 `app/utils/` 就是全站自動 import。
 *
 * 純函式（而不是讀 store 的 composable）還多一個好處：呼叫端必須把 `user`
 * 遞進來，於是「user 還沒載入」這件事在型別上就看得到（`UserEntity | null`），
 * 而不是藏在 store 內部變成一次安靜的 `undefined`。
 *
 * ## 兩件不會因為抽出來而改變的事
 *
 * 1. **藏起來只是 UI。** 真正擋下來的是後端的 403 —— 這個函式算錯只會讓畫面
 *    多一顆按不動的按鈕，不會讓任何人真的刪到別人的問卷。
 * 2. ⚠️ **它跟後端判斷時用的 role 不同源，兩者可能不一致：**
 *    ```
 *    前端  user.role        ← GET /auth/me  ← 查資料庫    （現在的值）
 *    後端  canManageSurvey  ← JWT payload                 （簽發當下的快照）
 *    ```
 *    剛被升成 ADMIN 但還沒重新登入的人：按鈕會出現，而後端一律回 403。
 *    那是後端 `LEARNING.md`「留給之後的事」第 4 條，不在這裡處理。
 */
export function canManageSurvey(
  ownerId: string | null,
  user: UserEntity | null,
): boolean {
  return isMySurvey(ownerId, user) || user?.role === 'ADMIN'
}

/**
 * 「這份問卷是我建的嗎」。
 *
 * ⚠️ **不能只寫 `ownerId === user?.id`。** 兩邊都有 null/undefined：
 * `ownerId` 在 Ch10 之前建的資料是 `null`，`user` 在還沒載入時是 `null`。
 * `null === undefined` 恰好是 `false`，所以那個寫法**現在的行為是對的** ——
 * 但它靠的是巧合，而且一旦哪天 user 變成 `{} as UserEntity` 之類的東西就會破。
 * 寫清楚比依賴巧合好。
 *
 * 後端沒有對應的函式（它的 `canManageSurvey` 把這一半內嵌了），
 * 所以這支是前端自己的 —— 有它是因為詳情頁要顯示「這是你建立的」。
 */
export function isMySurvey(
  ownerId: string | null,
  user: UserEntity | null,
): boolean {
  return ownerId !== null && user !== null && ownerId === user.id
}
