// 浏览器兼容层：防范 WebKit / Safari 跨域 iframe、隐私模式下的 SecurityError 及 API 缺失

export const safeStorage = {
  getItem(key) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // 在 Safari 隐私模式、第三方 iframe 或安全策略拦截时静默降级
    }
    return null;
  },
  setItem(key, value) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, String(value));
        return true;
      }
    } catch {
      // 存储满或无权限时安全捕获
    }
    return false;
  },
  removeItem(key) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return true;
      }
    } catch {}
    return false;
  }
};

export function safeTimeoutSignal(ms) {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ms);
    }
  } catch {}
  if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, ms);
    return controller.signal;
  }
  return undefined;
}

export function safeUid(prefix = 'cf') {
  try {
    if (typeof crypto !== 'undefined') {
      if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      if (typeof crypto.getRandomValues === 'function') {
        const arr = new Uint32Array(3);
        crypto.getRandomValues(arr);
        return `${prefix}-${Date.now().toString(36)}-${Array.from(arr, n => n.toString(36)).join('-')}`;
      }
    }
  } catch {}
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function safeOrigin() {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      const orig = window.location.origin;
      if (orig !== 'null' && !orig.startsWith('webkit-')) {
        return orig;
      }
    }
  } catch {}
  return '';
}
