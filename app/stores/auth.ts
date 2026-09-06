import { defineStore } from 'pinia'
import type { LoginDto, RegisterDto, UserEntity } from '~/api/auth'
import type { ApiError, RequestOption } from '~/composables/useMyService'

/**
 * login / register 的回傳。
 *
 * `ok` 之外還帶 `error`，因為那兩支是 silent 的 —— 沒有人幫它們跳 toast，
 * 訊息要由 /login 那一頁自己決定（401 與 409 講的不是同一件事）。
 */
export interface AuthResult {
  ok: boolean
  error: ApiError | null
}

/**
 * 認證狀態：手上有沒有票（token）、那張票是誰的（user）。
 *
 * 兩者的壽命不同，所以存在不同的地方：
 *   token —— cookie，活過 reload
 *   user  —— 記憶體，reload 就沒了，由守衛重新用 token 換回來
 *
 * ⚠️ **這是全專案唯一持有 token cookie ref 的地方**（理由見 utils/auth.ts 的
 * useTokenCookie 檔頭：各自呼叫 useCookie 會拿到不同的 ref，而寫入是非同步的）。
 */
export const useAuthStore = defineStore('auth', () => {
  const token = useTokenCookie()
  const user = ref<UserEntity | null>(null)

  const isLoggedIn = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  /**
   * 用手上的 token 換回身分。
   *
   * 回傳 boolean 而不是拋例外：呼叫端（守衛）要的是「能不能進去」這個答案，
   * 而失敗的處置（清票、跳 toast）useMyService 已經做完了。
   */
  async function fetchMe(option?: RequestOption): Promise<boolean> {
    const { data, ok } = await authApi.me(option)
    user.value = ok ? data : null
    return ok
  }

  /**
   * 登入。**回傳 error 而不只是 boolean**，跟 fetchMe 不一樣。
   *
   * 差別的理由：fetchMe 失敗的處置由 useMyService 做完了（清票、跳 toast），
   * 呼叫端只要知道「能不能進去」。但 /auth/login 是 anonymous + silent 的
   *（見 api/auth.ts）—— **沒有人幫它跳 toast**，而 401 與 409 要顯示不同的話，
   * 所以錯誤必須交回給呼叫端。
   */
  async function login(body: LoginDto): Promise<AuthResult> {
    const { data, ok, error } = await authApi.login(body)
    if (!ok || !data) return { ok: false, error }

    // 順序不能反：先存票，fetchMe 才帶得出去。
    // 而「存了立刻讀得到」這件事，是因為全專案共用這一個 ref —— 見檔頭。
    token.value = data.accessToken

    // fetchMe **不是** anonymous 的：它帶著剛拿到的票去要資源，
    // 所以那裡的 401 確實代表「票有問題」，交給 useMyService 的通用處置就對了。
    return { ok: await fetchMe(), error: null }
  }

  /** 註冊。只建立帳號、不發 token（後端刻意分成兩支端點），呼叫端要接著登入一次。 */
  async function register(body: RegisterDto): Promise<AuthResult> {
    const { ok, error } = await authApi.register(body)
    return { ok, error }
  }

  /**
   * 清掉整個 session：票與身分一起。
   *
   * 兩個呼叫端：使用者按登出，以及 useMyService 收到 401
   * （票沒用了 —— 沒帶票／票無效／那個人已被刪，三種對外一樣）。
   */
  function clearSession(): void {
    token.value = null
    user.value = null
  }

  return {
    token,
    user,
    isLoggedIn,
    isAdmin,
    fetchMe,
    login,
    register,
    clearSession,
  }
})
