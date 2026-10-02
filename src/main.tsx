import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { bootDiagnostics, runCapabilityProbes } from './game/core/bootDiagnostics';

/**
 * Application entry point.
 *
 * Boot order is explicit and each stage is recorded, so a failure is
 * attributable instead of surfacing as a blank page:
 *   BOOT -> ENVIRONMENT -> MODULES -> RENDERER -> GPU -> SHADERS -> ASSETS
 *        -> APPLICATION -> READY
 */
function start(): void {
  // Capability probing never throws (see runCapabilityProbes) and is the only
  // thing that runs before React mounts.
  runCapabilityProbes();

  bootDiagnostics.begin('APPLICATION');

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    bootDiagnostics.fail('APPLICATION', 'Root element #root not found in document.');
    return;
  }

  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    bootDiagnostics.pass('APPLICATION', 'React root mounted.');
  } catch (err) {
    bootDiagnostics.fail(
      'APPLICATION',
      `React failed to mount: ${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }

  // Hand control back to the static boot supervisor in index.html.
  requestAnimationFrame(() => {
    if (rootElement.childElementCount > 0) {
      bootDiagnostics.pass('ASSETS', 'Interface assets rendered.');
      bootDiagnostics.markReady();
      (window as unknown as { __vanguardBooted?: () => void }).__vanguardBooted?.();
    }
  });
}

try {
  start();
} catch (err) {
  // The supervisor in index.html picks this up through window.onerror and
  // renders the diagnostic failure screen with the real reason.
  throw err;
}
