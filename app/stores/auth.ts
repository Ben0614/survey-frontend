import { defineStore } from 'pinia'
import type { LoginDto, RegisterDto, UserEntity } from '~/api/auth'
import type { RequestOption } from '~/composables/useMyService'

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

  async function login(body: LoginDto): Promise<boolean> {
    const { data, ok } = await authApi.login(body)
    if (!ok || !data) return false

    // 順序不能反：先存票，fetchMe 才帶得出去。
    // 而「存了立刻讀得到」這件事，是因為全專案共用這一個 ref —— 見檔頭。
    token.value = data.accessToken
    return fetchMe()
  }

  async function register(body: RegisterDto): Promise<boolean> {
    const { ok } = await authApi.register(body)
    // 註冊只建立帳號、不發 token（後端刻意分成兩支端點），所以呼叫端要接著登入一次。
    return ok
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
