"""Run against an EMPTY local Development demo. Uses public OpenCV face fixtures.
Usage: python3 tests/api_smoke.py http://127.0.0.1:5091 /path/to/face-fixtures
Creates fixture employees, one office and exactly two attendance records.
"""
import base64
import datetime
import io
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image

if len(sys.argv) != 3:
    raise SystemExit(__doc__)
origin = sys.argv[1].rstrip('/')
assert urllib.parse.urlparse(origin).hostname in ('127.0.0.1', 'localhost', '::1'), 'Use a local test server.'
BASE = origin + '/api'
fixtures = Path(sys.argv[2])
passed = 0

def request(path, payload=None):
    req = urllib.request.Request(BASE + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

def check(condition, label):
    global passed
    assert condition, label
    passed += 1
    print('PASS', label)

def photo(data):
    return 'data:image/jpeg;base64,' + base64.b64encode(data).decode()

def case(label, payload, expected, decision=None):
    status, result = request('/attendance', payload)
    assert status == expected, (label, status, result)
    if decision:
        assert result.get('verification', {}).get('decision') == decision, (label, result)
    check(True, label)
    return result

status, server = request('/status')
assert status == 200 and server['mode'] == 'demo', 'Only run against a local Development demo.'
assert server['face_verification']['available'], 'Models and native runtime must be ready.'
assert all(not request(path)[1] for path in ('/attendance', '/offices')), 'Use a fresh demo store.'
initial_employees = request('/employees')[1]
seed_ids = {'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc'}
assert {employee['id'] for employee in initial_employees} <= seed_ids and all(not employee.get('photo_base64') for employee in initial_employees), 'Use only the fresh default demo roster.'

reference = (fixtures / 'lena.jpg').read_bytes()
other_image = Image.open(fixtures / 'messi5.jpg').convert('RGB')
# Public sports fixture: crop around its portrait to exercise identity, rather than minimum size.
other_image = other_image.crop((180, 45, 300, 190)).resize((512, 512))
other_buffer = io.BytesIO()
other_image.save(other_buffer, format='JPEG')
blank_buffer = io.BytesIO()
Image.new('RGB', (512, 512), (128, 128, 128)).save(blank_buffer, format='JPEG')
blank = photo(blank_buffer.getvalue())

office_status, office = request('/offices', {
    'id': '00000000-0000-0000-0000-000000000000', 'name': 'Face test office',
    'address': 'Isolated automated fixture', 'latitude': 12.97, 'longitude': 77.59, 'radius_meters': 150})
assert office_status == 200
employee_input = {'name': 'Face Test Employee', 'email': 'face-test@example.test',
    'designation': 'Fixture', 'monthly_salary': 0, 'currency': 'INR', 'photo_base64': photo(reference)}
invalid_status, invalid = request('/employees', {**employee_input, 'photo_base64': blank})
check(invalid_status == 409 and invalid['verification']['decision'] == 'reference_invalid', 'invalid enrollment photo rejected')
check(len(request('/employees')[1]) == len(initial_employees), 'rejected enrollment does not create an employee')
registered_status, registered = request('/register', {**employee_input, 'password': 'FixtureOnly123!'})
assert registered_status == 200, registered
employee = registered['employee']
check(bool(employee['photo_base64']), 'clear reference is registered')
body = {'office_id': office['id'], 'check_type': 'CHECK_IN', 'latitude': 12.97, 'longitude': 77.59,
    'accuracy_meters': 5, 'captured_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'photo_base64': photo(reference), 'user_id': employee['user_id'] or employee['id']}
case('outside boundary', {**body, 'latitude': 13.0}, 400)
case('poor GPS accuracy', {**body, 'accuracy_meters': 101}, 400)
case('stale GPS', {**body, 'captured_at': '2020-01-01T00:00:00Z'}, 400)
case('invalid photo format', {**body, 'photo_base64': 'https://example.com/photo.jpg'}, 400)
case('no face requests a retake', {**body, 'photo_base64': blank}, 422, 'retake')
case('different face is rejected', {**body, 'photo_base64': photo(other_buffer.getvalue())}, 422, 'mismatch')
check(not request('/attendance')[1], 'rejected captures create no attendance records')
case('checkout before checkin', {**body, 'check_type': 'CHECK_OUT'}, 409)
matched = case('matching face checks in', body, 200)
check(matched['face_verification']['decision'] == 'match', 'checkin includes server face decision')
case('duplicate checkin', body, 409)
case('mismatching checkout cannot transition state', {**body, 'check_type': 'CHECK_OUT', 'photo_base64': photo(other_buffer.getvalue())}, 422, 'mismatch')
check(len(request('/attendance')[1]) == 1, 'mismatching checkout leaves prior checkin intact')
case('matching face checks out', {**body, 'check_type': 'CHECK_OUT'}, 200)
check(len(request('/attendance')[1]) == 2, 'history contains exactly two successful transitions')
print(f'{passed} HTTP API checks passed.')
