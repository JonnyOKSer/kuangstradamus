"""
Record a narrated product demo of Kuangstradamus with Playwright.

    python3 scripts/demo-video.py [--mobile] [--base http://127.0.0.1:3000] [--league ID] [--team "Team name"] [--out docs/demo]

Runs against a local static export (served on :3000) and a local backend with
the access gate off, so the recording never needs an access code. Injects a
visible cursor and a caption bar into every page and drives the real UI with
human pacing.

Narration comes from demo-narration.json. If demo-voice.py has produced
docs/demo/voice/manifest.json, every scene is paced to its spoken line and the
clips are mixed into <stem>-voiced.mp4 at the moments they were cued; without
it, the captions hold for a reading-time estimate and the video stays silent.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://127.0.0.1:3001")
ap.add_argument("--api", default="http://127.0.0.1:3100", help="backend, used to pick a roster name when a trade target has no offer")
ap.add_argument("--league", default="1389709416873353216")
ap.add_argument("--team", default="Rebuild Year 3?")
ap.add_argument("--out", default="docs/demo")
ap.add_argument("--narration", default=str(Path(__file__).with_name("demo-narration.json")))
ap.add_argument("--voice-dir", help="defaults to <out>/voice")
ap.add_argument("--no-audio", action="store_true", help="ignore any generated voice clips")
ap.add_argument("--audio-offset", type=float, default=0.0, help="seconds to shift all narration (positive = later)")
ap.add_argument("--mobile", action="store_true", help="record the phone cut instead of desktop")
args = ap.parse_args()

OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
B = args.base.rstrip("/")
L = args.league
TRADE = "Christian McCaffrey for Bijan Robinson and Jake Ferguson"
BEATS = {b["id"]: b for b in json.load(open(args.narration))}
VOICE_DIR = Path(args.voice_dir) if args.voice_dir else OUT / "voice"
MANIFEST = {}
if not args.no_audio and (VOICE_DIR / "manifest.json").exists():
    MANIFEST = json.load(open(VOICE_DIR / "manifest.json"))
FFMPEG = shutil.which("ffmpeg") or next(iter(sorted((Path.home() / "Library/Caches/ms-playwright").glob("ffmpeg-*/ffmpeg-*"))), None)
FFPROBE = shutil.which("ffprobe")

# Cursor + caption overlay, installed on every document before any script runs.
OVERLAY = r"""
(() => {
  if (window.__kuangDemo) return;
  window.__kuangDemo = true;
  const css = `
    #kd-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;
      transform:translate(-3px,-2px);transition:transform .08s ease;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}
    #kd-cursor.down{transform:translate(-3px,-2px) scale(.85)}
    #kd-ring{position:fixed;width:40px;height:40px;border-radius:50%;border:2px solid #ff4d3d;z-index:2147483646;
      pointer-events:none;opacity:0;transform:translate(-50%,-50%) scale(.4)}
    #kd-ring.pulse{animation:kdpulse .55s ease-out}
    @keyframes kdpulse{0%{opacity:.9;transform:translate(-50%,-50%) scale(.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.3)}}
    #kd-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(8px);z-index:2147483645;
      max-width:min(760px,86vw);padding:12px 20px;border-radius:12px;background:rgba(10,10,12,.86);
      border:1px solid rgba(255,77,61,.45);box-shadow:0 0 28px rgba(255,77,61,.22);backdrop-filter:blur(8px);
      color:#f4f4f6;font:400 21px/1.35 "Instrument Serif",Georgia,serif;text-align:center;opacity:0;
      transition:opacity .35s ease,transform .35s ease;pointer-events:none;letter-spacing:.005em}
    #kd-cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
    #kd-cap .han{font-family:"Noto Serif SC","Songti SC",serif;color:#ff4d3d;margin-right:10px}
    #kd-title{position:fixed;inset:0;z-index:2147483644;background:#0a0a0c;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:14px;color:#f4f4f6;opacity:1;transition:opacity .6s ease;pointer-events:none}
    #kd-title.off{opacity:0}
    #kd-title .seal{width:72px;height:72px;border:2px solid #ff4d3d;border-radius:8px;color:#ff4d3d;display:flex;
      align-items:center;justify-content:center;font:400 40px "Noto Serif SC","Songti SC",serif;box-shadow:0 0 28px rgba(255,77,61,.45)}
    #kd-title h1{margin:0;font:400 56px/1.05 "Instrument Serif",Georgia,serif;letter-spacing:-.01em}
    #kd-title p{margin:0;font:400 18px/1.4 Inter,system-ui,sans-serif;color:#a0a0ac}
    #kd-title .cn{font:400 13px "Noto Serif SC","Songti SC",serif;letter-spacing:.3em;color:#ff4d3d}
  `;
  const st = document.createElement('style'); st.textContent = css;
  const mount = () => {
    (document.head || document.documentElement).appendChild(st);
    const cur = document.createElement('div'); cur.id = 'kd-cursor';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l16 9-7 1.5L9 20z" fill="#f4f4f6" stroke="#0a0a0c" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const ring = document.createElement('div'); ring.id = 'kd-ring';
    const cap = document.createElement('div'); cap.id = 'kd-cap';
    document.body.append(cur, ring, cap);
    window.addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; }, true);
    window.addEventListener('mousedown', () => { cur.classList.add('down'); ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse'); }, true);
    window.addEventListener('mouseup', () => cur.classList.remove('down'), true);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  window.__cap = (text, han) => {
    const cap = document.getElementById('kd-cap'); if (!cap) return;
    cap.classList.remove('on');
    setTimeout(() => { cap.innerHTML = (han ? `<span class="han">${han}</span>` : '') + text; cap.classList.add('on'); }, text ? 220 : 0);
  };
  window.__title = (on, seal, sub, cn) => {
    let t = document.getElementById('kd-title');
    if (on) {
      if (!t) { t = document.createElement('div'); t.id = 'kd-title';
        t.innerHTML = `<div class="seal">${seal || '谕'}</div><h1>Kuangstradamus</h1><p>${sub || 'The oracle of fantasy football · a trade verdict and your week, read first'}</p><div class="cn">${cn || '诺查丹玛斯 · 梦幻橄榄球神谕'}</div>`;
        document.body.appendChild(t); }
      t.classList.remove('off');
    } else if (t) { t.classList.add('off'); setTimeout(() => t.remove(), 700); }
  };
})();
"""

MOBILE_CSS = """document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style');
  s.textContent = '#kd-cap{font-size:14.5px;line-height:1.3;padding:8px 12px;bottom:14px;max-width:88vw;border-radius:10px}#kd-title h1{font-size:38px}#kd-title p{font-size:14px;padding:0 24px;text-align:center}#kd-title .seal{width:56px;height:56px;font-size:30px}';
  document.head.appendChild(s); });"""


def roster_name(league_id, roster_id, index=3):
    """A mid-value player from the team, for when a trade target comes with no offer idea."""
    try:
        with urllib.request.urlopen(f"{args.api}/api/league/{league_id}/team/{roster_id}", timeout=60) as r:
            roster = json.load(r).get("roster", [])
        if roster:
            return roster[min(index, len(roster) - 1)]["name"]
    except Exception as e:
        print("roster lookup failed:", e)
    return None


def wait_verdict(pg, label):
    """A verdict seal, or the oracle's error note, whichever comes first."""
    pg.wait_for_selector(".stamp, [class*='border-neon/60']", timeout=90000)
    if pg.locator(".stamp").count() == 0:
        print(f"[{label}] oracle returned an error instead of a verdict:", pg.locator("[class*='border-neon/60']").first.inner_text()[:200])


class Demo:
    """Pacing, cursor and narration cues for one recording."""

    def __init__(self, pg, mobile):
        self.pg = pg
        self.mobile = mobile
        self.cues = []
        self.t0 = time.monotonic()
        self.audio_end = 0.0

    def now(self):
        return time.monotonic() - self.t0

    def wait_until(self, t):
        d = t - self.now()
        if d > 0:
            self.pg.wait_for_timeout(int(d * 1000))

    def pause(self, ms):
        self.pg.wait_for_timeout(ms)

    def clip_length(self, bid):
        m = MANIFEST.get(bid)
        if m:
            return m["duration"]
        return max(2.2, len(BEATS[bid]["speech"]) / 15.5)  # reading-time estimate when silent

    def beat(self, bid, block=True, extra=0.35, gap=0.4):
        """Show the caption and start the spoken line. Never overlaps the previous line."""
        b = BEATS[bid]
        self.wait_until(self.audio_end + gap)
        self.pg.evaluate("([t, h]) => window.__cap(t, h)", [b["caption"], b.get("han")])
        t = self.now()
        dur = self.clip_length(bid)
        self.cues.append({"id": bid, "at": round(t, 3), "duration": round(dur, 3)})
        self.audio_end = t + dur
        if block:
            self.wait_until(self.audio_end + extra)

    def wait_audio(self, extra=0.35):
        self.wait_until(self.audio_end + extra)

    def move_to(self, locator, steps=28):
        box = locator.bounding_box()
        if not box:
            return
        self.pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + min(box["height"] / 2, 22), steps=steps)

    def click(self, locator, settle=600):
        locator.scroll_into_view_if_needed()
        self.pause(250)
        self.move_to(locator)
        self.pause(180)
        locator.click()
        self.pause(settle)

    def scroll(self, to, duration=900):
        self.pg.evaluate("y => window.scrollTo({ top: y, behavior: 'smooth' })", to)
        self.pause(duration)

    def scroll_to(self, selector, offset=120, duration=900):
        y = self.pg.evaluate("([s, o]) => document.querySelector(s).getBoundingClientRect().top + window.scrollY - o", [selector, offset])
        self.scroll(y, duration)


def run_scenes(d):
    pg, mobile = d.pg, d.mobile

    # ---- Scene 1: title + the Oracle
    pg.goto(f"{B}/", wait_until="networkidle")
    pg.evaluate("window.__title(true)")
    pg.mouse.move(195 if mobile else 720, 500)
    d.pause(500)
    d.beat("title")
    d.pause(300)
    pg.evaluate("window.__title(false)")
    d.pause(800)

    d.beat("ask", block=False)
    ta = pg.locator("textarea")
    d.click(ta, 200)
    ta.press_sequentially(TRADE, delay=38)
    d.wait_audio()

    d.beat("feed", block=False)
    d.pause(700)
    d.click(pg.locator("button[type=submit]"), 300)
    wait_verdict(pg, "scene 1")
    d.wait_audio()
    d.pause(300)
    d.beat("verdict")

    d.click(pg.get_by_role("button", name="Open the slip"), 500)
    d.beat("slip", block=False)
    d.scroll(900 if mobile else 420, 900)
    d.wait_audio()
    d.pause(400)

    # ---- Scene 2: the Almanac
    d.beat("almanac", block=False)
    d.click(pg.get_by_role("link", name="Almanac").locator("visible=true").first, 900)
    field = pg.locator("input[placeholder*='Sleeper']")
    d.click(field, 200)
    field.press_sequentially(L, delay=22)
    d.pause(300)
    d.click(pg.locator("form button[type=submit]").first, 500)
    pg.wait_for_selector("text=League pulse", timeout=60000)
    d.wait_audio()
    d.pause(400)

    d.beat("standings", block=False)
    d.scroll(900 if mobile else 520, 1000)
    d.wait_audio()
    d.pause(300)

    d.beat("strength", block=False)
    d.scroll(2300 if mobile else 1150, 1100)
    cells = pg.locator("span[title*='vs league average']")
    if cells.count() > 10:
        for i in (1, 2, 3, 9, 10):
            d.move_to(cells.nth(i), steps=14)
            d.pause(230)
    d.wait_audio()
    d.pause(400)

    d.beat("mark", block=False)
    d.scroll(700 if mobile else 300, 800)
    row = pg.locator("li", has_text=args.team).first
    d.click(row.get_by_role("button", name="mine"), 400)

    # ---- Scene 3: the day page
    pg.wait_for_selector("text=Today's reading", timeout=60000)
    d.wait_audio()
    d.pause(300)
    d.beat("daypage", block=False)
    d.scroll(0, 500)
    d.pause(1400)
    ribbon = pg.locator("[role=list][aria-label='Season weeks'] [role=listitem]")
    if ribbon.count() >= 10:
        d.click(ribbon.nth(9), 400)
    d.wait_audio()
    d.pause(300)
    if ribbon.count() >= 10:
        d.click(ribbon.nth(9), 300)

    d.beat("readings", block=False)
    first = pg.locator("button:has(span.han:text('签'))").first
    d.move_to(first, steps=20)
    d.wait_audio()
    d.pause(300)

    d.beat("slips", block=False)
    d.click(pg.locator("button[aria-controls='slip-waivers']"), 900)
    d.scroll_to("#slip-waivers", 120, 900)
    d.wait_audio()
    d.pause(500)

    d.beat("sheet", block=False)
    chip = pg.locator("#slip-waivers button").filter(has_text="·").first
    d.click(chip, 1200)
    sheet = pg.get_by_role("dialog")
    try:
        sheet.locator("[class*='overflow-y-auto']").first.evaluate("el => el.scrollTo({ top: 420, behavior: 'smooth' })")
    except Exception:
        pass
    d.wait_audio()
    d.pause(500)
    d.click(sheet.get_by_role("button", name="Close").last, 700)

    d.beat("trades", block=False)
    d.click(pg.locator("button[aria-controls='slip-trades']"), 900)
    d.scroll_to("#slip-trades", 120, 900)
    rid = (re.search(r"[?&]t=(\d+)", pg.url) or [None, None])[1]
    with_offer = pg.locator("#slip-trades li", has_text="offer:")
    card = with_offer.first if with_offer.count() else pg.locator("#slip-trades li").first
    d.wait_audio()
    d.pause(300)
    d.click(card.locator("a", has_text="Ask the Oracle"), 1500)

    # ---- Scene 4: back in the Oracle, league-scored
    if "give=" not in pg.url:
        give = roster_name(L, rid) or "Rashee Rice"
        d.beat("offer", block=False)
        ta2 = pg.locator("textarea")
        d.click(ta2, 200)
        ta2.press("Home")
        ta2.press_sequentially(f"{give} ", delay=40)
        d.pause(400)
        d.click(pg.locator("button[type=submit]"), 300)
    wait_verdict(pg, "scene 4")
    d.wait_audio()
    d.pause(300)
    d.beat("scored")

    # ---- Scene 5: season ledger
    d.beat("season", block=False)
    pg.goto(f"{B}/league.html?l={L}&view=season", wait_until="networkidle")
    pg.wait_for_selector("text=Playoff odds", timeout=60000)
    d.pause(900)
    d.scroll(900 if mobile else 560, 1200)
    d.pause(1200)
    d.scroll(1900 if mobile else 1150, 1200)
    d.wait_audio()
    d.pause(400)

    # ---- End card
    pg.evaluate("window.__title(true, '签', 'kuangstradamus.xyz · free Sleeper data · your week, read first', '神谕读的是概率，不是定数')")
    d.beat("end")
    d.pause(900)


def mux(silent_mp4, cues, lead, stem):
    """Place every narration clip at its cue time over the silent video."""
    clips = [(c, VOICE_DIR / MANIFEST[c["id"]]["file"]) for c in cues if c["id"] in MANIFEST]
    if not clips:
        return None
    cmd = [str(FFMPEG), "-y", "-loglevel", "error", "-i", str(silent_mp4)]
    parts = []
    for i, (c, path) in enumerate(clips):
        cmd += ["-i", str(path)]
        delay_ms = max(0, int(round((c["at"] + lead + args.audio_offset) * 1000)))
        parts.append(f"[{i + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay={delay_ms}:all=1[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(clips))) + f"amix=inputs={len(clips)}:normalize=0:duration=longest[a]"
    out = OUT / f"{stem}-voiced.mp4"
    cmd += ["-filter_complex", ";".join(parts + [mix]), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("mux failed:", r.stderr[:500])
        return None
    return out


def finish(raw, mobile, cues, t_close):
    stem = "kuangstradamus-demo-mobile" if mobile else "kuangstradamus-demo"
    webm = OUT / f"{stem}.webm"
    shutil.move(raw, webm)
    shutil.rmtree(OUT / "_raw", ignore_errors=True)
    json.dump({"cues": cues, "t_close": round(t_close, 3)}, open(OUT / f"{stem}-cues.json", "w"), indent=2)
    print("webm:", webm, f"({webm.stat().st_size // 1024} KB)")
    if not FFMPEG:
        print("no ffmpeg found; stopping at the .webm")
        return
    mp4 = OUT / f"{stem}.mp4"
    r = subprocess.run([str(FFMPEG), "-y", "-loglevel", "error", "-i", str(webm), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", str(mp4)])
    if r.returncode != 0 or not mp4.exists():
        print("mp4 conversion unavailable (no H.264 encoder); the .webm plays in Chrome, Slack and Discord.")
        return
    print("mp4: ", mp4, f"({mp4.stat().st_size // 1024} KB)")
    if MANIFEST and FFPROBE:
        vid = float(subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp4)], capture_output=True, text=True).stdout.strip() or 0)
        lead = max(0.0, vid - t_close)  # the recording starts a little before the clock did
        voiced = mux(mp4, cues, lead, stem)
        if voiced:
            print("voiced:", voiced, f"({voiced.stat().st_size // 1024} KB) · {len(cues)} cues · lead {lead:.2f}s · video {vid:.1f}s")
    elif not MANIFEST:
        print("no voice manifest: run scripts/demo-voice.py first for a narrated cut")


def main():
    mobile = args.mobile
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx_kw = dict(record_video_dir=str(OUT / "_raw"), color_scheme="dark")
        if mobile:
            dev = p.devices["iPhone 13"]
            ctx_kw.update(dev)
            ctx_kw["record_video_size"] = dict(dev["viewport"])  # the device viewport, not its screen
        else:
            ctx_kw.update(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            ctx_kw["record_video_size"] = {"width": 1440, "height": 900}
        ctx = browser.new_context(**ctx_kw)
        ctx.add_init_script(OVERLAY)
        if mobile:
            ctx.add_init_script(MOBILE_CSS)
        pg = ctx.new_page()
        d = Demo(pg, mobile)
        try:
            run_scenes(d)
        except Exception as e:  # keep the partial video and a still for debugging
            print("DEMO FAILED:", type(e).__name__, str(e).split("\n")[0])
            print("url at failure:", pg.url)
            pg.screenshot(path=str(OUT / "_fail.png"))
            ctx.close()
            browser.close()
            sys.exit(1)
        t_close = d.now()
        ctx.close()
        raw = pg.video.path()
        browser.close()
    finish(raw, mobile, d.cues, t_close)


if __name__ == "__main__":
    main()
