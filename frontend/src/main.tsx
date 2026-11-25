import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import App from './App';
import './index.css';

const reactDomClient =
  'createRoot' in ReactDOMClient ? ReactDOMClient : ReactDOMClient.default;

reactDomClient.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
