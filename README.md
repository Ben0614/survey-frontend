# survey-frontend

問卷管理平台的前端 —— **Nuxt 4 + Vuetify 4 + Pinia**。

後端是獨立的 repo：[`survey-backend`](https://github.com/Ben0614/survey-backend)（NestJS + Prisma + PostgreSQL）。
兩個 repo 並排 clone，**不是巢狀關係**。

| | 網址 |
| --- | --- |
| 前端 | https://survey-frontend-1eep.vercel.app |
| 後端 API 文件 | https://survey-backend-0dku.onrender.com/docs |

> ⚠️ 後端跑在 Render 免費方案，閒置後第一個請求要等大約 50 秒冷啟動。
> 前端會顯示載入中比較久，**那不是壞掉**。

> 📖 **這個專案的決策與踩坑紀錄集中在後端 repo 的
> [`LEARNING.md`](https://github.com/Ben0614/survey-backend/blob/main/LEARNING.md)**，
> 前端的部分是其中的 Ch13 ～ Ch18。

---

## 型別不是手寫的

這個 repo 最值得看的一件事：**前端與後端之間的契約是自動產生的，而且會在 CI 級別被檢查。**

```
後端 Swagger  →  /docs-json（OpenAPI 規格）
                      ↓  pnpm gen:api
              app/model/api/schema.d.ts
                      ↓  pnpm typecheck
              後端契約變了 → 這裡就會紅
```

所以 `pnpm typecheck` 不只是型別檢查，它是**契約檢查**：後端改了回應形狀而前端沒跟上，
不必等到打開瀏覽器才發現。

但這條線有它的邊界，而那個邊界踩過：**型別能從契約產，權限規則不能。**
前端每複製一條後端的商業規則（誰能編輯、什麼狀態能發布），就多一個會安靜過期的地方——
`tsc` 與契約 diff 都不會叫。這件事記在 `LEARNING.md` 的 Ch17。

## 功能與結構

七個頁面：登入、問卷列表、建立、編輯（含題目管理）、填寫、看結果。

```
app/
├── pages/          路由（Nuxt 檔案式路由）
├── components/     元件
├── composables/    useMyService —— 請求與錯誤處理的統一入口
├── stores/         Pinia（auth）
├── middleware/     路由守衛
├── model/api/      由後端 OpenAPI 產生的型別（不要手改）
└── utils/
```

分層與職責的判準寫在 [`docs/前端分層慣例.md`](docs/前端分層慣例.md)。

---

## 本機開發

需要 **Node >= 22** 與 **pnpm 11.17.0**（`package.json` 的 `packageManager` 有釘版本）。

```bash
pnpm install                               # postinstall 會跑 nuxt prepare，產出 .nuxt/ 的 tsconfig
cd ../survey-backend && pnpm start:dev     # 要重產型別的話，後端得先起來
pnpm gen:api                               # 從 /docs-json 產 app/model/api/schema.d.ts
pnpm typecheck                             # 契約檢查
pnpm dev                                   # 開發（http://localhost:3000）
```

API 位址由 `NUXT_PUBLIC_API_BASE` 決定，預設 `http://localhost:3100`。
不設也能跑（跟後端相反，後端少了 `CORS_ORIGIN` 會直接起不來）——理由寫在 [`.env.example`](.env.example)。

### 開工前先讀

| 讀什麼 | 為什麼 |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | 這個 repo 的慣例、現況、串接會撞到的四件事 |
| [`docs/前端分層慣例.md`](docs/前端分層慣例.md) | 分層與職責、`useMyService` 的骨架與判準 |
| `../survey-backend/LEARNING.md` | **進度與範圍的唯一來源** |

### 兩個地雷

⚠️ `pnpm-workspace.yaml` 的 `nodeLinker: hoisted` **不能拿掉** ——
少了它 `pnpm install` 會在 postinstall（`nuxt prepare`）失敗，
訊息是 `Named export 'attachScopes' not found`。原因與「上游修好後怎麼確認可以刪掉」
寫在那個檔案的註解裡。升降 nuxt 版本、釘 vite、`shamefullyHoist` 都無效，只有換 linker 有用。

⚠️ `NUXT_PUBLIC_API_BASE` **拼錯不會有任何錯誤訊息** ——
Nuxt 只是沒認出它，然後靜靜地用 `nuxt.config.ts` 裡的預設值。所以改完要驗證，不要假設它生效了。
