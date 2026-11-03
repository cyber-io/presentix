const preferenceKey = accountId => `present_office:${accountId}`;

export function chooseAttendanceOffice(offices, preferredId) {
  const places = Array.isArray(offices) ? offices : [];
  return places.find(place => place.id === preferredId)?.id
    || places.find(place => place.name?.trim().toLowerCase() === 'testing location')?.id
    || places.find(place => place.name?.toLowerCase().includes('krishna'))?.id
    || places[0]?.id
    || '';
}

export function readOfficePreference(storage, accountId) {
  if (!accountId) return '';
  try { return storage.getItem(preferenceKey(accountId)) || ''; }
  catch { return ''; }
}

export function saveOfficePreference(storage, accountId, officeId) {
  if (!accountId || !officeId) return;
  try { storage.setItem(preferenceKey(accountId), officeId); }
  catch { /* Selection still works when browser storage is unavailable. */ }
}
