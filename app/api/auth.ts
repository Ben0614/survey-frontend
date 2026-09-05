import type { components } from '~/model/api/schema'
import type { RequestOption } from '~/composables/useMyService'

// 型別一律從產出來的契約取，不手寫。
// 手寫的型別會跟後端漂移而沒有人知道；產的不會 —— 後端改了形狀，
// 這裡就編譯不過（見 CLAUDE.md 的「契約是產出來的，不是手寫的」）。
export type RegisterDto = components['schemas']['RegisterDto']
export type LoginDto = components['schemas']['LoginDto']
export type LoginEntity = components['schemas']['LoginEntity']
export type UserEntity = components['schemas']['UserEntity']

export const authApi = {
  /** 註冊。回的是 UserEntity，**不含 token** —— 註冊完還要再登入一次。 */
  register: (body: RegisterDto) =>
    useMyService.post<UserEntity>('/auth/register', body),

  /** 登入。只回 { accessToken }，身分要另外靠 /auth/me 拿。 */
  login: (body: LoginDto) => useMyService.post<LoginEntity>('/auth/login', body),

  /**
   * 還原身分的唯一入口。
   *
   * reload 之後前端手上只有 cookie 裡的 token，`id / email / role` 都要靠它拿回來。
   * silent 是給路由守衛用的：進站時票過期很正常，不需要為此跳一次 toast。
   */
  me: (option?: RequestOption) =>
    useMyService.get<UserEntity>('/auth/me', undefined, option),
}
