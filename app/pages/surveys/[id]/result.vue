<script setup lang="ts">
/**
 * 填答結果(Ch17 輪 ⑤)。兩個分頁,而它們正好是這一章命題的兩半:
 *
 *   摘要      **不分頁** —— 統計需要全部,而分頁是為了「不給你全部」（輪 ⑤a）
 *   個別回應  **分頁**   —— 這是 Ch4 那組參數第一次真的被用在一個 UI 上（輪 ⑤b）
 *
 * 所以「分頁參數好不好用」的答案是:**看你在做哪一種頁面。**
 * 同一份資料的兩種檢視,一種需要它、一種完全不能用它。
 *
 * 兩支端點各解掉一個 N+1:
 *   輪 ⑤a  沒有統計端點 → 前端得抓完所有分頁自己算
 *   輪 ⑤b  列表只回 { id, surveyId, createdAt } → 每一筆再打一次 /responses/:id
 *
 * 題目文字只取一次:**列表的 answers 刻意不含 question**（題目屬於問卷,
 * 不屬於每一筆填答），所以這一頁用摘要那一支已經有的 questions 建一張
 * `questionId → 題目` 的表,兩個分頁共用。
 */
import type { QuestionSummary, ResponseListItem } from '~/api/responses'

const route = useRoute()

const id = computed(() => route.params.id as string)
const tab = ref<'summary' | 'list'>('summary')

// ── 摘要（輪 ⑤a）─────────────────────────────────────────
const { data, status } = await useAsyncData(
  () => `survey-summary-${id.value}`,
  async () => {
    const { data, ok } = await responsesApi.summary(id.value)
    return ok ? data : null
  },
)

const loading = computed(() => status.value === 'pending')
const questions = computed<QuestionSummary[]>(() => data.value?.questions ?? [])

/**
 * 百分比在**前端**算,而且分母用每一題自己的 `answerCount`。
 *
 * 為什麼不是後端算:四捨五入之後加總不等於 100% 是常見的事,而那是
 * 「怎麼呈現」的問題 —— 後端一旦回了百分比,前端想改成一位小數就得改後端。
 *
 * 為什麼分母不是 `responseCount`:後端 Ch17 輪 ④ 才規定「整份必答」,
 * 在那之前存進去的填答**可以只答一題**。用 responseCount 當分母的話,
 * 那些舊資料的每一題百分比都會偏低,而且加起來不到 100%。
 */
const percent = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 1000) / 10

// ── 個別回應（輪 ⑤b）─────────────────────────────────────
const page = ref(1)
const order = ref<'asc' | 'desc'>('desc')

// 一次抓幾筆。抽成常數而不是散在 query、畫面文字與編號計算三個地方 ——
// 那三處只要有一個沒跟著改，編號就會從第二頁開始錯，而且不會有任何錯誤。
const PAGE_SIZE = 5

/**
 * `questionId → 題目`。
 *
 * 列表的 `answers` 只有 `{ id, questionId, content }` —— 這張表就是把它們
 * 對回題目的地方。用摘要那一支的資料建,所以**不必為此多發一次請求**。
 */
const questionById = computed(
  () => new Map(questions.value.map((q) => [q.questionId, q])),
)

// 只有切到「個別回應」才抓 —— 一進頁面就抓兩支的話，多數人只看摘要。
const {
  data: listData,
  status: listStatus,
  refresh: refreshList,
} = await useAsyncData(
  () => `survey-responses-${id.value}`,
  async () => {
    const { data, ok } = await responsesApi.list(id.value, {
      page: page.value,
      pageSize: PAGE_SIZE,
      order: order.value,
    })
    return ok ? data : null
  },
  { immediate: false, watch: [page, order] },
)

// `immediate: false` 之後要自己觸發第一次。用 watch 而不是 @click，
// 因為切回摘要再切回來時不該重抓（useAsyncData 有快取）。
watch(tab, (value) => {
  if (value === 'list' && !listData.value) void refreshList()
})

const listLoading = computed(() => listStatus.value === 'pending')
const items = computed<ResponseListItem[]>(() => listData.value?.data ?? [])
const meta = computed(() => listData.value?.meta ?? null)

// 改排序時回到第 1 頁。少了這段的壞法很安靜：在第 3 頁切換排序，
// 而新排序只有 2 頁 —— 畫面空白配一個「共 N 筆」（同列表頁踩過的那個）。
watch(order, () => {
  page.value = 1
})

/** 這一筆在整份填答裡是第幾筆（跨頁連號，不是每頁從 1 開始）。 */
const rowNumber = (index: number) =>
  ((meta.value?.page ?? 1) - 1) * PAGE_SIZE + index + 1

const dateTimeFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  dateStyle: 'short',
  timeStyle: 'short',
})
const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso))
</script>

<template>
  <v-container class="py-6" style="max-width: 820px">
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5">填答結果</h1>
      <v-spacer />
      <v-btn variant="text" to="/surveys">返回列表</v-btn>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" />

    <!--
      讀不到有兩種原因，而它們**對前端是同一件事**:
        403  看得到這份問卷，但結果只有擁有者與 ADMIN 能看
        404  問卷不存在，或那是別人的草稿（canSeeSurvey 就當它不存在）
      兩種都是「你不能看這一頁」，所以只有一種畫面。
    -->
    <v-alert v-else-if="!data" type="error" variant="tonal">
      看不到這份問卷的結果 —— 它不存在，或者你不是它的擁有者。
    </v-alert>

    <template v-else>
      <v-card class="mb-4">
        <v-card-text class="d-flex align-center">
          <div>
            <div class="text-h4">{{ data.responseCount }}</div>
            <div class="text-body-2 text-medium-emphasis">份填答</div>
          </div>
          <v-divider vertical class="mx-6" />
          <div>
            <div class="text-h4">{{ questions.length }}</div>
            <div class="text-body-2 text-medium-emphasis">題</div>
          </div>
        </v-card-text>

        <v-tabs v-model="tab" color="primary">
          <v-tab value="summary">摘要</v-tab>
          <v-tab value="list">個別回應</v-tab>
        </v-tabs>
      </v-card>

      <v-alert
        v-if="data.responseCount === 0"
        type="info"
        variant="tonal"
        class="mb-4"
      >
        還沒有人填寫這份問卷。
      </v-alert>

      <!-- ── 摘要 ──────────────────────────────────────── -->
      <template v-if="tab === 'summary'">
        <v-card
          v-for="(q, i) in questions"
          :key="q.questionId"
          class="mb-3"
          variant="outlined"
        >
          <v-card-text>
            <div class="d-flex align-center mb-3">
              <span class="text-subtitle-1">{{ i + 1 }}. {{ q.title }}</span>
              <v-spacer />
              <span class="text-body-2 text-medium-emphasis">
                {{ q.answerCount }} 筆回答
              </span>
            </div>

            <!--
              單選題:每個選項一條長條。
              ⚠️ **沒有人選的選項也會出現（count 是 0）** —— 那是後端刻意以題目的
              options 為基準組裝的結果。若讓資料庫的 GROUP BY 決定，
              零票的選項會整個消失，畫面上少一條長條，而使用者會以為那個選項不存在。
            -->
            <template v-if="q.options">
              <div v-for="option in q.options" :key="option.option" class="mb-2">
                <div class="d-flex align-center text-body-2 mb-1">
                  <span>{{ option.option }}</span>
                  <v-spacer />
                  <span class="text-medium-emphasis">
                    {{ option.count }}（{{
                      percent(option.count, q.answerCount)
                    }}%）
                  </span>
                </div>
                <v-progress-linear
                  :model-value="percent(option.count, q.answerCount)"
                  color="primary"
                  height="10"
                  rounded
                  bg-color="grey-lighten-3"
                />
              </div>
            </template>

            <!--
              簡答題數不出分佈（每個人寫的都不一樣），所以只顯示筆數與最近幾筆原文。
              **這是抽樣不是全部** —— 後端只回最近 5 筆，要看全部請切到「個別回應」。
            -->
            <template v-else-if="q.samples">
              <div
                v-if="q.samples.length === 0"
                class="text-medium-emphasis text-body-2"
              >
                還沒有人回答這一題。
              </div>
              <template v-else>
                <div class="text-body-2 text-medium-emphasis mb-2">
                  最近的回答
                </div>
                <v-sheet
                  v-for="(sample, j) in q.samples"
                  :key="j"
                  class="pa-3 mb-2 text-body-2"
                  color="grey-lighten-4"
                  rounded
                >
                  {{ sample }}
                </v-sheet>
                <div
                  v-if="q.answerCount > q.samples.length"
                  class="text-body-2 text-medium-emphasis"
                >
                  另外還有 {{ q.answerCount - q.samples.length }} 筆沒有顯示 ——
                  切到「個別回應」可以逐筆看完。
                </div>
              </template>
            </template>
          </v-card-text>
        </v-card>

        <div
          v-if="questions.length === 0"
          class="text-center text-medium-emphasis py-8"
        >
          這份問卷沒有任何題目。
        </div>
      </template>

      <!-- ── 個別回應 ──────────────────────────────────── -->
      <template v-else>
        <div class="d-flex align-center mb-3">
          <span class="text-body-2 text-medium-emphasis">
            一次顯示 {{ PAGE_SIZE }} 筆
          </span>
          <v-spacer />
          <!--
            排序是這一章唯一真的用到 Ch4 那組參數的地方。
            後端只接受 asc / desc（白名單）—— 送別的值是 400 而不是 500。
          -->
          <v-btn-toggle
            v-model="order"
            density="compact"
            variant="outlined"
            mandatory
          >
            <v-btn value="desc" size="small">最新的在前</v-btn>
            <v-btn value="asc" size="small">最舊的在前</v-btn>
          </v-btn-toggle>
        </div>

        <v-progress-linear v-if="listLoading" indeterminate color="primary" />

        <v-card
          v-for="(item, i) in items"
          :key="item.id"
          class="mb-3"
          variant="outlined"
        >
          <v-card-text>
            <div class="d-flex align-center mb-3">
              <!--
                ⚠️ **沒有填答者。** 後端的 Response 沒有 userId（匿名填答），
                所以這裡只有時間 —— 那是 schema 層的決定，不是這一頁漏做。
              -->
              <span class="text-subtitle-2">第 {{ rowNumber(i) }} 筆</span>
              <v-spacer />
              <span class="text-body-2 text-medium-emphasis">
                {{ formatDateTime(item.createdAt) }}
              </span>
            </div>

            <div v-for="answer in item.answers" :key="answer.id" class="mb-2">
              <!--
                答案身上只有 questionId，題目文字來自摘要那一支 ——
                所以這一頁**沒有為了題目多發任何請求**。
                對不到題目時（題目被刪掉了）顯示 id，不要讓整塊變空白。
              -->
              <div class="text-body-2 text-medium-emphasis">
                {{ questionById.get(answer.questionId)?.title ?? answer.questionId }}
              </div>
              <div class="text-body-1">{{ answer.content }}</div>
            </div>
          </v-card-text>
        </v-card>

        <div
          v-if="!listLoading && items.length === 0"
          class="text-center text-medium-emphasis py-8"
        >
          還沒有人填寫這份問卷。
        </div>

        <div
          v-if="meta && meta.totalPages > 1"
          class="d-flex align-center justify-space-between mt-4"
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
      </template>
    </template>
  </v-container>
</template>
