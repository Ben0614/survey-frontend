<script setup lang="ts">
/**
 * ⚠️ **佔位頁。** Ch15 會把它換成真正的問卷列表（`GET /surveys` + 分頁 + 刪除）。
 *
 * 這一輪它只做一件事：**證明登入之後的狀態是真的**。
 * 上面顯示的 email 與 role 不是從登入表單留下來的，是 reload 之後
 * 路由守衛拿 cookie 裡的 token 去打 `GET /auth/me` 換回來的 ——
 * 按 F5 之後這一頁還在、而且資料還在，那才叫「還原身分成功」。
 */
const auth = useAuthStore()

async function logout() {
  auth.clearSession()
  await navigateTo('/login')
}
</script>

<template>
  <v-container class="py-8">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <v-card>
          <v-card-title class="text-h6">已登入</v-card-title>

          <v-card-text>
            <v-list density="compact">
              <v-list-item title="Email" :subtitle="auth.user?.email ?? '—'" />
              <v-list-item title="角色" :subtitle="auth.user?.role ?? '—'" />
              <v-list-item title="使用者 id" :subtitle="auth.user?.id ?? '—'" />
            </v-list>

            <v-alert type="info" variant="tonal" density="compact" class="mt-2">
              按 F5 重新整理，這些資料應該還在 —— 那代表 token 活過了 reload、
              而且 <code>GET /auth/me</code> 把身分換回來了。
            </v-alert>
          </v-card-text>

          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="logout">登出</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
