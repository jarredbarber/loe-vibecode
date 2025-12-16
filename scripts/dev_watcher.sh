#!/bin/bash

# Configuration
VENV_PYTHON="./venv/bin/python"
PELICAN="./venv/bin/pelican"
SITE_CONFIG="site_config.py"
CONTENT_DIR="content"
OUTPUT_DIR="_site"
PORT=8000

# Function to check for fswatch
check_dependencies() {
    if ! command -v fswatch &> /dev/null; then
        echo "fswatch could not be found."
        echo "Installing fswatch via brew..."
        if command -v brew &> /dev/null; then
            brew install fswatch
        else
            echo "Error: Homebrew is not installed. Please install Homebrew or install fswatch manually."
            exit 1
        fi
    fi
}

# Function to build the site
build_site() {
    echo "Building site..."
    $PELICAN $CONTENT_DIR -s $SITE_CONFIG
    echo "Build complete."
}

# Function to start/restart the server
start_server() {
    # Find and kill existing server on the port
    PID=$(lsof -ti:$PORT)
    if [ ! -z "$PID" ]; then
        echo "Stopping existing server (PID: $PID)..."
        kill $PID
    fi
    
    echo "Starting web server at http://localhost:$PORT..."
    cd $OUTPUT_DIR
    python3 -m http.server $PORT &
    SERVER_PID=$!
    cd ..
}

# Cleanup function
cleanup() {
    echo -e "\nStopping watcher..."
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null
    fi
    exit 0
}

# Initial setup
check_dependencies
trap cleanup SIGINT SIGTERM

# Initial build and start
build_site
start_server

# Watch for changes
echo "Watching for changes in . (excluding _site, venv, .git)..."
fswatch -r . -e ".*_site.*" -e ".*venv.*" -e ".*\.git.*" -e ".*__pycache__.*" | while read num; do
    echo "Change detected. Rebuilding..."
    build_site
    start_server
done
