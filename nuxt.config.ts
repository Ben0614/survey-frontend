// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt'],

  // app/api/*.ts 也要 auto-import。Nuxt 預設只涵蓋 composables/ 與 utils/，
  // 少了這行，頁面與 store 裡的 authApi 會是 undefined（而且是執行期才炸）。
  imports: {
    dirs: ['api'],
  },

  // 後端的位址。Ch16 會把它接到 .env（NUXT_PUBLIC_API_BASE），
  // 所以現在就走 runtimeConfig 而不是寫死常數 —— 那時候只要加環境變數，不必改程式碼。
  runtimeConfig: {
    public: {
      apiBase: 'http://localhost:3100',
    },
  },

  // ── Vuetify 的四處設定，缺一不可（見 docs/前端分層慣例.md §4）──
  build: {
    transpile: ['vuetify'],
  },

  css: ['vuetify/lib/styles/main.sass', '@mdi/font/css/materialdesignicons.css'],

  vite: {
    ssr: {
      noExternal: ['vuetify'],
    },
    resolve: {
      // .ts 要排在 .js 前面：誤 emit 的 .js 會蓋過同名 .ts，
      // 於是 ~/utils/auth 解析到錯的那一份。
      extensions: ['.mjs', '.mts', '.ts', '.tsx', '.js', '.jsx', '.json'],
    },
  },
})
