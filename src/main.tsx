import PhoneGate from './PhoneGate';
import {StrictMode} from 'react'; import {createRoot} from 'react-dom/client'; import App from './App'; import LiveRoot from './LiveRoot'; import {isDemoMode} from './services/supabase'; import './styles.css'; import './admin.css';
const saved=localStorage.getItem('vibemate-theme');document.documentElement.dataset.theme=saved||'system';createRoot(document.getElementById('root')!).render(<StrictMode><PhoneGate>{isDemoMode?<App/>:<LiveRoot/>}</PhoneGate></StrictMode>);
