/**
 * Cloudflare Worker — 通用代理 + Docker Registry Mirror
 *
 * 路由规则：
 *   OPTIONS *                  → CORS 预检
 *   /v2/...                    → Docker Registry → registry-1.docker.io
 *   /https://... /http://...   → 通用 URL 代理（git clone / wget）
 *   /<image> 或 /<user>/<img>  → Docker pull（docker pull 本域名时）
 *   其他路径                     → Pages 静态资源
 */

// ============================================================
// 配置
// ============================================================

const DOCKER_UPSTREAM = 'https://registry-1.docker.io';

const ALLOWED_HOSTS = [
  'github.com', 'api.github.com', 'raw.githubusercontent.com',
  'gist.github.com', 'gist.githubusercontent.com',
  'quay.io', 'gcr.io', 'k8s.gcr.io', 'registry.k8s.io',
  'ghcr.io', 'docker.cloudsmith.io', 'registry-1.docker.io',
];

const DOCKER_REGISTRIES = new Set([
  'quay.io', 'gcr.io', 'k8s.gcr.io', 'registry.k8s.io',
  'ghcr.io', 'docker.cloudsmith.io', 'registry-1.docker.io',
]);

const STRIP_REQ_HEADERS = new Set([
  'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
  'cf-ew-via', 'x-forwarded-proto', 'x-real-ip', 'cdn-loop',
]);

const STRIP_RES_HEADERS = new Set([
  'content-security-policy', 'content-security-policy-report-only',
  'x-content-security-policy', 'x-webkit-csp',
]);

// 空 body 的 SHA-256，S3 需要
const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const MAX_REDIRECTS = 5;

// ============================================================
// 工具函数
// ============================================================

function isAmazonS3(url) {
  try { return new URL(url).hostname.includes('amazonaws.com'); } catch { return false; }
}

function getAmzDate() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, -5) + 'Z';
}

/** 构建代理请求头：去掉 CF 私有头，替换 Host，S3 自动补 amz 头 */
function buildReqHeaders(request, targetUrl) {
  const targetHost = new URL(targetUrl).host;
  const h = new Headers();

  for (const [k, v] of request.headers) {
    if (STRIP_REQ_HEADERS.has(k.toLowerCase())) continue;
    if (k.toLowerCase() === 'host') { h.set('host', targetHost); continue; }
    h.set(k, v);
  }
  if (!h.has('host')) h.set('host', targetHost);

  // S3 需要这四个头，客户端可能不带
  if (isAmazonS3(targetUrl)) {
    h.set('x-amz-content-sha256', EMPTY_BODY_SHA256);
    h.set('x-amz-date', getAmzDate());
  } else {
    // 非 S3 去掉可能干扰的残留 amz 头
    h.delete('x-amz-content-sha256');
    h.delete('x-amz-date');
    h.delete('x-amz-security-token');
    h.delete('x-amz-user-agent');
  }
  return h;
}

/** CORS 预检 */
function corsPreflight() {
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

/** 包装上游响应：加 CORS + 去敏感头 */
function wrapResponse(upstream) {
  const h = new Headers(upstream.headers);
  for (const name of STRIP_RES_HEADERS) h.delete(name);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  h.set('Access-Control-Allow-Headers', '*');
  h.set('Access-Control-Expose-Headers', '*');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: h,
  });
}

// ============================================================
// Docker Auth Token
// ============================================================

/** 解析 WWW-Authenticate 并拿 token */
async function fetchDockerToken(wwwAuth) {
  const m = wwwAuth.match(/Bearer realm="([^"]+?)",service="([^"]*?)",scope="([^"]*?)"/);
  if (!m) return null;

  const [, realm, service, scope] = m;
  const tokenUrl = `${realm}?service=${service}&scope=${encodeURIComponent(scope)}`;

  try {
    const res = await fetch(tokenUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token || data.access_token || null;
  } catch {
    return null;
  }
}

// ============================================================
// 核心代理（带 token 重试 + S3 重定向反代）
// ============================================================

async function proxyWithAuth(targetUrl, request, isDocker, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    return new Response('Too many redirects', { status: 508 });
  }

  const headers = buildReqHeaders(request, targetUrl);

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual', // 关键：手动处理重定向
  });

  // ===== Docker 401 → 拿 token 重试 =====
  if (isDocker && upstream.status === 401) {
    const wwwAuth = upstream.headers.get('WWW-Authenticate');
    if (wwwAuth) {
      const token = await fetchDockerToken(wwwAuth);
      if (token) {
        const authHeaders = buildReqHeaders(request, targetUrl);
        authHeaders.set('Authorization', `Bearer ${token}`);
        const retry = await fetch(targetUrl, {
          method: request.method,
          headers: authHeaders,
          body: request.body,
          redirect: 'manual',
        });
        return retry;
      }
    }
    // token 拿不到就原样返回 401
    return wrapResponse(upstream);
  }

  // ===== S3 / CDN 重定向 → 重新代理 =====
  if (upstream.status === 302 || upstream.status === 307) {
    const location = upstream.headers.get('Location');
    if (location) {
      const redirHeaders = buildReqHeaders(request, location);
      // 带回上游给的 Authorization（如果有的话）
      const upstreamAuth = upstream.headers.get('Authorization');
      if (upstreamAuth) redirHeaders.set('Authorization', upstreamAuth);

      const redirResp = await fetch(location, {
        method: request.method,
        headers: redirHeaders,
        body: request.body,
        redirect: 'manual',
      });

      // 如果还是重定向，递归
      if (redirResp.status === 302 || redirResp.status === 307) {
        const nextLocation = redirResp.headers.get('Location');
        if (nextLocation) {
          return proxyWithAuth(nextLocation, request, isDocker, redirectCount + 1);
        }
      }
      return wrapResponse(redirResp);
    }
  }

  return wrapResponse(upstream);
}

// ============================================================
// Docker 路径解析
// ============================================================

/**
 * 仅识别两种 Docker 路径（Docker daemon 实际发出的请求格式）：
 *   /v2/library/nginx/...         → Docker Hub registry mirror
 *   /ghcr.io/user/image/...       → 第三方 registry
 * 不做"单段 = library/xxx"的猜测，避免把 /gh、/docs 等静态页面路径误判为镜像名。
 */
function parseDockerPath(pathname, search) {
  if (pathname.startsWith('/v2/')) {
    return {
      targetUrl: DOCKER_UPSTREAM + pathname + (search || ''),
      isDocker: true,
    };
  }

  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  if (DOCKER_REGISTRIES.has(parts[0])) {
    const host = parts[0];
    const imagePath = parts.slice(1).join('/');
    return {
      targetUrl: `https://${host}/v2/${imagePath}`,
      isDocker: true,
    };
  }

  return null;
}

// ============================================================
// 主入口
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname, search } = url;

    if (request.method === 'OPTIONS') return corsPreflight();

    // —— Docker 路径 ——
    const docker = parseDockerPath(pathname, search);
    if (docker) {
      return proxyWithAuth(docker.targetUrl, request, docker.isDocker);
    }

    // —— 通用 URL 代理 (/https://github.com/...) ——
    if (/^\/https?:\/\//.test(pathname)) {
      const targetUrl = pathname.slice(1) + (search || '');
      // 目标域名不在白名单里就拒绝
      try {
        const targetHost = new URL(targetUrl).hostname;
        if (!ALLOWED_HOSTS.includes(targetHost)) {
          return new Response(`Error: domain "${targetHost}" not allowed.\n`, { status: 400 });
        }
      } catch {
        return new Response('Error: invalid target URL.\n', { status: 400 });
      }
      return proxyWithAuth(targetUrl, request, false);
    }

    // —— 静态资源 ——
    try {
      const assetsResp = await env.ASSETS.fetch(request);
      // 如果路径不含扩展名，且 ASSETS 返回了 404，尝试追加 .html
      if (assetsResp.status === 404 && !pathname.includes('.')) {
        const htmlUrl = new URL(request.url);
        htmlUrl.pathname = pathname + '.html';
        const htmlResp = await env.ASSETS.fetch(new Request(htmlUrl, request));
        if (htmlResp.status !== 404) return htmlResp;
      }
      return assetsResp;
    } catch (_) {
      return new Response('Not Found', { status: 404 });
    }
  },
};
