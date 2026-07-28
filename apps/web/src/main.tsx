import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './styles.css';

const googleClientId =
  import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ||
  '912636242362-m5hogktgcnramtb6g132aada1jftsfrl.apps.googleusercontent.com';

if (import.meta.env.DEV) {
  const maskedClientId = googleClientId.replace(/^(.{12}).*(@?apps\\.googleusercontent\\.com)?$/, '$1...apps.googleusercontent.com');
  console.info('[google-oauth][web]', { origin: window.location.origin, clientId: maskedClientId });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
);
