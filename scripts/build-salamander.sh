#!/usr/bin/env bash
# Builds the web sample set for the built-in grand piano from
# Salamander Grand Piano V3 (Alexander Holm, CC BY 3.0).
#
#   curl -L https://freepats.zenvoid.org/Piano/SalamanderGrandPiano/SalamanderGrandPianoV3+20161209_44khz16bit.tar.xz \
#     | tar -xJ --wildcards '*v3.wav' '*v7.wav' '*v11.wav' '*v15.wav'
#   scripts/build-salamander.sh SalamanderGrandPianoV3_44.1khz16bit/44.1khz16bit public/samples/salamander
#
# Keeps every sampled note (A0–C8 in minor thirds) at 4 of the 16 velocity
# layers, levels each sample's attack (first 150 ms) to the median of its
# layer so neighbouring notes match (the recordings vary by up to ~4 dB note to
# note, and the top octave is much quieter), caps each sample at 8 s with a
# 1.5 s fade, and encodes VBR MP3
# (the one compressed format every browser decodes). Files are named
# <midi>v<layer>.mp3, e.g. 60v11.mp3 is middle C, layer 11.
set -euo pipefail
src=${1:?source wav dir}
out=${2:?output dir}
mkdir -p "$out"
names=(C C# D D# E F F# G G# A A# B)
wav() { local midi=$1 v=$2; echo "$src/${names[$((midi % 12))]}$((midi / 12 - 1))v$v.wav"; }
attack_db() { ffmpeg -hide_banner -i "$1" -t 0.15 -af volumedetect -f null - 2>&1 | awk '/mean_volume/ { print $5 }'; }
peak_db() { ffmpeg -hide_banner -i "$1" -af volumedetect -f null - 2>&1 | awk '/max_volume/ { print $5 }'; }

# Pass 1: attack level of every file, and each layer's median.
declare -A level peak median
for v in 3 7 11 15; do
  for midi in $(seq 21 3 108); do
    level[$midi.$v]=$(attack_db "$(wav $midi $v)")
    peak[$midi.$v]=$(peak_db "$(wav $midi $v)")
  done
  median[$v]=$(for midi in $(seq 21 3 108); do echo "${level[$midi.$v]}"; done | sort -g | awk '{ a[NR] = $1 } END { print (NR % 2 ? a[(NR + 1) / 2] : (a[NR / 2] + a[NR / 2 + 1]) / 2) }')
done

# Pass 2: level (clamped to ±10 dB, never past -1 dBFS), trim, fade, encode.
for midi in $(seq 21 3 108); do
  for v in 3 7 11 15; do
    in=$(wav $midi $v)
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
    len=$(awk -v d="$dur" 'BEGIN { print (d > 8 ? 8 : d) }')
    fade=$(awk -v l="$len" 'BEGIN { print l - 1.5 }')
    gain=$(awk -v m="${median[$v]}" -v l="${level[$midi.$v]}" -v p="${peak[$midi.$v]}" \
      'BEGIN { g = m - l; g = g > 10 ? 10 : g < -10 ? -10 : g; if (p + g > -1) g = -1 - p; print g }')
    ffmpeg -hide_banner -loglevel error -y -i "$in" -t "$len" -af "volume=${gain}dB,afade=t=out:st=$fade:d=1.5" \
      -c:a libmp3lame -q:a 5 "$out/${midi}v$v.mp3"
  done
done
