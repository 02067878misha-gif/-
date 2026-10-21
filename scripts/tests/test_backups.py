import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('backup_version', Path(__file__).resolve().parents[1] / 'backup_version.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupSafetyTests(unittest.TestCase):
    def test_source_archive_excludes_all_historical_binaries(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            subprocess.run(['git', 'init', '-q', str(repo)], check=True)
            (repo / 'main.go').write_text('package main\nconst version = "1.4.0"\n')
            (repo / 'backups' / 'v1.0.0').mkdir(parents=True)
            (repo / 'backups' / 'v1.0.0' / 'old.zip').write_bytes(b'old release')
            (repo / '.github' / 'workflows').mkdir(parents=True)
            (repo / '.github' / 'workflows' / 'backup.yml').write_text('name: backup\n')
            subprocess.run(['git', 'add', '.'], cwd=repo, check=True)
            archive = repo / 'source.zip'
            backup.make_source_zip(archive, repo)
            with ZipFile(archive) as z:
                self.assertEqual(set(z.namelist()), {'WulffGenerator_source/main.go', 'WulffGenerator_source/.github/workflows/backup.yml'})

    def test_corrupt_backup_is_rejected_without_replacement(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'v1.4.0'
            folder.mkdir()
            archive = folder / 'program.zip'
            with ZipFile(archive, 'w') as z:
                z.writestr('WulffGenerator.exe', b'MZ fixture for archive validation')
            digest = backup.checksum(archive)
            (folder / 'manifest.json').write_text(json.dumps({'version': '1.4.0', 'tag': 'v1.4.0', 'archive': archive.name, 'sha256': digest}))
            (folder / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n')
            self.assertEqual(backup.verify_backup(folder)['version'], '1.4.0')
            archive.write_bytes(archive.read_bytes() + b'changed')
            before = archive.read_bytes()
            with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
                backup.verify_backup(folder)
            self.assertEqual(before, archive.read_bytes())

    def test_existing_output_is_never_removed_or_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'v1.4.0'
            folder.mkdir()
            sentinel = folder / 'existing.zip'
            sentinel.write_bytes(b'previous release')
            with self.assertRaises(FileExistsError):
                backup.prepare(folder, '/not/a/compiler')
            self.assertEqual(sentinel.read_bytes(), b'previous release')


if __name__ == '__main__':
    unittest.main()
