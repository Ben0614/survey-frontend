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
    theme: {
      defaultTheme: 'light',
    },
  })

  nuxtApp.vueApp.use(vuetify)
})
