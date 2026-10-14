@echo off
rem Convierte MP4 (o MOV, MKV...) a AVI con sonido para la tarjeta SD de Robit Mark 1.
rem Uso: arrastra uno o varios videos sobre este archivo, o:  convertir_video.bat pelicula.mp4
rem Los .avi quedan en la carpeta "para_la_SD" junto al original. Copialos a la carpeta video de la tarjeta (FAT32).
rem Formato: 360x360, 24 fps, Motion-JPEG, sonido PCM 24 kHz mono. Usa nombres cortos (menos de 40 letras).
where ffmpeg >nul 2>nul || (echo Falta ffmpeg: instalalo desde https://ffmpeg.org/download.html ^(o: winget install ffmpeg^) & pause & exit /b 1)
if "%~1"=="" (echo Uso: arrastra un video sobre este archivo & pause & exit /b 1)
:next
if "%~1"=="" goto fin
if not exist "%~dp1para_la_SD" mkdir "%~dp1para_la_SD"
echo ^>^> %~1
ffmpeg -nostdin -loglevel error -stats -y -i "%~1" -vf "scale=360:360:force_original_aspect_ratio=decrease,pad=360:360:(ow-iw)/2:(oh-ih)/2,fps=24" -c:v mjpeg -q:v 8 -pix_fmt yuvj420p -c:a pcm_s16le -ar 24000 -ac 1 "%~dp1para_la_SD\%~n1.avi"
shift
goto next
:fin
echo.
echo Listo. Copia los archivos de la carpeta para_la_SD a la carpeta video de la tarjeta SD (FAT32).
pause
