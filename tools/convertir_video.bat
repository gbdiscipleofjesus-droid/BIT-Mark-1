@echo off
rem Uso: arrastra un video sobre este archivo, o:  convertir_video.bat pelicula.mp4
rem Crea pelicula.avi listo para la tarjeta SD de Robit Mark 1 (360x360, 24 fps, Motion-JPEG, sonido PCM 24 kHz mono).
if "%~1"=="" (echo Uso: convertir_video.bat video.mp4 & exit /b 1)
ffmpeg -i "%~1" -vf "scale=360:360:force_original_aspect_ratio=decrease,pad=360:360:(ow-iw)/2:(oh-ih)/2,fps=24" -c:v mjpeg -q:v 8 -c:a pcm_s16le -ar 24000 -ac 1 "%~dpn1.avi"
echo Listo: "%~dpn1.avi"  - copialo a la carpeta video de la tarjeta SD (FAT32)
