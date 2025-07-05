#!/bin/sh
# health-check.sh

# 使用 localhost 和容器内部端口 3000 进行健康检查
# curl -f http://localhost:3000/api/health || exit 1
# Updated to use sh compatible syntax and avoid bashisms if any

if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    exit 0
else
    exit 1
fi