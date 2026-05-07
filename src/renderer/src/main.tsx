import React from 'react'
import ReactDOM from 'react-dom/client'
import './assets/main.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <div className="main-window">
      <h1>Specter</h1>
      <p>Your AI Software Tutor</p>
      <div className="status-card">
        <div className="status-dot"></div>
        <span>Ready to assist</span>
      </div>
      <div className="info">
        Double-tap <strong>Shift</strong> to toggle the overlay.
      </div>
    </div>
  </React.StrictMode>
)
