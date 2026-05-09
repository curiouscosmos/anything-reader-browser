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

type ActionKind = 'read' | 'summarize';

function App() {
  const [step, setStep] = useState<'welcome' | 'ready'>('welcome');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isBusyAction, setIsBusyAction] = useState<ActionKind | null>(null);

  async function handleActionClick(action: ActionKind) {
    const isSummarize = action === 'summarize';
    const actionLabel = isSummarize ? 'Summarizing the active page...' : 'Reading the active page...';
    console.log(DEBUG_PREFIX, `${action} button pressed`);
    setIsBusyAction(action);
    setStatus(actionLabel);
    setError('');

    try {
      // The popup delegates the actual work to the background script so the
      // extension can coordinate tab access and native messaging in one place.
      const request = {
        type: READ_CURRENT_PAGE_MESSAGE,
        summarize: isSummarize,
      };
      console.log(DEBUG_PREFIX, 'Sending request to background', request);

      const response = (await browser.runtime.sendMessage(request)) as ReadResult | undefined;
      console.log(DEBUG_PREFIX, 'Received response from background', response);

      if (!response || !response.ok) {
        throw new Error(response?.error ?? 'Unable to read the current page.');
      }

      setStatus(
        isSummarize
          ? `Sent ${response.textLength.toLocaleString()} characters to Anything Reader with summarize enabled.`
          : `Sent ${response.textLength.toLocaleString()} characters to Anything Reader.`,
      );
    } catch (err) {
      const message =
        typeof err === 'string'
          ? err
          : err instanceof Error
            ? err.message || err.name
            : 'Unable to read the current page.';
      console.error(DEBUG_PREFIX, `${action} flow failed`, err);
      setError(message);
      setStatus('');
    } finally {
      console.log(DEBUG_PREFIX, `${action} flow finished`);
      setIsBusyAction(null);
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
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => handleActionClick('read')}
              disabled={isBusyAction !== null}
            >
              {isBusyAction === 'read' ? 'Reading…' : 'Read with Anything Reader'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => handleActionClick('summarize')}
              disabled={isBusyAction !== null}
            >
              {isBusyAction === 'summarize' ? 'Summarizing…' : 'Summarize'}
            </button>
          </div>
          {status ? <p className="status">{status}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>
      )}
    </main>
  );
}

export default App;
