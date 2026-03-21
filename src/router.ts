import { match } from 'path-to-regexp';

export interface RouteMatch {
  params: Record<string, string>;
}

export type MatchFn = (path: string) => RouteMatch | null;

export function createMatcher(pattern: string | RegExp): MatchFn {
  if (pattern instanceof RegExp) {
    return (path: string) => {
      const m = pattern.exec(path);
      if (!m) return null;
      const params: Record<string, string> = {};
      for (let i = 1; i < m.length; i++) {
        params[String(i)] = m[i];
      }
      return { params };
    };
  }

  // Wildcard patterns: * matches one segment, ** matches everything
  if (pattern.includes('*')) {
    const regexStr = '^' + pattern
      .replace(/\*\*/g, '§GLOBSTAR§')     // protect ** first
      .replace(/\*/g, '[^/]+')             // * = one path segment
      .replace(/§GLOBSTAR§/g, '.*')        // ** = anything
      + '$';
    const regex = new RegExp(regexStr);
    return (path: string) => {
      if (regex.test(path)) return { params: {} };
      return null;
    };
  }

  // path-to-regexp for :param patterns
  const matchFn = match(pattern, { decode: decodeURIComponent });
  return (path: string) => {
    const result = matchFn(path);
    if (!result) return null;
    const params: Record<string, string> = {};
    for (const [key, val] of Object.entries(result.params)) {
      if (typeof val === 'string') params[key] = val;
      else if (Array.isArray(val)) params[key] = val.join('/');
    }
    return { params };
  };
}
