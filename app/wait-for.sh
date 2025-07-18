#!/bin/sh

HOST_PORT="$1"
shift

HOST=$(echo "$HOST_PORT" | cut -d: -f1)
PORT=$(echo "$HOST_PORT" | cut -d: -f2)

echo "Waiting for $HOST:$PORT..."

for i in $(seq 1 30); do
  nc -z "$HOST" "$PORT" && break
  echo "Still waiting for $HOST:$PORT..."
  sleep 1
done

if nc -z "$HOST" "$PORT"; then
  echo "$HOST:$PORT is up - executing command"
  exec "$@"
else
  echo "Timed out waiting for $HOST:$PORT"
  exit 1
fi
