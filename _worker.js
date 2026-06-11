/**
 * Cloudflare Worker — 通用代理 + Docker Registry Mirror
 *
 * 路由规则：
 *   /https://github.com/...  → 代理到对应 GitHub URL
 *   /https://raw.github...    → 代理到 raw.githubusercontent.com
 *   /https://.*               → 通用 URL 代理
 *   /v2/...                   → Docker Registry API (registry-1.docker.io)
 *   其他路径                    → 返回 Pages 静态资源
 */

const DOCKER_UPSTREAM = 'https://registry-1.docker.io';

const BLOCKED_HEADERS = [
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-proto',
  'x-real-ip',
];

function rewriteHeaders(headers, targetHost) {
  const result = new Headers(headers);
  result.set('Host', targetHost);
  for (const h of BLOCKED_HEADERS) {
    result.delete(h);
  }
  return result;
}

async function proxyFetch(targetUrl, request) {
  const target = new URL(targetUrl);
  const headers = rewriteHeaders(request.headers, target.host);

  const fetchInit = {
    method: request.method,
    headers,
    redirect: 'follow',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    fetchInit.body = request.body;
  }

  const upstream = await fetch(targetUrl, fetchInit);

  const respHeaders = new Headers(upstream.headers);
  respHeaders.set('Access-Control-Allow-Origin', '*');
  respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  respHeaders.set('Access-Control-Allow-Headers', '*');
  respHeaders.set('Access-Control-Expose-Headers', '*');
  respHeaders.delete('content-security-policy');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

function isProxyPath(pathname) {
  // Matches /https://... or /http://...
  return /^\/https?:\/\//.test(pathname);
}

function extractTargetUrl(pathname, search) {
  // Strip leading / to get the full target URL
  const target = pathname.slice(1) + (search || '');
  return target;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname, search } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Docker Registry API proxy (/v2/...)
    if (pathname.startsWith('/v2/')) {
      const targetUrl = DOCKER_UPSTREAM + pathname + search;
      return proxyFetch(targetUrl, request);
    }

    // Generic URL proxy (/https://github.com/...)
    if (isProxyPath(pathname)) {
      const targetUrl = extractTargetUrl(pathname, search);
      return proxyFetch(targetUrl, request);
    }

    // Static assets — let Cloudflare Pages serve them
    return env.ASSETS.fetch(request);
  },
};
