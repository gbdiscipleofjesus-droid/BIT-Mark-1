#!/bin/bash
# Uso:  ./convertir_video.sh pelicula.mp4 [calidad]
# Crea pelicula.avi listo para la tarjeta SD de Robit Mark 1 (360x360, 24 fps, Motion-JPEG, sonido PCM 24 kHz mono).
# calidad: numero de 2 (mejor, pesa mas) a 20 (peor, pesa menos). Por defecto 8. Para peliculas largas usa 10-12.
set -e
IN="$1"; Q="${2:-8}"
[ -z "$IN" ] && { echo "Uso: $0 video.mp4 [calidad]"; exit 1; }
OUT="${IN%.*}.avi"
ffmpeg -i "$IN" \
  -vf "scale=360:360:force_original_aspect_ratio=decrease,pad=360:360:(ow-iw)/2:(oh-ih)/2,fps=24" \
  -c:v mjpeg -q:v "$Q" -c:a pcm_s16le -ar 24000 -ac 1 "$OUT"
echo "Listo: $OUT  -> copialo a la carpeta 'video' de la tarjeta SD (FAT32)"
