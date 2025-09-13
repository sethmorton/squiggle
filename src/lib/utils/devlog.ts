import { customAlphabet } from 'nanoid';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

export type DevLogger = {
  traceId: string;
  enabled: boolean;
  step: (name: string, data?: Record<string, unknown>) => void;
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
  time: (name: string) => { end: (extra?: Record<string, unknown>) => void };
  clip: (s: string, n?: number) => string;
};

export function createDevLogger(label: string, enabled?: boolean): DevLogger {
  const traceId = nano();
  const on = !!enabled;
  const timers = new Map<string, number>();
  const base = (level: string, msg: string, data?: Record<string, unknown>) => {
    if (!on) return;
    const payload = { t: new Date().toISOString(), trace: traceId, level, label, msg, ...(data || {}) };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  };
  return {
    traceId,
    enabled: on,
    step: (name, data) => base('STEP', name, data),
    info: (msg, data) => base('INFO', msg, data),
    warn: (msg, data) => base('WARN', msg, data),
    error: (msg, data) => base('ERROR', msg, data),
    time: (name) => {
      if (on) timers.set(name, Date.now());
      return {
        end: (extra) => {
          if (!on) return;
          const start = timers.get(name) ?? Date.now();
          const ms = Date.now() - start;
          base('TIME', name, { ms, ...(extra || {}) });
        }
      };
    },
    clip: (s: string, n = 160) => (s.length <= n ? s : s.slice(0, n) + '…')
  };
}

export function clip(s: string, n = 160) {
  return s.length <= n ? s : s.slice(0, n) + '…';
}

export function safeLen(s?: string | null) {
  return typeof s === 'string' ? s.length : 0;
}

