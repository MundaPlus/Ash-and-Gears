"""Build one HTML page from docs/spec/*.md. Usage: build_spec_page.py <spec_dir> <out.html>"""
import re
import sys
from pathlib import Path

import markdown

spec_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
files = sorted(p for p in spec_dir.glob("[0-9][0-9]-*.md"))

sections, toc = [], []
for f in files:
    num = f.name[:2]
    sid = "s" + num
    md = f.read_text()
    title = re.search(r"^# (.+)$", md, re.M).group(1)
    title = re.sub(r"^\d+\s*—\s*", "", title)
    md = re.sub(r"^# .+\n", "", md, count=1, flags=re.M)
    html = markdown.markdown(md, extensions=["tables", "fenced_code"])
    # Shift headings down one level: h3->h4, h2->h3.
    html = re.sub(r"<(/?)h3>", r"<\1h4>", html)
    html = re.sub(r"<(/?)h2>", r"<\1h3>", html)
    # Give subsections ids for deep links.
    def sub_id(m, sid=sid, n=[0]):
        n[0] += 1
        return f'<h3 id="{sid}-{n[0]}">'
    html = re.sub(r"<h3>", sub_id, html)
    # Wrap tables so they scroll on phones.
    html = html.replace("<table>", '<div class="tbl"><table>').replace("</table>", "</table></div>")
    # Wrap the "Demo subset" part (always last) in a callout.
    m = re.search(r'<h3 id="[^"]+">Demo subset</h3>', html)
    if m:
        html = html[: m.start()] + '<aside class="demo"><span class="tag">In the first demo</span>' + html[m.end():] + "</aside>"
    sections.append(
        f'<section id="{sid}"><p class="chap">Chapter {num}</p><h2>{title}</h2>{html}</section>'
    )
    toc.append(f'<li><a href="#{sid}"><span class="n">{num}</span>{title}</a></li>')

page = f"""<title>Wasteland Colony Spec</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@700;800&family=Barlow:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
/* Layout: field-manual spec. Sticky chapter list on the left, one reading column on the right. */
:root {{
  --bg: #eceef0; --surface: #f8f9fa; --fg: #1d2125; --muted: #58616a; --line: #cdd3d8;
  --rust: #a8481a; --hazard: #b98a00; --hazard-bg: #f7efd2;
  --display: "Big Shoulders Stencil Display", Impact, "Arial Narrow", sans-serif;
  --body: "Barlow", "Segoe UI", system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #14171a; --surface: #1c2024; --fg: #e2e5e8; --muted: #9aa3ab; --line: #2e343a;
  --rust: #e27b44; --hazard: #e0b52a; --hazard-bg: #2a2512; color-scheme: dark; }} }}
:root[data-theme="dark"] {{
  --bg: #14171a; --surface: #1c2024; --fg: #e2e5e8; --muted: #9aa3ab; --line: #2e343a;
  --rust: #e27b44; --hazard: #e0b52a; --hazard-bg: #2a2512; color-scheme: dark; }}
html {{ scroll-behavior: smooth; }}
@media (prefers-reduced-motion: reduce) {{ html {{ scroll-behavior: auto; }} }}
body {{ background: var(--bg); color: var(--fg); font: 17px/1.6 var(--body); }}
.wrap {{ max-width: 1180px; margin: 0 auto; padding-inline: 20px; padding-block: 0 64px;
  display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 48px; }}
header.top {{ grid-column: 1 / -1; padding-block: 40px 28px; border-bottom: 2px solid var(--fg); }}
.status {{ font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted);
  display: flex; flex-wrap: wrap; gap: 8px 18px; }}
.status b {{ color: var(--hazard); }}
h1 {{ font: 800 clamp(44px, 8vw, 88px)/.92 var(--display); letter-spacing: .01em; margin: 14px 0 12px; text-wrap: balance; }}
.lede {{ max-width: 62ch; color: var(--muted); margin: 0; font-size: 18px; }}
.gates {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; padding: 0; list-style: none; }}
.gates li {{ font: 400 13px/1 var(--mono); border: 1px solid var(--line); background: var(--surface); padding: 8px 10px; }}
.gates li.now {{ border-color: var(--rust); color: var(--rust); font-weight: 600; }}
nav.toc {{ position: sticky; top: calc(env(safe-area-inset-top, 0px) + 20px); align-self: start; margin-top: 32px; }}
nav.toc p {{ font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 10px; }}
nav.toc ol {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }}
nav.toc a {{ display: flex; gap: 10px; padding: 6px 8px; color: var(--fg); text-decoration: none; font-weight: 600; font-size: 15px; border-left: 2px solid transparent; }}
nav.toc a:hover, nav.toc a:focus-visible {{ border-left-color: var(--rust); background: var(--surface); outline: none; }}
nav.toc .n {{ font: 400 13px/1.7 var(--mono); color: var(--muted); }}
main {{ min-width: 0; max-width: 760px; }}
section {{ padding-top: 40px; border-bottom: 1px solid var(--line); padding-bottom: 32px; scroll-margin-top: 12px; }}
.chap {{ font: 600 12px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--rust); margin: 0; }}
h2 {{ font: 700 clamp(34px, 5vw, 48px)/1 var(--display); margin: 8px 0 18px; text-wrap: balance; }}
h3 {{ font: 700 26px/1.1 var(--display); margin: 34px 0 10px; letter-spacing: .01em; scroll-margin-top: 12px; }}
h4 {{ font: 600 15px/1.3 var(--mono); text-transform: uppercase; letter-spacing: .05em; margin: 24px 0 6px; color: var(--muted); }}
p, li {{ max-width: 68ch; }}
ul, ol {{ padding-left: 1.3em; }}
li {{ margin: 3px 0; }}
li::marker {{ color: var(--rust); }}
strong {{ font-weight: 600; }}
code {{ font: 400 .86em var(--mono); background: var(--surface); border: 1px solid var(--line); padding: 1px 5px; }}
pre {{ background: var(--surface); border: 1px solid var(--line); padding: 14px; overflow-x: auto; line-height: 1.35; }}
pre code {{ border: 0; padding: 0; background: none; font-size: 13px; }}
.tbl {{ overflow-x: auto; margin: 14px 0; border: 1px solid var(--line); background: var(--surface); }}
table {{ border-collapse: collapse; width: 100%; font-size: 15px; font-variant-numeric: tabular-nums; }}
th, td {{ text-align: left; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid var(--line); }}
th {{ font: 600 12px/1.3 var(--mono); text-transform: uppercase; letter-spacing: .05em; color: var(--muted); white-space: nowrap; }}
tr:last-child td {{ border-bottom: 0; }}
aside.demo {{ margin-top: 30px; padding: 16px 18px 10px; background: var(--hazard-bg);
  border: 1px solid var(--hazard); background-image: repeating-linear-gradient(-45deg, var(--hazard) 0 10px, transparent 10px 20px);
  background-size: 100% 6px; background-repeat: no-repeat; background-color: var(--hazard-bg); padding-top: 22px; }}
aside.demo .tag {{ font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--hazard); }}
aside.demo p {{ margin: 8px 0; }}
footer {{ grid-column: 2; color: var(--muted); font-size: 14px; padding-top: 24px; }}
@media (max-width: 860px) {{
  .wrap {{ grid-template-columns: minmax(0, 1fr); gap: 0; padding-inline: 16px; }}
  nav.toc {{ position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; margin: 0 -16px; padding: 8px 16px;
    background: var(--bg); border-bottom: 1px solid var(--line); }}
  nav.toc p {{ display: none; }}
  nav.toc ol {{ display: flex; overflow-x: auto; gap: 4px; scrollbar-width: none; }}
  nav.toc a {{ white-space: nowrap; border: 1px solid var(--line); background: var(--surface); font-size: 14px; }}
  footer {{ grid-column: 1; }}
  section, h3 {{ scroll-margin-top: 60px; }}
  body {{ font-size: 16px; }}
}}
</style>
<div class="wrap">
  <header class="top">
    <div class="status"><span>Game spec</span><span>Code name: wasteland-colony</span><span><b>Draft v0.1</b></span><span>2026-10-09</span></div>
    <h1>Wasteland Colony</h1>
    <p class="lede">A post-apocalyptic colony sim with progressive automation. RimWorld-style survivors, Factorio-style machines, dark humor. For web and mobile. Title picked later.</p>
    <ol class="gates" aria-label="Decision gates">
      <li class="now">Gate 1 · Spec review (now)</li>
      <li>Gate 2 · Art style choice</li>
      <li>Gate 3 · Demo review</li>
    </ol>
  </header>
  <nav class="toc" aria-label="Chapters"><p>Chapters</p><ol>{''.join(toc)}</ol></nav>
  <main>{''.join(sections)}</main>
  <footer>Source: <code>docs/spec/</code> in the project folder. Chapters 01–09 end with a yellow box. It lists what the first playable demo contains.</footer>
</div>
"""
out.write_text(page)
print(out, len(page))
