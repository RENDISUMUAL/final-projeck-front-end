import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Entry point aplikasi: cari elemen #root di index.html lalu pasang React App.
// StrictMode membantu menemukan pola React yang berpotensi menimbulkan bug.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
