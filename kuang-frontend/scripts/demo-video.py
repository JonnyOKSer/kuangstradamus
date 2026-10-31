"""
Record a narrated product demo of Kuangstradamus with Playwright.

    python3 scripts/demo-video.py [--base http://127.0.0.1:3000] [--league ID] [--team "Team name"] [--out docs/demo]

Runs against a local static export (served on :3000) and a local backend with
the access gate off, so the recording never needs an access code. Injects a
visible cursor and a caption bar into every page, drives the real UI with
human pacing, and writes a .webm (plus .mp4 when an H.264 encoder exists).
"""
import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://127.0.0.1:3000")
ap.add_argument("--league", default="1389709416873353216")
ap.add_argument("--team", default="Rebuild Year 3?")
ap.add_argument("--out", default="docs/demo")
ap.add_argument("--api", default="http://127.0.0.1:3100", help="backend used to look up a roster name when a trade target has no offer")
ap.add_argument("--mobile", action="store_true", help="record the phone cut instead of desktop")
args = ap.parse_args()

OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
B = args.base.rstrip("/")
L = args.league
TRADE = "Christian McCaffrey for Bijan Robinson and Jake Ferguson"

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
  window.__title = (on) => {
    let t = document.getElementById('kd-title');
    if (on) {
      if (!t) { t = document.createElement('div'); t.id = 'kd-title';
        t.innerHTML = '<div class="seal">谕</div><h1>Kuangstradamus</h1><p>The oracle of fantasy football · a trade verdict and your week, read first</p><div class="cn">诺查丹玛斯 · 梦幻橄榄球神谕</div>';
        document.body.appendChild(t); }
      t.classList.remove('off');
    } else if (t) { t.classList.add('off'); setTimeout(() => t.remove(), 700); }
  };
})();
"""


def roster_name(league_id, roster_id, index=3):
    """A mid-value player from the team, for when a trade target comes with no offer idea."""
    import json
    import urllib.request
    try:
        with urllib.request.urlopen(f"{args.api}/api/league/{league_id}/team/{roster_id}", timeout=60) as r:
            roster = json.load(r).get("roster", [])
        if roster:
            return roster[min(index, len(roster) - 1)]["name"]
    except Exception as e:
        print("roster lookup failed:", e)
    return None


def wait_verdict(pg, label):
    """A verdict seal, or the oracle's error note — whichever comes first."""
    pg.wait_for_selector(".stamp, [class*='border-neon/60']", timeout=90000)
    if pg.locator(".stamp").count() == 0:
        print(f"[{label}] oracle returned an error instead of a verdict:", pg.locator("[class*='border-neon/60']").first.inner_text()[:200])


def main():
    mobile = args.mobile
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx_kw = dict(record_video_dir=str(OUT / "_raw"), color_scheme="dark")
        if mobile:
            dev = p.devices["iPhone 13"]
            ctx_kw.update(dev)
            # record at the device's viewport, not its screen, or the frame gets padded
            ctx_kw["record_video_size"] = dict(dev["viewport"])
        else:
            ctx_kw.update(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            ctx_kw["record_video_size"] = {"width": 1440, "height": 900}
        ctx = browser.new_context(**ctx_kw)
        ctx.add_init_script(OVERLAY)
        if mobile:
            ctx.add_init_script("""document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style');
              s.textContent = '#kd-cap{font-size:14.5px;line-height:1.3;padding:8px 12px;bottom:14px;max-width:88vw;border-radius:10px}#kd-title h1{font-size:38px}#kd-title p{font-size:14px;padding:0 24px;text-align:center}#kd-title .seal{width:56px;height:56px;font-size:30px}';
              document.head.appendChild(s); });""")
        pg = ctx.new_page()
        try:
            run_scenes(pg, mobile)
        except Exception as e:  # keep the partial video and a still for debugging
            print("DEMO FAILED:", type(e).__name__, str(e).split("\n")[0])
            print("url at failure:", pg.url)
            pg.screenshot(path=str(OUT / "_fail.png"))
            ctx.close(); browser.close()
            sys.exit(1)
        ctx.close()
        raw = pg.video.path()
        browser.close()
    finish(raw, mobile)


def run_scenes(pg, mobile):
    if True:

        def cap(text, han=None, hold=0):
            pg.evaluate("([t, h]) => window.__cap(t, h)", [text, han])
            if hold:
                pg.wait_for_timeout(hold)

        def move_to(locator, steps=28):
            box = locator.bounding_box()
            if not box:
                return
            pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + min(box["height"] / 2, 22), steps=steps)

        def click(locator, settle=600):
            locator.scroll_into_view_if_needed()
            pg.wait_for_timeout(250)
            move_to(locator)
            pg.wait_for_timeout(180)
            locator.click()
            pg.wait_for_timeout(settle)

        def scroll(to, duration=900):
            pg.evaluate("y => window.scrollTo({ top: y, behavior: 'smooth' })", to)
            pg.wait_for_timeout(duration)

        def pause(ms):
            pg.wait_for_timeout(ms)

        # ---- Scene 1: title + the Oracle
        pg.goto(f"{B}/", wait_until="networkidle")
        pg.evaluate("window.__title(true)")
        pg.mouse.move(720 if not mobile else 195, 500)
        pause(2600)
        pg.evaluate("window.__title(false)")
        pause(900)
        cap("Ask the Oracle about any trade.", "问", 1200)
        ta = pg.locator("textarea")
        click(ta, 200)
        ta.press_sequentially(TRADE, delay=38)
        pause(700)
        cap("Players resolve on the free Sleeper feed. No paid data anywhere.", "卜", 900)
        click(pg.locator("button[type=submit]"), 300)
        wait_verdict(pg, "scene 1")
        pause(900)
        cap("Value above a free replacement, not raw points. The seal is the verdict.", "勝", 2800)
        click(pg.get_by_role("button", name="Open the slip"), 500)
        cap("Open the slip for each player: rest-of-season points, rank, bye, flags.", "签", 2600)
        scroll(420 if not mobile else 900, 900)
        pause(1200)

        # ---- Scene 2: the Almanac
        cap("The Almanac imports any Sleeper league.", "盟", 800)
        nav = pg.get_by_role("link", name="Almanac").locator("visible=true").first
        click(nav, 900)
        field = pg.locator("input[placeholder*='Sleeper']")
        click(field, 200)
        field.press_sequentially(L, delay=22)
        pause(400)
        click(pg.locator("form button[type=submit]").first, 500)
        pg.wait_for_selector("text=League pulse", timeout=60000)
        pause(600)
        cap("Standings with playoff odds and luck. One hue per direction, nothing to decode.", "名", 2600)
        scroll(520 if not mobile else 900, 1000)
        pause(1400)
        cap("Positional strength as a heat grid: jade above the league, violet below.", "势", 800)
        scroll(1150 if not mobile else 2300, 1100)
        cells = pg.locator("span[title*='vs league average']")
        if cells.count() > 8:
            for i in (1, 2, 3, 9, 10):
                move_to(cells.nth(i), steps=14)
                pause(230)
        pause(1200)
        cap("Mark your team once…", "我", 700)
        scroll(300 if not mobile else 700, 800)
        row = pg.locator("li", has_text=args.team).first
        mine = row.get_by_role("button", name="mine")
        click(mine, 400)

        # ---- Scene 3: the day page
        pg.wait_for_selector("text=Today's reading", timeout=60000)
        pause(700)
        cap("…and your day page opens on what matters this week.", "日", 2600)
        scroll(0, 500)
        cap("Six lines of strength, eighteen weeks of byes, deadline and playoffs.", "爻", 800)
        ribbon = pg.locator("[role=list][aria-label='Season weeks'] [role=listitem]")
        if ribbon.count() >= 10:
            click(ribbon.nth(9), 1800)
            click(ribbon.nth(9), 300)
        cap("Three readings: lineup, waivers, the next date that matters.", "签", 800)
        first = pg.locator("button:has(span.han:text('签'))").first
        move_to(first, steps=20)
        pause(2200)
        cap("Slips open one at a time for a single answer.", "补", 500)
        click(pg.locator("button[aria-controls='slip-waivers']"), 1000)
        scroll(pg.evaluate("document.querySelector('#slip-waivers').getBoundingClientRect().top + window.scrollY - 120"), 900)
        pause(1800)
        cap("Every player opens a sheet: value, this week's gates, FAAB from your league's own bids.", "人", 600)
        chip = pg.locator("#slip-waivers button").filter(has_text="·").first
        click(chip, 1200)
        pause(2600)
        sheet = pg.get_by_role("dialog")
        sheet_scroll = sheet.locator("div.overflow-y-auto, [class*='overflow-y-auto']").first
        try:
            sheet_scroll.evaluate("el => el.scrollTo({ top: 420, behavior: 'smooth' })")
        except Exception:
            pass
        pause(1600)
        click(sheet.get_by_role("button", name="Close").last, 700)
        cap("Trade targets come with a partner and an offer, and hand the Oracle the question.", "易", 600)
        click(pg.locator("button[aria-controls='slip-trades']"), 1000)
        scroll(pg.evaluate("document.querySelector('#slip-trades').getBoundingClientRect().top + window.scrollY - 120"), 900)
        pause(2000)
        import re as _re
        rid = (_re.search(r"[?&]t=(\d+)", pg.url) or [None, None])[1]
        with_offer = pg.locator("#slip-trades li", has_text="offer:")
        card = with_offer.first if with_offer.count() else pg.locator("#slip-trades li").first
        ask = card.locator("a", has_text="Ask the Oracle")
        click(ask, 1500)

        # ---- Scene 4: back in the Oracle, league-scored
        if "give=" not in pg.url:
            give = roster_name(L, rid) or "Rashee Rice"
            cap(f"No offer was suggested here, so we name one: {give}.", "易", 900)
            ta2 = pg.locator("textarea")
            click(ta2, 200)
            ta2.press("Home")
            ta2.press_sequentially(f"{give} ", delay=40)
            pause(500)
            click(pg.locator("button[type=submit]"), 300)
        wait_verdict(pg, "scene 4")
        pause(700)
        cap("Scored in your league's own rules this time, prefilled from the Almanac.", "規", 3000)

        # ---- Scene 5: season ledger
        cap("The season ledger: odds, luck, lineup efficiency and the schedule ahead.", "籍", 600)
        pg.goto(f"{B}/league.html?l={L}&view=season", wait_until="networkidle")
        pg.wait_for_selector("text=Playoff odds", timeout=60000)
        pause(1200)
        scroll(560 if not mobile else 900, 1200)
        pause(1500)
        scroll(1150 if not mobile else 1900, 1200)
        pause(1500)

        # ---- End card
        pg.evaluate("""() => { const t = document.createElement('div'); t.id='kd-title';
          t.innerHTML = '<div class="seal">签</div><h1>Kuangstradamus</h1><p>kuangstradamus.xyz · free Sleeper data · your week, read first</p><div class="cn">神谕读的是概率，不是定数</div>';
          document.body.appendChild(t); }""")
        pause(2800)


def finish(raw, mobile):
    stem = "kuangstradamus-demo-mobile" if mobile else "kuangstradamus-demo"
    webm = OUT / f"{stem}.webm"
    shutil.move(raw, webm)
    shutil.rmtree(OUT / "_raw", ignore_errors=True)
    print("webm:", webm, f"({webm.stat().st_size // 1024} KB)")

    ff = shutil.which("ffmpeg") or next(iter(sorted((Path.home() / "Library/Caches/ms-playwright").glob("ffmpeg-*/ffmpeg-*"))), None)
    if ff:
        mp4 = OUT / f"{stem}.mp4"
        r = subprocess.run([str(ff), "-y", "-loglevel", "error", "-i", str(webm), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", str(mp4)])
        if r.returncode == 0 and mp4.exists():
            print("mp4: ", mp4, f"({mp4.stat().st_size // 1024} KB)")
        else:
            print("mp4 conversion unavailable (no H.264 encoder in this ffmpeg); the .webm plays in Chrome, Slack and Discord.")


if __name__ == "__main__":
    main()
