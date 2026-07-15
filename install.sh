#!/bin/bash
# LODE one-line installer / updater.
#   curl -fsSL https://raw.githubusercontent.com/leocreated/lode/main/install.sh | bash
# Installs to ~/lode. Run the same line again any time to update.
set -e

DIR="$HOME/lode"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required. On a Mac, run: xcode-select --install   then rerun this."
  exit 1
fi

if [ -d "$DIR/.git" ]; then
  echo "Updating LODE in $DIR ..."
  git -C "$DIR" pull --ff-only
else
  echo "Downloading LODE to $DIR ..."
  git clone --depth 1 https://github.com/leocreated/lode.git "$DIR"
fi

cd "$DIR"
# setup asks for the YouTube key; read from the terminal even when piped via curl
bash setup.sh </dev/tty

echo "To start LODE any time:  cd ~/lode && npm start"
