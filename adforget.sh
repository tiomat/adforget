#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="${SCRIPT_DIR}/server"
PID_FILE="${SERVER_DIR}/adforget-server.pid"
LOG_FILE="${SERVER_DIR}/adforget-server.log"

cd "${SCRIPT_DIR}"

usage() {
  echo "Usage: $0 {start|stop|restart|status|logs}"
  exit 1
}

is_running() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(cat "${PID_FILE}")"
    if kill -0 "${pid}" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

cmd_start() {
  if is_running; then
    echo "AdForget server is already running (PID: $(cat "${PID_FILE}"))"
    exit 0
  fi

  cd "${SERVER_DIR}"
  nohup node server.js > "${LOG_FILE}" 2>&1 &
  local pid=$!
  echo "${pid}" > "${PID_FILE}"
  echo "AdForget server started (PID: ${pid})"
  echo "Logs: ${LOG_FILE}"
}

cmd_stop() {
  if ! is_running; then
    echo "AdForget server is not running"
    rm -f "${PID_FILE}"
    return 0
  fi

  local pid
  pid="$(cat "${PID_FILE}")"
  echo "Stopping AdForget server (PID: ${pid})..."
  kill "${pid}" 2>/dev/null || true

  # Wait up to 5 seconds for graceful shutdown
  local count=0
  while is_running && [[ ${count} -lt 10 ]]; do
    sleep 0.5
    count=$((count + 1))
  done

  if is_running; then
    echo "Force killing AdForget server..."
    kill -9 "${pid}" 2>/dev/null || true
  fi

  rm -f "${PID_FILE}"
  echo "AdForget server stopped"
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  if is_running; then
    echo "AdForget server is running (PID: $(cat "${PID_FILE}"))"
    echo "Logs: ${LOG_FILE}"
  else
    echo "AdForget server is not running"
  fi
}

cmd_logs() {
  if [[ -f "${LOG_FILE}" ]]; then
    tail -n 50 -f "${LOG_FILE}"
  else
    echo "No log file found at ${LOG_FILE}"
  fi
}

case "${1:-}" in
  start)
    cmd_start
    ;;
  stop)
    cmd_stop
    ;;
  restart)
    cmd_restart
    ;;
  status)
    cmd_status
    ;;
  logs)
    cmd_logs
    ;;
  *)
    usage
    ;;
esac
