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
 *   錯誤內容   { error: { code, message, details? } }  ← 包了一層
 *
 * 所以「什麼算失敗」「錯誤從哪裡取」兩件事都不一樣。
 */

/** 攤平後的錯誤。對應後端 ErrorBodyEntity（見 model/api/schema.d.ts）。 */
export interface ApiError {
  code: string
  message: string
  details?: string[]
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
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

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
      details: inner.details,
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
    if (error.code === 'UNAUTHORIZED') {
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
    if (error.code === 'UNAUTHORIZED' && import.meta.client && !option.silent) {
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

  remove: <T>(path: string, option?: RequestOption) =>
    request<T>('DELETE', path, undefined, option),
}
