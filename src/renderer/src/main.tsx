import React from 'react'
import ReactDOM from 'react-dom/client'
import './assets/main.css'

const DemoApp: React.FC = () => {
  const [buttonOneDone, setButtonOneDone] = React.useState(false)
  const [buttonTwoDone, setButtonTwoDone] = React.useState(false)
  const [text, setText] = React.useState('')
  const [confirmed, setConfirmed] = React.useState(false)

  const reset = () => {
    setButtonOneDone(false)
    setButtonTwoDone(false)
    setText('')
    setConfirmed(false)
  }

  return (
    <div className="main-window">
      <div className="demo-stage">
        <div className="demo-header">
          <h1>Specter</h1>
          <p>Controlled demo target</p>
        </div>

        <button
          className={`demo-target demo-button-one ${buttonOneDone ? 'is-done' : ''}`}
          onClick={() => setButtonOneDone(true)}
        >
          {buttonOneDone ? 'Button 1 done' : 'Button 1'}
        </button>

        <button
          className={`demo-target demo-button-two ${buttonTwoDone ? 'is-done' : ''}`}
          onClick={() => setButtonTwoDone(true)}
        >
          {buttonTwoDone ? 'Button 2 done' : 'Button 2'}
        </button>

        <input
          className="demo-target demo-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Text input"
          aria-label="Text input"
        />

        <button
          className={`demo-target demo-confirm ${confirmed ? 'is-done' : ''}`}
          onClick={() => setConfirmed(true)}
        >
          {confirmed ? 'Confirmed' : 'Confirm'}
        </button>

        <div className="demo-status" aria-live="polite">
          <span className={buttonOneDone ? 'is-done' : ''}>1</span>
          <span className={buttonTwoDone ? 'is-done' : ''}>2</span>
          <span className={text.trim() ? 'is-done' : ''}>3</span>
          <span className={confirmed ? 'is-done' : ''}>4</span>
        </div>

        <button className="demo-reset" onClick={reset}>
          Reset
        </button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>
)
