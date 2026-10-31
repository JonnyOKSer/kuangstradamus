"""
Generate the demo voiceover, one clip per narration beat.

    python3 scripts/demo-voice.py --engine elevenlabs --voice-name "My Clone"   # or --voice-id
    python3 scripts/demo-voice.py --engine say                                   # macOS stand-in voice
    python3 scripts/demo-voice.py --list-voices                                  # find your clone's id

Clips are cached by a hash of (engine, voice, model, text), so editing one line
in demo-narration.json only regenerates that line. Writes
docs/demo/voice/manifest.json with each clip's duration, which demo-video.py
uses to pace the recording and place the audio.

ElevenLabs credentials: --api-key, or ELEVENLABS_API_KEY in the environment, or
a KEY=VALUE file at ~/.config/kuangstradamus/elevenlabs.env (also read for
ELEVENLABS_VOICE_ID). Nothing is written to the repo.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--narration", default=str(Path(__file__).with_name("demo-narration.json")))
ap.add_argument("--out", default="docs/demo/voice")
ap.add_argument("--engine", choices=["elevenlabs", "say"], default="elevenlabs")
ap.add_argument("--voice-id")
ap.add_argument("--voice-name", help="ElevenLabs voice name (case-insensitive) when you do not know the id")
ap.add_argument("--model", default="eleven_multilingual_v2")
ap.add_argument("--api-key")
ap.add_argument("--say-voice", default="Samantha")
ap.add_argument("--say-rate", type=int, default=178)
ap.add_argument("--list-voices", action="store_true")
ap.add_argument("--force", action="store_true", help="regenerate every clip")
args = ap.parse_args()

OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
FFMPEG = shutil.which("ffmpeg") or next(iter(sorted((Path.home() / "Library/Caches/ms-playwright").glob("ffmpeg-*/ffmpeg-*"))), None)
FFPROBE = shutil.which("ffprobe")


def load_env_file():
    p = Path.home() / ".config/kuangstradamus/elevenlabs.env"
    out = {}
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


ENV_FILE = load_env_file()
API_KEY = args.api_key or os.environ.get("ELEVENLABS_API_KEY") or os.environ.get("ELEVEN_API_KEY") or ENV_FILE.get("ELEVENLABS_API_KEY")
VOICE_ID = args.voice_id or os.environ.get("ELEVENLABS_VOICE_ID") or ENV_FILE.get("ELEVENLABS_VOICE_ID")


def eleven(path, method="GET", body=None, raw=False):
    if not API_KEY:
        sys.exit("No ElevenLabs API key. Pass --api-key, set ELEVENLABS_API_KEY, or create ~/.config/kuangstradamus/elevenlabs.env")
    req = urllib.request.Request(f"https://api.elevenlabs.io{path}", method=method, headers={"xi-api-key": API_KEY, "accept": "audio/mpeg" if raw else "application/json"})
    if body is not None:
        req.add_header("content-type", "application/json")
        req.data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
            return data if raw else json.loads(data)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        sys.exit(f"ElevenLabs {e.code} on {path}: {detail}")


def list_voices():
    voices = eleven("/v1/voices").get("voices", [])
    for v in voices:
        print(f"{v['voice_id']}  {v['name']:30s} {v.get('category', '')}")
    return voices


def resolve_voice():
    if VOICE_ID:
        return VOICE_ID
    if args.voice_name:
        for v in eleven("/v1/voices").get("voices", []):
            if v["name"].lower() == args.voice_name.lower():
                return v["voice_id"]
        sys.exit(f"No voice named {args.voice_name!r}. Run --list-voices.")
    # a single cloned voice is an unambiguous default
    cloned = [v for v in eleven("/v1/voices").get("voices", []) if v.get("category") == "cloned"]
    if len(cloned) == 1:
        print("Using your only cloned voice:", cloned[0]["name"])
        return cloned[0]["voice_id"]
    sys.exit("Pass --voice-id or --voice-name (run --list-voices to see them).")


def duration_of(path):
    r = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def synth_elevenlabs(voice_id, text, dest):
    audio = eleven(
        f"/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        method="POST",
        body={
            "text": text,
            "model_id": args.model,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "style": 0.15, "use_speaker_boost": True},
        },
        raw=True,
    )
    dest.write_bytes(audio)


def synth_say(text, dest):
    with tempfile.TemporaryDirectory() as td:
        aiff = Path(td) / "clip.aiff"
        subprocess.run(["say", "-v", args.say_voice, "-r", str(args.say_rate), "-o", str(aiff), text], check=True)
        subprocess.run([str(FFMPEG), "-y", "-loglevel", "error", "-i", str(aiff), "-ar", "44100", "-ac", "1", "-b:a", "128k", str(dest)], check=True)


def main():
    if args.list_voices:
        list_voices()
        return
    beats = json.load(open(args.narration))
    voice = resolve_voice() if args.engine == "elevenlabs" else f"say:{args.say_voice}:{args.say_rate}"
    manifest_path = OUT / "manifest.json"
    manifest = json.load(open(manifest_path)) if manifest_path.exists() else {}
    made = kept = 0
    for b in beats:
        text = b["speech"].strip()
        h = hashlib.sha1(f"{args.engine}|{voice}|{args.model}|{text}".encode()).hexdigest()[:10]
        dest = OUT / f"{b['id']}-{h}.mp3"
        if dest.exists() and not args.force:
            kept += 1
        else:
            for old in OUT.glob(f"{b['id']}-*.mp3"):
                old.unlink()
            print(f"synth {b['id']:10s} {len(text):4d} chars …", end=" ", flush=True)
            if args.engine == "elevenlabs":
                synth_elevenlabs(voice, text, dest)
            else:
                synth_say(text, dest)
            print(f"{duration_of(dest):.1f}s")
            made += 1
        manifest[b["id"]] = {"file": dest.name, "duration": round(duration_of(dest), 3), "text": text, "engine": args.engine, "voice": voice}
    json.dump(manifest, open(manifest_path, "w"), indent=2)
    total = sum(v["duration"] for v in manifest.values())
    print(f"{made} generated, {kept} cached · {len(manifest)} clips · {total:.0f}s of speech · manifest: {manifest_path}")


if __name__ == "__main__":
    main()
