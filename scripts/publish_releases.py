#!/usr/bin/env python3
"""Publish backed-up versions as GitHub Releases; never overwrite existing ones."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
from backup_version import ROOT, verify_backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, help='GitHub owner/repository')
    args = parser.parse_args()
    # A successful read is required before any writes. An access error stops here.
    raw = subprocess.check_output(['gh', 'release', 'list', '--repo', args.repo,
                                   '--limit', '1000', '--json', 'tagName'], text=True)
    existing = {r['tagName'] for r in json.loads(raw)}
    folders = sorted((ROOT / 'backups').glob('v*'), key=lambda p: tuple(map(int, p.name[1:].split('.'))))
    for folder in folders:
        meta = verify_backup(folder)
        if meta['tag'] in existing:
            print('Preserved existing release:', meta['tag'])
            continue
        with tempfile.TemporaryDirectory(prefix='wulff-notes-') as temp:
            notes = Path(temp) / 'notes.md'
            notes.write_text(f"Сетка Вульфа {meta['tag']} для Windows x64.\n\n"
                             'Распакуйте ZIP и запустите `WulffGenerator.exe`. В архиве также '
                             'исходный код, инструкция, примеры заданий и ответы преподавателю.\n\n'
                             'Этот архив сохранён в Git вместе с контрольной суммой SHA-256. '
                             'Предыдущие версии не заменяются.\n')
            subprocess.run(['gh', 'release', 'create', meta['tag'], '--repo', args.repo,
                            '--verify-tag', '--title', 'Сетка Вульфа ' + meta['tag'],
                            '--notes-file', str(notes), str(folder / meta['archive']),
                            str(folder / 'SHA256SUMS.txt')], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
