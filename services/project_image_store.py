"""Persistent PIM image files, separate from browser storage."""
import os
import re
import sys
import tempfile
from pathlib import Path


def _image_dir():
    configured = os.environ.get('ANNOTATE_IMAGE_DIR')
    if configured:
        return Path(configured)
    if os.environ.get('ANNOTATE_PARENT_PID'):
        if sys.platform == 'darwin':
            return Path.home() / 'Library' / 'Application Support' / 'Annotate' / 'images'
        if sys.platform == 'win32':
            return Path(os.environ.get('APPDATA', str(Path.home()))) / 'Annotate' / 'images'
        return Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local' / 'share'))) / 'Annotate' / 'images'
    return Path(__file__).resolve().parents[1] / 'data' / 'project-images'


def image_path(project_id):
    if not re.fullmatch(r'project_[A-Za-z0-9_-]+', project_id or ''):
        raise ValueError('Invalid project ID')
    return _image_dir() / f'{project_id}.png'


def save_image(project_id, image_bytes):
    target = image_path(project_id)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, prefix='.image-', suffix='.tmp', delete=False) as output:
            temporary = Path(output.name)
            output.write(image_bytes)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    return target
