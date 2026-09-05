<script setup lang="ts">
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
