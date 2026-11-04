import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kakeibo.app',
  appName: 'Kakeibo',
  webDir: 'dist',
  android: {
    // The Wi-Fi direct transfer fetches http://<lan-ip>:<port> links from the
    // app's https://localhost origin, so the WebView must allow mixed content.
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#F3F1EB',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#343D35',
    },
  },
}

export default config
