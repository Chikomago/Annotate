"""Assemble the Tauri resource directory without local project data."""
import argparse
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--python-home', type=Path, required=True)
    args = parser.parse_args()

    resources = ROOT / 'src-tauri' / 'resources'
    if resources.exists():
        shutil.rmtree(resources)
    resources.mkdir(parents=True)
    shutil.copytree(args.python_home, resources / 'python', symlinks=True)
    app = resources / 'app'
    app.mkdir()
    for filename in ('app.py', 'index.html'):
        shutil.copy2(ROOT / filename, app / filename)
    for dirname in ('api', 'services', 'models', 'js', 'css', 'assets'):
        shutil.copytree(ROOT / dirname, app / dirname,
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.DS_Store', '*.bak'))
    data = app / 'data'
    data.mkdir()
    (data / 'statistics.json').write_text(json.dumps({'records': []}), encoding='utf-8')
    (data / 'users').mkdir()


if __name__ == '__main__':
    main()
