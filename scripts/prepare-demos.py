"""Package real, exported projects for the built-in demo gallery. No AI calls."""
import argparse
import hashlib
import io
import json
import zipfile
from pathlib import Path
from PIL import Image


def prepare(source, slug, title, description):
    destination = Path('public/demos') / slug
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        if archive.testzip():
            raise ValueError('Corrupt source archive')
        manifest = json.loads(archive.read('manifest.json'))
        converted = {}

        def raster(name):
            if name in converted:
                return converted[name]
            target = destination / Path(name).with_suffix('.webp')
            target.parent.mkdir(parents=True, exist_ok=True)
            image = Image.open(io.BytesIO(archive.read(name))).convert('RGBA')
            # Invisible RGB need not duplicate the full design in every transparent layer.
            empty = image.getchannel('A').point(lambda alpha: 255 if alpha == 0 else 0)
            image.paste((0, 0, 0, 0), mask=empty)
            image.save(target, 'WEBP', lossless=True, method=6, exact=True)
            check = Image.open(target).convert('RGBA')
            if image.tobytes() != check.tobytes():
                raise ValueError(f'Lossless verification failed: {name}')
            result = '/' + target.relative_to('public').as_posix()
            converted[name] = result
            return result

        original = manifest['originalFile']
        (destination / Path(original).name).write_bytes(archive.read(original))
        parts = []
        for part in manifest['parts']:
            if part['status'] != 'ready':
                continue
            record = dict(part)
            record['masterFile'] = raster(part['masterFile'])
            record['layers'] = [{**layer, 'file': raster(layer['file'])} for layer in part['layers']]
            parts.append(record)
        elements = []
        for entry in manifest.get('elements', []):
            if entry.get('source') != 'ai-reconstruction' or not entry.get('approved'):
                continue
            # Keep actual model PNG bytes for individual asset exports.
            name = entry['file']
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(name))
            elements.append({**entry, 'file': '/' + target.relative_to('public').as_posix()})
        original_image = Image.open(io.BytesIO(archive.read(original))).convert('RGB')
        original_image.thumbnail((600, 600))
        original_image.save(destination / 'cover.webp', 'WEBP', quality=90)
        project = {'schemaVersion': 1, 'id': slug, 'title': title, 'description': description,
                   'originalFile': f'/demos/{slug}/{Path(original).name}',
                   'sourceArchiveSha256': hashlib.sha256(Path(source).read_bytes()).hexdigest(),
                   'provenance': 'Раніше отриманий і збережений результат OpenAI; під час відкриття API не викликається.',
                   'notes': ['Невидимий принт реконструйовано приблизно. Стикування деталей перевіряє конструктор.',
                             'Це збережена генерація 1K; профіль 2K застосовується до нових запусків.'],
                   'parts': parts, 'elements': elements}
        (destination / 'project.json').write_text(json.dumps(project, ensure_ascii=False, indent=2))
        print(slug, len(parts), 'parts;', len(elements), 'assets;',
              sum(p.stat().st_size for p in destination.rglob('*') if p.is_file()), 'bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('slug')
    parser.add_argument('title')
    parser.add_argument('description')
    args = parser.parse_args()
    prepare(args.source, args.slug, args.title, args.description)
