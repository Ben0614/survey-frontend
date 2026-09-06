import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    // ⚠️ **這一行不能省，而少了它的症狀只在 console 裡。**
    //
    // Vuetify 有些元件（v-tabs / v-slide-group / v-navigation-drawer…）會問
    // `useDisplay()` 現在是不是手機寬度，而那要量 `window.innerWidth` ——
    // **伺服器端沒有 window**。少了 ssr: true 時它會直接當成 mobile，
    // 於是同一個 v-tabs：
    //
    //   伺服器產出  class="… v-slide-group--mobile …"
    //   瀏覽器算出  class="… （沒有 mobile）…"
    //
    // Vue 在 hydration 時發現對不起來，警告
    // 「Hydration class mismatch」+「Hydration completed but contains mismatches」，
    // 然後**把那一整塊重畫**。畫面看起來正常，所以不看 console 就不會發現 ——
    // 這是 Ch17 輪 ③ 用瀏覽器驗編輯頁時才順手看到的，實際是輪 ① 的 v-tabs 帶進來的。
    //
    // 傳 true 之後 Vuetify 改用「先照預設值畫、掛載後再量」的策略，兩邊就一致了。
    ssr: true,
    components,
    directives,
    // ── 主題 ────────────────────────────────────────────
    //
    // 顏色**同時**寫在這裡與 assets/css/app.css 的 :root。
    // 那不是重複，是兩個不同的消費者：
    //   這裡    給 Vuetify 元件用（color="primary"、狀態色、漣漪）
    //   app.css 給自己寫的 class 用（頭帶、卡片列、統計數字）
    // 兩邊的值必須一致 —— 改色時兩處都要動，這是這個做法的代價。
    theme: {
      defaultTheme: 'light',
      themes: {
        light: {
          colors: {
            background: '#F5F4F8',
            surface: '#FFFFFF',
            primary: '#4F46E5',
            // secondary 是深紫頭帶那個色，拿來給頭帶上的元件用
            secondary: '#2E2A4A',
            error: '#E11D48',
            success: '#16A34A',
            warning: '#B45309',
            info: '#4F46E5',
          },
        },
      },
    },

    // ── 元件預設值 ──────────────────────────────────────
    //
    // **圓角與陰影一律在這裡定，不要在每個頁面寫 class。**
    // 這一版的視覺語彙是「膠囊按鈕 + 大圓角卡片 + 沒有陰影的表面」，
    // 而那三件事如果散在六個頁面裡，改一次要改六個地方。
    //
    // 刻意不設 VBtn 的 height：icon 按鈕靠 size 決定大小，
    // 統一高度會把它們壓成橢圓。
    defaults: {
      VBtn: {
        rounded: 'pill',
        elevation: 0,
        // 中文在全大寫轉換下沒有效果，但英文按鈕（如未來的 OK）會被拉開，
        // 關掉讓兩種語言看起來一致。
        style: 'text-transform: none; letter-spacing: 0;',
      },
      VCard: { rounded: 'xl', elevation: 0 },
      VSheet: { rounded: 'lg' },
      VChip: { rounded: 'pill' },
      VTextField: { variant: 'outlined', rounded: 'lg', color: 'primary' },
      VTextarea: { variant: 'outlined', rounded: 'lg', color: 'primary' },
      VSelect: { variant: 'outlined', rounded: 'lg', color: 'primary' },
      VAlert: { rounded: 'lg', variant: 'tonal' },
      VPagination: { rounded: 'circle', activeColor: 'primary' },
      VSnackbar: { rounded: 'pill' },
    },
  })

  nuxtApp.vueApp.use(vuetify)
})
