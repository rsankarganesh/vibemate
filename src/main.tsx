import {StrictMode} from 'react'; import {createRoot} from 'react-dom/client'; import App from './App'; import './styles.css';
const saved=localStorage.getItem('vibemate-theme');if(saved)document.documentElement.dataset.theme=saved;createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
