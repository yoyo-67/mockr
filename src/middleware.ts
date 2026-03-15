import type { Middleware, MockrRequest, HandlerResult } from './types.js';

export function delay(opts: { min: number; max: number }): Middleware {
  return {
    name: 'delay',
    async pre() {
      const ms = opts.min + Math.random() * (opts.max - opts.min);
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}

export function auth(opts: {
  type: 'bearer';
  validate: (token: string) => boolean;
  exclude?: string[];
}): Middleware {
  return {
    name: 'auth',
    pre(req: MockrRequest) {
      if (opts.exclude?.includes(req.path)) return;
      const header = req.headers.authorization;
      if (!header || typeof header !== 'string') {
        return { status: 401, body: { error: 'Unauthorized' } };
      }
      const token = header.replace(/^Bearer\s+/i, '');
      if (!opts.validate(token)) {
        return { status: 403, body: { error: 'Forbidden' } };
      }
    },
  };
}

export function logger(): Middleware {
  return {
    name: 'logger',
    pre(req: MockrRequest) {
      console.log(`[mockr] ${req.method} ${req.path}`);
    },
    post(req: MockrRequest, res: HandlerResult) {
      console.log(`[mockr] ${req.method} ${req.path} → ${res.status || 200}`);
    },
  };
}

export function errorInjection(opts: { rate: number; status?: number }): Middleware {
  return {
    name: 'errorInjection',
    pre() {
      if (Math.random() < opts.rate) {
        return { status: opts.status || 500, body: { error: 'Injected error' } };
      }
    },
  };
}
