<script setup lang="ts">
/**
 * 新增問卷（Ch17 輪 ②）。
 *
 * 標題與題目**一起送出、一次建好**。後端輪 ② 之前只收 `{ title }`，
 * 題目要一題一題 POST —— 建一份 5 題的問卷是 6 次請求，而且第 3 題失敗時
 * 前面已經寫進資料庫了，使用者卻看到「失敗」。改成巢狀 create 之後
 * Prisma 自己包了交易：要嘛整份建好，要嘛一個字都不留。
 *
 * 這一頁也是後端 Ch15 那個 `fields` 第一次真的被用到的地方 ——
 * 400 回來時把紅字標到**出錯的那一格**，而不是跳一個「輸入的內容不正確」。
 */
import type { CreateQuestion, QuestionType } from '~/api/surveys'

const notification = useNotificationStore()

// ── 表單狀態 ──────────────────────────────────────────────
//
// 本地的題目多帶一個 key，只為了給 v-for 當識別。
// **不能用索引當 key**：刪掉第 2 題時，第 3 題會頂上索引 2，
// Vue 會把它當成「同一個節點只是內容變了」而重用 DOM ——
// 輸入框裡的游標位置、剛打到一半的字都會錯位。
type DraftQuestion = CreateQuestion & { key: number }

let nextKey = 0
const newQuestion = (): DraftQuestion => ({
  key: nextKey++,
  title: '',
  type: 'TEXT',
  options: ['', ''],
})

const title = ref('')
const questions = ref<DraftQuestion[]>([])
const pending = ref(false)

/**
 * 後端回來的欄位級錯誤：`{ 'questions.0.options': '單選題至少要有兩個選項' }`。
 *
 * 送出前清空 —— 不然改好第一題之後，舊的紅字還掛在那裡。
 */
const serverErrors = ref<Record<string, string>>({})

const TYPES: { title: string; value: QuestionType }[] = [
  { title: '簡答', value: 'TEXT' },
  { title: '單選', value: 'SINGLE_CHOICE' },
]

// ── 前端的即時驗證 ────────────────────────────────────────
//
// ⚠️ 這幾條規則是**硬寫的**，而契約裡其實有 maxLength: 200
//（後端 create-survey.dto.ts / create-question.dto.ts 的 @ApiProperty）——
// 但 openapi-typescript 不會把 maxLength 產進 TypeScript 型別，
// TS 也沒有「最多 200 字的字串」這種型別。所以這是**兩份規則**，
// 而它們可能漂移（後端 Ch15 那一輪已經確認過這件事無解，只能讓契約看得到）。
//
// 分工是清楚的，不是重複：
//   前端這份  UX —— 打字的當下就給回饋，不必等一次往返
//   後端那份  防守 —— 有人繞過前端時擋下來
const required = (v: string) => !!v?.trim() || '必填'
const maxTitle = (v: string) => (v?.length ?? 0) <= 200 || '最多 200 個字'

function addQuestion() {
  questions.value.push(newQuestion())
}

function removeQuestion(index: number) {
  questions.value.splice(index, 1)
}

function move(index: number, delta: number) {
  const to = index + delta
  if (to < 0 || to >= questions.value.length) return
  const list = questions.value
  // 交換而不是 splice 兩次 —— 少一次中間狀態，也不會動到其他索引。
  ;[list[index], list[to]] = [list[to]!, list[index]!]
}

function addOption(question: DraftQuestion) {
  question.options.push('')
}

function removeOption(question: DraftQuestion, index: number) {
  question.options.splice(index, 1)
}

// ── 送出 ──────────────────────────────────────────────────
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return

  serverErrors.value = {}
  pending.value = true

  const { data, ok, error } = await surveysApi.create({
    title: title.value.trim(),
    // key 是前端自己加的，**不能送出去** —— 後端的 whitelist 會無聲丟掉它，
    // 但依賴那個行為等於把「多送沒關係」寫進前端。這裡明確拿掉。
    //
    // TEXT 題一律送空陣列：使用者可能先填了選項才改成簡答，
    // 那些殘留的字不該被存進去。
    questions: questions.value.map((q) => ({
      title: q.title.trim(),
      type: q.type,
      options: q.type === 'SINGLE_CHOICE' ? q.options.map((o) => o.trim()) : [],
    })),
  })

  pending.value = false

  if (!ok) {
    // 通用的 toast 由 useMyService 跳過了，這裡只做它做不到的事：
    // 把紅字標到出錯的那一格。
    serverErrors.value = toFieldErrors(error)
    return
  }

  notification.success(`已建立「${data?.title ?? title.value}」`)
  await navigateTo('/surveys')
}
</script>

<template>
  <v-container class="py-6" style="max-width: 880px">
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5">新增問卷</h1>
      <v-spacer />
      <v-btn variant="text" to="/surveys">取消</v-btn>
      <v-btn color="primary" :loading="pending" class="ml-2" @click="submit">
        建立
      </v-btn>
    </div>

    <v-form ref="formRef" @submit.prevent="submit">
      <v-card class="mb-4">
        <v-card-text>
          <v-text-field
            v-model="title"
            label="問卷標題"
            variant="outlined"
            counter="200"
            :rules="[required, maxTitle]"
            :error-messages="serverErrors.title"
          />
          <div class="text-body-2 text-medium-emphasis">
            建立後是<strong>草稿</strong>，確認內容之後再發布。
          </div>
        </v-card-text>
      </v-card>

      <v-card
        v-for="(q, i) in questions"
        :key="q.key"
        class="mb-3"
        variant="outlined"
      >
        <v-card-title class="d-flex align-center text-subtitle-1">
          第 {{ i + 1 }} 題
          <v-spacer />
          <v-btn
            icon="mdi-arrow-up"
            size="small"
            variant="text"
            :disabled="i === 0"
            @click="move(i, -1)"
          />
          <v-btn
            icon="mdi-arrow-down"
            size="small"
            variant="text"
            :disabled="i === questions.length - 1"
            @click="move(i, 1)"
          />
          <v-btn
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            @click="removeQuestion(i)"
          />
        </v-card-title>

        <v-card-text>
          <div class="d-flex ga-3 flex-wrap">
            <v-text-field
              v-model="q.title"
              label="題目"
              variant="outlined"
              density="compact"
              counter="200"
              :rules="[required, maxTitle]"
              :error-messages="serverErrors[`questions.${i}.title`]"
              style="flex: 1 1 320px"
            />
            <v-select
              v-model="q.type"
              :items="TYPES"
              label="類型"
              variant="outlined"
              density="compact"
              style="flex: 0 0 160px"
            />
          </div>

          <!--
            選項只有單選題才出現。改成簡答時**不清掉** options ——
            使用者切回單選時原本打的字還在，而送出時本來就會忽略它們。
          -->
          <div v-if="q.type === 'SINGLE_CHOICE'">
            <div class="text-body-2 text-medium-emphasis mb-2">選項</div>

            <div
              v-for="(option, j) in q.options"
              :key="j"
              class="d-flex align-center ga-2"
            >
              <v-text-field
                v-model="q.options[j]"
                :label="`選項 ${j + 1}`"
                variant="outlined"
                density="compact"
                :rules="[required]"
              />
              <v-btn
                icon="mdi-close"
                size="small"
                variant="text"
                :disabled="q.options.length <= 2"
                @click="removeOption(q, j)"
              />
            </div>

            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-plus"
              @click="addOption(q)"
            >
              新增選項
            </v-btn>

            <!--
              這一格對應後端的 SingleChoiceNeedsOptions
              （fields 是 { field: 'questions.N.options', rule: 'singleChoiceNeedsOptions' }）。
              前端已經擋住了同一件事，所以正常不會出現 —— 它是繞過前端時的第二道。
            -->
            <div
              v-if="serverErrors[`questions.${i}.options`]"
              class="text-error text-body-2 mt-1"
            >
              {{ serverErrors[`questions.${i}.options`] }}
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-btn variant="tonal" prepend-icon="mdi-plus" @click="addQuestion">
        新增題目
      </v-btn>

      <div class="text-body-2 text-medium-emphasis mt-3">
        不加題目也可以 —— 那會建立一份空草稿,之後再補。
      </div>
    </v-form>
  </v-container>
</template>
