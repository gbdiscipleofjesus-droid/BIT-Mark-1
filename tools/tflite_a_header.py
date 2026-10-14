#!/usr/bin/env python3
"""Convierte un modelo microWakeWord (.tflite) en model_data.h para el sketch Hey_Buddy_MicroWakeWord.

Con el .json que acompaña al modelo (los modelos oficiales lo traen):
    python tools/tflite_a_header.py hey_jarvis.tflite --json hey_jarvis.json > Hey_Buddy_MicroWakeWord/model_data.h

Con un modelo que entrenaste tú (el notebook solo entrega el .tflite), pon los valores a mano:
    python tools/tflite_a_header.py stream_state_internal_quant.tflite --name "hey buddy" --cutoff 0.9 --window 5 --arena 30000 > Hey_Buddy_MicroWakeWord/model_data.h
"""
import argparse, json, os, sys
ap = argparse.ArgumentParser()
ap.add_argument("tflite"); ap.add_argument("--json")
ap.add_argument("--name", default=None); ap.add_argument("--cutoff", type=float, default=None)
ap.add_argument("--window", type=int, default=None); ap.add_argument("--arena", type=int, default=None)
a = ap.parse_args()
m, name = {}, None
if a.json:
    j = json.load(open(a.json)); m = j.get("micro", {}); name = j.get("wake_word")
name = a.name or name or os.path.splitext(os.path.basename(a.tflite))[0]
cutoff = a.cutoff if a.cutoff is not None else m.get("probability_cutoff", 0.9)
window = a.window if a.window is not None else m.get("sliding_window_size", 5)
arena = a.arena if a.arena is not None else m.get("tensor_arena_size", 30000)
data = open(a.tflite, "rb").read()
o = sys.stdout
o.write("// generado por tools/tflite_a_header.py - no editar a mano\n")
o.write(f'#define MODEL_NAME     "{name}"\n#define MODEL_CUTOFF   {cutoff}f\n#define MODEL_WINDOW   {window}\n#define MODEL_ARENA    {arena}\n')
o.write(f"// {os.path.basename(a.tflite)}, {len(data)} bytes\nalignas(16) static const unsigned char g_model[] = {{\n")
for i in range(0, len(data), 16):
    o.write("  " + ", ".join(f"0x{b:02x}" for b in data[i:i + 16]) + ",\n")
o.write("};\n")
