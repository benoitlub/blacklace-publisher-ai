"""Explicit one-shot setup, no scheduler and no paid service.

Install piper-tts==1.8.0 separately. Downloads the CC-BY 4.0 French SIWIS
model through the inherited proxy, checks its hash, and prints non-secret paths.
"""
import hashlib
import pathlib
import subprocess
import sys

target = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'data/studio-models').resolve()
target.mkdir(parents=True, exist_ok=True)
base = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/'
expected = '641d1ab097da2b81128c076810edb052b385decc8be3381814802a64a73baf99'
for name in ['fr_FR-siwis-medium.onnx', 'fr_FR-siwis-medium.onnx.json', 'MODEL_CARD']:
    dest = target / name
    if not dest.exists():
        temporary = dest.with_name(dest.name + '.download')
        try:
            subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--connect-timeout', '20', '--max-time', '180', '--output', str(temporary), base + name], check=True)
            temporary.replace(dest)
        finally:
            temporary.unlink(missing_ok=True)
model = target / 'fr_FR-siwis-medium.onnx'
if hashlib.sha256(model.read_bytes()).hexdigest() != expected:
    raise SystemExit('Model checksum mismatch; refusing synthesis.')
print('PIPER_MODEL=' + str(model))
print('PIPER_MODEL_SHA256=' + expected)
print('License: CC-BY 4.0. Attribute SIWIS, University of Edinburgh; preserve MODEL_CARD.')
