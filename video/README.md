# git — 60-second showreel

`git_showreel.mp4` is a one-minute motion-graphics piece showing what Git can do,
told through an imaginary autonomous-rover project (`rover-nav`):

| Time | Chapter | What happens |
|---|---|---|
| 0:00 | `git init` | Terminal cold open, and particles come together into the logo |
| 0:04 | Commit | Each commit adds a part to the rover: motors, lidar, IMU, PID |
| 0:10 | Three trees | Only two files get staged and committed. The third stays uncommitted |
| 0:16 | Branch | SLAM and RL experiments run side by side with live sims. The dead end gets deleted |
| 0:26 | Merge | A `Kp = 1.2` vs `Kp = 0.8` conflict gets resolved |
| 0:32 | Bisect | The rover crashes, and 4 bisect steps across 16 commits find the bad one |
| 0:40 | Reflog | `reset --hard` deletes three commits, and the reflog brings them back |
| 0:45 | Ship | Push, teammates' commits, `git tag v1.0`, and 12 rovers update |
| 0:53 | Outro | The whole history folds into the logo |

Everything is procedural, with no stock assets. PIL draws the frames at 2× supersampling.
NumPy and SciPy add bloom, chromatic aberration, glitches and grain. The 120 BPM soundtrack
is synthesised in NumPy and cut to the same event timeline as the visuals. FFmpeg does
the encoding.

## Re-render

```bash
pip install pillow numpy scipy imageio-ffmpeg   # imageio-ffmpeg bundles an ffmpeg binary
python video/showreel.py                         # -> video/git_showreel.mp4 (1080p30, ~7 min on 4 cores)
python video/showreel.py --stills 5,20,36        # PNG stills for quick checks
```
