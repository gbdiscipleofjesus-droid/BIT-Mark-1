#!/bin/bash
# Convierte MP4 (o MOV, MKV, WEBM...) a AVI con sonido, listo para la tarjeta SD de Robit Mark 1.
# (Robit no puede reproducir MP4: su chip no decodifica H.264. Este script cambia el formato; el sonido se conserva.)
#
# Un video:      bash tools/convertir_video.sh pelicula.mp4 [calidad]
# Una carpeta:   bash tools/convertir_video.sh carpeta/ [calidad]     (convierte todos los videos que haya dentro)
#
# Los .avi salen en una carpeta llamada "para_la_SD" al lado del original. Copialos a la carpeta "video" de la tarjeta (FAT32).
# calidad: de 2 (mejor, pesa mas) a 20 (peor, pesa menos). Por defecto 8. Para peliculas largas usa 10-12.
# Formato de salida: 360x360, 24 fps, Motion-JPEG, sonido PCM 24 kHz mono.
IN="$1"; Q="${2:-8}"
if [ -z "$IN" ]; then echo "Uso: bash $0 video.mp4|carpeta [calidad]"; exit 1; fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Falta ffmpeg. En Mac: instala Homebrew (https://brew.sh) y luego escribe:  brew install ffmpeg"
  echo "En Linux:  sudo apt install ffmpeg"; exit 1
fi
convertir() {
  local f="$1" dir base out
  dir="$(dirname "$f")/para_la_SD"; mkdir -p "$dir"
  base="$(basename "${f%.*}" | tr ' ' '_' | tr -cd 'A-Za-z0-9_.-')"; [ -z "$base" ] && base="video"
  out="$dir/${base:0:40}.avi"                       # nombre corto y sin tildes: asi lo lee la placa
  echo ">> $f  ->  $out"
  if ffmpeg -nostdin -loglevel error -stats -y -i "$f" \
       -vf "scale=360:360:force_original_aspect_ratio=decrease,pad=360:360:(ow-iw)/2:(oh-ih)/2,fps=24" \
       -c:v mjpeg -q:v "$Q" -pix_fmt yuvj420p -c:a pcm_s16le -ar 24000 -ac 1 "$out"; then
    if ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "$out" 2>/dev/null | grep -q pcm; then echo "   listo, con sonido"; else echo "   listo (el original no tenia sonido)"; fi
  else echo "   ERROR convirtiendo $f"; fi
}
if [ -d "$IN" ]; then
  n=0
  while IFS= read -r -d '' f; do convertir "$f"; n=$((n+1)); done < <(find "$IN" -maxdepth 1 -type f \( -iname '*.mp4' -o -iname '*.m4v' -o -iname '*.mov' -o -iname '*.mkv' -o -iname '*.webm' -o -iname '*.avi' -o -iname '*.wmv' -o -iname '*.flv' -o -iname '*.mpg' -o -iname '*.mpeg' -o -iname '*.3gp' \) -print0)
  [ "$n" = 0 ] && echo "No encontre videos en $IN"
else
  convertir "$IN"
fi
echo; echo "Copia los archivos de la carpeta 'para_la_SD' a la carpeta 'video' de la tarjeta SD (FAT32)."
