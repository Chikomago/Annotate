"""Persistent user supplied Word template for PIM exports."""
import os
import sys
import tempfile
from pathlib import Path

from docx import Document


def template_path():
    configured = os.environ.get('ANNOTATE_TEMPLATE_DIR')
    if configured:
        directory = Path(configured)
    elif os.environ.get('ANNOTATE_PARENT_PID'):
        if sys.platform == 'darwin':
            directory = Path.home() / 'Library' / 'Application Support' / 'Annotate'
        elif sys.platform == 'win32':
            directory = Path(os.environ.get('APPDATA', str(Path.home()))) / 'Annotate'
        else:
            directory = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local' / 'share'))) / 'Annotate'
    else:
        directory = Path(__file__).resolve().parents[1] / 'data'
    return directory / 'pim-template.docx'


def save_template(stream):
    target = template_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, prefix='.template-', suffix='.docx', delete=False) as output:
            temporary = Path(output.name)
            while chunk := stream.read(1024 * 1024):
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        document = Document(temporary)
        if not document.tables or len(document.tables[-1].columns) < 3:
            raise ValueError('模板需要包含至少三列的表格')
        os.replace(temporary, target)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    return target
