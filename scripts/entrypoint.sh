#!/bin/sh
# HTML Share 容器入口：确保数据目录存在且属主正确，再以非 root 用户启动。
set -e

DATA_DIR="${DATA_DIR:-/app/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R app:app "$DATA_DIR"
  exec su -s /bin/sh app -c 'exec node src/server.js'
fi

exec node src/server.js
