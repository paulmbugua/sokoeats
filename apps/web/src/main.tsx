import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './styles.css';

const googleClientId =
  import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ||
  '557799973381-ksp83t2vo6fdqufhm0iie06lnb4e8j8v.apps.googleusercontent.com';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
);
