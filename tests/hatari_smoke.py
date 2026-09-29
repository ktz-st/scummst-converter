#!/usr/bin/env python3
"""Optional target smoke: run a locally generated READY directory in Hatari."""
import argparse
import os
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('prg', type=Path)
    parser.add_argument('--harness', type=Path, required=True,
                        help='directory containing hatari_session.py')
    parser.add_argument('--shots', type=Path, required=True)
    parser.add_argument('--seconds', type=int, default=25)
    args = parser.parse_args()
    sys.path.insert(0, str(args.harness))
    from hatari_session import HatariSession
    os.environ['SDL_VIDEODRIVER'] = 'dummy'
    args.shots.mkdir(parents=True, exist_ok=True)
    with HatariSession(str(args.prg.resolve()), machine='ste',
                       screenshot_dir=str(args.shots.resolve()),
                       debug_except='bus,address,illegal', sound=True,
                       extra_args=['--memsize', '4', '--natfeats', 'true',
                                   '--bios-intercept', 'true',
                                   '--fast-forward', 'false']) as hatari:
        for elapsed in range(5, args.seconds + 1, 5):
            hatari.wait(5)
            print(elapsed, hatari.screenshot(), flush=True)
        for line in hatari.lines[-80:]:
            if any(word in line.lower() for word in ('error', 'exception', 'converted', 'resource', 'fatal')):
                print(line, flush=True)


if __name__ == '__main__':
    main()
