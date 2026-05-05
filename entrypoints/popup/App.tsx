import { useState } from 'react';
import './App.css';

const READ_CURRENT_PAGE_MESSAGE = 'anything-reader:read-current-page';
const DEBUG_PREFIX = '[Anything Reader][Popup]';

type ReadResult =
  | {
      ok: true;
      textLength: number;
    }
  | {
      ok: false;
      error: string;
    };

function App() {
  const [step, setStep] = useState<'welcome' | 'ready'>('welcome');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isReading, setIsReading] = useState(false);

  async function handleReadClick() {
    console.log(DEBUG_PREFIX, 'Read button pressed');
    setIsReading(true);
    setStatus('Reading the active page...');
    setError('');

    try {
      // The popup delegates the actual work to the background script so the
      // extension can coordinate tab access and native messaging in one place.
      const request = {
        type: READ_CURRENT_PAGE_MESSAGE,
      };
      console.log(DEBUG_PREFIX, 'Sending request to background', request);

      const response = (await browser.runtime.sendMessage(request)) as ReadResult | undefined;
      console.log(DEBUG_PREFIX, 'Received response from background', response);

      if (!response || !response.ok) {
        throw new Error(response?.error ?? 'Unable to read the current page.');
      }

      setStatus(`Sent ${response.textLength.toLocaleString()} characters to Anything Reader.`);
    } catch (err) {
      const message =
        typeof err === 'string'
          ? err
          : err instanceof Error
            ? err.message || err.name
            : 'Unable to read the current page.';
      console.error(DEBUG_PREFIX, 'Read flow failed', err);
      setError(message);
      setStatus('');
    } finally {
      console.log(DEBUG_PREFIX, 'Read flow finished');
      setIsReading(false);
    }
  }

  return (
    <main className="popup-shell">
      {step === 'welcome' ? (
        <section className="panel">
          <p className="eyebrow">Anything Reader</p>
          <h1>Mac app required</h1>
          <p className="body-copy">
            Anything Reader Mac app is required for this browser extension to work.
          </p>
          <p className="body-copy secondary">
            Install the Mac app, then continue to read the active page.
          </p>
          <button type="button" className="primary-button" onClick={() => setStep('ready')}>
            Next
          </button>
        </section>
      ) : (
        <section className="panel">
          <p className="eyebrow">Ready</p>
          <h1>Read with Anything Reader</h1>
          <p className="body-copy">
            This extracts the readable text from the active tab and sends it to the local Mac app.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={handleReadClick}
            disabled={isReading}
          >
            {isReading ? 'Reading…' : 'Read with Anything Reader'}
          </button>
          {status ? <p className="status">{status}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>
      )}
    </main>
  );
}

export default App;
