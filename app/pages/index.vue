<script setup lang="ts">
// 這個專案沒有首頁 —— 進站直接去問卷列表。
// 沒登入的話 auth.global 守衛會在到達之前就把人攔去 /login。
definePageMeta({ redirect: '/surveys' })
</script>

<template>
  <div />
</template>
