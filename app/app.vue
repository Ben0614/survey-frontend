<script setup lang="ts">
// 分頁標題的樣板。各頁自己 useHead({ title: '...' })，這裡負責接上站名。
//
// ⚠️ **寫成函式是必要的，而且因此不能放 nuxt.config。**
// 字串樣板 '%s · 問卷平台' 在「這一頁沒給標題」時會產出
// 「 · 問卷平台」（前面掛一個孤兒分隔號）；而 nuxt.config 的 head
// 會被序列化進 build 產物，放不了函式 —— 所以樣板只能寫在這裡。
useHead({
  titleTemplate: (title) => (title ? `${title} · 問卷平台` : '問卷平台'),
})

const notification = useNotificationStore()
</script>

<template>
  <v-app>
    <NuxtRouteAnnouncer />
    <NuxtPage />

    <!--
      全域訊息列。錯誤 toast 只有這一個出口 —— useMyService 統一觸發，
      呼叫端在 `if (!ok)` 分支裡不要再跳一次（見 stores/notification.ts）。
    -->
    <v-snackbar
      v-model="notification.visible"
      :color="notification.color"
      location="top"
      :timeout="4000"
    >
      {{ notification.text }}
    </v-snackbar>
  </v-app>
</template>
