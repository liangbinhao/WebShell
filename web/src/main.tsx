import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 注：不使用 StrictMode，避免开发模式下 xterm/WebSocket 双重挂载产生两个连接
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
