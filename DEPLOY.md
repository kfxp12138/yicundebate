# 部署说明

域名：`3wings.top`

这个项目是一个纯 Node.js 服务，无需构建步骤。`server.js` 同时提供控场页、观众投票页和实时票数接口。

## 1. DNS

在 DNSPod 或腾讯云域名解析里添加记录：

- 主机记录：`@`，类型：`A`，记录值：服务器公网 IP
- 当前只使用根域名 `3wings.top`，不需要 `www` 记录。

等待解析生效后，服务器安全组/防火墙放行：

- `80/tcp`
- `443/tcp`

## 2. 上传项目

推荐放在服务器的 `/opt/debates`：

```bash
sudo mkdir -p /opt/debates
sudo chown -R $USER:$USER /opt/debates
```

如果从本机上传：

```bash
scp -r /Users/triplewings/vibecoding/debates/* root@服务器公网IP:/opt/debates/
```

从 GitHub 获取代码：

```bash
git clone https://github.com/kfxp12138/yicundebate.git /opt/debates
```

## 3. 安装 Node.js

Ubuntu/Debian 示例：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

在项目目录测试启动：

```bash
cd /opt/debates
npm start
```

本项目默认监听 `127.0.0.1:5177`，适合放在 Nginx 后面。

## 4. 配置常驻服务

创建 systemd 服务：

```bash
sudo tee /etc/systemd/system/debates.service >/dev/null <<'EOF'
[Unit]
Description=Debate control voting app
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/debates
Environment=HOST=127.0.0.1
Environment=PORT=5177
ExecStart=/usr/bin/node /opt/debates/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now debates
sudo systemctl status debates
```

## 5. 配置 Nginx

安装 Nginx：

```bash
sudo apt-get install -y nginx
```

创建站点配置：

```bash
sudo tee /etc/nginx/sites-available/debates >/dev/null <<'EOF'
server {
    listen 80;
    server_name 3wings.top;

    location / {
        proxy_pass http://127.0.0.1:5177;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/votes/stream {
        proxy_pass http://127.0.0.1:5177;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
    }
}
EOF
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/debates /etc/nginx/sites-enabled/debates
sudo nginx -t
sudo systemctl reload nginx
```

现在应可访问：

- `http://3wings.top/index.html`
- `http://3wings.top/vote.html`

## 6. 开启 HTTPS

用 Certbot 自动申请和配置证书：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 3wings.top
```

完成后访问：

- `https://3wings.top/index.html`
- `https://3wings.top/vote.html`

## 7. 微信投票使用方式

把 `https://3wings.top/vote.html` 做成二维码给观众扫码。控场屏打开：

```text
https://3wings.top/index.html
```

当前版本用浏览器本地身份限制一人一票，适合小型现场活动。若要更严格防刷票，后续应接微信公众号网页授权或小程序登录，用微信 `openid` 作为投票身份。

## 8. 常用运维命令

查看服务：

```bash
sudo systemctl status debates
```

看日志：

```bash
journalctl -u debates -f
```

重启：

```bash
sudo systemctl restart debates
```

更新代码（部署分支为 `main`）：

```bash
cd /opt/debates
git pull --ff-only origin main
```

只修改 `index.html`、`app.js`、`styles.css` 或 `vote.html` 时，刷新浏览器即可生效，无需重启服务。修改 `server.js` 后才需要 `sudo systemctl restart debates`。

## 注意

目前票数保存在内存中，服务重启会清空票数。正式比赛前可以用控场页里的“清空服务器票数”按钮重置。
