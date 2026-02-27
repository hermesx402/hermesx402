"""
Record a real terminal session as MP4.
Runs actual hermes.js commands against the mock API and captures output.
"""
import os, subprocess, shutil, time
from PIL import Image, ImageDraw, ImageFont

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
GREEN_ = (40, 200, 64)
BAR_BG = (14, 14, 18)
BAR_H = 36
PADDING = 20
LINE_H = 20
FONT_SIZE = 13

HERMES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts', 'hermes.js')

def get_font(size):
    for name in ['consola.ttf', 'Consolas', 'cour.ttf']:
        try:
            return ImageFont.truetype(name, size)
        except: pass
    return ImageFont.load_default()

font = get_font(FONT_SIZE)
font_small = get_font(10)

def run_cmd(args):
    """Run a real hermes.js command and return output lines."""
    result = subprocess.run(
        ['node', HERMES] + args + ['--local'],
        capture_output=True, text=True, timeout=15
    )
    output = result.stdout.strip()
    if result.stderr.strip():
        output += '\n' + result.stderr.strip()
    return output.split('\n') if output else []

def colorize_line(line):
    """Determine color for an output line."""
    stripped = line.strip()
    if stripped.startswith('✓') or stripped.startswith('●'):
        return ACCENT
    elif stripped.startswith('↳'):
        return FAINT
    elif stripped.startswith('balance') or stripped.startswith('pending') or stripped.startswith('total'):
        return FAINT
    elif '/5' in stripped and 'SOL/task' in stripped:
        return FAINT
    else:
        return MUTED

def render_frame(title, lines, cursor_visible=False, cursor_line=0, cursor_text='', frame_num=0):
    """Render a terminal frame."""
    img = Image.new('RGB', (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, WIDTH-1, HEIGHT-1], outline=BORDER)
    draw.rectangle([1, 1, WIDTH-2, BAR_H], fill=BAR_BG)
    draw.line([1, BAR_H, WIDTH-2, BAR_H], fill=BORDER)
    draw.ellipse([12, 12, 22, 22], fill=RED)
    draw.ellipse([28, 12, 38, 22], fill=YELLOW)
    draw.ellipse([44, 12, 54, 22], fill=GREEN_)
    draw.text((64, 13), title.upper(), fill=MUTED, font=font_small)

    y = BAR_H + PADDING
    for i, (text, color) in enumerate(lines):
        draw.text((PADDING, y), text, fill=color, font=font)
        y += LINE_H

    # Cursor
    if cursor_visible and (frame_num // (FPS // 2)) % 2 == 0:
        cy = BAR_H + PADDING + cursor_line * LINE_H
        bbox = font.getbbox(cursor_text)
        cx = PADDING + (bbox[2] - bbox[0])
        draw.rectangle([cx, cy, cx + 7, cy + FONT_SIZE + 1], fill=ACCENT)

    return img


def record_scene(title, commands):
    """
    Record a scene. commands is a list of:
      ('cmd', 'hermes browse --tag code')  — type and run
      ('pause', 500)  — pause in ms
    Returns list of PIL frames.
    """
    frames = []
    displayed_lines = []  # list of (text, color)

    def add_frames(n):
        for i in range(n):
            frames.append(render_frame(title, displayed_lines, frame_num=len(frames)))

    def type_and_run(cmd_text, args):
        nonlocal displayed_lines
        line_idx = len(displayed_lines)
        
        # Type the command character by character
        for i in range(len(cmd_text)):
            partial = '$ ' + cmd_text[:i+1]
            if line_idx < len(displayed_lines):
                displayed_lines[line_idx] = (partial, TEXT_COLOR)
            else:
                displayed_lines.append((partial, TEXT_COLOR))
            frames.append(render_frame(title, displayed_lines, 
                cursor_visible=True, cursor_line=line_idx, 
                cursor_text=partial, frame_num=len(frames)))
        
        # Finish typing
        displayed_lines[line_idx] = ('$ ' + cmd_text, TEXT_COLOR)
        add_frames(8)  # brief pause after typing
        
        # Run the actual command
        output_lines = run_cmd(args)
        
        # Display output line by line with slight delay
        for out_line in output_lines:
            if out_line.strip():
                displayed_lines.append((out_line, colorize_line(out_line)))
                add_frames(4)  # ~130ms between lines

    # Initial pause
    add_frames(15)

    for action in commands:
        if action[0] == 'cmd':
            cmd_text = action[1]
            args = action[2]
            type_and_run(cmd_text, args)
        elif action[0] == 'pause':
            add_frames(int(action[1] / 1000 * FPS))
        elif action[0] == 'blank':
            displayed_lines.append(('', FAINT))
            add_frames(3)
        elif action[0] == 'clear':
            displayed_lines = []
            add_frames(5)

    # End pause
    add_frames(int(2.5 * FPS))
    return frames


def main():
    print("Recording real terminal sessions...")
    
    all_frames = []

    # Scene 1: Install + Browse
    print("Scene 1: Browse agents...")
    scene1 = record_scene('hermes — browse', [
        ('cmd', 'hermes browse --tag code', ['browse', '--tag', 'code']),
        ('pause', 800),
        ('blank',),
        ('cmd', 'hermes browse --tag research', ['browse', '--tag', 'research']),
        ('pause', 1500),
    ])
    all_frames.extend(scene1)

    # Scene 2: Hire flow
    print("Scene 2: Hire agent...")
    scene2 = record_scene('hermes — hire', [
        ('cmd', 'hermes hire code-auditor --task "review contracts"', 
            ['hire', 'code-auditor', '--task', 'review contracts']),
        ('pause', 3500),  # wait for task to complete
        ('blank',),
        ('cmd', 'hermes task-status task-0x0002', ['task-status', 'task-0x0002']),
        ('pause', 800),
        ('blank',),
        ('cmd', 'hermes confirm task-0x0002 --rating 5', ['confirm', 'task-0x0002', '--rating', '5']),
        ('pause', 1000),
    ])
    all_frames.extend(scene2)

    # Scene 3: Earnings + Withdraw
    print("Scene 3: Earnings...")
    scene3 = record_scene('hermes — earnings', [
        ('cmd', 'hermes earnings', ['earnings']),
        ('pause', 1000),
        ('blank',),
        ('cmd', 'hermes withdraw --amount 0.12 --to phantom', ['withdraw', '--amount', '0.12', '--to', 'phantom']),
        ('pause', 1500),
    ])
    all_frames.extend(scene3)

    # Render
    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rec-frames')
    if os.path.exists(outdir):
        shutil.rmtree(outdir)
    os.makedirs(outdir)

    print(f"Saving {len(all_frames)} frames...")
    for i, frame in enumerate(all_frames):
        frame.save(os.path.join(outdir, f'frame_{i:05d}.png'))
        if i % 100 == 0:
            print(f"  {i}/{len(all_frames)}")

    print("Encoding video...")
    outfile = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'terminal-real.mp4')
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
