# CLAUDE.md

問卷平台的前端（Nuxt 4）。後端是並排的 `../survey-backend`，**兩個獨立的 GitHub repo**。

## 先讀這個

- **進度與範圍的唯一來源是 `../survey-backend/LEARNING.md`**（18 章課綱、目前在哪一章、
  該章的驗收標準）。這個 repo 不放學習紀錄 —— 拆成兩份，「現在到哪一章」就要看兩個地方。
- **共用的教學慣例在 `../survey-backend/CLAUDE.md`**（`[教學]` 註解、閱讀動線、開工指引格式）。
  這一份只寫前端自己的部分。
- ⚠️ **兩個 repo 的 commit 不能混。** Render 接的是 `survey-backend` 的 `main`，
  推錯地方會觸發不該有的部署。上一層的 `survey/` 不是 repo，每個 git 指令都要先 `cd` 進來。

## 這個 repo 不走教練模式

使用者本身是前端工程師，前端沒有學習目標 —— **程式碼由 AI 直接寫**，
review 的重點只在「**它有沒有正確反映後端契約**」，不在實作細節。
（後端仍然是教練模式：使用者自己寫、AI review。）

## 契約是產出來的，不是手寫的

```bash
cd ../survey-backend && pnpm start:dev   # 先讓 http://localhost:3100/docs-json 出得來
pnpm gen:api                             # 產型別到 app/model/api/schema.d.ts
pnpm typecheck                           # 綠 = 契約可用
```

- `app/model/api/schema.d.ts` 是 `openapi-typescript` 從後端 Swagger 產的，**不要手改**，
  但**要進版控** —— 它是契約的快照，後端改了形狀就會在這裡看到 diff。
- **吃本機那條 `/docs-json`，不要用線上的**（`https://survey-backend-0dku.onrender.com`
  接的是 production 資料庫）。
- `app/model/api/contract-check.ts` 是編譯期的契約斷言，不發請求。後端改壞回應形狀時
  它會比任何測試更早紅。新增前端在意的形狀時往裡面加一行。

## ⚠️ `pnpm-workspace.yaml` 的 `nodeLinker: hoisted` 不能拿掉

拿掉之後 `pnpm install` 會在 postinstall（`nuxt prepare`）失敗，訊息看起來像
「pnpm 壞了」或「套件版本不對」，實際上是 pnpm 的嚴格 symlink 佈局跟 Nuxt 4.5.2
底下 vite 的 subpath imports 不合。**完整的原因、實測排除過的四個假設、
以及「上游修好之後怎麼確認可以刪掉」都寫在那個檔案的註解裡** —— 動它之前先讀。

連帶要知道的一件事：平鋪之後**失去了幽靈依賴防護**（沒寫進 `package.json`
的套件也 import 得到）。所以新增套件時要自己確認有 `pnpm add`，
不要因為 import 得到就以為它是依賴。

## 目錄慣例

```
app/api/*.ts                    逐 domain 的薄封裝（一個檔案一個資源）
app/composables/useMyService.ts 統一的 HTTP 封裝
app/model/api/schema.d.ts       ← 產的，不手寫
app/utils/auth.ts               token 存 cookie（useCookie）
app/middleware/auth.global.ts   全域路由守衛，publicPages 白名單
```

**分層的完整說明在 [`docs/前端分層慣例.md`](docs/前端分層慣例.md)** —— 寫 `useMyService`、
`api/*.ts`、路由守衛或接 Vuetify 之前先讀它。

一句話的重點：**`useMyService` 要依這個後端的錯誤約定設計**。Java/Spring 生態常見的
`ApiResponse<T>`（HTTP 一律 2xx、靠 body 的 `code !== 0` 判斷業務錯誤）在這裡不適用，
這個後端是相反的 **真實 HTTP 狀態碼 + `{ error: { code, message, details? } }`**。

## 串接時一定會撞到的四件事

1. **token 一小時過期且不會自動延長**，沒有 refresh token —— 過期就重新登入。
2. **401 是唯一有通用處置的狀態碼**：清掉 token、導去登入頁。
3. **403 有兩種來源**（角色不足／不是你的資源）但對外一樣，顯示「權限不足」即可，不要試圖分辨。
4. **`GET /auth/me` 是還原身分的唯一入口** —— `login` 只回 `{ accessToken }`，
   reload 之後要靠它拿回 `id / email / role`。

**用 `error.code` 分支，不要解析 `error.message`**（message 的內容會隨版本變動）。

## 現況

- Ch13 只做到「產型別 + 型別檢查」，**還沒有任何頁面、也還沒發過真的請求**。
- ✅ **`pnpm typecheck` 現在是綠的（exit 0）。** 它在 Ch13 開工到輪 ① 之間
  刻意紅著一條（`ownerId` 產出 `Record<string, never>`），後端補上 `type: String`
  之後轉綠。**紅了就是契約真的變了，要查，不是「本來就紅」。**
- **重產型別的時機：後端只要改了 entity / DTO / `@Api...` 就要重跑 `pnpm gen:api`。**
  改回應形狀就是改契約 —— `schema.d.ts` 的 diff 是唯一看得見那件事的地方。
- ⚠️ **後端還沒設定 CORS**（Ch14 的第一件事）。第一個真請求會被瀏覽器擋下，
  症狀是 Console 一片紅 `Failed to fetch`，但用 `curl` 打完全正常 —— 那不是後端壞了。
