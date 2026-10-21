#!/usr/bin/env python3
"""Build an immutable release backup, commit it and optionally push it to GitHub."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]


def run(args, *, cwd=ROOT, env=None, capture=False):
    return subprocess.run([str(x) for x in args], cwd=cwd, env=env, check=True,
                          text=True, stdout=subprocess.PIPE if capture else None).stdout


def git(*args, repo=ROOT):
    return run(['git', *args], cwd=repo, capture=True).strip()


def version(repo=ROOT):
    m = re.search(r'^const version\s*=\s*"(\d+\.\d+\.\d+)"',
                  (repo / 'main.go').read_text(), re.MULTILINE)
    if not m:
        raise RuntimeError('main.go must declare a numeric version, e.g. 1.4.0')
    return m.group(1)


def checksum(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def verify_backup(folder):
    meta = json.loads((folder / 'manifest.json').read_text())
    v = meta['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', v) or folder.name != 'v' + v:
        raise RuntimeError(f'Invalid backup version: {folder}')
    filename = meta['archive']
    if Path(filename).name != filename or not filename.endswith('.zip'):
        raise RuntimeError('Invalid archive filename')
    archive = folder / filename
    if checksum(archive) != meta['sha256']:
        raise RuntimeError(f'Backup checksum mismatch: {archive}')
    with ZipFile(archive) as z:
        if z.testzip() is not None:
            raise RuntimeError(f'Corrupt ZIP: {archive}')
        if 'WulffGenerator.exe' not in z.namelist():
            raise RuntimeError(f'EXE missing from backup: {archive}')
        if 'source_zip_sha256' in meta:
            sources = [name for name in z.namelist()
                       if name.startswith('WulffGenerator_source') and name.endswith('.zip')]
            if len(sources) != 1 or hashlib.sha256(z.read(sources[0])).hexdigest() != meta['source_zip_sha256']:
                raise RuntimeError(f'Source archive checksum mismatch: {archive}')
    expected = f"{meta['sha256']}  {filename}\n"
    if (folder / 'SHA256SUMS.txt').read_text() != expected:
        raise RuntimeError(f'Checksum document mismatch: {folder}')
    return meta


def source_files(repo=ROOT):
    raw = subprocess.check_output(['git', 'ls-files', '-z'], cwd=repo)
    paths = [Path(os.fsdecode(x)) for x in raw.split(b'\0') if x]
    return [p for p in paths if p.parts[0] not in {'.git', 'backups', 'dist', 'output'}
            and '__pycache__' not in p.parts and p.suffix != '.pyc']


def make_source_zip(destination, repo=ROOT):
    with ZipFile(destination, 'w', ZIP_DEFLATED, compresslevel=9) as z:
        for rel in sorted(source_files(repo)):
            full = repo / rel
            if not full.is_file() or full.is_symlink():
                raise RuntimeError(f'Unsupported tracked source: {rel}')
            z.write(full, 'WulffGenerator_source/' + rel.as_posix())


def prepare(destination, go, repo=ROOT):
    v = version(repo)
    destination.mkdir(parents=True, exist_ok=False)
    try:
        go_version = run([go, 'version'], capture=True)
        if not go_version.startswith('go version go'):
            raise RuntimeError('--go must point to the official Go compiler')
        run([go, 'test', '-mod=readonly', './...'], cwd=repo)
        run([go, 'vet', '-mod=readonly', './...'], cwd=repo)
        with tempfile.TemporaryDirectory(prefix='wulff-release-') as temp:
            work = Path(temp)
            native = work / ('wulff-native.exe' if sys.platform == 'win32' else 'wulff-native')
            native_env = dict(os.environ)
            for key in ['GOOS', 'GOARCH']:
                native_env.pop(key, None)
            run([go, 'build', '-mod=readonly', '-trimpath', '-o', native, '.'], cwd=repo, env=native_env)
            exe = work / 'WulffGenerator.exe'
            windows_env = dict(os.environ, GOOS='windows', GOARCH='amd64', CGO_ENABLED='0')
            run([go, 'build', '-mod=readonly', '-trimpath', '-ldflags=-s -w -H=windowsgui', '-o', exe, '.'],
                cwd=repo, env=windows_env)
            examples = work / 'examples'
            run([native, '--generate', '--count', '2', '--seed', 'WULFF-2026', '--colors', '--out', examples], cwd=repo)
            source = work / f'WulffGenerator_source_v{v}.zip'
            make_source_zip(source, repo)
            archive = destination / f'WulffGenerator_Windows_x64_v{v}.zip'
            with ZipFile(archive, 'w', ZIP_DEFLATED, compresslevel=9) as z:
                z.write(exe, exe.name)
                z.write(source, source.name)
                z.write(repo / 'README.md', 'README.md')
                z.writestr('START_HERE.txt', '\ufeffРаспакуйте архив и запустите WulffGenerator.exe.\n'
                           'Откроется отдельное окно Windows; браузер и интернет не нужны.\n'
                           'Примеры заданий и ответы находятся в examples.\n'
                           'Печать A4: фактический размер / 100%. Подробности — README.md.\n')
                for p in sorted(examples.iterdir()):
                    if p.name != 'wulff-set.zip':
                        z.write(p, 'examples/' + p.name)
                for license_path in sorted((repo / 'assets').glob('*-LICENSE.txt')):
                    z.write(license_path, 'licenses/' + license_path.name)
                goroot = Path(run([go, 'env', 'GOROOT'], capture=True).strip())
                z.write(goroot / 'LICENSE', 'licenses/GO-LICENSE.txt')
            meta = {'schema': 1, 'version': v, 'tag': 'v' + v, 'archive': archive.name,
                    'sha256': checksum(archive), 'source_commit': git('rev-parse', 'HEAD', repo=repo),
                    'source_zip_sha256': checksum(source), 'go_version': go_version.strip()}
            (destination / 'manifest.json').write_text(json.dumps(meta, indent=2) + '\n')
            (destination / 'SHA256SUMS.txt').write_text(f"{meta['sha256']}  {archive.name}\n")
        # Verify with the final version-directory name before publishing.
        if destination.name == 'v' + v:
            verify_backup(destination)
        return meta
    except BaseException:
        shutil.rmtree(destination)
        raise


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--go', default=shutil.which('go'), help='Official Go compiler path')
    p.add_argument('--push', action='store_true', help='Push source, backup commit and version tag atomically')
    p.add_argument('--verify', action='store_true', help='Check an existing backup without creating or pushing anything')
    p.add_argument('--prepare-only', type=Path, metavar='DIRECTORY', help='Test packaging only; do not commit, tag or push')
    args = p.parse_args()
    if args.verify and args.push:
        p.error('--verify cannot be combined with --push')
    if args.prepare_only and (args.push or args.verify):
        p.error('--prepare-only cannot be combined with --push or --verify')
    v = version()
    tag = 'v' + v
    folder = ROOT / 'backups' / tag
    if args.prepare_only:
        if not args.go:
            p.error('Go is not installed; supply --go')
        prepare(args.prepare_only.resolve(), args.go)
        print('Packaging verified:', args.prepare_only)
        return
    tag_exists = subprocess.run(['git', 'show-ref', '--verify', '--quiet', 'refs/tags/' + tag], cwd=ROOT).returncode == 0
    if folder.exists() or tag_exists or args.verify:
        if not folder.is_dir() or not tag_exists:
            raise RuntimeError(f'Both immutable backup {folder} and tag {tag} must exist; refusing to replace either')
        verify_backup(folder)
        git('cat-file', '-e', f'{tag}:backups/{tag}/manifest.json')
        print('Verified existing backup and tag:', tag, '(left unchanged)')
        if args.push:
            run(['git', 'push', '--atomic', 'origin', 'HEAD:refs/heads/main', f'refs/tags/{tag}'])
        return
    if git('status', '--porcelain'):
        raise RuntimeError('Commit source changes first. The backup command requires a clean working tree.')
    if not args.go:
        p.error('Go is not installed; supply --go')
    if args.push:
        if git('ls-remote', '--tags', 'origin', f'refs/tags/{tag}'):
            raise RuntimeError(f'Remote tag {tag} already exists; refusing to replace it')
    with tempfile.TemporaryDirectory(prefix='wulff-staging-') as temp:
        staging = Path(temp) / tag
        prepare(staging, args.go)
        # Never overwrite a previous version, even if it appeared during the build.
        folder.parent.mkdir(exist_ok=True)
        shutil.copytree(staging, folder)
    verify_backup(folder)
    run(['git', 'add', '--', str(folder.relative_to(ROOT))])
    run(['git', 'commit', '-m', f'Backup {tag}: Windows program, source and examples'])
    run(['git', 'tag', '-a', tag, '-m', f'Immutable release backup {tag}'])
    if args.push:
        run(['git', 'push', '--atomic', 'origin', 'HEAD:refs/heads/main', f'refs/tags/{tag}'])
    print('Saved:', folder, '| tag:', tag)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, OSError, ValueError) as e:
        print('Backup failed:', e, file=sys.stderr)
        sys.exit(1)
