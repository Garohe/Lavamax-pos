@echo off
title Lavamax POS - Servidor
color 0A
echo.
echo  ==========================================
echo    LAVAMAX - Sistema Punto de Venta
echo  ==========================================
echo.
echo  Iniciando servidor en http://localhost:3000
echo  Presiona Ctrl+C para detener
echo.
cd /d "%~dp0"
node server.js
pause
