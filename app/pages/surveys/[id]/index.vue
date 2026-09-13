<script setup lang="ts">
useHead({ title: '問卷內容' })

/**
 * 問卷內容（唯讀詳情頁，`/surveys/:id`）。
 *
 * **為什麼補這一頁：Ch17 做完之後，「看一份別人的已發布問卷」是做不到的。**
 * 當時只有五頁，而能看到題目的只有兩頁：
 *
 * ```
 * edit.vue   擁有者 / ADMIN 才進得去
 * fill.vue   進得去，但它是**填答表單** —— 想先看看內容的人被直接推進填答流程
 * ```
 *
 * 於是一個新註冊的帳號登入後，清單上每一份都只剩「填寫」一顆鈕，
 * 點進去就是在作答。那不是權限問題 —— **後端早就給得出來**：
 *
 * ```ts
 * canSeeSurvey = status === PUBLISHED || canManageSurvey(...)   // 已發布的任何人都看得到
 * GET /surveys/:id?includeQuestions=true                        // surveysApi.get 已經包好了
 * ```
 *
 * 所以這一頁**後端一行都沒動、契約也不必重產**，純粹是前端少一頁。
 * 這也是 Ch17 那個結論再出現一次：**e2e 全綠也抓不到「不好用」。**
 *
 * 讀不到時只會是 **404，不會是 403**：`canSeeSurvey` 先擋，別人的草稿一律
 * 當作不存在（Ch15）。回 403 等於承認「這個 id 存在」，別人就能靠掃 id 列舉。
 */
import type { Question } from '~/api/surveys'

const route = useRoute()
const auth = useAuthStore()
const notification = useNotificationStore()

const id = computed(() => route.params.id as string)

// key 帶上 id，否則從一份問卷切到另一份時會沿用上一份的快取。
const { data, status: fetchStatus } = await useAsyncData(
  () => `survey-view-${id.value}`,
  async () => {
    const { data, ok } = await surveysApi.get(id.value)
    return ok ? data : null
  },
)

const loading = computed(() => fetchStatus.value === 'pending')
const questions = computed<Question[]>(() => data.value?.questions ?? [])

/**
 * 能不能管這一份。**判準是 `~/utils/permissions.ts` 那一份，不在這裡重寫** ——
 * 這一頁出現之前它是列表頁的區域函式，而「抄第二份」正是它漂移過三次的原因。
 */
const canManage = computed(() =>
  canManageSurvey(data.value?.ownerId ?? null, auth.user),
)
const isMine = computed(() => isMySurvey(data.value?.ownerId ?? null, auth.user))

// 題型標籤。用 Record 而不是 v-if：後端加一種題型時這裡會編譯不過（同 SurveyStatusChip）。
const TYPE_LABEL: Record<Question['type'], string> = {
  TEXT: '簡答',
  SINGLE_CHOICE: '單選',
}

// ⚠️ 日期一定要指定時區，否則 SSR 會有 hydration mismatch：伺服器（部署後是 UTC）
// 與瀏覽器（使用者本機）算出來的字串不一樣。寫死 Asia/Taipei 是產品決定。
const dateTimeFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  dateStyle: 'short',
  timeStyle: 'short',
})
const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso))

// ── 刪除 ──────────────────────────────────────────────────
//
// 用 v-dialog 而不是原生 confirm()：原生對話框會凍住整個分頁（包含 Vue 的排程），
// 而且沒辦法做成這個 app 的樣子。
const confirming = ref(false)
const deleting = ref(false)

/**
 * 刪除這一份，成功就回列表。
 *
 * **兩條後端規則刻意不複製到前端**（同列表頁）：
 *   有人填答過 → 409，按鈕照樣能按，訊息由 useMyService 跳成 toast
 *   不是你的   → 403，這顆鈕本來就藏起來了，但藏起來只是 UI
 * 前端每複製一條後端規則，就多一個會安靜過期的地方。
 */
async function remove() {
  deleting.value = true
  const { ok } = await surveysApi.remove(id.value)
  deleting.value = false
  confirming.value = false

  if (!ok) return // 失敗的 toast 由 useMyService 跳，這裡不要再跳一次

  notification.success(`已刪除「${data.value?.title ?? ''}」`)
  // 刪完不能留在這一頁 —— 它的資料已經不存在了，refresh 會變成 404。
  await navigateTo('/surveys')
}
</script>

<template>
  <AppShell
    :title="data?.title ?? '問卷內容'"
    :subtitle="
      data ? `${questions.length} 題 · 建立於 ${formatDateTime(data.createdAt)}` : '　'
    "
    :max-width="880"
  >
    <template #actions>
      <div class="d-flex ga-2 align-center">
        <v-btn variant="flat" class="app-chip-ghost" to="/surveys">返回列表</v-btn>

        <!-- 管理動作：條件與它為什麼只有一份，寫在 canManage 上方。 -->
        <v-btn
          v-if="canManage"
          variant="flat"
          class="app-chip-ghost"
          :to="`/surveys/${id}/edit`"
        >
          編輯
        </v-btn>
        <v-btn
          v-if="canManage"
          variant="flat"
          class="app-chip-ghost"
          :to="`/surveys/${id}/result`"
        >
          結果
        </v-btn>

        <!--
          填寫是這一頁唯一的「主要動作」，所以只有它用檸檬綠 ——
          全站只有一種按鈕是這個顏色，它不必再靠大小或位置去搶注意力。
        -->
        <v-btn
          v-if="data?.status === 'PUBLISHED'"
          size="large"
          variant="flat"
          :to="`/surveys/${id}/fill`"
          style="background: var(--app-lime); color: #211e38; font-weight: 700"
        >
          填寫
        </v-btn>
      </div>
    </template>

    <v-progress-linear v-if="loading" indeterminate color="primary" rounded />

    <v-alert v-else-if="!data" type="error">
      找不到這份問卷 —— 它不存在，或者它還是別人的草稿。
    </v-alert>

    <template v-else>
      <!-- 狀態與時間。這一塊刻意不顯示 ownerId：那是一串 cuid，對人沒有意義，
           而「誰建的」後端只給 id（沒有 owner 的 email）。只說「是不是你」。 -->
      <div class="app-row pa-5 mb-4 d-flex align-center ga-4 flex-wrap">
        <SurveyStatusChip :status="data.status" />
        <span v-if="isMine" class="text-body-2 app-muted">你建立的</span>
        <v-spacer />
        <span class="text-body-2 app-muted">
          最後更新 {{ formatDateTime(data.updatedAt) }}
        </span>
      </div>

      <v-alert v-if="data.status !== 'PUBLISHED'" type="info" class="mb-4">
        這份問卷還是草稿，還不能填寫。
      </v-alert>

      <!--
        題目區是**純顯示**，不是 readonly 的 `<QuestionListEditor>`。
        那個元件 readonly 之後仍然渲染一整排輸入框，看起來像填到一半的表單 ——
        這一頁的讀者是「想知道這份問卷在問什麼」的人，不是要改它的人。
      -->
      <v-card
        v-for="(q, i) in questions"
        :key="q.id"
        class="pa-6 mb-3"
        style="box-shadow: var(--app-shadow)"
      >
        <div class="d-flex align-center ga-4 mb-3">
          <span class="text-h6 font-weight-bold" style="line-height: 1.4">
            <span class="app-muted mr-2">{{ i + 1 }}.</span>{{ q.title }}
          </span>
          <v-spacer />
          <span
            class="text-caption font-weight-bold px-3 py-1"
            style="
              border-radius: 999px;
              white-space: nowrap;
              background: var(--app-primary-soft);
              color: var(--app-primary);
            "
          >
            {{ TYPE_LABEL[q.type] }}
          </span>
        </div>

        <!--
          選項只畫「圈圈 + 文字」，不用 v-radio-group：真的放一組 radio 的話，
          使用者點得動（而且點了什麼都不會發生）。這裡要的是看，不是選。
        -->
        <template v-if="q.type === 'SINGLE_CHOICE'">
          <div
            v-for="option in q.options"
            :key="option"
            class="d-flex align-center ga-3 py-1"
          >
            <span
              style="
                width: 14px;
                height: 14px;
                border-radius: 999px;
                border: 2px solid var(--app-muted);
                flex: 0 0 auto;
              "
            />
            <span class="text-body-1">{{ option }}</span>
          </div>
        </template>

        <div
          v-else
          class="pa-3 text-body-2 app-muted"
          style="background: var(--app-fill); border-radius: 14px"
        >
          填答者自由作答（最多 500 字）
        </div>
      </v-card>

      <div
        v-if="questions.length === 0"
        class="app-row pa-10 text-center app-muted"
      >
        這份問卷沒有任何題目。
        <template v-if="canManage">
          <br />
          <strong>一題都沒有的問卷不能發布</strong> —— 到「編輯」加幾題。
        </template>
      </div>

      <!--
        刪除放在最下面、而且是這一頁唯一不在頭帶上的動作。
        理由不是排版：頭帶上那一排是「常用動作」，而刪除是這一頁唯一不可回復的事，
        跟「返回列表」並排只會增加誤點。
      -->
      <div v-if="canManage" class="d-flex justify-end mt-6">
        <v-btn
          variant="flat"
          class="app-btn-danger-soft"
          prepend-icon="mdi-trash-can-outline"
          @click="confirming = true"
        >
          刪除這份問卷
        </v-btn>
      </div>

      <v-dialog v-model="confirming" max-width="420" :persistent="deleting">
        <v-card class="pa-2">
          <v-card-title class="text-h6 font-weight-bold">刪除問卷</v-card-title>
          <v-card-text class="app-ink-soft">
            確定要刪除「{{ data.title }}」嗎？
          </v-card-text>
          <v-card-actions class="px-4 pb-4">
            <v-spacer />
            <v-btn
              variant="flat"
              class="app-btn-soft"
              :disabled="deleting"
              @click="confirming = false"
            >
              取消
            </v-btn>
            <v-btn color="error" variant="flat" :loading="deleting" @click="remove">
              刪除
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>
  </AppShell>
</template>
