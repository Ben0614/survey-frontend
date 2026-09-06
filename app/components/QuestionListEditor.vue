<script setup lang="ts">
/**
 * 題目清單編輯器 —— `/surveys/new` 與 `/surveys/:id/edit` 共用。
 *
 * 抽出來的理由不是「重複的行數多」，是**這裡面有一份會漂移的規則**：
 * 哪些型別可選、單選題至少幾個選項、送出前怎麼整理 options。
 * 複製兩份的話，兩邊會各自過期 —— 這個專案已經踩過一次
 *（列表頁的 `v-if="auth.isAdmin"` 與後端放寬後的 `canManageSurvey` 不一致，
 * 擁有者看不到自己問卷的刪除鈕，`tsc` 與契約 diff 都沒有任何反應）。
 *
 * 它**只管題目清單**：標題、儲存按鈕、發布狀態都不歸它。
 * 判準是「換一個頁面用，它需不需要改」—— 需要就代表那件事不屬於它。
 */
import type { DraftQuestion } from '~/utils/questions'
import type { QuestionType } from '~/api/surveys'

const questions = defineModel<DraftQuestion[]>({ required: true })

const props = withDefaults(
  defineProps<{
    /**
     * 後端回來的欄位級錯誤，key 是完整路徑：`questions.0.options`。
     *
     * 由呼叫端傳進來而不是自己去拿 —— 這個元件不知道請求是誰發的，
     * 也不該知道（`/surveys/new` 送 POST、編輯頁送 PUT，兩支端點）。
     */
    serverErrors?: Record<string, string>
    /**
     * 唯讀。已發布的問卷不能改題目（後端 `canEditQuestions`，只有 DRAFT 可以）。
     *
     * ⚠️ 這只是 UI。真正擋下來的是後端的 409 —— 藏起輸入框不等於防護。
     */
    readonly?: boolean
  }>(),
  { serverErrors: () => ({}), readonly: false },
)

const TYPES: { title: string; value: QuestionType }[] = [
  { title: '簡答', value: 'TEXT' },
  { title: '單選', value: 'SINGLE_CHOICE' },
]

// ⚠️ 這幾條規則是**硬寫的**，而契約裡其實有 maxLength: 200
//（後端 create-question.dto.ts 的 @ApiProperty）—— 但 openapi-typescript
// 不會把 maxLength 產進 TypeScript 型別，TS 也沒有「最多 200 字的字串」這種型別。
// 所以這是兩份規則，而它們可能漂移（後端 Ch15 已確認無解，只能讓契約看得到）。
//
// 分工是清楚的，不是重複：
//   前端這份  UX —— 打字的當下就給回饋，不必等一次往返
//   後端那份  防守 —— 有人繞過前端時擋下來
const required = (v: string) => !!v?.trim() || '必填'
const maxTitle = (v: string) => (v?.length ?? 0) <= 200 || '最多 200 個字'

function addQuestion() {
  questions.value.push(newDraftQuestion())
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

const fieldError = (index: number, field: string) =>
  props.serverErrors[`questions.${index}.${field}`]
</script>

<template>
  <div>
    <v-card
      v-for="(q, i) in questions"
      :key="q.key"
      class="mb-3"
      variant="outlined"
    >
      <v-card-title class="d-flex align-center text-subtitle-1">
        第 {{ i + 1 }} 題
        <v-spacer />
        <template v-if="!readonly">
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
        </template>
      </v-card-title>

      <v-card-text>
        <div class="d-flex ga-3 flex-wrap">
          <v-text-field
            v-model="q.title"
            label="題目"
            variant="outlined"
            density="compact"
            counter="200"
            :readonly="readonly"
            :rules="readonly ? [] : [required, maxTitle]"
            :error-messages="fieldError(i, 'title')"
            style="flex: 1 1 320px"
          />
          <v-select
            v-model="q.type"
            :items="TYPES"
            label="類型"
            variant="outlined"
            density="compact"
            :readonly="readonly"
            style="flex: 0 0 160px"
          />
        </div>

        <!--
          選項只有單選題才出現。改成簡答時**不清掉** options ——
          使用者切回單選時原本打的字還在，而送出時本來就會忽略它們
          （見 utils/questions.ts 的 toCreatePayload）。
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
              :readonly="readonly"
              :rules="readonly ? [] : [required]"
            />
            <v-btn
              v-if="!readonly"
              icon="mdi-close"
              size="small"
              variant="text"
              :disabled="q.options.length <= 2"
              @click="removeOption(q, j)"
            />
          </div>

          <v-btn
            v-if="!readonly"
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
            v-if="fieldError(i, 'options')"
            class="text-error text-body-2 mt-1"
          >
            {{ fieldError(i, 'options') }}
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-btn
      v-if="!readonly"
      variant="tonal"
      prepend-icon="mdi-plus"
      @click="addQuestion"
    >
      新增題目
    </v-btn>

    <div
      v-if="questions.length === 0"
      class="text-body-2 text-medium-emphasis mt-3"
    >
      這份問卷還沒有任何題目。
    </div>
  </div>
</template>
