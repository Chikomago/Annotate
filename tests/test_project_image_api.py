import io
import os
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
import werkzeug
from app import create_app

if not hasattr(werkzeug, '__version__'):
    werkzeug.__version__ = '3'


class ProjectImageApiTest(unittest.TestCase):
    def test_uploaded_image_survives_independent_read(self):
        with tempfile.TemporaryDirectory() as image_dir:
            with patch.dict(os.environ, {'ANNOTATE_IMAGE_DIR': image_dir}):
                client = create_app().test_client()
                image = io.BytesIO()
                Image.new('RGB', (16, 16), 'red').save(image, format='PNG')
                image.seek(0)
                uploaded = client.post('/api/upload/image', data={
                    'projectId': 'project_test_image_persistence',
                    'file': (image, 'test.png')
                }, content_type='multipart/form-data')
                self.assertEqual(uploaded.status_code, 200)
                self.assertTrue(uploaded.json.get('imageStored'))

                loaded = client.get('/api/projects/project_test_image_persistence/image')
                self.assertEqual(loaded.status_code, 200)
                self.assertEqual(loaded.mimetype, 'image/png')
                self.assertTrue(loaded.data.startswith(b'\x89PNG'))
                loaded.close()

                deleted = client.delete('/api/projects/project_test_image_persistence/image')
                self.assertEqual(deleted.status_code, 200)
                self.assertEqual(client.get('/api/projects/project_test_image_persistence/image').status_code, 404)


if __name__ == '__main__':
    unittest.main()
