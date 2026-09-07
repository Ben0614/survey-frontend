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

  // ⚠️ 順序有意義：Vuetify 的樣式要在 app.css 之前，否則 token 與
  // 少數覆蓋規則會被 Vuetify 的預設蓋掉。
  css: [
    'vuetify/lib/styles/main.sass',
    '@mdi/font/css/materialdesignicons.css',
    '~/assets/css/app.css',
  ],

  // 字體從 Google Fonts 來。preconnect 兩行不是裝飾 ——
  // 少了它們，字體檔要等到 CSS 下載完才開始連線，首屏會閃一次系統字。
  //
  // 只載三個字重（400/700/900）。中文字體檔很大，每多一個字重就是
  // 多一份完整的字集；設計上用不到的就不要載。
  app: {
    head: {
      link: [
        // favicon 三件套（public/ 底下，Nuxt 會原樣複製到網站根目錄）。
        //
        // 為什麼是三個檔而不是一個：
        //   .svg   現代瀏覽器優先用它 —— 向量，高 DPI 螢幕與大尺寸都不糊
        //   .ico   舊瀏覽器與 Windows 工作列的退路（32x32）
        //   .png   iOS「加到主畫面」用的（180x180），沒有它會抓網頁截圖
        //
        // ⚠️ 順序有意義：瀏覽器取**最後一個看得懂**的 icon 宣告，
        // 所以 .svg 要放在 .ico 後面，否則支援 svg 的瀏覽器仍然會用 .ico。
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },

        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700;900&display=swap',
        },
      ],
    },
  },

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
