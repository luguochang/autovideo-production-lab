import React from 'react';
import {createRoot} from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import App from './App.jsx';
import MvpApp from './MvpApp.jsx';

const RootApp = new URLSearchParams(window.location.search).get('advanced') === '1' ? App : MvpApp;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
);
