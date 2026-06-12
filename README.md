# 零成本搭建自己的 GitHub/Docker 加速站：Cloudflare Pages 一键部署，大陆访问速度直接拉满

## 🤕 痛点
相信每一个国内开发者都遇到过这些崩溃时刻：
- GitHub Clone 代码几KB/s，动不动就断连
- Docker pull 镜像拉到一半超时，重拉好几次才成功
- 想下GitHub Release包，进度条卡到天荒地老
- 网上找的公开加速站要么限速，要么突然就挂了

今天给大家分享一个自己搭的完全免费、不限速、完全可控的加速方案，5分钟就能部署好，用Cloudflare Pages零成本运行。

## ✨ 项目特性
| 功能 | 支持情况 |
|------|----------|
| GitHub Release/Clone/Raw/Archive 加速 | ✅ 全支持 |
| Docker Hub 镜像加速 | ✅ 原生支持 |
| GHCR/Quay/GCR 第三方容器仓库 | ✅ 兼容 |
| 自定义域名 | ✅ 支持 |
| 访问速度 | ✅ Cloudflare 全球节点，大陆优化线路 |
| 成本 | ✅ 完全免费，无配额限制 |
| 部署难度 | ✅ 5分钟傻瓜式部署，不用写一行代码 |
| 功能扩展 | ✅ 纯Worker逻辑，可自行修改加功能 |

**核心优势对比其他公开加速站：**
- 自己的域名，自己可控，不会突然失效
- 不限速，用的是你自己Cloudflare账户的配额，个人使用完全足够
- 支持Docker镜像层S3重定向自动反代，这是很多公开加速站没有的功能，拉取Docker镜像速度提升特别明显
- 自动处理Docker 401鉴权，不用复杂配置

## 🚀 直接使用（不想自己搭的直接用）
### GitHub 加速
把GitHub地址直接拼在你的加速域名后面就行：
```bash
# 原地址
git clone https://github.com/maoshengyzx/cloudflare-proxy.git
# 加速地址
git clone https://你的域名/https://github.com/maoshengyzx/cloudflare-proxy.git

# 下载Release包
wget https://你的域名/https://github.com/maoshengyzx/cloudflare-proxy/releases/download/v1.0.0/release.zip
```

### Docker 加速
Linux 系统配置：
```bash
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://你的域名"]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

配置完成后直接正常pull就行：
```bash
docker pull nginx:alpine
docker pull ghcr.io/immich-app/immich-server:release
```

## 🛠️ 5分钟部署自己的加速站
### 前置要求
- 一个GitHub账号
- 一个Cloudflare账号（免费版就行）
- 域名可以不用，Cloudflare Pages自带的`*.pages.dev`域名也能用

#### 步骤1：Fork 源码
打开项目仓库：[https://github.com/maoshengyzx/cloudflare-proxy](https://github.com/maoshengyzx/cloudflare-proxy)
点击右上角「Fork」按钮，把代码复制到你自己的GitHub账户下。

#### 步骤2：创建Cloudflare Pages项目
1. 登录Cloudflare控制台，进入「Pages」页面
2. 点击「创建项目」→「连接到Git」
3. 选择你刚才Fork的`cloudflare-proxy`仓库
4. 构建配置全部留空：
   - 构建命令：（空）
   - 输出目录：`/`
5. 点击「部署」，等待30秒，部署完成。

#### 步骤3：配置域名（可选）
如果想用自己的域名，在Pages项目的「自定义域」页面，添加你自己的域名，Cloudflare会自动配置SSL证书。

#### 步骤4：修改站点配置
编辑你Fork后的仓库里的`assets/js/config.js`文件：
```js
window.CF_PROXY = {
  DOMAIN: '你的域名.com', // 替换成你刚才的Pages域名或者自定义域名
};
```
提交修改，Cloudflare会自动重新部署，1分钟后生效。

#### 步骤5：测试使用
打开你的域名，就能看到加速站页面了，里面有详细的使用教程和URL生成器，直接粘贴地址就能生成加速链接。

## ⚙️ 技术原理（想二开的可以看）
核心代理逻辑全在根目录的`_worker.js`文件里，Cloudflare Pages会自动识别这个文件作为边缘函数运行：
1. **路由识别**：
   - 路径带`/v2/`开头的走Docker Registry代理逻辑
   - 路径带`/https://`或者`/http://`的走通用URL代理
   - 其他路径返回静态页面
2. **Docker 鉴权**：拦截401响应，自动解析`WWW-Authenticate`头，去对应的认证服务获取Token，再重新发起请求，用户完全无感知
3. **S3 反代**：拦截Docker Registry返回的S3 302/307重定向，不走客户端跳转，由Worker去拉取S3资源再返回给用户，解决国内直接访问S3限速的问题
4. **多Registry支持**：自动识别ghcr.io、quay.io、gcr.io等第三方容器仓库地址，自动适配代理逻辑

## 📦 源码地址
开源地址：[https://github.com/maoshengyzx/cloudflare-proxy](https://github.com/maoshengyzx/cloudflare-proxy)
欢迎Star、Fork、提PR，有问题可以在Issue里反馈。

## 💡 常见问题
1. **有没有流量限制？**
   Cloudflare Pages免费版每天10万次请求，带宽完全够用，个人用根本用不完，就算超了也只是限速不会停用。
2. **支持SSH协议的git@地址吗？**
   不支持，Cloudflare Worker只处理HTTP/HTTPS请求，把SSH地址改成HTTPS地址就能用，前端已经做了自动转换，直接粘贴git@地址会自动生成可用的HTTPS加速链接。
3. **可以代理其他网站吗？**
   可以，只要修改`_worker.js`里的`ALLOWED_HOSTS`数组，添加你想代理的域名就行。
4. **需要备案吗？**
   不需要，用Cloudflare的节点，域名不用备案，直接就能用。

---
如果部署过程中有问题，可以在评论区留言，我看到会回复~