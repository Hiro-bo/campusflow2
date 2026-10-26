import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './App.jsx';
import './style.css';

// 防范 Safari/WebKit 跨域脚本及扩展注入产生的全局未捕获异常
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    // 忽略空对象 rejection 或已中止异常
    if (!event.reason || event.reason.name === 'AbortError' || (typeof event.reason === 'object' && Object.keys(event.reason).length === 0)) {
      event.preventDefault();
    }
  });
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1f2937' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '12px', fontWeight: 600 }}>应用遇到了一点小问题</h2>
          <p style={{ color: '#4b5563', marginBottom: '20px', fontSize: '14px' }}>
            {this.state.error?.message || '页面运行出现异常，请点击下方按钮重新加载。'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              backgroundColor: '#00aeec',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            重新加载页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <Home />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
