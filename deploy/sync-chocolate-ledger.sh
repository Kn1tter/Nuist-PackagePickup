#!/usr/bin/env bash
# 把巧克力记账 APK 同步到前端静态目录，供 https://chocolatefornuist.tech/app/ 下载与更新检测。
# 用法（在仓库根，构建后或部署脚本末尾）：
#   bash deploy/sync-chocolate-ledger.sh
# 可选环境变量：
#   CHOCOLATE_LEDGER_TAG=chocolate-ledger-1.1.9
#   CHOCOLATE_LEDGER_DIST=frontend/dist/app
#   CHOCOLATE_LEDGER_APK=/path/to/local.apk   # 优先用本地 APK，跳过 GitHub 下载
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${CHOCOLATE_LEDGER_TAG:-chocolate-ledger-1.1.9}"
DEST="${CHOCOLATE_LEDGER_DIST:-$ROOT/frontend/dist/app}"
BASE="https://github.com/Kn1tter/Nuist-PackagePickup/releases/download/${TAG}"
LOCAL_APK="${CHOCOLATE_LEDGER_APK:-}"
# 也写入 public/，避免下次 Vite 构建只带出 mascot/update 而丢掉 APK 镜像
PUBLIC_DEST="${CHOCOLATE_LEDGER_PUBLIC:-$ROOT/frontend/public/app}"

mkdir -p "$DEST" "$PUBLIC_DEST"

echo "==> 写入 update.json（apkUrl 指向本站 APK，保障应用内更新）"
cat > "$DEST/update.json" <<'EOF'
{
  "version": "1.1.9",
  "versionCode": 11,
  "apkUrl": "https://chocolatefornuist.tech/app/chocolate-ledger.apk",
  "notes": "修复应用内更新（站点直链 APK、跟随 GitHub 302、安装调起）"
}
EOF
cp -f "$DEST/update.json" "$PUBLIC_DEST/update.json"

if [[ -n "$LOCAL_APK" && -f "$LOCAL_APK" ]]; then
  echo "==> 使用本地 APK: $LOCAL_APK"
  cp -f "$LOCAL_APK" "$DEST/chocolate-ledger.apk"
elif curl -fsI "$BASE/chocolate-ledger.apk" >/dev/null 2>&1; then
  echo "==> 下载 APK → $DEST/chocolate-ledger.apk"
  curl -fL --retry 3 --retry-delay 2 \
    -o "$DEST/chocolate-ledger.apk.tmp" \
    "$BASE/chocolate-ledger.apk"
  mv -f "$DEST/chocolate-ledger.apk.tmp" "$DEST/chocolate-ledger.apk"
else
  echo "WARN: Release $TAG 尚未可下载，且未提供 CHOCOLATE_LEDGER_APK。"
  echo "      请稍后重跑，或：CHOCOLATE_LEDGER_APK=/path/to.apk bash deploy/sync-chocolate-ledger.sh"
  exit 2
fi

# 站点镜像必填：update.json apkUrl 指向本站 /app/chocolate-ledger.apk
cp -f "$DEST/chocolate-ledger.apk" "$PUBLIC_DEST/chocolate-ledger.apk"

ls -lh "$DEST/update.json" "$DEST/chocolate-ledger.apk"
echo "完成。update.json apkUrl → https://chocolatefornuist.tech/app/chocolate-ledger.apk"
echo "站点镜像：/app/chocolate-ledger.apk （发版后请重跑本脚本，勿只依赖 dist 残留）"
