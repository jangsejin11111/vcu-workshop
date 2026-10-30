"""Offline genuine multilingual SBERT. Never uploads workshop responses."""
import argparse, json, sys, hashlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend import model

def collect(paths, field):
    items = []
    for path in paths:
        data = json.loads(Path(path).read_text(encoding='utf-8-sig'))
        code = data.get('room', {}).get('id') or data['duo'][0]['code']
        rounds = {r['id']: r for r in data['duo_round']}
        latest = {}
        for e in data['duo_edit']:
            key = (e['round'], e['participant'])
            if key not in latest or e['version'] > latest[key]['version']:
                latest[key] = e
        for e in latest.values():
            r = rounds.get(e['round'])
            text = e['answers'].get(field, '').strip()
            if not r or r['status'] != 'closed' or not text:
                continue
            scene_key = hashlib.sha256(json.dumps(r['scene'], ensure_ascii=False).encode()).hexdigest()
            items.append(dict(id=e['id'], room=code, group=e['group'], pid=e['pid'], participant=e['participant'],
                round=r['number'], scene=r['scene'], scene_key=scene_key, field=field,
                text=text, version=e['version'], phase='discussion'))
    # Downloading the same workshop twice must not count people twice.
    unique = {}
    for x in items:
        key = (x['room'], x['round'], x['participant'])
        if key not in unique or x['version'] > unique[key]['version']: unique[key] = x
    return [{k:v for k,v in x.items() if k != 'participant'} for x in unique.values()]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exports', nargs='+')
    parser.add_argument('--field', choices=['meaning','reply','action','emotion'], default='meaning')
    parser.add_argument('--output', default='analysis.json')
    parser.add_argument('--prepare', action='store_true', help='Download model before analysis')
    args = parser.parse_args()
    inputs = collect(args.exports, args.field)
    result = dict(schema='vcu-sbert-v1', status='failed', field=args.field, inputs=inputs, pairs=[], human_reviews=[])
    try:
        if args.prepare: model.prepare()
        if model.load()['status'] != 'ready': raise RuntimeError(model.state['error'])
        buckets = {}
        for item in inputs: buckets.setdefault(item['scene_key'], []).append(item)
        for rows in buckets.values():
            if len(rows) < 2: continue
            scores, lengths = model.encode([r['text'] for r in rows])
            for r, length in zip(rows, lengths): r['token_length'] = length; r['truncated'] = length > model.state['max_seq_length']
            for i, left in enumerate(rows):
                for j in range(i+1, len(rows)):
                    result['pairs'].append(dict(left=left['id'], right=rows[j]['id'],
                        left_room=left['room'], right_room=rows[j]['room'], score=float(scores[i,j])))
        result['pairs'].sort(key=lambda x: x['score'], reverse=True)
        result.update(status='complete', model=model.state)
    except Exception as e:
        result.update(error=str(e), model=model.state)
        result['pairs'] = []
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"{result['status']}: {len(inputs)} responses, {len(result['pairs'])} pairs → {args.output}")
    if result['status'] == 'failed':
        print('No scores generated. Prepare the model or continue manual review.', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__': raise SystemExit(main())
