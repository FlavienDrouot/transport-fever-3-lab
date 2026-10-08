"""Import only configurator PNGs from a private, verified thumbnail package.

Usage: python3 scripts/import-thumbnails.py /path/to/tf3-vehicle-thumbnails.zip
Original archive, TGA files, campaign assets and unrelated vehicles stay private.
"""
import hashlib
import json
import posixpath
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(relative):
    return json.loads((ROOT / relative).read_text())


def collect_components():
    groups = [
        ('rail', 'locomotive', 'data/rail-locomotives.json', 'locomotives'),
        ('rail', 'passenger-wagon', 'data/rail-passenger-wagons.json', 'wagons'),
        ('rail', 'freight-wagon', 'data/rail-freight-wagons.json', 'wagons'),
        ('rail', 'multiple-unit', 'data/trains.json', 'trains'),
        ('tram', 'locomotive', 'data/tram-locomotives.json', 'locomotives'),
        ('tram', 'passenger-wagon', 'data/tram-passenger-wagons.json', 'wagons'),
        ('tram', 'freight-wagon', 'data/tram-freight-wagons.json', 'wagons'),
        ('tram', 'passenger-motor', 'data/trams.json', 'trams'),
        ('tram', 'freight-motor', 'data/trams.json', 'freightTrams'),
    ]
    for carrier, group, file, key in groups:
        for item in read(file)[key]:
            yield f'{carrier}:{group}:{item["id"]}', file, item


def main(package):
    source = read('data/source-catalogue.json')
    records = source['vehicles'] + source['formations']
    resources = {item['id']: item for item in records}
    observations = {}
    for item in records:
        observation = item.get('nameReconciliation', {}).get('observation')
        if observation:
            observations.setdefault(observation, []).append(item['id'])

    # Filename exceptions checked against the acquired catalogue. The ambiguous
    # Metroliner/SS4G images show ONE section; the formation repeats that section.
    aliases = {
        '/vehicle/train/metroliner/icons/metroliner_icon_small@2x.tga': '/vehicle/train/metroliner/metroliner.mdl',
        '/vehicle/train/shaoshan_4g/icons/shaoshan_4g_icon_small@2x.tga': '/vehicle/train/shaoshan_4g/shaoshan_4g.mdl',
    }
    components, assets = {}, {}
    with zipfile.ZipFile(package) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        icons, rear = {}, None
        for image in manifest['images']:
            resource = image.get('vehicle_id')
            if image['resource_path'] in aliases:
                resource = f'{image["source_content"]}::{aliases[image["resource_path"]]}'
            if image['resource_path'] == '/vehicle/train/avelia_liberty/icons/avelia_liberty_back_icon_small@2x.tga':
                rear = image
            if resource:
                if resource in icons:
                    raise ValueError(f'Duplicate miniature for {resource}')
                icons[resource] = image

        def part(image, reverse=False):
            conversion = image['conversion']
            digest = conversion['sha256']
            filename = f'{digest}.png'
            if filename not in assets:
                pixels = archive.read(conversion['archive_path'])
                if hashlib.sha256(pixels).hexdigest() != digest:
                    raise ValueError(f'PNG checksum mismatch: {conversion["archive_path"]}')
                if conversion.get('resized') or not conversion.get('decoded_pixels_and_alpha_identical'):
                    raise ValueError('Only lossless original-size conversions may be imported')
                assets[filename] = (pixels, {
                    'sourceContent': image['source_content'], 'sourceResource': image['resource_path'],
                    'sha256': digest, 'width': image['width'], 'height': image['height'],
                })
            return {'src': f'./assets/vehicle-thumbnails/{filename}',
                    'width': image['width'], 'height': image['height'], 'reverse': reverse}

        def miniature(resource, forward=True):
            if resource.endswith('/avelia_liberty_front.mdl') and not forward and rear:
                return [part(rear)]
            if resource in icons:
                return [part(icons[resource], not forward)]
            formation = resources.get(resource, {})
            if not formation.get('components'):
                raise ValueError(f'No miniature for {resource}')
            owner, path = resource.split('::', 1)
            result = []
            for entry in formation['components']:
                name = entry['name']
                child = name if name.startswith('/') else posixpath.join(posixpath.dirname(path), name)
                result.extend(miniature(f'{owner}::{child}', entry.get('forward', True)))
            return result

        for component_id, file, item in collect_components():
            resource = item.get('dataProvenance', {}).get('resourceId') or item.get('formationProvenance', {}).get('resourceId')
            if not resource:
                candidates = observations.get(f'{file}#{item["id"]}', [])
                if len(candidates) != 1:
                    raise ValueError(f'A unique source association is required for {component_id}: {candidates}')
                resource = candidates[0]
            components[component_id] = {'resourceId': resource, 'parts': miniature(resource)}

        # Validate everything before writing, keeping the private package intact.
        destination = ROOT / 'assets/vehicle-thumbnails'
        destination.mkdir(parents=True, exist_ok=True)
        for filename, (pixels, _) in assets.items():
            (destination / filename).write_bytes(pixels)
        index = {'schemaVersion': 1,
                 'source': 'Original Transport Fever 3 purchase-list miniatures; unchanged PNG conversions.',
                 'components': components,
                 'assets': {name: metadata for name, (_, metadata) in sorted(assets.items())}}
        (ROOT / 'data/vehicle-thumbnails.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
        print(f'{len(components)} configurator choices, {len(assets)} original PNGs, {sum(len(x[0]) for x in assets.values()):,} bytes')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
