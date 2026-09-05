// token 在 cookie 裡的 key。
//
// 存 cookie 而不是 localStorage，是為了讓 SSR 那一側也讀得到同一個值 ——
// 路由守衛在伺服器端就會跑一次，localStorage 在那裡不存在。
//
// ⚠️ 這個 cookie 不是「瀏覽器自動帶去後端」的那種用法：
// 每次請求是 useMyService 自己把它讀出來、放進 Authorization 標頭。
// 後端的 CORS 因此不必開 credentials（Ch14 輪 ① 的決定）。
export const TOKEN_KEY = 'survey_token'

// 後端簽的 token 一小時過期且不會延長（沒有 refresh token），
// cookie 的壽命對齊它 —— 過期之後 cookie 自己消失，使用者直接看到登入頁，
// 而不是帶著一張死票去撞 401。
const TOKEN_MAX_AGE = 60 * 60

/**
 * 取得 token 的 cookie ref。
 *
 * ⚠️⚠️ **全專案只有 stores/auth.ts 可以呼叫它，其餘一律用 `useAuthStore().token`。**
 *
 * 理由在 Nuxt 的實作裡（node_modules/nuxt/dist/app/composables/cookie.js）：
 *
 *   const cookies = readRawCookies(opts)        // 每次呼叫都重讀 document.cookie
 *   const cookie = ref(cookies[name])           // 每次呼叫都是一個新的 ref
 *   if (opts.watch) watch(cookie, () => writeClientCookie(...))   // 寫入靠 watch
 *
 * `watch` 是非同步的（flush: 'pre'）。所以「A 處存好 token、B 處立刻讀」時，
 * B 建立的新 ref 讀到的還是舊的 document.cookie —— 值是 null。
 *
 * Ch14 輪 ③ 實際踩到：登入成功 → setToken() → 立刻 fetchMe()，
 * 而 fetchMe 讀不到剛存好的 token，於是 `GET /auth/me` 沒帶 Authorization 標頭，
 * 後端回 401「缺少存取權杖」。看起來像「登入壞了」，其實是同一個 tick 內的競態。
 *
 * 對策是結構性的：**只建立一個 ref、放在 store 裡共用**，
 * 而不是在每個要用 token 的地方各自呼叫一次 useCookie。
 */
export function useTokenCookie() {
  return useCookie<string | null>(TOKEN_KEY, {
    maxAge: TOKEN_MAX_AGE,
    sameSite: 'lax',
  })
}
