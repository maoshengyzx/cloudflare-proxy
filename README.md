# Cloudflare Proxy

基于 Cloudflare Pages 的 GitHub / Docker Hub 加速代理服务。**免费、零依赖、一键部署。**

## 加速支持

| 平台 | 方式 | 说明 |
|------|------|------|
| **GitHub** | `git clone` / `wget` / `curl` | Release 下载、源码克隆、Raw 文件、Archive 归档 |
| **Docker Hub** | `docker pull` | Registry Mirror 代理，配置一次永久生效 |
| **GHCR** | `docker pull` | GitHub Container Registry 代理 |
| **Quay.io** | `docker pull` | Red Hat Quay 代理 |

## 快速部署

1. **Fork** 本仓库到你的 GitHub 账号
2. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → 创建 → Pages → 连接到 Git
3. 选择你 Fork 的仓库，构建配置保持默认（留空）
4. 点击部署，Cloudflare Pages 会自动识别根目录的 `_worker.js`

```
Framework preset:  None
Build command:     (leave empty)
Output directory:  /
```

5. 编辑 `assets/js/config.js`，将 `DOMAIN` 改为你的实际域名。页面所有代码块会自动更新。

## 使用方式

### GitHub 加速

```bash
# Clone 仓库
git clone https://your-domain.com/https://github.com/user/repo.git

# 下载 Release
wget https://your-domain.com/https://github.com/user/repo/releases/download/v1.0/file.tar.gz

# 一劳永逸 - 设置全局代理
git config --global url."https://your-domain.com/".insteadOf "https://github.com/"
```

### Docker 加速

编辑 `/etc/docker/daemon.json`：

```json
{
  "registry-mirrors": ["https://your-domain.com"]
}
```

重启 Docker：

```bash
sudo systemctl restart docker
```

## Worker 路由

`_worker.js` 在项目根目录，会自动被 Cloudflare Pages 检测并启用：

| 路径 | 行为 |
|------|------|
| `/https://github.com/...` | 代理到对应 GitHub URL |
| `/http://...` | 通用 HTTP 代理 |
| `/v2/...` | Docker Hub Registry API |
| 其他 | 返回 Pages 静态页面 |

## 配置

所有站点配置集中在 `assets/js/config.js`：

```js
window.CF_PROXY = {
  DOMAIN: 'your-domain.com',  // 改为你的域名
};
```

修改后页面所有代码块中的 `your-domain.com` 会自动替换为你的域名，无需手动搜索替换。

## 技术栈

- **HTML + Tailwind CSS**（CDN，零构建）
- **Vanilla JavaScript**（无框架）
- **Cloudflare Worker**（`_worker.js`）
- **Google Fonts**（IBM Plex Sans + JetBrains Mono）

## 限制

- Workers Free 计划：每日 10 万次请求，单次响应体上限 100MB
- GitHub LFS 大文件（>100MB）需要额外配置
- 如遇 GitHub Rate Limit，可在 Worker 中添加 Personal Access Token

## License

MIT
