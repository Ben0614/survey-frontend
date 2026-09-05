/**
 * 全域路由守衛。每次路由變更都會跑（含 SSR 的第一次進站）。
 *
 * ⚠️ **它只看「cookie 裡有沒有 token」，不看那張票有沒有過期。**
 * token 一小時過期而且不會續期，所以「有 token 但已失效」是常態。
 * 真正把人踢出去的是 useMyService 收到 401 的那一刻，不是這支守衛 ——
 * 兩者缺一不可：守衛擋沒登入過的人，401 擋票過期的人。
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // 這個專案的公開頁只有登入頁（註冊也在同一頁）。
  const publicPages = ['/login']
  const isPublic = publicPages.includes(to.path)

  const auth = useAuthStore()
  const token = auth.token

  // 沒票：公開頁放行，其餘一律回登入頁。
  if (!token) {
    return isPublic ? undefined : navigateTo('/login')
  }

  // 有票、但還不知道是誰 —— 首次進站或 reload 之後就是這個狀態
  // （token 活在 cookie 裡，store 活在記憶體裡，後者 reload 就沒了）。
  //
  // silent: true 是刻意的：進站時票剛好過期很正常，
  // 不值得為此跳一次 toast，而且導頁要由這支守衛決定（見 useMyService 的 RequestOption）。
  if (!auth.isLoggedIn) {
    const ok = await auth.fetchMe({ silent: true })

    // 換不回身分 = 那張票已經沒用了（useMyService 已經把 cookie 清掉）。
    if (!ok) {
      return isPublic ? undefined : navigateTo('/login')
    }
  }

  // 已經登入的人不該再看到登入頁。
  if (isPublic) {
    return navigateTo('/surveys')
  }
})
