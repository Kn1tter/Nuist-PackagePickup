#!/usr/bin/env bash
# 在阿里云 Ubuntu 服务器上执行：把南信大互助部署到本机 Nginx + PM2
# 用法：
#   cd /var/www/nuist && bash deploy/aliyun-setup.sh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$APP_ROOT/backend"
FRONTEND="$APP_ROOT/frontend"

echo "==> 安装系统依赖（需 root）"
if [[ "$(id -u)" -ne 0 ]]; then
  echo "请用 root 运行：sudo bash deploy/aliyun-setup.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx git curl ca-certificates

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]]; then
  echo "==> 安装 Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm i -g pm2
fi

echo "==> 后端依赖"
cd "$BACKEND"
if [[ ! -f .env ]]; then
  cat > .env <<'EOF'
PORT=3000
DATABASE_URL=
JWT_SECRET=请改成至少16位随机字符串
FRONTEND_ORIGIN=*
ADMIN_STUDENT_IDS=
EOF
  echo "已生成 $BACKEND/.env ，请先编辑填入 DATABASE_URL / JWT_SECRET / ADMIN_STUDENT_IDS 后再重新运行本脚本。"
  echo "  nano $BACKEND/.env"
  exit 2
fi

# 粗查必填项
if ! grep -qE '^JWT_SECRET=.+' .env || grep -q '请改成' .env; then
  echo "请先在 .env 里设置有效的 JWT_SECRET（≥16 位）"
  exit 2
fi

npm install --omit=optional

echo "==> 启动 API (pm2)"
pm2 delete nuist-api 2>/dev/null || true
# 强制 DNS 优先 IPv4，避免连 Supabase 时 ENETUNREACH
pm2 start src/app.js --name nuist-api --node-args="--dns-result-order=ipv4first"
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/pm2-startup.txt || true
# 尝试执行 startup 提示命令（若已配置会忽略失败）
grep -o 'sudo .*' /tmp/pm2-startup.txt 2>/dev/null | head -1 | bash || true

echo "==> 等待 API 就绪"
ok=0
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/tmp/nuist-health.json 2>/dev/null; then
    head -c 200 /tmp/nuist-health.json
    echo ""
    ok=1
    break
  fi
  sleep 1
done
if [[ "$ok" -ne 1 ]]; then
  echo "健康检查失败，查看日志：pm2 logs nuist-api --lines 40 --nostream"
  exit 1
fi
echo "==> API 正常"

echo "==> 构建前端（同源 /api，不设 VITE_API_BASE）"
cd "$FRONTEND"
# 确保生产构建走相对路径
rm -f .env.production
npm install
npm run build

echo "==> 配置 Nginx"
install -m 644 "$APP_ROOT/deploy/nginx-nuist.conf" /etc/nginx/sites-available/nuist
# 把 root 路径写死为当前仓库
sed -i "s|root /var/www/nuist/frontend/dist;|root $FRONTEND/dist;|" /etc/nginx/sites-available/nuist
ln -sfn /etc/nginx/sites-available/nuist /etc/nginx/sites-enabled/nuist
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

IP="$(curl -fsS -m 3 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
echo "========================================"
echo " 部署完成"
echo " 浏览器打开: http://$IP"
echo " 健康检查:   http://$IP/api/health"
echo " 看日志:     pm2 logs nuist-api"
echo "========================================"
