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
 *
 * **版面在 Ch17 之後重做過一次**：表格換成卡片列，登出移到 `<AppShell>`。
 * 卡片列的代價是一頁看得到的列數變少，換到的是每一列的層級更清楚
 *（標題最大、數字次之、動作最輕），而這一頁的動作有四個。
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

// 顯示用的順序與標籤。跟 TAB_QUERY 分開放是因為它們回答的是兩個問題
//（「怎麼查」與「怎麼顯示」），而且這一份有順序、那一份沒有。
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'mine', label: '我建立的' },
  { key: 'draft', label: '我的草稿' },
  { key: 'open', label: '可以填的' },
]

const tab = ref<TabKey>('all')
const page = ref(1)
const pageSize = ref(10)
// ⚠️ **型別是 `string | null`，不是 `string`。**
//
// `v-text-field` 的 `clearable` 叉叉會把 model 設成 **null**（不是空字串），
// 而原本這裡宣告成 `ref('')`、watcher 裡寫 `value.trim()` ——
// 按下叉叉就是 `null.trim()`，TypeError 丟在 setTimeout 裡**沒有任何地方接**，
// 於是 q 永遠沒被更新、列表不會重抓。
//
// 症狀是「按了叉叉，字不見了但清單沒變」，而 console 以外看不出任何東西。
// 這個洞從 Ch17 輪 ① 就在，只是沒有人按過那個叉叉。
const search = ref<string | null>('')
const q = ref<string | undefined>(undefined)

/**
 * 把目前輸入框的內容套用到查詢上。
 *
 * 抽成具名函式而不是寫在 watcher 裡，是因為有三個觸發點：
 *   打字     debounce 300ms 之後
 *   Enter    立刻
 *   按叉叉   立刻
 * 後兩個「立刻」如果各寫一份，遲早會有一份忘了先 clearTimeout ——
 * 那會讓已經套用過的查詢在 300ms 後被舊值再蓋一次。
 */
function applySearch() {
  clearTimeout(timer)
  q.value = search.value?.trim() || undefined
}

/**
 * 叉叉的處理。**自己把 model 設成 null 再套用**，不依賴 Vuetify 的事件順序 ——
 * `@click:clear` 與 model 更新誰先誰後是它的內部細節，賭那個順序會很脆。
 */
function clearSearch() {
  search.value = null
  applySearch()
}

// [搜尋] 打字時不要每一鍵都送請求。
//
// 這不只是省流量：後端的搜尋是 `ILIKE '%…%'`，開頭那個 % 讓索引完全失效
// → 全表掃描（backend surveys.service.ts 的註解量過）。輸入「員工滿意度」
// 六個字就是六次全表掃描，而使用者只想要最後那一次。
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(applySearch, 300)
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

// 狀態標籤用自訂的底色／文字色，而不是 Vuetify 的 color 名稱：
// 這一版要的是低飽和的柔和標籤（淡綠底＋深綠字），
// 而 color="success" 會給整塊實心綠，在白卡上太搶。
const STATUS_STYLE: Record<SurveyStatus, string> = {
  DRAFT: 'background: var(--app-fill); color: var(--app-ink-soft);',
  PUBLISHED:
    'background: var(--app-success-soft); color: var(--app-success);',
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

// ⚠️ **這個判準必須跟後端的 canManageSurvey 一致，而沒有任何工具會在它們
// 不一致時叫。**（survey.rules.ts:120 —— `ownerId === user.id || role === ADMIN`）
//
// **名字刻意跟後端取成一樣的**：改那條後端規則的人 grep 得到這一處。
// 那是目前唯一能連結兩個 repo 的機制 —— 型別能從契約產，權限規則不能。
//
// 這個漂移已經發生三次，而**每一次都是「同一個判準各寫一次」造成的**：
//   輪 ①  寫 v-if="auth.isAdmin"（當時後端是 @Roles(Role.ADMIN)）
//   輪 ②  後端放寬成「擁有者或 ADMIN」，**只修好了刪除那一行**
//         → 擁有者看不到自己問卷的刪除鈕
//   本輪  編輯與結果留在 isMine(s) → **ADMIN 看不到別人問卷的編輯與結果鈕**
//         而它是「有人真的建了第一個 ADMIN 去用」才撞出來的，
//         tsc 綠、契約 diff 也看不出來（e2e 全綠也抓不到「不好用」）。
// 所以這次不再逐一修那幾行，改成三個按鈕共用這一個函式。
//
// ⚠️ **它跟後端判斷的 role 不同源，兩者可能不一致：**
//   這裡     auth.isAdmin ← /auth/me ← 查資料庫      （現在的值）
//   後端     canManageSurvey ← JWT payload           （簽發當下的快照）
// 剛被升成 ADMIN 但還沒重新登入的人：按鈕會出現，而後端一律回 403。
// 那是後端 LEARNING.md「留給之後的事」第 4 條，本輪不處理。
//
// 另外兩件事沒有變：
//   1. **藏起來只是 UI。** 真正擋下來的是後端（403）。
//   2. 「有人填答就不能刪」「一題都沒有不能發布」那類規則**刻意不複製到前端** ——
//      按鈕照樣出現，按下去由後端回 409，useMyService 把訊息跳成 toast
//      （CONFLICT 走 notification 的 default 分支）。
const canManageSurvey = (s: SurveyListItem) => isMine(s) || auth.isAdmin

// ── 刪除 ──────────────────────────────────────────────────
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
</script>

<template>
  <AppShell
    title="我的問卷"
    :subtitle="
      meta ? `${meta.total} 份問卷` : '　'
    "
  >
    <template #actions>
      <!--
        頭帶上唯一的主要動作，用檸檬綠 —— 全站只有這一種按鈕是這個顏色，
        所以它不必再靠大小或位置去搶注意力。
      -->
      <v-btn
        to="/surveys/new"
        size="large"
        variant="flat"
        prepend-icon="mdi-plus"
        style="background: var(--app-lime); color: #211e38; font-weight: 700"
      >
        新增問卷
      </v-btn>
    </template>

    <!--
      分類 + 搜尋放在頭帶裡（見 AppShell 的 filters slot），不在內容區 ——
      內容區疊上來的那 40px 落在一排膠囊上會很難看。
    -->
    <template #filters>
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-btn
          v-for="t in TABS"
          :key="t.key"
          size="default"
          variant="flat"
          class="app-pill"
          :class="tab === t.key ? 'app-pill--active' : ''"
          @click="tab = t.key"
        >
          {{ t.label }}
        </v-btn>

        <v-spacer />

        <v-text-field
          v-model="search"
          placeholder="搜尋標題"
          prepend-inner-icon="mdi-magnify"
          density="comfortable"
          variant="solo"
          flat
          rounded="pill"
          bg-color="white"
          hide-details
          clearable
          style="max-width: 260px"
          @keyup.enter="applySearch"
          @click:clear="clearSearch"
        />
      </div>
    </template>

    <v-progress-linear
      v-if="pending"
      indeterminate
      color="primary"
      rounded
      class="mb-3"
    />

    <!-- 卡片列 -->
    <div class="d-flex flex-column ga-3">
      <div
        v-for="s in items"
        :key="s.id"
        class="app-row pa-5 d-flex align-center ga-6 flex-wrap"
      >
        <!--
          三個區塊都給**固定的 flex 基準寬**，不是讓它們自己撐。
          動作按鈕的數量會隨權限與狀態變（4 個 / 3 個 / 1 個），
          不固定寬度的話每一列的數字會落在不同的 x —— 掃視時很明顯。
        -->
        <div style="flex: 1 1 240px; min-width: 0">
          <div class="text-h6 font-weight-bold" style="line-height: 1.3">
            {{ s.title }}
          </div>
          <div class="d-flex align-center ga-3 mt-2">
            <span
              class="text-caption font-weight-bold px-3 py-1"
              style="border-radius: 999px"
              :style="STATUS_STYLE[s.status]"
            >
              {{ STATUS_LABEL[s.status] }}
            </span>
            <span class="text-body-2 app-muted">{{ formatDate(s.createdAt) }}</span>
          </div>
        </div>

        <!-- 這兩個數字就是輪 ① 的產出。沒有後端那行 _count 的話，
             光是畫出它們就要對每一筆再打兩次 API。 -->
        <div class="d-flex ga-6 text-center justify-end" style="flex: 0 0 130px">
          <div>
            <div class="app-stat">{{ s.questionCount }}</div>
            <div class="app-stat__label">題</div>
          </div>
          <div>
            <div
              class="app-stat"
              :class="s.responseCount === 0 ? 'app-stat--muted' : ''"
              :style="s.responseCount > 0 ? 'color: var(--app-primary)' : ''"
            >
              {{ s.responseCount }}
            </div>
            <div class="app-stat__label">填答</div>
          </div>
        </div>

        <div class="d-flex ga-2 align-center justify-end" style="flex: 0 0 320px">
          <v-btn
            v-if="s.status === 'PUBLISHED'"
            size="small"
            variant="flat"
            class="app-btn-soft"
            :to="`/surveys/${s.id}/fill`"
          >
            填寫
          </v-btn>
          <v-btn
            v-if="canManageSurvey(s)"
            size="small"
            variant="flat"
            class="app-btn-soft"
            :to="`/surveys/${s.id}/edit`"
          >
            編輯
          </v-btn>
          <v-btn
            v-if="canManageSurvey(s)"
            size="small"
            variant="flat"
            color="primary"
            :to="`/surveys/${s.id}/result`"
          >
            結果
          </v-btn>
          <!-- 條件、它為什麼是共用的、以及「有人填答會回 409」都寫在
               canManageSurvey 上方，不在這裡留第二份。 -->
          <v-btn
            v-if="canManageSurvey(s)"
            icon="mdi-trash-can-outline"
            size="small"
            variant="flat"
            class="app-btn-danger-soft"
            @click="target = s"
          />
        </div>
      </div>

      <div
        v-if="!pending && items.length === 0"
        class="app-row pa-10 text-center app-muted"
      >
        沒有符合條件的問卷
      </div>
    </div>

    <div
      v-if="meta && meta.totalPages > 1"
      class="d-flex align-center justify-space-between mt-5"
    >
      <span class="text-body-2 app-muted">共 {{ meta.total }} 筆</span>
      <v-pagination
        v-model="page"
        :length="meta.totalPages"
        :total-visible="5"
        density="comfortable"
      />
    </div>

    <v-dialog v-model="confirming" max-width="420" :persistent="deleting">
      <v-card class="pa-2">
        <v-card-title class="text-h6 font-weight-bold">刪除問卷</v-card-title>
        <v-card-text class="app-ink-soft">
          <!--
            這裡原本有一段「已經有 N 份填答，會一起被刪掉」的警告。
            輪 ② 之後那句話是**假的** —— 後端改成有填答就回 409、不刪。

            整段拿掉而不是改文字：它存在的唯一目的是陳述一個後果，
            而那個後果現在由後端決定。改成「可能無法刪除」就是把規則
            複製回前端，正是上面那個 v-if 剛剛踩過的坑。
          -->
          確定要刪除「{{ target?.title }}」嗎？
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn
            variant="flat"
            class="app-btn-soft"
            :disabled="deleting"
            @click="target = null"
          >
            取消
          </v-btn>
          <v-btn color="error" variant="flat" :loading="deleting" @click="remove">
            刪除
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppShell>
</template>
