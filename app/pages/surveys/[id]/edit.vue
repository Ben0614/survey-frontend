<script setup lang="ts">
/**
 * 編輯問卷（Ch17 輪 ③）。
 *
 * 這一頁逼出了後端三個問題，三個都在輪 ③ 就地修掉了：
 *
 *   1. **編輯不是原子的** —— 改標題、改題、加題、刪題各一支端點，
 *      一份 N 題的問卷要打 1 + N 次請求，第 3 個失敗就留下改到一半的問卷
 *   2. **`order` 完全改不了** —— CreateQuestionDto 刻意沒有它、
 *      UpdateQuestionDto 是它的 PartialType，所以題目順序建好之後永久固定
 *   3. **空問卷可以發布** —— publish 只檢查擁有權，一題都沒有照樣上架，
 *      出現在「可以填的」清單裡，點進去一片空白
 *
 * 前兩個由 `PUT /surveys/:id/questions`（整份取代，順序＝陣列位置）解掉，
 * 第三個由 `canPublish` 解掉。**三個 e2e 都抓不到 —— 要有人真的用才會撞到。**
 *
 * 讀不到問卷時只會是 **404，不會是 403**：`canSeeSurvey` 先擋，別人的草稿一律
 * 當作不存在（Ch15）。回 403 等於承認「這個 id 存在」，別人就能靠掃 id 列舉。
 * 所以錯誤畫面只要一種。
 */
import type { DraftQuestion } from '~/utils/questions'

const route = useRoute()
const notification = useNotificationStore()

const id = computed(() => route.params.id as string)

// ── 讀取 ──────────────────────────────────────────────────
//
// 用 useAsyncData 而不是 onMounted + ref：這是「掛載時就發請求」，
// 而 useMyService 的定位是命令式的（按鈕觸發）——分工寫在它的檔頭。
//
// key 帶上 id，否則從一份問卷切到另一份時會沿用上一份的快取。
const { data, status, refresh } = await useAsyncData(
  () => `survey-edit-${id.value}`,
  async () => {
    const { data, ok } = await surveysApi.get(id.value)
    return ok ? data : null
  },
)

const loading = computed(() => status.value === 'pending')
const isDraft = computed(() => data.value?.status === 'DRAFT')

// ── 編輯中的狀態 ──────────────────────────────────────────
const title = ref('')
const questions = ref<DraftQuestion[]>([])
const serverErrors = ref<Record<string, string>>({})

/**
 * 伺服器那一份的「快照」，用來判斷有沒有改過。
 *
 * 題目比對的是 **payload 的 JSON**，不是物件本身：`key` 是本地加的、
 * 每次 toDraftQuestions 都會產生新的值，直接比物件永遠不相等。
 * 比 payload 等於「送出去會不會不一樣」——那才是我們真正想問的問題。
 */
const snapshot = computed(() => ({
  title: data.value?.title ?? '',
  questions: JSON.stringify(
    toCreatePayload(toDraftQuestions(data.value?.questions ?? [])),
  ),
}))

/**
 * 伺服器資料一到（或 refresh 之後）就把本地狀態重設成它。
 *
 * `immediate: true` 不能省 —— useAsyncData 在 SSR 已經把資料抓好了，
 * watch 預設不會為「一開始就有的值」觸發，少了它畫面會是空的。
 */
watch(
  data,
  (survey) => {
    title.value = survey?.title ?? ''
    questions.value = toDraftQuestions(survey?.questions ?? [])
    serverErrors.value = {}
  },
  { immediate: true },
)

const titleChanged = computed(() => title.value.trim() !== snapshot.value.title)
const questionsChanged = computed(
  () => JSON.stringify(toCreatePayload(questions.value)) !== snapshot.value.questions,
)
// 已發布的問卷改不了題目，所以那一半的改動不算數（也送不出去）。
const dirty = computed(
  () => titleChanged.value || (isDraft.value && questionsChanged.value),
)

// ── 儲存 ──────────────────────────────────────────────────
const saving = ref(false)
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)

const required = (v: string) => !!v?.trim() || '必填'
const maxTitle = (v: string) => (v?.length ?? 0) <= 200 || '最多 200 個字'

/**
 * 失敗之後要不要把畫面重載回伺服器的狀態。
 *
 * 400（驗證沒過）**不要重載** —— 使用者打了一半的字會全部消失，
 * 而問題就在他眼前那一格，紅字標出來就好。
 * 其他失敗（403 / 404 / 409）代表**伺服器的狀態跟這一頁的假設不一樣了**
 *（別人撤了發布、問卷被刪、有人開始填答），這時繼續讓他編輯只會再錯一次。
 */
function shouldReload(code: string | undefined) {
  return code !== 'VALIDATION_FAILED' && code !== 'BAD_REQUEST'
}

/**
 * 儲存 —— **兩次請求，而且不是原子的**。
 *
 * 順序是「先題目、後標題」，理由是**讓最容易失敗的先跑**：
 * PUT 會撞驗證（400）、狀態（409）、擁有權（403）；PATCH 幾乎只會成功。
 * 先跑 PUT 的話它失敗時標題還沒動，使用者重按一次就好；
 * 反過來則會留下「標題改了、題目沒改」，而畫面說失敗。
 *
 * 兩邊都沒改就一個請求都不送（按鈕本來也是 disabled）。
 */
async function save() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return

  serverErrors.value = {}
  saving.value = true

  try {
    if (isDraft.value && questionsChanged.value) {
      const { data: saved, ok, error } = await surveysApi.replaceQuestions(
        id.value,
        toCreatePayload(questions.value),
      )
      if (!ok) {
        serverErrors.value = toFieldErrors(error)
        if (shouldReload(error?.code)) await refresh()
        return
      }
      // ⚠️ **一定要用回傳值取代本地狀態。** 整份取代是「全刪重建」，
      // 這些題目的 id 全是新的，手上那些舊 id 一個都不能再用
      //（後端有一條 e2e 把這件事寫成規格）。
      questions.value = toDraftQuestions(saved ?? [])
    }

    if (titleChanged.value) {
      const { ok, error } = await surveysApi.update(id.value, {
        title: title.value.trim(),
      })
      if (!ok) {
        serverErrors.value = toFieldErrors(error)
        if (shouldReload(error?.code)) await refresh()
        return
      }
    }

    notification.success('已儲存')
    // 重新讀一次，讓 snapshot 跟著更新 —— 否則「有沒有改過」會一直是 true，
    // 儲存鈕永遠亮著，而且再按一次會送出一模一樣的內容。
    await refresh()
  } finally {
    saving.value = false
  }
}

// ── 發布 / 撤回 ───────────────────────────────────────────
const publishing = ref(false)

/**
 * 發布與撤回共用一顆按鈕。
 *
 * 兩條後端規則**刻意不複製到前端**：
 *   發布 —— 一題都沒有會回 409
 *   撤回 —— 已經有人填答會回 409
 * 按鈕照樣可以按，失敗時由 useMyService 把後端的訊息跳成 toast。
 * 前端每複製一條後端規則，就多一個會安靜過期的地方
 *（列表頁那個 `v-if="auth.isAdmin"` 就是它過期的樣子）。
 *
 * 有未儲存的變更時擋下來 —— 那不是複製規則，是這一頁自己的狀態：
 * 發布一份「畫面上有、資料庫裡沒有」的內容，使用者一定會誤會。
 */
async function togglePublish() {
  const toPublish = isDraft.value

  publishing.value = true
  const { ok } = toPublish
    ? await surveysApi.publish(id.value)
    : await surveysApi.unpublish(id.value)
  publishing.value = false

  if (!ok) return // 失敗的 toast 由 useMyService 跳，這裡不要再跳一次

  notification.success(toPublish ? '已發布' : '已撤回發布')
  await refresh()
}
</script>

<template>
  <AppShell
    :title="data?.title ?? '編輯問卷'"
    :subtitle="data ? (isDraft ? '草稿 · 題目可以改' : '發布中 · 題目唯讀') : '　'"
    :max-width="880"
  >
    <template #actions>
      <div class="d-flex ga-2">
        <v-btn variant="flat" class="app-chip-ghost" to="/surveys">返回列表</v-btn>
        <v-btn
          v-if="data"
          variant="flat"
          class="app-chip-ghost"
          :loading="publishing"
          :disabled="dirty"
          @click="togglePublish"
        >
          {{ isDraft ? '發布' : '撤回發布' }}
        </v-btn>
        <v-btn
          v-if="data"
          size="large"
          variant="flat"
          :loading="saving"
          :disabled="!dirty"
          :style="
            dirty
              ? 'background: var(--app-lime); color: #211e38; font-weight: 700'
              : ''
          "
          @click="save"
        >
          儲存
        </v-btn>
      </div>
    </template>

    <v-progress-linear v-if="loading" indeterminate color="primary" rounded />

    <!--
      讀不到只有一種情況要顯示：404。403 不會發生（canSeeSurvey 先擋），
      401 已經被 useMyService 清 session 並導去登入頁了。
    -->
    <v-alert v-else-if="!data" type="error">
      找不到這份問卷，或你沒有權限編輯它。
    </v-alert>

    <v-form v-else ref="formRef">
      <v-card class="pa-6 mb-4">
        <v-text-field
          v-model="title"
          label="問卷標題"
          counter="200"
          :rules="[required, maxTitle]"
          :error-messages="serverErrors.title"
        />
        <!--
          標題在**兩種狀態都能改**，這不是漏掉：後端 PATCH /surveys/:id
          只檢查擁有權，沒有 canEditQuestions。改錯字不會讓已送出的答案
          對不起來，改題目才會。
        -->
        <div class="text-body-2 app-muted">標題隨時可以改，已發布也一樣。</div>
      </v-card>

      <v-alert v-if="!isDraft" type="info" class="mb-4">
        已發布的問卷不能改題目。要修改請先<strong>撤回發布</strong> ——
        但只要有人填過就撤不回來了（撤回之後題目能改，舊答案會對不起來）。
      </v-alert>

      <QuestionListEditor
        v-model="questions"
        :server-errors="serverErrors"
        :readonly="!isDraft"
      />

      <div v-if="isDraft" class="text-body-2 app-muted mt-4">
        題目的順序就是這裡的順序。<strong>儲存時整份送出</strong> ——
        沒有列出來的題目就是被刪掉了。
      </div>
    </v-form>
  </AppShell>
</template>
