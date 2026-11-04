#!/usr/bin/env bash
# 把巧克力记账 APK 同步到前端静态目录，供 https://chocolatefornuist.tech/app/ 下载与更新检测。
# 用法（在仓库根，构建后或部署脚本末尾）：
#   bash deploy/sync-chocolate-ledger.sh
# 可选环境变量：
#   CHOCOLATE_LEDGER_TAG=chocolate-ledger-1.1.17
#   CHOCOLATE_LEDGER_DIST=frontend/dist/app
#   CHOCOLATE_LEDGER_APK=/path/to/local.apk   # 优先用本地 APK，跳过 GitHub 下载
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${CHOCOLATE_LEDGER_TAG:-chocolate-ledger-1.1.17}"
DEST="${CHOCOLATE_LEDGER_DIST:-$ROOT/frontend/dist/app}"
BASE="https://github.com/Kn1tter/Nuist-PackagePickup/releases/download/${TAG}"
LOCAL_APK="${CHOCOLATE_LEDGER_APK:-}"

mkdir -p "$DEST"

echo "==> 写入 update.json（指向本站 APK）"
cat > "$DEST/update.json" <<'EOFJSON'
{
  "version": "1.1.17",
  "versionCode": 19,
  "apkUrl": "https://chocolatefornuist.tech/app/chocolate-ledger.apk",
  "apkSize": 91104665,
  "notes": "账单时间可选：记一笔/编辑支持完整日期时间；截图 OCR 解析小票时间、多笔可分别改时间后记账；设置可切换 24 小时制。"
}
EOFJSON

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

ls -lh "$DEST/update.json" "$DEST/chocolate-ledger.apk"
echo "完成。线上路径：/app/update.json 与 /app/chocolate-ledger.apk"
