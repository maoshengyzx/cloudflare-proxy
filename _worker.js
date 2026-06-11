/**
 * Cloudflare Worker — 通用代理 + Docker Registry Mirror
 *
 * 路由规则：
 *   OPTIONS *                → 返回 CORS 预检响应
 *   /v2/...                  → Docker Registry API → registry-1.docker.io
 *   /https://...  /http://... → 通用 URL 代理（支持 git clone）
 *   其他路径                   → Cloudflare Pages 静态资源
 */

const DOCKER_UPSTREAM = 'https://registry-1.docker.io';

// Cloudflare 注入的 header，不应转发到上游
const STRIP_HEADERS = [
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'cf-ew-via',
  'x-forwarded-proto',
  'x-real-ip',
  'cdn-loop',
];

// 这些 header 可能非常大或造成问题，需要从响应中删除
const STRIP_RESPONSE_HEADERS = [
  'content-security-policy',
  'content-security-policy-report-only',
  'x-content-security-policy',
  'x-webkit-csp',
];

/**
 * 将客户端请求代理到目标 URL。
 */
async function proxyFetch(targetUrl, request) {
  const { method } = request;

  // 构建转发 header —— 逐项拷贝，避开 Cloudflare 私有 header
  const reqHeaders = new Headers();
  for (const [k, v] of request.headers) {
    const lower = k.toLowerCase();
    if (STRIP_HEADERS.includes(lower)) continue;
    // 将 Host 替换为目标域名
    if (lower === 'host') {
      try { reqHeaders.set('host', new URL(targetUrl).host); } catch (_) {}
      continue;
    }
    reqHeaders.set(k, v);
  }
  // 确保 Host 存在（客户端不发送 Host 时的兜底）
  if (!reqHeaders.has('host')) {
    try { reqHeaders.set('host', new URL(targetUrl).host); } catch (_) {}
  }

  try {
    // 对于 GET / HEAD，不携带 body（fetch 规范允许 body 为 null）
    const fetchInit = {
      method,
      headers: reqHeaders,
      redirect: 'follow',
    };
    if (method !== 'GET' && method !== 'HEAD') {
      fetchInit.body = request.body;
    }

    const upstream = await fetch(targetUrl, fetchInit);

    // 构建响应 header，注入 CORS 并删除敏感 header
    const respHeaders = new Headers(upstream.headers);
    for (const h of STRIP_RESPONSE_HEADERS) respHeaders.delete(h);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    respHeaders.set('Access-Control-Allow-Headers', '*');
    respHeaders.set('Access-Control-Expose-Headers', '*');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response('Proxy Error: ' + err.message, {
      status: 502,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname, search } = url;

    // —— CORS 预检 ——
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

    // —— Docker Registry API 代理 ——
    if (pathname.startsWith('/v2/')) {
      const targetUrl = DOCKER_UPSTREAM + pathname + (search || '');
      return proxyFetch(targetUrl, request);
    }

    // —— 通用 URL 代理 ——
    // 匹配 /https://github.com/... 或 /http://example.com/...
    if (/^\/https?:\/\//.test(pathname)) {
      const targetUrl = pathname.slice(1) + (search || '');
      return proxyFetch(targetUrl, request);
    }

    // —— 静态资源：交给 Cloudflare Pages 处理 ——
    try {
      return env.ASSETS.fetch(request);
    } catch (_) {
      return new Response('Not Found', { status: 404 });
    }
  },
};
