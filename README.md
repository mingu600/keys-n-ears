# Chord Drill

See a chord symbol, play it, get timed. The chords you're slowest on come up more often.

No build step and no dependencies. Plain HTML + ES modules.

## Run locally (Linux desktop)

```sh
npm run dev        # serves http://localhost:8000
npm test           # chord logic + scheduler tests
```

With no piano attached, play with the computer keyboard:
- Lower row `Z X C V B N M` = C3–B3 (black keys on `S D G H J`)
- Upper row `Q W E R T Y U I O P` = C4–E5 (black keys on the number row)
- Or click keys on screen to toggle them on and off.

Shortcuts: `Space` hint, `Enter` skip, `Esc` release all.

## Use with the Yamaha P-515 (MacBook)

1. Connect a USB-C-to-USB-B cable to the piano's **USB TO HOST** port.
2. Open the deployed URL in **Chrome** (Safari has no Web MIDI).
3. Allow MIDI access when Chrome asks. The header should show the piano's name.

Web MIDI only works on `https://` or `localhost`, so the Mac needs the deployed URL.

## Deploy to GitHub Pages

```sh
git init && git add . && git commit -m "Chord drill prototype"
gh repo create chord-drill --public --source=. --push
gh api repos/{owner}/chord-drill/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

The site appears at `https://<your-username>.github.io/chord-drill/` about a minute later.
After that, `git push` updates it.

## Rules

- Every chord tone must be held, and no other notes. Octave doublings are fine.
- Plain chords (C, Am7) accept any inversion.
- Slash chords (D/F♯) need the slash note as the lowest note.
- "Allow dropping the 5th" lets 4-note chords skip the perfect 5th (common pop voicing).
- The sustain pedal is ignored: only keys you're physically holding count.
- Hints and skips record 10 s for that chord, so it comes back more often.

Timings are saved in the browser (localStorage), so the Mac and the Linux desktop keep separate stats.
