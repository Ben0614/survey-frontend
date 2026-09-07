<script setup lang="ts">
useHead({ title: '填寫問卷' })

/**
 * 填寫問卷（Ch17 輪 ④）。
 *
 * 這一頁逼出後端兩個問題，兩個都在輪 ④ 就地修掉了：
 *
 *   1. **可以只答一題就送出** —— 驗證只有 `@ArrayNotEmpty()`，一份 10 題的問卷
 *      送一題的答案照樣 201。後果會延到結果頁才爆：算「滿意 60%」時分母到底是
 *      填答人數還是這題的作答數，兩者不一樣，而且沒有地方講清楚。
 *   2. **單選題的答案不必是選項之一** —— `content` 只有 `@IsString @MaxLength(500)`，
 *      送一句自由文字給單選題也會被存起來，結果頁會多出一個沒人認得的分類。
 *
 * 兩條規則都補在後端（`responses.rules.ts`）。這一頁用 `v-radio-group` + 必填
 * 讓它們正常不會被觸發 —— **但那是 UX，不是防護**，理由同輪 ②/③。
 *
 * **這一頁不需要是擁有者。** 能看到就能填（後端 `canSeeSurvey`：PUBLISHED 的
 * 大家都看得到），那正是這個產品的用途。用擁有權去擋的話別人的問卷就沒人填得了。
 *
 * ⚠️ **填答目前是匿名的**（後端 Ch5 的決定，`Response` 沒有 `userId`）。
 * 所以這一頁做不到「你已經填過了」，也擋不住同一個人送一百次。
 * 那是 schema 變更，記在 `LEARNING.md`，留給之後獨立處理。
 */
import type { Question } from '~/api/surveys'
import type { Answer } from '~/api/responses'

const route = useRoute()
const notification = useNotificationStore()

const id = computed(() => route.params.id as string)

const { data, status } = await useAsyncData(
  () => `survey-fill-${id.value}`,
  async () => {
    const { data, ok } = await surveysApi.get(id.value)
    return ok ? data : null
  },
)

const loading = computed(() => status.value === 'pending')
const questions = computed<Question[]>(() => data.value?.questions ?? [])

/**
 * 使用者填的內容：`{ 題目 id: 答案文字 }`。
 *
 * 用 id 當 key 而不是陣列索引 —— 送出時要的就是 `questionId`，
 * 而且題目順序若在別的分頁被改過，索引會對到不同的題。
 */
const answers = ref<Record<string, string>>({})

// 進來就先把每一題都放一個空字串。
//
// 少了這一步，v-model 綁到一個不存在的 key 上仍然可以用（Vue 3 的 Proxy 會補），
// 但 `answered` 的計數會在使用者碰第一個欄位之前算錯 —— 進度顯示會從
// 「0 / 3」開始跳，而不是穩定的。
watch(
  questions,
  (list) => {
    answers.value = Object.fromEntries(list.map((q) => [q.id, '']))
  },
  { immediate: true },
)

const answered = computed(
  () => Object.values(answers.value).filter((v) => v.trim() !== '').length,
)
// 後端要求**整份必答**，所以這裡的判準跟它一致：一題都不能少。
const complete = computed(
  () => questions.value.length > 0 && answered.value === questions.value.length,
)

// ── 送出 ──────────────────────────────────────────────────
const pending = ref(false)

async function submit() {
  if (!complete.value) return

  pending.value = true
  const payload: Answer[] = questions.value.map((question) => ({
    questionId: question.id,
    // 單選題的 content 是**選項的文字本身**（後端拿它跟 options 比對），
    // 不是索引 —— v-radio 的 value 直接綁選項字串，這裡就不必轉換。
    content: (answers.value[question.id] ?? '').trim(),
  }))

  const { ok } = await responsesApi.submit(id.value, payload)
  pending.value = false

  if (!ok) return // 失敗的 toast 由 useMyService 跳，這裡不要再跳一次

  notification.success('已送出，謝謝你的填寫')
  await navigateTo('/surveys')
}
</script>

<template>
  <AppShell
    :title="data?.title ?? '填寫問卷'"
    :subtitle="
      data ? `共 ${questions.length} 題，每一題都要回答` : '　'
    "
    :max-width="760"
  >
    <template #actions>
      <div class="d-flex align-center ga-4">
        <!-- 進度放在按鈕旁邊：「為什麼不能送」要看得見，而不是按下去才知道。 -->
        <span v-if="data && questions.length" class="app-header__subtitle">
          {{ answered }} / {{ questions.length }}
        </span>
        <v-btn variant="flat" class="app-chip-ghost" to="/surveys">返回列表</v-btn>
        <v-btn
          v-if="data"
          size="large"
          variant="flat"
          :loading="pending"
          :disabled="!complete"
          :style="
            complete
              ? 'background: var(--app-lime); color: #211e38; font-weight: 700'
              : ''
          "
          @click="submit"
        >
          送出
        </v-btn>
      </div>
    </template>

    <v-progress-linear v-if="loading" indeterminate color="primary" rounded />

    <!--
      讀不到只有一種情況：404。別人的草稿一律當作不存在（後端 canSeeSurvey），
      401 已經被 useMyService 清 session 並導去登入頁了。
    -->
    <v-alert v-else-if="!data" type="error">
      找不到這份問卷，或它還沒有發布。
    </v-alert>

    <template v-else>
      <!--
        DRAFT 的問卷送出去會被後端擋（409「問卷未發布，無法填寫」），
        所以這裡先講清楚，而不是讓人填完才失敗。
        ⚠️ 這**不是**把後端規則複製過來 —— 送出鈕照樣可以按，
        真正擋下來的仍然是後端。這一段只是把已經知道的事提早說。
      -->
      <v-alert v-if="data.status !== 'PUBLISHED'" type="warning" class="mb-4">
        這份問卷還沒有發布，現在送出會被拒絕。
      </v-alert>

      <v-card
        v-for="(q, i) in questions"
        :key="q.id"
        class="pa-6 mb-3"
        style="box-shadow: var(--app-shadow)"
      >
        <div class="text-h6 font-weight-bold mb-4" style="line-height: 1.4">
          <span class="app-muted mr-2">{{ i + 1 }}.</span>{{ q.title }}
          <span style="color: var(--app-danger)">*</span>
        </div>

        <!--
          單選用 v-radio-group：value 直接綁**選項的文字**，
          所以送出時不必做任何轉換，後端拿到的就是它要比對的東西。
        -->
        <v-radio-group
          v-if="q.type === 'SINGLE_CHOICE'"
          v-model="answers[q.id]"
          hide-details
          color="primary"
        >
          <v-radio
            v-for="option in q.options"
            :key="option"
            :label="option"
            :value="option"
            class="mb-1"
          />
        </v-radio-group>

        <v-textarea
          v-else
          v-model="answers[q.id]"
          rows="2"
          auto-grow
          counter="500"
          hide-details="auto"
          placeholder="請輸入你的回答"
        />
      </v-card>

      <div
        v-if="questions.length === 0"
        class="app-row pa-10 text-center app-muted"
      >
        這份問卷沒有任何題目。
      </div>

      <div v-else class="text-body-2 app-muted mt-4">
        <!--
          「送出之後不能修改」是**目前的事實**（沒有編輯作答的端點），
          不是一條規則。等真的做了再改這句話。
        -->
        送出之後無法修改。
      </div>
    </template>
  </AppShell>
</template>
