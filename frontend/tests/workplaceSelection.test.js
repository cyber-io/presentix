import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseAttendanceOffice,
  readOfficePreference,
  saveOfficePreference,
} from '../src/workplaceSelection.js';

const testing = { id: 'testing-office', name: 'Testing Location' };
const real = { id: 'real-office', name: 'Krishna Gaushala Jainabad' };
const other = { id: 'other-office', name: 'Head Office' };
const offices = [real, other, testing];

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('separate staff accounts without a preference both default to the shared testing office', () => {
  const storage = memoryStorage();
  for (const staff of ['staff-alice', 'staff-bob']) {
    assert.equal(
      chooseAttendanceOffice(offices, readOfficePreference(storage, staff)),
      testing.id,
    );
  }
});

test('an explicit real-office choice survives reload for the same account', () => {
  const storage = memoryStorage();
  saveOfficePreference(storage, 'staff-alice', real.id);
  assert.equal(readOfficePreference(storage, 'staff-alice'), real.id);
  assert.equal(
    chooseAttendanceOffice(offices, readOfficePreference(storage, 'staff-alice')),
    real.id,
  );
});

test('a saved workplace does not leak into another account on the same browser', () => {
  const storage = memoryStorage();
  saveOfficePreference(storage, 'staff-alice', real.id);
  assert.equal(readOfficePreference(storage, 'staff-bob'), '');
  assert.equal(
    chooseAttendanceOffice(offices, readOfficePreference(storage, 'staff-bob')),
    testing.id,
  );

  saveOfficePreference(storage, 'staff-bob', other.id);
  assert.equal(readOfficePreference(storage, 'staff-alice'), real.id);
  assert.equal(readOfficePreference(storage, 'staff-bob'), other.id);
});

test('a removed saved office falls back to Testing Location', () => {
  const storage = memoryStorage();
  saveOfficePreference(storage, 'staff-alice', 'removed-office');
  assert.equal(
    chooseAttendanceOffice(offices, readOfficePreference(storage, 'staff-alice')),
    testing.id,
  );
});

test('the exact new Testing Location takes precedence over legacy test names', () => {
  const legacy = { id: 'legacy-test', name: 'Workplace (Test Location)' };
  assert.equal(chooseAttendanceOffice([legacy, real, testing]), testing.id);
});

test('Testing Location name matching tolerates capitalization and surrounding whitespace', () => {
  const renamed = { ...testing, name: '  TESTING LOCATION  ' };
  assert.equal(chooseAttendanceOffice([real, renamed]), testing.id);
});

test('a valid explicit selection takes precedence over the default testing office', () => {
  assert.equal(chooseAttendanceOffice(offices, other.id), other.id);
});

test('without Testing Location the existing Krishna workplace remains the default', () => {
  assert.equal(chooseAttendanceOffice([other, real]), real.id);
  assert.equal(
    chooseAttendanceOffice([other, { ...real, name: 'KRISHNA Office' }], 'removed-office'),
    real.id,
  );
});

test('without a known default the first available office is usable', () => {
  assert.equal(chooseAttendanceOffice([other]), other.id);
});

test('an empty or unavailable office list has no selected office', () => {
  for (const places of [[], undefined, null]) {
    assert.equal(chooseAttendanceOffice(places, real.id), '');
  }
});

test('blocked browser storage still permits the shared default and manual selection', () => {
  const blocked = {
    getItem() { throw new Error('Storage access denied'); },
    setItem() { throw new Error('Storage access denied'); },
  };
  assert.equal(readOfficePreference(blocked, 'staff-alice'), '');
  assert.doesNotThrow(() => saveOfficePreference(blocked, 'staff-alice', real.id));
  assert.equal(
    chooseAttendanceOffice(offices, readOfficePreference(blocked, 'staff-alice')),
    testing.id,
  );
  assert.equal(chooseAttendanceOffice(offices, real.id), real.id);
});

test('missing storage behaves like having no saved preference', () => {
  assert.equal(readOfficePreference(undefined, 'staff-alice'), '');
  assert.doesNotThrow(() => saveOfficePreference(undefined, 'staff-alice', real.id));
});

test('anonymous or incomplete selections do not overwrite a staff preference', () => {
  const storage = memoryStorage();
  saveOfficePreference(storage, 'staff-alice', real.id);
  saveOfficePreference(storage, 'staff-alice', '');
  saveOfficePreference(storage, '', other.id);
  assert.equal(readOfficePreference(storage, 'staff-alice'), real.id);
  assert.equal(readOfficePreference(storage, ''), '');
});
