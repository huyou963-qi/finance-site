#!/bin/sh
set -eu

: "${HK_HOST:?HK_HOST is required}"
: "${HK_SSH_USER:?HK_SSH_USER is required}"
: "${SSH_KEY_PATH:?SSH_KEY_PATH is required}"
: "${SSH_KNOWN_HOSTS_PATH:?SSH_KNOWN_HOSTS_PATH is required}"

tinyproxy -c /etc/tinyproxy/tinyproxy.conf &
proxy_pid=$!
trap 'kill "$proxy_pid" 2>/dev/null || true' EXIT INT TERM

exec autossh -M 0 -N \
  -i "$SSH_KEY_PATH" \
  -p "${HK_SSH_PORT:-22}" \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$SSH_KNOWN_HOSTS_PATH" \
  -R "127.0.0.1:${REMOTE_PROXY_PORT:-18080}:127.0.0.1:3128" \
  "${HK_SSH_USER}@${HK_HOST}"
