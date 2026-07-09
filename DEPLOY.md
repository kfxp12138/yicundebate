# 部署说明

域名：`triplewings123.online`

这个项目是一个纯 Node.js 服务，无需构建步骤。`server.js` 同时提供控场页、观众投票页和实时票数接口。

## 1. DNS

在 DNSPod 或腾讯云域名解析里添加记录：

- 主机记录：`@`，类型：`A`，记录值：服务器公网 IP
- 主机记录：`www`，类型：`A`，记录值：服务器公网 IP

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

如果以后放到 GitHub，也可以在服务器上：

```bash
git clone 仓库地址 /opt/debates
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
    server_name triplewings123.online www.triplewings123.online;

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

- `http://triplewings123.online/index.html`
- `http://triplewings123.online/vote.html`

## 6. 开启 HTTPS

用 Certbot 自动申请和配置证书：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d triplewings123.online -d www.triplewings123.online
```

完成后访问：

- `https://triplewings123.online/index.html`
- `https://triplewings123.online/vote.html`

## 7. 微信投票使用方式

把 `https://triplewings123.online/vote.html` 做成二维码给观众扫码。控场屏打开：

```text
https://triplewings123.online/index.html
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

更新代码后：

```bash
cd /opt/debates
sudo systemctl restart debates
```

## 注意

目前票数保存在内存中，服务重启会清空票数。正式比赛前可以用控场页里的“清空服务器票数”按钮重置。
