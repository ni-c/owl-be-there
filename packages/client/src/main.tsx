import './lib/zod-config.ts';
import '@fontsource-variable/nunito';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { startI18n } from './i18n/index.tsx';

const root = document.getElementById('root');
// No top-level await: the dictionary chunks import from this entry chunk, and
// an entry that waited for them would never finish evaluating.
if (root) {
  void startI18n().then((languages) => {
    // Null: the page is reloading to fetch the language afresh.
    if (!languages) return;
    createRoot(root).render(
      <StrictMode>
        <App languages={languages} />
      </StrictMode>
    );
  });
}
