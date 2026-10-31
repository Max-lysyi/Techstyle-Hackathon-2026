"""Add lossless TIFF copies to an existing project ZIP, without regeneration."""
import argparse
import copy
import io
import json
import os
import re
import tempfile
import zipfile
from pathlib import Path

from PIL import Image


def _convert(source: Path, target: Path):
    if source.resolve() == target.resolve() or target.exists():
        raise ValueError("Output must be a new file; existing archives are never overwritten.")
    mapping = {}
    with zipfile.ZipFile(source) as original:
        names = original.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive entries are not supported.")
        bad = original.testzip()
        if bad:
            raise ValueError(f"Corrupt ZIP entry: {bad}")
        candidates = [n for n in names if re.search(r"\.(png|jpe?g)$", n, re.I)
                      and not re.search(r"(^|/)masks/|-mask\.png$", n, re.I)]
        for name in candidates:
            tiff = re.sub(r"\.(png|jpe?g)$", ".tiff", name, flags=re.I)
            if tiff in names:
                raise ValueError(f"TIFF already exists: {tiff}")
            mapping[name] = tiff

        def annotate(value):
            if isinstance(value, list):
                return [annotate(item) for item in value]
            if not isinstance(value, dict):
                return value
            result = {}
            for key, item in value.items():
                result[key] = annotate(item)
                if isinstance(item, str) and item in mapping:
                    field = 'tiffFile' if key == 'file' else re.sub(r'File$', '', key) + 'TiffFile'
                    result[field] = mapping[item]
            return result

        with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_STORED) as output:
            for entry in original.infolist():
                data = original.read(entry.filename)
                if entry.filename.endswith('manifest.json'):
                    manifest = annotate(json.loads(data))
                    manifest['tiff'] = {'format': 'TIFF', 'colorSpace': 'RGB',
                                        'bitsPerSample': 8, 'alpha': 'unassociated',
                                        'compression': 'Adobe Deflate', 'dpi': None}
                    if entry.filename == 'manifest.json':
                        manifest['tiff']['files'] = mapping
                    data = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
                output.writestr(copy.copy(entry), data)
            for name, tiff in mapping.items():
                with Image.open(io.BytesIO(original.read(name))) as image:
                    if image.width * image.height > 16_777_216:
                        raise ValueError(f"Image exceeds 16.7 megapixels: {name}")
                    pixels = image.convert('RGBA')
                    encoded = io.BytesIO()
                    pixels.save(encoded, format='TIFF', compression='tiff_adobe_deflate')
                    encoded.seek(0)
                    with Image.open(encoded) as check:
                        if (check.format != 'TIFF' or check.size != pixels.size
                                or check.convert('RGBA').tobytes() != pixels.tobytes()
                                or check.tag_v2.get(338) != (2,)):
                            raise ValueError(f"TIFF verification failed: {name}")
                    output.writestr(tiff, encoded.getvalue())
                    print(tiff, pixels.size)
    with zipfile.ZipFile(target) as check:
        if check.testzip():
            raise ValueError('Output ZIP CRC verification failed.')
    return len(mapping)


def convert(source: Path, target: Path):
    if target.exists():
        raise ValueError('Output already exists; choose a new filename.')
    with tempfile.TemporaryDirectory(prefix='.ai-promt-tiff-', dir=target.parent) as work:
        temporary = Path(work) / 'project.zip'
        count = _convert(source, temporary)
        # Publish only after verification, without overwriting a concurrent file.
        os.link(temporary, target)
    print(f"Added {count} verified TIFF files: {target}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    convert(args.source, args.target)
