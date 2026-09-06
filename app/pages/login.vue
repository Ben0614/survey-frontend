<script setup lang="ts">
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
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card>
          <v-card-title class="text-h6 pt-4">問卷平台</v-card-title>

          <v-tabs v-model="mode" grow>
            <v-tab value="login" @click="switchMode('login')">登入</v-tab>
            <v-tab value="register" @click="switchMode('register')">註冊</v-tab>
          </v-tabs>

          <v-card-text>
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
                block
                class="mt-2"
                :loading="pending"
              >
                {{ isRegister ? '註冊並登入' : '登入' }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
