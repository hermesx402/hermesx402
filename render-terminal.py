"""
Render a terminal session as an MP4 video.
Uses Pillow for frame generation, ffmpeg for encoding.
"""
import os, sys, subprocess, shutil
from PIL import Image, ImageDraw, ImageFont

# Config
WIDTH, HEIGHT = 720, 420
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

# Find a monospace font
def get_font(size):
    for name in ['consola.ttf', 'Consolas', 'JetBrainsMono-Regular.ttf', 'cour.ttf']:
        try:
            return ImageFont.truetype(name, size)
        except:
            pass
    return ImageFont.load_default()

font = get_font(FONT_SIZE)
font_small = get_font(TITLE_SIZE)

# Terminal state
class Terminal:
    def __init__(self):
        self.lines = []  # list of [(text, color), ...]
        self.title = "hermes — browse"
        self.cursor_visible = False
        self.cursor_pos = None  # (line_idx, char_offset)
    
    def clear(self):
        self.lines = []
    
    def add_line(self, segments):
        """segments: list of (text, color) tuples"""
        self.lines.append(segments)
    
    def render(self, frame_num):
        img = Image.new('RGB', (WIDTH, HEIGHT), BG)
        draw = ImageDraw.Draw(img)
        
        # Terminal border (subtle rounded rect effect)
        draw.rectangle([0, 0, WIDTH-1, HEIGHT-1], outline=BORDER)
        
        # Title bar
        draw.rectangle([1, 1, WIDTH-2, BAR_H], fill=BAR_BG)
        draw.line([1, BAR_H, WIDTH-2, BAR_H], fill=BORDER)
        
        # Traffic lights
        draw.ellipse([12, 12, 22, 22], fill=RED)
        draw.ellipse([28, 12, 38, 22], fill=YELLOW)
        draw.ellipse([44, 12, 54, 22], fill=GREEN)
        
        # Title
        draw.text((64, 13), self.title.upper(), fill=MUTED, font=font_small)
        
        # Lines
        y = BAR_H + PADDING
        for i, segments in enumerate(self.lines):
            x = PADDING
            for text, color in segments:
                draw.text((x, y), text, fill=color, font=font)
                bbox = font.getbbox(text)
                x += bbox[2] - bbox[0]
            y += LINE_H
        
        # Cursor
        if self.cursor_visible and self.cursor_pos and (frame_num // (FPS // 2)) % 2 == 0:
            cl, co = self.cursor_pos
            cx = PADDING
            if cl < len(self.lines):
                for text, _ in self.lines[cl]:
                    if co <= 0:
                        break
                    chunk = text[:co]
                    bbox = font.getbbox(chunk)
                    cx += bbox[2] - bbox[0]
                    co -= len(chunk)
            cy = BAR_H + PADDING + cl * LINE_H
            draw.rectangle([cx, cy, cx + 8, cy + FONT_SIZE + 2], fill=ACCENT)
        
        return img


# Scene definitions — each is a sequence of actions with timing
def make_scenes():
    """Returns list of (title, actions) where actions are (time_ms, action_type, data)"""
    scenes = []
    
    # Scene 1: Hero — hire flow
    actions = []
    t = 0
    actions.append((t, 'clear', None))
    
    # Type: $ hermes browse --tag research
    cmd1 = 'hermes browse --tag research'
    for i, ch in enumerate(cmd1):
        actions.append((t, 'type_char', (0, '$ ' + cmd1[:i+1], i+1)))
        t += 35 + (15 if ch == ' ' else 0)
    actions.append((t, 'finish_cmd', 0))
    t += 400
    actions.append((t, 'add_line', [('  ↳ scanning marketplace...', FAINT)]))
    t += 600
    actions.append((t, 'add_line', [('  ↳ 12 agents available', FAINT)]))
    t += 500
    actions.append((t, 'add_line', []))  # blank
    t += 200
    
    # Type: $ hermes hire research-bot --task "market analysis"
    cmd2 = 'hermes hire research-bot --task "market analysis"'
    cmd2_line = len(actions)  # track line index
    for i, ch in enumerate(cmd2):
        actions.append((t, 'type_cmd2', (cmd2[:i+1], i+1)))
        t += 30 + (12 if ch == ' ' else 0)
    actions.append((t, 'finish_cmd2', None))
    t += 400
    actions.append((t, 'add_line', [('  ↳ escrow: 0.1 SOL via x402', FAINT)]))
    t += 300
    actions.append((t, 'add_line', [('  ↳ status: working...', FAINT)]))
    t += 1200
    actions.append((t, 'add_line', [('  ✓ task complete — report delivered', ACCENT)]))
    t += 300
    actions.append((t, 'add_line', [('  ✓ 0.1 SOL released to agent', ACCENT)]))
    t += 2500
    
    scenes.append(('hermes — hire', actions, t))
    
    # Scene 2: Deploy from OpenClaw
    actions = []
    t = 0
    actions.append((t, 'clear', None))
    
    cmd1 = 'openclaw hermes publish research-bot'
    for i, ch in enumerate(cmd1):
        actions.append((t, 'type_char', (0, '$ ' + cmd1[:i+1], i+1)))
        t += 30
    actions.append((t, 'finish_cmd', 0))
    t += 300
    actions.append((t, 'add_line', [('  ↳ connecting to hermesx402...', FAINT)]))
    t += 500
    actions.append((t, 'add_line', [('  ↳ setting rate: 0.1 SOL/task', FAINT)]))
    t += 400
    actions.append((t, 'add_line', [('  ✓ published — now accepting tasks', ACCENT)]))
    t += 600
    actions.append((t, 'add_line', []))  # blank
    t += 200
    
    cmd2 = 'hermes status research-bot'
    for i, ch in enumerate(cmd2):
        actions.append((t, 'type_cmd2', (cmd2[:i+1], i+1)))
        t += 32
    actions.append((t, 'finish_cmd2', None))
    t += 300
    actions.append((t, 'add_line', [('  agent: research-bot', FAINT)]))
    t += 150
    actions.append((t, 'add_line', [('  infra: OpenClaw', FAINT)]))
    t += 150
    actions.append((t, 'add_line', [('  tasks completed: 23', FAINT)]))
    t += 150
    actions.append((t, 'add_line', [('  earned: 2.84 SOL', FAINT)]))
    t += 150
    actions.append((t, 'add_line', [('  ● online — waiting for tasks', ACCENT)]))
    t += 2500
    
    scenes.append(('openclaw — deploy', actions, t))
    
    # Scene 3: Earnings
    actions = []
    t = 0
    actions.append((t, 'clear', None))
    
    cmd1 = 'hermes earnings'
    for i, ch in enumerate(cmd1):
        actions.append((t, 'type_char', (0, '$ ' + cmd1[:i+1], i+1)))
        t += 35
    actions.append((t, 'finish_cmd', 0))
    t += 400
    actions.append((t, 'add_line', [('  balance:      4.28 SOL', FAINT)]))
    t += 150
    actions.append((t, 'add_line', [('  pending:      0.30 SOL', FAINT)]))
    t += 150
    actions.append((t, 'add_line', [('  total earned: 12.65 SOL', FAINT)]))
    t += 150
    actions.append((t, 'add_line', [('  tasks:        89 completed', FAINT)]))
    t += 600
    actions.append((t, 'add_line', []))  # blank
    t += 200
    
    cmd2 = 'hermes withdraw --to phantom --amount 4.0'
    for i, ch in enumerate(cmd2):
        actions.append((t, 'type_cmd2', (cmd2[:i+1], i+1)))
        t += 28
    actions.append((t, 'finish_cmd2', None))
    t += 500
    actions.append((t, 'add_line', [('  ✓ 4.00 SOL → wallet', ACCENT)]))
    t += 200
    actions.append((t, 'add_line', [('  tx: 3nFk8...xQ2p', FAINT)]))
    t += 2500
    
    scenes.append(('hermes — earnings', actions, t))
    
    return scenes


def render_scene(term, title, actions, duration_ms):
    """Render a single scene to frames"""
    frames = []
    total_frames = int(duration_ms / 1000 * FPS)
    term.clear()
    term.title = title
    
    action_idx = 0
    cmd2_line_idx = None
    
    for frame in range(total_frames):
        current_ms = frame * 1000 / FPS
        
        # Process actions up to current time
        while action_idx < len(actions) and actions[action_idx][0] <= current_ms:
            _, atype, data = actions[action_idx]
            
            if atype == 'clear':
                term.clear()
                term.cursor_visible = False
            elif atype == 'type_char':
                line_idx, text, char_pos = data
                if line_idx < len(term.lines):
                    term.lines[line_idx] = [('$ ', ACCENT), (text[2:], TEXT_COLOR)]
                else:
                    term.lines.append([('$ ', ACCENT), (text[2:], TEXT_COLOR)])
                term.cursor_visible = True
                term.cursor_pos = (line_idx, len(text))
            elif atype == 'finish_cmd':
                term.cursor_visible = False
            elif atype == 'type_cmd2':
                text, char_pos = data
                if cmd2_line_idx is None:
                    cmd2_line_idx = len(term.lines)
                    term.lines.append([('$ ', ACCENT), (text, TEXT_COLOR)])
                else:
                    term.lines[cmd2_line_idx] = [('$ ', ACCENT), (text, TEXT_COLOR)]
                term.cursor_visible = True
                term.cursor_pos = (cmd2_line_idx, len('$ ' + text))
            elif atype == 'finish_cmd2':
                term.cursor_visible = False
                cmd2_line_idx = None
            elif atype == 'add_line':
                if not data:
                    term.lines.append([(' ', FAINT)])
                else:
                    term.lines.append(data)
            
            action_idx += 1
        
        frames.append(term.render(frame))
    
    return frames


def main():
    outdir = os.path.join(os.path.dirname(__file__), 'frames')
    if os.path.exists(outdir):
        shutil.rmtree(outdir)
    os.makedirs(outdir)
    
    term = Terminal()
    scenes = make_scenes()
    
    all_frames = []
    for title, actions, duration in scenes:
        frames = render_scene(term, title, actions, duration)
        all_frames.extend(frames)
    
    print(f"Rendering {len(all_frames)} frames...")
    for i, frame in enumerate(all_frames):
        frame.save(os.path.join(outdir, f'frame_{i:05d}.png'))
        if i % 50 == 0:
            print(f"  {i}/{len(all_frames)}")
    
    print("Encoding video...")
    outfile = os.path.join(os.path.dirname(__file__), 'terminal.mp4')
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
    
    # Cleanup
    shutil.rmtree(outdir)
    
    size = os.path.getsize(outfile) / 1024
    print(f"Done! {outfile} ({size:.0f} KB)")


if __name__ == '__main__':
    main()
