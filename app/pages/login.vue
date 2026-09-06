<script setup lang="ts">
// ⚠️ 深紫要鋪到 **body**，不能只給頁面裡那個 div。
// 那個 div 有 min-height: 100vh，但 v-application 的底色仍然在它下面 ——
// 內容比視窗矮時，捲到底會露出一條淺灰。加一個 body class 是最小的解法，
// 而且離開這一頁時 Nuxt 會自動把它移掉。
useHead({ bodyAttrs: { class: 'auth-page' } })

const auth = useAuthStore()
const notification = useNotificationStore()

type Mode = 'login' | 'register'

const mode = ref<Mode>('login')
const email = ref('')
const password = ref('')
const pending = ref(false)
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)

const isRegister = computed(() => mode.value === 'register')

const required = (v: string) => !!v || '必填'
const emailRule = (v: string) => /.+@.+\..+/.test(v) || 'Email 格式不正確'

// ⚠️ 這兩條規則是**硬寫的**，而且**即使契約補齊了也還是要硬寫**。
//
// 後端 Ch15 輪 ② 已經把 @MinLength(8) / @MaxLength(72)（72 是 bcrypt 的硬上限）
// 補進 @ApiProperty 了，所以 /docs 現在看得到、IDE hover 也看得到 ——
// 但 `openapi-typescript` **不會把 minLength 產進 TypeScript 型別**
//（TS 沒有「最短 8 字的字串」這種型別，連 JSDoc 都不會有）。
//
// 所以這是兩份規則，而它們可能漂移。那不是還沒解決的技術債，是分工：
//   前端這份  UX —— 打字的當下就給回饋，不必等一次往返
//   後端那份  防守 —— 有人繞過前端時擋下來
// 表單驗證本來就該兩邊各一份。契約補齊換到的是「硬寫時有依據可以對照」，
// 不是「硬寫會消失」。（同樣的說明見 pages/surveys/new.vue。）
const minLen = (v: string) => v.length >= 8 || '密碼至少 8 個字'
const maxLen = (v: string) => v.length <= 72 || '密碼最多 72 個字'

const passwordRules = computed(() =>
  isRegister.value ? [required, minLen, maxLen] : [required],
)

function switchMode(next: Mode) {
  mode.value = next
  formRef.value?.validate?.()
}

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return

  pending.value = true
  try {
    const body = { email: email.value, password: password.value }

    if (isRegister.value) {
      // 註冊只建立帳號、不發 token（後端刻意分成兩支端點），所以要接著登入一次。
      const registered = await auth.register(body)
      if (!registered) return
      notification.success('註冊成功，正在登入')
    }

    const loggedIn = await auth.login(body)
    if (!loggedIn) return

    // 失敗時不在這裡跳 toast —— useMyService 已經跳過了（見 stores/notification.ts）。
    await navigateTo('/surveys')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <!--
    登入頁是全站唯一**不套 AppShell** 的頁面：那個外框有登出按鈕與使用者 email，
    而這裡還沒有使用者。所以它自己畫底 —— 整片深紫，白卡置中。
  -->
  <div
    class="d-flex align-center justify-center"
    style="min-height: 100dvh; background: var(--app-header); padding: 24px"
  >
    <div style="width: 100%; max-width: 420px">
      <!-- 品牌 -->
      <div class="d-flex align-center justify-center ga-3 mb-8">
        <span
          class="d-flex align-center justify-center"
          style="
            width: 34px;
            height: 34px;
            border-radius: 11px;
            background: var(--app-lime);
          "
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#2E2A4A"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 12l5 5L20 6" />
          </svg>
        </span>
        <span
          class="text-white font-weight-black"
          style="font-size: 22px; letter-spacing: -0.02em"
        >
          問卷平台
        </span>
      </div>

      <v-card class="pa-2" style="box-shadow: var(--app-shadow-lg)">
        <v-tabs v-model="mode" grow color="primary">
          <v-tab value="login" @click="switchMode('login')">登入</v-tab>
          <v-tab value="register" @click="switchMode('register')">註冊</v-tab>
        </v-tabs>

        <v-card-text class="pt-6 px-5 pb-5">
          <v-form ref="formRef" @submit.prevent="submit">
            <v-text-field
              v-model="email"
              label="Email"
              type="email"
              autocomplete="email"
              :rules="[required, emailRule]"
              :disabled="pending"
            />

            <v-text-field
              v-model="password"
              label="密碼"
              type="password"
              :autocomplete="isRegister ? 'new-password' : 'current-password'"
              :rules="passwordRules"
              :disabled="pending"
            />

            <v-btn
              type="submit"
              color="primary"
              size="large"
              block
              class="mt-2 font-weight-bold"
              :loading="pending"
            >
              {{ isRegister ? '註冊並登入' : '登入' }}
            </v-btn>
          </v-form>
        </v-card-text>
      </v-card>

      <div
        class="text-center text-body-2 mt-6"
        style="color: #b5afd4"
      >
        建立問卷、發布、收集填答，然後看結果。
      </div>
    </div>
  </div>
</template>
