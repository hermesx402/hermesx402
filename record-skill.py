"""
Record the OpenClaw skill install scene — real CLI output.
"""
import os, subprocess, shutil
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 640, 360
FPS = 30
BG = (8, 8, 10)
BORDER = (30, 30, 32)
TEXT_COLOR = (232, 232, 232)
MUTED = (136, 136, 136)
FAINT = (68, 68, 68)
ACCENT = (52, 211, 153)
RED = (255, 95, 87)
YELLOW = (255, 189, 46)
GREEN_ = (40, 200, 64)
BAR_BG = (14, 14, 18)
BAR_H = 36
PADDING = 20
LINE_H = 20
FONT_SIZE = 13

HERMES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts', 'hermes.js')

def get_font(size):
    for name in ['consola.ttf', 'Consolas', 'cour.ttf']:
        try: return ImageFont.truetype(name, size)
        except: pass
    return ImageFont.load_default()

font = get_font(FONT_SIZE)
font_small = get_font(10)

def run_cmd(args):
    result = subprocess.run(['node', HERMES] + args + ['--local'],
        capture_output=True, text=True, timeout=15)
    output = result.stdout.strip()
    return output.split('\n') if output else []

def colorize(line):
    s = line.strip()
    if s.startswith('✓') or s.startswith('●'): return ACCENT
    elif s.startswith('↳'): return FAINT
    elif '/5' in s and 'SOL' in s: return FAINT
    elif 'balance' in s or 'status' in s or 'pending' in s: return FAINT
    return MUTED

def render(title, lines, cursor_vis=False, cursor_line=0, cursor_text='', fnum=0):
    img = Image.new('RGB', (WIDTH, HEIGHT), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0,0,WIDTH-1,HEIGHT-1], outline=BORDER)
    d.rectangle([1,1,WIDTH-2,BAR_H], fill=BAR_BG)
    d.line([1,BAR_H,WIDTH-2,BAR_H], fill=BORDER)
    d.ellipse([12,12,22,22], fill=RED)
    d.ellipse([28,12,38,22], fill=YELLOW)
    d.ellipse([44,12,54,22], fill=GREEN_)
    d.text((64,13), title.upper(), fill=MUTED, font=font_small)
    y = BAR_H + PADDING
    for text, color in lines:
        d.text((PADDING, y), text, fill=color, font=font)
        y += LINE_H
    if cursor_vis and (fnum // (FPS//2)) % 2 == 0:
        cy = BAR_H + PADDING + cursor_line * LINE_H
        bbox = font.getbbox(cursor_text)
        cx = PADDING + (bbox[2]-bbox[0])
        d.rectangle([cx,cy,cx+7,cy+FONT_SIZE+1], fill=ACCENT)
    return img

def main():
    frames = []
    lines = []

    def add(n):
        for _ in range(n):
            frames.append(render(title, lines, fnum=len(frames)))

    def type_cmd(cmd, args):
        line_idx = len(lines)
        for i in range(len(cmd)):
            partial = '$ ' + cmd[:i+1]
            if line_idx < len(lines): lines[line_idx] = (partial, TEXT_COLOR)
            else: lines.append((partial, TEXT_COLOR))
            frames.append(render(title, lines, True, line_idx, partial, len(frames)))
        lines[line_idx] = ('$ ' + cmd, TEXT_COLOR)
        add(8)
        out = run_cmd(args)
        for ol in out:
            if ol.strip():
                lines.append((ol, colorize(ol)))
                add(4)

    # Scene 1: Install + first use
    title = 'openclaw — install'
    lines = []
    add(15)

    # Simulate install (can't run real openclaw skills add)
    line_idx = 0
    install_cmd = 'openclaw skills add hermesx402'
    for i in range(len(install_cmd)):
        partial = '$ ' + install_cmd[:i+1]
        lines = [(partial, TEXT_COLOR)] if line_idx == 0 else lines[:1]
        lines[0] = (partial, TEXT_COLOR)
        frames.append(render(title, lines, True, 0, partial, len(frames)))
    lines[0] = ('$ ' + install_cmd, TEXT_COLOR)
    add(8)
    
    # Simulated install output
    for msg, delay in [
        ('  ↳ downloading hermesx402@latest...', 12),
        ('  ↳ installing dependencies...', 10),
        ('  ↳ validating skill manifest...', 8),
        ('  ✓ hermesx402 installed successfully', 4),
    ]:
        lines.append((msg, ACCENT if '✓' in msg else FAINT))
        add(delay)

    add(int(0.6 * FPS))
    lines.append(('', FAINT))
    add(3)

    # Real browse command
    type_cmd('hermes browse --tag code', ['browse', '--tag', 'code'])
    add(int(1.5 * FPS))

    # Scene 2: Publish
    title = 'openclaw — publish'
    lines = []
    add(15)

    # Simulate publish
    pub_cmd = 'openclaw hermes publish my-agent'
    for i in range(len(pub_cmd)):
        partial = '$ ' + pub_cmd[:i+1]
        if len(lines) == 0: lines.append((partial, TEXT_COLOR))
        else: lines[0] = (partial, TEXT_COLOR)
        frames.append(render(title, lines, True, 0, partial, len(frames)))
    lines[0] = ('$ ' + pub_cmd, TEXT_COLOR)
    add(8)
    
    for msg, delay in [
        ('  ↳ detecting agent config...', 10),
        ('  ↳ name: my-agent', 5),
        ('  ↳ tags: research, analysis', 5),
        ('  ↳ rate: 0.1 SOL/task', 5),
        ('  ✓ published to hermesx402', 10),
        ('  ✓ now accepting tasks', 4),
    ]:
        lines.append((msg, ACCENT if '✓' in msg else FAINT))
        add(delay)

    add(int(0.5 * FPS))
    lines.append(('', FAINT))
    add(3)

    # Real earnings command
    type_cmd('hermes earnings', ['earnings'])
    add(int(2.5 * FPS))

    # Save
    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skill-rec-frames')
    if os.path.exists(outdir): shutil.rmtree(outdir)
    os.makedirs(outdir)

    print(f"Saving {len(frames)} frames...")
    for i, f in enumerate(frames):
        f.save(os.path.join(outdir, f'frame_{i:05d}.png'))
        if i % 100 == 0: print(f"  {i}/{len(frames)}")

    outfile = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skill-terminal.mp4')
    ffmpeg = r'C:\Users\Noe Mondragon\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe'

    print("Encoding...")
    subprocess.run([ffmpeg, '-y', '-framerate', str(FPS),
        '-i', os.path.join(outdir, 'frame_%05d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23',
        '-preset', 'medium', '-movflags', '+faststart', outfile], check=True)

    shutil.rmtree(outdir)
    print(f"Done! {outfile} ({os.path.getsize(outfile)/1024:.0f} KB)")

if __name__ == '__main__':
    main()
