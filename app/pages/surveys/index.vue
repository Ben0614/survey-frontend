<script setup lang="ts">
/**
 * 問卷列表（Ch17 輪 ①）。
 *
 * ⚠️ 檔案在輪 ② 從 `pages/surveys.vue` 搬到 `pages/surveys/index.vue`。
 * 那不是整理，是 Nuxt 的路由規則：`surveys.vue` 與 `surveys/new.vue` 並存時，
 * 前者會變成後者的**父層 layout**（必須放 `<NuxtPage/>`，否則子頁面畫不出來），
 * 而 `/surveys` 也就不再是這個列表了。放進資料夾當 index 才是兩個平行的頁面。
 *
 * 這一頁是這一章的第一個「真的在用 API」的頁面，而它一開工就撞到一個
 * e2e 全綠也抓不到的問題：**列表要顯示「幾題／幾份填答」，而 API 不給。**
 * 前端唯一能拿到的方式是對每一筆再打兩次（十筆 = 二十一次往返）——
 * 那是 N+1，而它在後端是一行 `_count`（實測多出零句 SQL）。
 * 所以輪 ① 的主要交付其實在後端，這一頁是它的驗收。
 *
 * 四種分類全部走同一支端點，只是參數不同（後端 Ch15 定的規則）：
 *
 *   全部（我看得到的）  無參數        → PUBLISHED 的 ∪ 我的
 *   我建立的            mine=true
 *   我的草稿            mine + DRAFT
 *   可以填的            status=PUBLISHED
 *
 * 第四種分類「我填過的」**做不到**：Response 表沒有記誰填的（後端 Ch5 的
 * 匿名決定），那要改 schema，不是加一個參數。刻意留到之後。
 */
import type { FindSurveysQuery, SurveyListItem, SurveyStatus } from '~/api/surveys'

const auth = useAuthStore()
const notification = useNotificationStore()

// ── 篩選狀態 ──────────────────────────────────────────────
type TabKey = 'all' | 'mine' | 'draft' | 'open'

/**
 * 分頁籤 → query 參數。
 *
 * 「我的草稿」寫成 `mine + DRAFT` 而不是只給 `status=DRAFT`。
 * 後端那條規則化簡之後兩者其實等價（`DRAFT AND (PUBLISHED OR 我的)`
 * ＝「我的草稿」，因為 DRAFT 與 PUBLISHED 互斥），但**依賴那個化簡很脆弱**：
 * 哪天多一個 ARCHIVED 狀態，或那條 OR 改了寫法，只給 status 的版本會安靜地
 * 開始回別人的東西。寫成它字面上的意思，就不必依賴任何化簡。
 */
const TAB_QUERY: Record<TabKey, FindSurveysQuery> = {
  all: {},
  mine: { mine: true },
  draft: { mine: true, status: 'DRAFT' },
  open: { status: 'PUBLISHED' },
}

const tab = ref<TabKey>('all')
const page = ref(1)
const pageSize = ref(10)
const search = ref('')
const q = ref<string | undefined>(undefined)

// [搜尋] 打字時不要每一鍵都送請求。
//
// 這不只是省流量：後端的搜尋是 `ILIKE '%…%'`，開頭那個 % 讓索引完全失效
// → 全表掃描（backend surveys.service.ts 的註解量過）。輸入「員工滿意度」
// 六個字就是六次全表掃描，而使用者只想要最後那一次。
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    q.value = value.trim() || undefined
  }, 300)
})
onBeforeUnmount(() => clearTimeout(timer))

// ⚠️ **換籤或改搜尋時，page 一定要回到 1。**
//
// 少了這段的壞法很安靜：在第 3 頁按下「我的草稿」，而草稿只有 1 頁 ——
// API 回 `data: []`、`total: 2`、`totalPages: 1`，畫面是一片空白配一個
// 「共 2 筆」。沒有錯誤、沒有紅字，使用者只會覺得「壞了」。
watch([tab, q, pageSize], () => {
  page.value = 1
})

const query = computed<FindSurveysQuery>(() => ({
  ...TAB_QUERY[tab.value],
  page: page.value,
  pageSize: pageSize.value,
  q: q.value,
}))

// ── 取資料 ────────────────────────────────────────────────
//
// 用 useAsyncData 而不是自己 onMounted + ref：這是「掛載時就發請求」，
// 而 useMyService 的定位是命令式的（按鈕觸發）——分工寫在它的檔頭。
// 這樣寫 SSR 那一側也會先抓好，首屏不會閃一下空白。
//
// 錯誤不必在這裡處理：useMyService 已經跳過 toast、401 也清過 session 了
// （見 stores/notification.ts）。這裡只要把「失敗 = 沒有資料」表達出來。
const { data, status, refresh } = await useAsyncData(
  'surveys-list',
  async () => {
    const { data, ok } = await surveysApi.list(query.value)
    return ok ? data : null
  },
  { watch: [query] },
)

const pending = computed(() => status.value === 'pending')
const items = computed<SurveyListItem[]>(() => data.value?.data ?? [])
const meta = computed(() => data.value?.meta ?? null)

// ── 顯示用的小工具 ────────────────────────────────────────
//
// 用 Record<SurveyStatus, …> 而不是 switch：後端哪天在 enum 加一個狀態，
// 契約重產之後**這裡會編譯不過**，而不是安靜地顯示一個空白標籤。
// 型別從契約來，所以這個保護是免費的。
const STATUS_LABEL: Record<SurveyStatus, string> = {
  DRAFT: '草稿',
  PUBLISHED: '發布中',
}
const STATUS_COLOR: Record<SurveyStatus, string> = {
  DRAFT: 'grey',
  PUBLISHED: 'success',
}

// ⚠️ 日期一定要指定時區，否則 SSR 會有 hydration mismatch：
// 伺服器（部署後多半是 UTC）與瀏覽器（使用者本機）算出來的字串不一樣，
// Vue 會在 console 抱怨「text content did not match」然後整塊重畫。
// 寫死 Asia/Taipei 是一個產品決定，不是技術限制。
const dateFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const formatDate = (iso: string) => dateFormat.format(new Date(iso))

// ownerId 可能是 null（Ch10 之前建的資料沒有擁有者），所以不能只比對相等 ——
// user 還沒載入時 auth.user?.id 也是 undefined，null === undefined 是 false，
// 但寫清楚比依賴那個巧合好。
const isMine = (s: SurveyListItem) =>
  s.ownerId !== null && s.ownerId === auth.user?.id

// ── 刪除（只有 ADMIN 看得到）──────────────────────────────
//
// 用 v-dialog 而不是原生的 confirm()：原生對話框會凍住整個分頁
//（包含 Vue 的排程），而且沒辦法做成這個 app 的樣子。
const target = ref<SurveyListItem | null>(null)
const deleting = ref(false)

// v-dialog 的 v-model 收的是 boolean，而我們真正要記的是「刪哪一筆」。
// 用一個 computed 橋接，就不必同時維護 `open` 與 `target` 兩個狀態 ——
// 那種「兩個變數要保持一致」的寫法，遲早會有一個忘記更新。
const confirming = computed({
  get: () => target.value !== null,
  set: (open: boolean) => {
    if (!open) target.value = null
  },
})

async function remove() {
  const survey = target.value
  if (!survey) return

  deleting.value = true
  const { ok } = await surveysApi.remove(survey.id)
  deleting.value = false
  target.value = null

  if (!ok) return // 失敗的 toast 由 useMyService 跳，這裡不要再跳一次

  notification.success(`已刪除「${survey.title}」`)

  // ⚠️ 刪掉當頁最後一筆時，page 會停在一個已經不存在的頁碼。
  // 症狀跟上面那個一樣：空白畫面配一個「共 N 筆」。
  // 往前退一頁會觸發 watch 自動重抓，所以那個分支不必自己 refresh。
  if (items.value.length === 1 && page.value > 1) {
    page.value -= 1
    return
  }
  await refresh()
}

async function logout() {
  auth.clearSession()
  await navigateTo('/login')
}
</script>

<template>
  <v-container class="py-6">
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5">問卷</h1>
      <v-spacer />
      <span class="text-body-2 text-medium-emphasis mr-3">
        {{ auth.user?.email }}
      </span>
      <v-btn variant="text" size="small" @click="logout">登出</v-btn>
    </div>

    <v-card>
      <v-tabs v-model="tab" color="primary">
        <v-tab value="all">全部</v-tab>
        <v-tab value="mine">我建立的</v-tab>
        <v-tab value="draft">我的草稿</v-tab>
        <v-tab value="open">可以填的</v-tab>
      </v-tabs>

      <v-card-text>
        <div class="d-flex align-center ga-3 flex-wrap">
          <v-text-field
            v-model="search"
            label="搜尋標題"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            style="max-width: 320px"
          />
          <v-spacer />
          <!--
            編輯／填寫／結果那三個按鈕的目標頁面還不存在（輪 ③～⑤），仍然 disabled。
            「新增問卷」在輪 ② 接上了 —— 每一輪拿掉一個。
          -->
          <v-btn color="primary" to="/surveys/new" prepend-icon="mdi-plus">
            新增問卷
          </v-btn>
        </div>
      </v-card-text>

      <v-progress-linear v-if="pending" indeterminate color="primary" />

      <v-table>
        <thead>
          <tr>
            <th>標題</th>
            <th style="width: 110px">狀態</th>
            <th class="text-right" style="width: 80px">題數</th>
            <th class="text-right" style="width: 90px">填答</th>
            <th style="width: 130px">建立時間</th>
            <th style="width: 220px" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in items" :key="s.id">
            <td>{{ s.title }}</td>
            <td>
              <v-chip :color="STATUS_COLOR[s.status]" size="small" label>
                {{ STATUS_LABEL[s.status] }}
              </v-chip>
            </td>
            <!-- 這兩欄就是輪 ① 的產出。沒有後端那行 _count 的話，
                 光是畫出它們就要對每一筆再打兩次 API。 -->
            <td class="text-right">{{ s.questionCount }}</td>
            <td class="text-right">{{ s.responseCount }}</td>
            <td class="text-medium-emphasis">{{ formatDate(s.createdAt) }}</td>
            <td class="text-right">
              <v-btn
                v-if="s.status === 'PUBLISHED'"
                size="small"
                variant="text"
                disabled
              >
                填寫
              </v-btn>
              <v-btn v-if="isMine(s)" size="small" variant="text" disabled>
                編輯
              </v-btn>
              <v-btn v-if="isMine(s)" size="small" variant="text" disabled>
                結果
              </v-btn>
              <!--
                刪除是這一頁唯一真的會發請求的動作。

                ⚠️ **這個條件必須跟後端的 canManageSurvey 一致，而沒有任何工具
                會在它們不一致時叫。** 輪 ① 寫的是 v-if="auth.isAdmin"（當時後端是
                @Roles(Role.ADMIN)）；輪 ② 後端放寬成「擁有者或 ADMIN」，
                **而這一行留在原地** —— 於是擁有者看不到自己問卷的刪除鈕。
                tsc 不會紅、契約 diff 也看不出來：**型別能從契約產，權限規則不能。**

                另一件事沒變：藏起來只是 UI。真正擋下來的是後端（403）。

                「有人填答就不能刪」那條規則**刻意不複製到這裡** ——
                按鈕照樣出現，按下去由後端回 409，useMyService 會把它的訊息
                跳成 toast（CONFLICT 走 notification 的 default 分支）。
                前端每複製一條後端規則，就多一個會安靜過期的地方，而上面那段
                就是它過期的樣子。
              -->
              <v-btn
                v-if="isMine(s) || auth.isAdmin"
                size="small"
                variant="text"
                color="error"
                @click="target = s"
              >
                刪除
              </v-btn>
            </td>
          </tr>

          <tr v-if="!pending && items.length === 0">
            <td colspan="6" class="text-center text-medium-emphasis py-8">
              沒有符合條件的問卷
            </td>
          </tr>
        </tbody>
      </v-table>

      <div
        v-if="meta && meta.totalPages > 1"
        class="d-flex align-center justify-space-between px-4 py-3"
      >
        <span class="text-body-2 text-medium-emphasis">
          共 {{ meta.total }} 筆
        </span>
        <v-pagination
          v-model="page"
          :length="meta.totalPages"
          :total-visible="5"
          density="comfortable"
        />
      </div>
    </v-card>

    <v-dialog v-model="confirming" max-width="420" :persistent="deleting">
      <v-card>
        <v-card-title class="text-h6">刪除問卷</v-card-title>
        <v-card-text>
          <!--
            這裡原本有一段「已經有 N 份填答，會一起被刪掉」的警告。
            輪 ② 之後那句話是**假的** —— 後端改成有填答就回 409、不刪。

            整段拿掉而不是改文字：它存在的唯一目的是陳述一個後果，
            而那個後果現在由後端決定。改成「可能無法刪除」就是把規則
            複製回前端，正是上面那個 v-if 剛剛踩過的坑。
          -->
          確定要刪除「{{ target?.title }}」嗎？
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="deleting" @click="target = null">
            取消
          </v-btn>
          <v-btn color="error" :loading="deleting" @click="remove">刪除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
