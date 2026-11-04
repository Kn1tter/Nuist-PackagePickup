#!/usr/bin/env bash
# 在阿里云 ECS 上安装 Cloudflare Tunnel，让未备案域名也可通过 CF 访问
# 用法：
#   1. 先在 https://one.dash.cloudflare.com/ 创建 Zero Trust → Networks → Tunnels
#   2. 选 Cloudflared，复制安装 token
#   3. 在服务器执行：
#        export CF_TUNNEL_TOKEN='你的token'
#        bash deploy/cloudflare-tunnel.sh
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请用 root 运行"
  exit 1
fi

if [[ -z "${CF_TUNNEL_TOKEN:-}" ]]; then
  echo "请先设置：export CF_TUNNEL_TOKEN='你的token'"
  exit 2
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) DEB_ARCH=amd64 ;;
  aarch64|arm64) DEB_ARCH=arm64 ;;
  *) echo "不支持的架构: $ARCH"; exit 1 ;;
esac

cd /tmp
curl -fsSL -o cloudflared.deb \
  "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${DEB_ARCH}.deb"
dpkg -i cloudflared.deb || apt-get install -f -y

cloudflared service install "$CF_TUNNEL_TOKEN"
systemctl enable cloudflared
systemctl restart cloudflared
systemctl --no-pager --full status cloudflared || true

echo ""
echo "Tunnel 已启动。请在 Cloudflare 控制台把 Public Hostname 配成："
echo "  chocolatefornuist.tech  →  http://127.0.0.1:80"
echo "  www.chocolatefornuist.tech → http://127.0.0.1:80"
echo "并把域名 NS 改到 Cloudflare（或按控制台提示改 DNS）。"
