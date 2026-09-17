@echo off
cd /d "%~dp0"
echo EmbodiedLens 3.2 - http://localhost:8008
echo Keep this window open. Use Ctrl+C to stop.
python -m http.server 8008 --bind 127.0.0.1
pause

