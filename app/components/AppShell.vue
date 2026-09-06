<script setup lang="ts">
/**
 * 登入後每一頁的外框：深紫頭帶 + 往上疊的內容區。
 *
 * 抽出來的理由跟 `QuestionListEditor` 一樣，是**那裡面有一份會漂移的東西**：
 * 頭帶的高度與內容區的負上邊距是一對數字（見 `assets/css/app.css`），
 * 品牌區塊、使用者 email、登出按鈕也一樣 —— 六個頁面各寫一次，
 * 遲早會有一頁的頭帶比別頁矮 4px。
 *
 * 它**只管外框**：標題、副標與右側動作由呼叫端給，內容全部走 default slot。
 * 判準同樣是「換一個頁面用，它需不需要改」—— 需要就代表那件事不屬於它。
 */
defineProps<{
  /** 頭帶上的大標。省略時頭帶只有品牌列（給填寫頁那種標題在內容區的頁面用）。 */
  title?: string
  /** 大標底下那一行小字，通常是統計或說明。 */
  subtitle?: string
  /** 內容區的最大寬度。列表頁寬、表單頁窄。 */
  maxWidth?: number
}>()

const auth = useAuthStore()

async function logout() {
  auth.clearSession()
  await navigateTo('/login')
}
</script>

<template>
  <div>
    <header class="app-header">
      <v-container :style="{ maxWidth: `${maxWidth ?? 1120}px` }">
        <!-- 品牌列 -->
        <div class="d-flex align-center ga-3">
          <NuxtLink
            to="/surveys"
            class="d-flex align-center ga-3 text-decoration-none"
            style="color: inherit"
          >
            <!--
              標記用 inline SVG 而不是 mdi 的字型圖示：它要疊在檸檬綠方塊上，
              而字型圖示的視覺重心會偏，24px 以下看得出來。
            -->
            <span
              class="d-flex align-center justify-center"
              style="
                width: 28px;
                height: 28px;
                border-radius: 9px;
                background: var(--app-lime);
              "
            >
              <svg
                width="16"
                height="16"
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
            <span class="app-header__brand">問卷平台</span>
          </NuxtLink>

          <v-spacer />

          <span class="app-header__muted d-none d-sm-inline">
            {{ auth.user?.email }}
          </span>
          <v-btn
            size="small"
            variant="flat"
            class="app-chip-ghost"
            @click="logout"
          >
            登出
          </v-btn>
        </div>

        <!-- 大標列。沒有 title 時整塊不出現，頭帶自然變矮。 -->
        <div v-if="title" class="d-flex align-end ga-6 flex-wrap mt-8">
          <div>
            <h1 class="app-header__title">{{ title }}</h1>
            <div v-if="subtitle" class="app-header__subtitle mt-1">
              {{ subtitle }}
            </div>
          </div>
          <v-spacer />
          <slot name="actions" />
        </div>

        <!--
          篩選列**放在頭帶裡**，不是內容區的第一個元素。
          理由是底下 .app-body 有負的上邊距（內容要疊上來一點），
          而那個重疊如果落在一排膠囊上，會變成「一半在紫底、一半在灰底」——
          看起來像沒對齊，而不是像刻意的層次。
          疊上來的必須是**一整塊卡片**，邊界才讀得出來。
        -->
        <div v-if="$slots.filters" class="mt-7">
          <slot name="filters" />
        </div>
      </v-container>
    </header>

    <v-container
      class="app-body pb-10"
      :style="{ maxWidth: `${maxWidth ?? 1120}px` }"
    >
      <slot />
    </v-container>
  </div>
</template>
