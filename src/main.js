import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import 'mdui/mdui.css'
import 'mdui/components/avatar.js'
import 'mdui/components/badge.js'
import 'mdui/components/button.js'
import 'mdui/components/card.js'
import 'mdui/components/checkbox.js'
import 'mdui/components/circular-progress.js'
import 'mdui/components/dialog.js'
import 'mdui/components/linear-progress.js'
import 'mdui/components/text-field.js'
import { setColorScheme } from 'mdui/functions/setColorScheme.js'
import App from './App.vue'
import './styles.css'

setColorScheme('#006874')
registerSW({ immediate: true })
createApp(App).mount('#app')
