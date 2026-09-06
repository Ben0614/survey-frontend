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
 *
 * **輪 ③ 把題目編輯的部分抽成了 `<QuestionListEditor>`**，因為編輯頁要用同一套。
 * 這一頁剩下的是它獨有的東西：標題、送出、以及「建完就導回列表」。
 */
import type { DraftQuestion } from '~/utils/questions'

const notification = useNotificationStore()

const title = ref('')
const questions = ref<DraftQuestion[]>([])
const pending = ref(false)

/**
 * 後端回來的欄位級錯誤：`{ 'questions.0.options': '單選題至少要有兩個選項' }`。
 *
 * 送出前清空 —— 不然改好第一題之後，舊的紅字還掛在那裡。
 */
const serverErrors = ref<Record<string, string>>({})

const required = (v: string) => !!v?.trim() || '必填'
const maxTitle = (v: string) => (v?.length ?? 0) <= 200 || '最多 200 個字'

const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return

  serverErrors.value = {}
  pending.value = true

  const { data, ok, error } = await surveysApi.create({
    title: title.value.trim(),
    // toCreatePayload 負責拿掉本地的 key、並讓 TEXT 題送空陣列
    //（見 utils/questions.ts）。
    questions: toCreatePayload(questions.value),
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

      <QuestionListEditor v-model="questions" :server-errors="serverErrors" />

      <div class="text-body-2 text-medium-emphasis mt-3">
        不加題目也可以 —— 那會建立一份空草稿，之後再補。
        <strong>但空的問卷不能發布</strong>（後端會回 409）。
      </div>
    </v-form>
  </v-container>
</template>
