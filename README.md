# survey-frontend

問卷平台的前端（Nuxt 4）。後端是並排的 [`../survey-backend`](https://github.com/Ben0614/survey-backend)，**兩個獨立的 repo**。

```
Desktop/train/survey/
├── survey-backend/     ← NestJS + Prisma + PostgreSQL（學習紀錄也在這裡）
└── survey-frontend/    ← 這個 repo
```

## 開工前先讀

| 讀什麼 | 為什麼 |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | 這個 repo 的慣例、現況、串接會撞到的四件事 |
| [`docs/前端分層慣例.md`](docs/前端分層慣例.md) | 分層與職責、`useMyService` 的骨架與判準 |
| `../survey-backend/LEARNING.md` | **進度與範圍的唯一來源**（現在在哪一章、驗收標準是什麼） |

## 常用指令

```bash
pnpm install                               # postinstall 會跑 nuxt prepare
cd ../survey-backend && pnpm start:dev     # 產型別前後端要先起來
pnpm gen:api                               # 從 /docs-json 產 app/model/api/schema.d.ts
pnpm typecheck                             # 契約檢查
pnpm dev                                   # 開發（http://localhost:3000）
```

✅ `pnpm typecheck` 目前是綠的。紅了代表後端契約變了 —— 先跑 `pnpm gen:api` 重產型別。

⚠️ `pnpm-workspace.yaml` 的 `nodeLinker: hoisted` **不能拿掉** ——
少了它 `pnpm install` 會在 postinstall 失敗。原因寫在那個檔案的註解裡。
