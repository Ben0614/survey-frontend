import type { components } from '~/model/api/schema'
import type { RequestOption } from '~/composables/useMyService'

// 型別一律從產出來的契約取，不手寫。
// 手寫的型別會跟後端漂移而沒有人知道；產的不會 —— 後端改了形狀，
// 這裡就編譯不過（見 CLAUDE.md 的「契約是產出來的，不是手寫的」）。
export type RegisterDto = components['schemas']['RegisterDto']
export type LoginDto = components['schemas']['LoginDto']
export type LoginEntity = components['schemas']['LoginEntity']
export type UserEntity = components['schemas']['UserEntity']

/**
 * 這兩支端點**不需要票**，所以都要帶 `anonymous: true` 與 `silent: true`。
 * 兩個旗標各說一件事，不能只給一個（完整說明見 useMyService 的 RequestOption）：
 *
 *   anonymous  這裡的 401 是「帳密不對」，不是「你的票壞了」——
 *              **不要清掉現有的 session、不要導頁**
 *   silent     錯誤由呼叫端顯示。登入失敗的訊息屬於表單旁邊，不是 toast：
 *              使用者的視線就在那裡，而且它不該四秒後自己消失
 *
 * 少了 anonymous 的症狀實際發生過（2026-09-06 上線驗收時使用者回報）：
 * 未註冊的帳號登入 → 跳「登入逾時，請重新登入」。
 * （另一個「已登入者打錯密碼會被登出」的推論**不成立** —— 路由守衛擋住了那條路，
 *   完整說明見 useMyService 的 RequestOption.anonymous。）
 */
const AUTH_ENDPOINT: RequestOption = { anonymous: true, silent: true }

export const authApi = {
  /**
   * 註冊。回的是 UserEntity，**不含 token** —— 註冊完還要再登入一次。
   *
   * 失敗的兩種：409 CONFLICT（email 撞名，`fields` 會指出是 email）、
   * 400 VALIDATION_FAILED。兩種都由呼叫端顯示。
   */
  register: (body: RegisterDto) =>
    useMyService.post<UserEntity>('/auth/register', body, AUTH_ENDPOINT),

  /**
   * 登入。只回 { accessToken }，身分要另外靠 /auth/me 拿。
   *
   * 失敗一律是 401，而且**「帳號不存在」與「密碼錯」回一模一樣的東西** ——
   * 那是後端刻意的（不讓人用登入端點列舉哪些 email 註冊過），
   * 所以前端也不要試圖分辨。
   */
  login: (body: LoginDto) =>
    useMyService.post<LoginEntity>('/auth/login', body, AUTH_ENDPOINT),

  /**
   * 還原身分的唯一入口。
   *
   * reload 之後前端手上只有 cookie 裡的 token，`id / email / role` 都要靠它拿回來。
   * silent 是給路由守衛用的：進站時票過期很正常，不需要為此跳一次 toast。
   */
  me: (option?: RequestOption) =>
    useMyService.get<UserEntity>('/auth/me', undefined, option),
}
