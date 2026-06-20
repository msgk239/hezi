import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

async function bootstrap(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  if (import.meta.env.DEV && params.get('qa') === 'editor') {
    const { installProjectBoxTestNative } = await import('@/utils/testNativeApi')
    installProjectBoxTestNative()
  }

  createApp(App).mount('#app')
}

void bootstrap()
