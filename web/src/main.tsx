import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 内置 Web 字体（打包进前端，无需用户安装）：
// - JetBrains Mono、Fira Code 由 @fontsource 提供，离线/内网可用
// - 400 常规 + 400 斜体（终端常用）
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/400-italic.css';
import '@fontsource/fira-code/400.css';

// 注：不使用 StrictMode，避免开发模式下 xterm/WebSocket 双重挂载产生两个连接
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
