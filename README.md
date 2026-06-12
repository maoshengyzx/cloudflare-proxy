# 家人们！5分钟零成本搭自己的GitHub/Docker加速站，再也不用忍受几KB/s的龟速了！

## 😭 我是真的被折磨够了
谁懂啊家人们！作为一个国内开发，每天都要被这些破事搞崩溃：
- 一大早赶需求要clone个GitHub项目，进度条直接卡0%卡10分钟，动不动就timeout，直接给我整迟到
- 线上出问题要pull个Docker镜像排查，拉到一半给我断了，重拉三次才成功，老板都在群里催疯了
- 想下个GitHub Release的安装包，100M的东西要下半小时，比我家十年前的网还慢
- 网上搜的那些公开加速站，要么限速到1M/s，要么用着用着突然就凉了，找都找不到地方说理

今天给大家分享我自己用了大半年的方案，**真·一分钱不用花，真·5分钟搞定，真·速度直接拉满**，用Cloudflare Pages零成本运行，完全自己可控，再也不用看别人脸色。

## ✨ 我这方案好在哪？
先给你们看看和外面那些公开加速站的区别，真的是吊打：
| 功能 | 我这个方案 | 外面的公开加速站 |
|------|------------|------------------|
| GitHub各种加速（Clone/Release/Raw） | ✅ 全支持 | ✅ 大部分支持 |
| Docker镜像加速 | ✅ 原生支持，自动鉴权 | ❌ 很多不支持，或者经常炸 |
| GHCR/Quay/GCR这些小众容器仓库 | ✅ 全兼容 | ❌ 基本都不支持 |
| 速度 | ✅ 不限速，跑满你家带宽 | ❌ 普遍限速1-2M/s，慢到死 |
| 稳定性 | ✅ 自己的Cloudflare账户，想用到什么时候用到什么时候 | ❌ 说挂就挂，说限速就限速，你连找谁都不知道 |
| 成本 | ✅ 完全免费，一分钱不用花 | ❌ 好用的基本都要收费 |
| 部署难度 | ✅ 有手就行，5分钟搞定 | ❌ 你不用管，但是哪天没了也不知道 |

**最牛逼的是我加了别人没有的功能：**
Docker镜像拉取的时候会自动反代S3的重定向链接，不用你客户端跳转到S3，直接从Cloudflare节点给你吐数据，这个功能对国内用户提升速度特别明显，我自己用下来拉Docker镜像速度从原来的几KB/s直接干到几十MB/s，爽到飞起。

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

## 🛠️ 真·5分钟搞定部署，有手就行
### 提前准备好这俩东西就行：
- 一个GitHub账号（没有的去注册一个，2分钟的事）
- 一个Cloudflare账号（免费版完全够用，不用花钱升级）
- 域名都不用买！Cloudflare Pages自带的`*.pages.dev`域名直接就能用

#### 第一步：先把代码拷到你自己名下
打开我这个项目的仓库：[https://github.com/maoshengyzx/cloudflare-proxy](https://github.com/maoshengyzx/cloudflare-proxy)
点右上角的「Fork」按钮，一键把代码复制到你自己的GitHub账号里，啥都不用改。

#### 第二步：去Cloudflare Pages创建项目
1. 登录Cloudflare控制台，找到「Pages」入口，点进去
2. 点「创建项目」→「连接到Git」，选你刚才Fork的那个`cloudflare-proxy`仓库
3. 构建配置啥都不用改，全部留空就行：
   - 构建命令：空着就行，啥都不用填
   - 输出目录：填个`/`就行
4. 直接点「部署」，等30秒，Cloudflare就给你部署好了，就是这么简单。

#### 第三步：改个配置就完事了
编辑你Fork后的仓库里的`assets/js/config.js`文件，把里面的域名改成你刚才Cloudflare给你的`*.pages.dev`域名，或者你自己的域名：
```js
window.CF_PROXY = {
  DOMAIN: 'xxx.pages.dev', // 改成你自己的域名就行
};
```
提交修改，Cloudflare会自动重新部署，1分钟后就能用了。

#### 第四步：爽起来
打开你的域名，就能看到一个干干净净的加速站页面，里面有现成的URL生成器，直接把你要下的GitHub地址或者Docker镜像名粘进去，自动给你生成加速链接，复制就能用，傻瓜式操作。

## ⚙️ 好奇原理的可以看看，不想看的直接跳过就行
说人话就是：
代码核心就是根目录的`_worker.js`，Cloudflare会自动把它跑在全球的边缘节点上，你所有的请求都先到Cloudflare节点，然后它去国外帮你把资源拉回来，再给你，相当于找了个全球最快的跑腿帮你取东西，你不用自己慢慢连国外的慢网。

我做了几个核心优化：
1. Docker拉镜像的时候如果遇到要登录的401错误，自动帮你去拿Token，你啥都不用管，直接pull就行
2. Docker镜像的文件都是存在S3上的，国内直接访问S3巨慢，我做了个自动反代，所有S3的资源都从Cloudflare节点给你吐，速度直接翻几十倍
3. 自动识别GHCR、Quay这些小众容器仓库，不用你单独配置，直接就能用

## 📦 源码地址
全部代码都开源在这里：[https://github.com/maoshengyzx/cloudflare-proxy](https://github.com/maoshengyzx/cloudflare-proxy)
觉得好用的兄弟们别忘了点个Star支持一下啊，感谢🙏，有bug或者想要加功能直接提Issue就行，我看到就会改。

## 💡 你们可能会问的问题
1. **真的完全免费吗？会不会扣我钱？**
   放一百个心，Cloudflare Pages免费版每天10万次请求，个人用根本用不完，就算你用超了也只是限速，不会扣你钱，也不会给你停服务。
2. **支持git@开头的SSH地址吗？**
   不支持哈，Cloudflare Worker只能处理HTTP/HTTPS请求，不过我在页面上做了自动转换，你直接把git@开头的地址粘进去，自动给你转成能用的HTTPS加速链接，复制就能用。
3. **我想代理其他网站可以吗？**
   没问题，自己改`_worker.js`里的`ALLOWED_HOSTS`数组，把你想代理的域名加进去就行，想代理啥代理啥。
4. **域名需要备案吗？**
   完全不用，用Cloudflare自带的`*.pages.dev`域名直接就能用，你自己的域名解析到Cloudflare也不用备案，直接就能跑。
5. **会不会被墙啊？**
   用你自己的域名，自己的Cloudflare账户，只要你不往外乱发，基本不会被墙，用的人越少越稳定。

---
部署过程中遇到啥问题直接在评论区留言，我看到就会回复~ 觉得有用的兄弟们点赞收藏关注一波，下次找得到😎