import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Overlay from './Overlay'

// One bundle, two windows: the main window loads index.html, the click-through
// overlay loads the same file with #overlay.
const isOverlay = window.location.hash === '#overlay'
if (isOverlay) document.documentElement.classList.add('overlay-mode')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isOverlay ? <Overlay /> : <App />}</React.StrictMode>
)
