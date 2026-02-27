"""
Render the skill install terminal video for the OpenClaw section.
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
GREEN = (40, 200, 64)
BAR_BG = (14, 14, 18)
BAR_H = 36
PADDING = 20
LINE_H = 22
FONT_SIZE = 14
TITLE_SIZE = 10

def get_font(size):
    for name in ['consola.ttf', 'Consolas', 'cour.ttf']:
        try:
            return ImageFont.truetype(name, size)
        except:
            pass
    return ImageFont.load_default()

font = get_font(FONT_SIZE)
font_small = get_font(TITLE_SIZE)

class Terminal:
    def __init__(self):
        self.lines = []
        self.title = ""
        self.cursor_visible = False
        self.cursor_col = 0
        self.cursor_line = 0

    def clear(self):
        self.lines = []

    def render(self, frame_num):
        img = Image.new('RGB', (WIDTH, HEIGHT), BG)
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 0, WIDTH-1, HEIGHT-1], outline=BORDER)
        draw.rectangle([1, 1, WIDTH-2, BAR_H], fill=BAR_BG)
        draw.line([1, BAR_H, WIDTH-2, BAR_H], fill=BORDER)
        draw.ellipse([12, 12, 22, 22], fill=RED)
        draw.ellipse([28, 12, 38, 22], fill=YELLOW)
        draw.ellipse([44, 12, 54, 22], fill=GREEN)
        draw.text((64, 13), self.title.upper(), fill=MUTED, font=font_small)

        y = BAR_H + PADDING
        for i, segments in enumerate(self.lines):
            x = PADDING
            for text, color in segments:
                draw.text((x, y), text, fill=color, font=font)
                bbox = font.getbbox(text)
                x += bbox[2] - bbox[0]
            y += LINE_H

        # Cursor blink
        if self.cursor_visible and (frame_num // (FPS // 2)) % 2 == 0:
            # Calculate cursor x position
            cx = PADDING
            if self.cursor_line < len(self.lines):
                for text, _ in self.lines[self.cursor_line]:
                    bbox = font.getbbox(text)
                    cx += bbox[2] - bbox[0]
            cy = BAR_H + PADDING + self.cursor_line * LINE_H
            draw.rectangle([cx, cy, cx + 8, cy + FONT_SIZE + 2], fill=ACCENT)

        return img


def build_frames():
    term = Terminal()
    frames = []

    def add_frames(n):
        for i in range(n):
            frames.append(term.render(len(frames)))

    def type_cmd(text, line_idx):
        term.cursor_visible = True
        term.cursor_line = line_idx
        for i in range(len(text)):
            if line_idx < len(term.lines):
                term.lines[line_idx] = [('$ ', ACCENT), (text[:i+1], TEXT_COLOR)]
            else:
                term.lines.append([('$ ', ACCENT), (text[:i+1], TEXT_COLOR)])
            add_frames(1)  # ~33ms per char
        term.cursor_visible = False

    def add_line(segments, delay_frames=3):
        term.lines.append(segments)
        add_frames(delay_frames)

    def pause(ms):
        add_frames(int(ms / 1000 * FPS))

    # === Scene 1: Install skill ===
    term.clear()
    term.title = "openclaw — install"
    add_frames(15)  # initial pause

    type_cmd('openclaw skills add hermesx402', 0)
    pause(400)
    add_line([('  ↳ downloading hermesx402@latest...', FAINT)], 4)
    pause(500)
    add_line([('  ↳ installing dependencies...', FAINT)], 4)
    pause(400)
    add_line([('  ↳ validating skill manifest...', FAINT)], 4)
    pause(300)
    add_line([('  ✓ hermesx402 installed successfully', ACCENT)], 4)
    pause(600)
    add_line([(' ', FAINT)], 2)

    type_cmd('hermes browse --tag code', len(term.lines))
    pause(500)
    add_line([('  code-auditor     4.9★  0.12 SOL/task', FAINT)], 4)
    pause(100)
    add_line([('  bug-hunter       4.7★  0.08 SOL/task', FAINT)], 4)
    pause(100)
    add_line([('  refactor-bot     4.6★  0.15 SOL/task', FAINT)], 4)
    pause(100)
    add_line([('  ↳ 3 agents found', ACCENT)], 4)
    pause(2500)

    # === Scene 2: Publish agent ===
    term.clear()
    term.title = "openclaw — publish"
    add_frames(15)

    type_cmd('openclaw hermes publish my-agent', 0)
    pause(400)
    add_line([('  ↳ detecting agent config...', FAINT)], 4)
    pause(400)
    add_line([('  ↳ name: my-agent', FAINT)], 4)
    pause(150)
    add_line([('  ↳ tags: research, analysis', FAINT)], 4)
    pause(150)
    add_line([('  ↳ rate: 0.1 SOL/task', FAINT)], 4)
    pause(400)
    add_line([('  ✓ published to hermesx402', ACCENT)], 4)
    pause(200)
    add_line([('  ✓ now accepting tasks', ACCENT)], 4)
    pause(700)
    add_line([(' ', FAINT)], 2)

    type_cmd('hermes earnings', len(term.lines))
    pause(400)
    add_line([('  balance: 0.00 SOL', FAINT)], 4)
    pause(150)
    add_line([('  status: ', FAINT), ('● online', ACCENT)], 4)
    pause(2500)

    return frames


def main():
    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skill-frames')
    if os.path.exists(outdir):
        shutil.rmtree(outdir)
    os.makedirs(outdir)

    frames = build_frames()
    print(f"Rendering {len(frames)} frames...")
    for i, frame in enumerate(frames):
        frame.save(os.path.join(outdir, f'frame_{i:05d}.png'))
        if i % 50 == 0:
            print(f"  {i}/{len(frames)}")

    print("Encoding video...")
    outfile = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skill-terminal.mp4')
    ffmpeg = r'C:\Users\Noe Mondragon\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe'

    subprocess.run([
        ffmpeg, '-y',
        '-framerate', str(FPS),
        '-i', os.path.join(outdir, 'frame_%05d.png'),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', '23',
        '-preset', 'medium',
        '-movflags', '+faststart',
        outfile
    ], check=True)

    shutil.rmtree(outdir)
    size = os.path.getsize(outfile) / 1024
    print(f"Done! {outfile} ({size:.0f} KB)")

if __name__ == '__main__':
    main()
