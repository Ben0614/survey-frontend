<script setup lang="ts">
/**
 * 填答結果 —— 摘要（Ch17 輪 ⑤a）。
 *
 * 這一頁是這一章原始命題的答案:**Ch4 定的分頁參數好不好用?**
 *
 *   逐筆瀏覽  很好用 —— 那正是它設計的用途（輪 ⑤b 會用到）
 *   統計      **完全不能用** —— 分頁是為了「不給你全部」，統計卻需要全部
 *
 * 所以後端加了一支不分頁的 `GET /surveys/:id/responses/summary`。
 * 不分頁不等於把資料搬回來:那一支用 GROUP BY 在資料庫算完才回，
 * 回傳量只跟「有幾題、幾個選項」有關，跟填答數無關。
 *
 * 順帶一提，這一頁的前身做不出來:`GET /surveys/:id/responses` 回的
 * `ResponseEntity` 只有 `{ id, surveyId, createdAt }` —— **一串時間戳**。
 * 要顯示內容得對每一筆再打一次 `/responses/:id`，十筆就是十一次請求。
 * 那個 N+1 由輪 ⑤b 處理。
 */
import type { QuestionSummary } from '~/api/responses'

const route = useRoute()

const id = computed(() => route.params.id as string)

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

const dateFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  dateStyle: 'short',
})
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
      </v-card>

      <v-alert
        v-if="data.responseCount === 0"
        type="info"
        variant="tonal"
        class="mb-4"
      >
        還沒有人填寫這份問卷。下面每一題的數字都是 0。
      </v-alert>

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
            <div
              v-for="option in q.options"
              :key="option.option"
              class="mb-2"
            >
              <div class="d-flex align-center text-body-2 mb-1">
                <span>{{ option.option }}</span>
                <v-spacer />
                <span class="text-medium-emphasis">
                  {{ option.count }}（{{ percent(option.count, q.answerCount) }}%）
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
            **這是抽樣不是全部** —— 後端只回最近 5 筆，要看全部得逐筆瀏覽（輪 ⑤b）。
          -->
          <template v-else-if="q.samples">
            <div v-if="q.samples.length === 0" class="text-medium-emphasis text-body-2">
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
                另外還有 {{ q.answerCount - q.samples.length }} 筆沒有顯示。
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
  </v-container>
</template>
