/**
 * 全專案唯一碰 `$fetch` 的地方。
 *
 * 頁面不該知道 token 存在哪、baseURL 是什麼、錯誤要不要跳 toast ——
 * 那三件事各只有一個地方決定，就在這個檔案裡。
 *
 * ⚠️ **這支的內容是照這個後端的約定寫的，不能套 `ApiResponse<T>` 那種約定。**
 * Java/Spring 生態常見的做法是「HTTP 一律 2xx、靠 body 的 code !== 0 判斷業務錯誤」，
 * 而這個後端（Ch6 定的）完全相反：
 *
 *   成敗       真實 HTTP 狀態碼（400/401/403/404/409/500）
 *   錯誤內容   { error: { code, message, fields? } }  ← 包了一層
 *
 * 所以「什麼算失敗」「錯誤從哪裡取」兩件事都不一樣。
 */

import type { components } from '~/model/api/schema'

/** 後端定義的錯誤形狀。**從契約取，不手寫。** */
type BackendError = components['schemas']['ErrorBodyEntity']

/**
 * 攤平後的錯誤。
 *
 * code 在後端契約裡是字面值聯集（BAD_REQUEST | UNAUTHORIZED | ...），
 * 這裡多加一個 **NETWORK_ERROR** —— 那是前端自己造的，代表
 * 「請求根本沒到伺服器」（CORS 被擋、離線、後端沒起來）。
 * 後端不可能回它，所以它不在契約裡；用聯集擴充而不是改成 string，
 * 是為了讓 switch 的其他分支仍然被型別檢查。
 *
 * ⚠️ 這個型別原本是手寫的 interface，後端 Ch15 輪 ③ 把 details 換成 fields 時
 * **typecheck 一個字都沒紅** —— 它只是安靜地讀到 undefined。
 * 那正是 CLAUDE.md 那條「型別一律從產出來的契約取」要防的事。
 */
export type ApiError = Omit<BackendError, 'code'> & {
  code: BackendError['code'] | 'NETWORK_ERROR'
}

/**
 * 每次請求的結果。
 *
 * 刻意回傳**純值而不是 ref**：這個專案的請求都是命令式的（按下按鈕才發），
 * 呼叫端 `await` 完就拿到結果，包成 ref 只是多一層 `.value`。
 * 需要在 template 裡響應式呈現的資料，由呼叫端自己 `ref()` 起來。
 * （「掛載時就發請求」那種場景用 Nuxt 內建的 `useAsyncData`，不必重造。）
 */
export interface MyResult<T> {
  data: T | null
  error: ApiError | null
  ok: boolean
}

export interface RequestOption {
  /**
   * 這是背景發起的請求，**失敗的處置由呼叫端自己負責**：不跳 toast、401 也不自動導頁。
   *
   * 兩個典型用途：路由守衛（它自己知道該去哪，讓這裡也導會兩邊搶著決定），
   * 以及批次操作（十個請求失敗就跳十次 toast，該由呼叫端彙整成一句）。
   */
  silent?: boolean

  /**
   * 這支端點**不需要票**（目前只有 `/auth/login` 與 `/auth/register`）。
   *
   * 它改變的是「**401 代表什麼**」：
   *
   *   帶票的請求收到 401   票沒用了     → 清掉 session、導回登入頁
   *   不帶票的請求收到 401 這次帳密不對 → **跟現有的 session 無關**
   *
   * **這個旗標修的是一件真的發生過的事，加上一件目前到不了的事。** 兩者要分清楚：
   *
   *   真的發生過（2026-09-06 上線驗收，使用者回報）
   *     沒登入過的人登入失敗 → 被告知「登入逾時，請重新登入」。
   *     他從來沒登入過，沒有東西可以逾時。
   *
   *   目前到不了（**當初誤判成也發生過，實測才發現不成立**）
   *     「已登入的人走到 /login 打錯密碼 → 原本的 session 被清掉」——
   *     `middleware/auth.global.ts` 最後一段會把已登入的人從 /login 導走，
   *     所以這條路走不到。清 session 的程式碼路徑存在，但沒有入口。
   *
   * 所以這個旗標對第二件事是**縱深防禦**，不是在修一個看得見的 bug ——
   * 而它仍然值得加，因為「401 一律代表票壞了」這個假設本身是錯的：
   * 哪天守衛放寬（例如允許已登入的人切換帳號），它就會現形。
   *
   * ⚠️ **不能用 `silent` 代替。** 底下的 clearSession 刻意**不看** silent ——
   * 路由守衛用的就是 `fetchMe({ silent: true })`，而它**需要**那個 clearSession
   *（進站時票過期要清掉）。兩個旗標各管一件事：
   *   silent     錯誤要不要由這裡跳 toast、要不要導頁
   *   anonymous  這個 401 算不算「session 壞了」
   */
  anonymous?: boolean
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

/**
 * 請求 body 的型別。用 Record 而不是 unknown —— `$fetch` 的 body 不吃 unknown。
 *
 * 這個後端的每一支端點收的都是 JSON 物件，所以夠用。
 * 從 schema.d.ts 取出來的 DTO（例如 RegisterDto）是 object type 不是 interface，
 * 可以直接賦值給它。
 */
type RequestBody = Record<string, unknown>

/** `$fetch` 丟出來的東西，我們只在意這幾個欄位。 */
interface FetchErrorLike {
  data?: unknown
  status?: number
  statusCode?: number
}

/**
 * 從例外裡挖出後端的錯誤 body。
 *
 * **fallback 不能省。** 這三種情況 `e.data` 都不是預期的形狀：
 *   - CORS 被瀏覽器擋下（連 body 都讀不到）
 *   - 後端沒起來 / 連線被拒
 *   - 反向代理回了一頁 HTML 錯誤頁
 *
 * 少了 fallback，這裡會丟出 TypeError，於是真正的原因被一個
 * 「Cannot read properties of undefined」蓋掉。
 */
function extractApiError(e: unknown): ApiError {
  const err = e as FetchErrorLike
  const body = err?.data as { error?: Partial<ApiError> } | undefined
  const inner = body?.error

  if (typeof inner?.code === 'string' && typeof inner?.message === 'string') {
    return {
      code: inner.code,
      message: inner.message,
      fields: inner.fields,
    }
  }

  // 沒有狀態碼 = 請求根本沒到伺服器（CORS、離線、後端沒起來）。
  const status = err?.status ?? err?.statusCode
  if (!status) {
    return {
      code: 'NETWORK_ERROR',
      message: '無法連線到伺服器，請確認後端是否啟動',
    }
  }

  return {
    code: 'INTERNAL_ERROR',
    message: `伺服器回應異常（HTTP ${status}）`,
  }
}

async function request<T>(
  method: Method,
  path: string,
  payload?: { query?: Record<string, unknown>; body?: RequestBody },
  option: RequestOption = {},
): Promise<MyResult<T>> {
  // ⚠️ 所有需要 Nuxt context 的東西都在 await 之前取好。
  // Nuxt 的 context 在 await 之後可能已經不在了，那時再呼叫 composable
  // 會拿到「must be called at the top of a setup function」這種錯。
  const apiBase = useRuntimeConfig().public.apiBase
  const notification = useNotificationStore()
  const auth = useAuthStore()
  const router = useRouter()
  // token 從 store 拿，不自己呼叫 useCookie ——
  // 每次呼叫 useCookie 都是一個新的 ref，而寫入是 watch 觸發的（非同步），
  // 於是「剛登入存好的票」在同一個 tick 內讀不到（見 utils/auth.ts 檔頭）。
  const token = auth.token

  // ⚠️ 用 flag 而不是 `!error`：`throw undefined` 這種 falsy 例外會讓
  // `!undefined === true`，於是失敗被判成成功（false-success）。
  let hadError = false
  let data: T | null = null
  let error: ApiError | null = null

  try {
    data = await $fetch<T>(path, {
      baseURL: apiBase,
      method,
      query: payload?.query,
      body: payload?.body,
      // token 走標頭，不靠瀏覽器自動帶 cookie —— 後端的 CORS 因此不必開 credentials。
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
  } catch (e) {
    hadError = true
    error = extractApiError(e)

    // 401 是唯一有「通用處置」的狀態碼：票已經沒用了，清掉並回登入頁。
    // 它的三種來源（沒帶票／票無效／那個人已被刪）對外一模一樣，前端不必分辨。
    //
    // ⚠️ **但那個假設只在「帶票去要資源」的請求上成立。**
    // /auth/login 是「去換一張票」，它的 401 意思是「帳密不對」——
    // 清掉 session 等於因為別人打錯密碼而把自己登出（見 RequestOption.anonymous）。
    const sessionRelevant = error.code === 'UNAUTHORIZED' && !option.anonymous

    if (sessionRelevant) {
      auth.clearSession()
    }

    if (!option.silent) {
      notification.fromApiError(error)
    }

    // 導頁只在瀏覽器端、而且只在非 silent 時做：
    //   SSR 期間      —— 路由守衛負責
    //   silent 的請求 —— 呼叫端負責（守衛就是這樣用的）
    // 少了這兩個條件，同一次失敗會有兩個地方同時要導頁。
    // 用開頭取好的 router 而不是 navigateTo —— 同樣的理由：
    // navigateTo 需要 Nuxt context，而這裡已經在 await 之後了。
    if (sessionRelevant && import.meta.client && !option.silent) {
      await router.push('/login')
    }
  }

  return { data, error, ok: !hadError }
}

/**
 * 對外的四個方法。
 *
 * 命名用 `get` 而不是參考慣例裡的 `fetch` —— `fetch` 跟全域的同名函式撞，
 * 而且讀起來像「發一個請求」而不是「發一個 GET」。
 */
export const useMyService = {
  get: <T>(path: string, query?: Record<string, unknown>, option?: RequestOption) =>
    request<T>('GET', path, { query }, option),

  post: <T>(path: string, body?: RequestBody, option?: RequestOption) =>
    request<T>('POST', path, { body }, option),

  patch: <T>(path: string, body?: RequestBody, option?: RequestOption) =>
    request<T>('PATCH', path, { body }, option),

  /**
   * PATCH 的兄弟：**整份取代**，沒給的欄位視為要清空。
   *
   * 後端只有一支用它（PUT /surveys/:id/questions，Ch17 輪 ③）。
   * 兩者不能互換 —— 那支端點只註冊了 PUT，用 patch 打過去是 404。
   */
  put: <T>(path: string, body?: RequestBody, option?: RequestOption) =>
    request<T>('PUT', path, { body }, option),

  remove: <T>(path: string, option?: RequestOption) =>
    request<T>('DELETE', path, undefined, option),
}
