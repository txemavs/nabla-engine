import { headsetPageStyles } from '../src/runtime/interface-theme.js'
const style = document.createElement('style')
style.id = 'nabla-interface-theme'
style.textContent = headsetPageStyles
document.head.append(style)
document.body.classList.add('nabla-headset-page')
