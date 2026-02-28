#!/bin/bash
grep -v --line-buffered \
  -e 'cache bypass, force executing' \
  -e '> @aiponge/.*@.* dev' \
  -e '> NODE_OPTIONS=' \
  -e 'Fast resolver is enabled' \
  -e 'Tunnel connected' \
  -e 'Tunnel ready' \
  -e 'Using a non-interactive terminal' \
  -e '› Choose an app' \
  -e '› Press ' \
  -e '› shift+' \
  -e 'Logs for your project will appear below' \
  -e 'Starting project at' \
  -e '• Packages in scope' \
  -e '• Running dev in' \
  -e '• Remote caching' \
  -e 'env: load .env' \
  -e 'env: export '
