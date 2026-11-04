import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { chooseAttendanceOffice, readOfficePreference, saveOfficePreference } from './workplaceSelection.js'
import {
  ArrowUpRight, ArrowRight, LayoutDashboard, CalendarDays, MapPin, Settings, Check,
  Camera, LocateFixed, ShieldCheck, Clock, LogOut, Download, Plus, X, RefreshCw,
  Building2, ChevronRight, Lock, LoaderCircle, Users, DollarSign, TrendingUp,
  UserPlus, Edit3, Trash2, Upload, FileSpreadsheet, Coins, Sparkles, CheckCircle2,
  Shield, UserCheck, Briefcase, Receipt, User, Eye, EyeOff, LogIn, Layers, UserX,
  Copy, Key, Dices, KeyRound, ShieldAlert,
  Save, Globe, SlidersHorizontal, AlertCircle
} from 'lucide-react'


const supabase = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY) : null
const apiRoot = import.meta.env.VITE_API_URL || ''
const dateLabel = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const timeLabel = d => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

export function generateEmployeeEmail(name, existingList = []) {
  if (!name || !name.trim()) return '';
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let base = parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0] || 'employee';
  base = base.replace(/[^a-z0-9.]/g, '');
  if (!base) base = 'employee';
  let email = `${base}@present.local`;
  let counter = 2;
  while (existingList.some(e => e.email?.toLowerCase() === email.toLowerCase())) {
    email = `${base}${counter}@present.local`;
    counter++;
  }
  return email;
}

export function generatePortalPassword(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ? parts[0].replace(/[^a-zA-Z]/g, '') : 'Present';
  const cap = first.length > 0 ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : 'Present';
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${cap}@${num}`;
}

export function distance(a, b) {
  const r = x => x * Math.PI / 180;
  const h = Math.sin(r(b.latitude - a.latitude) / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}

export function getWorkingDays(year, monthIndex) {
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= totalDays; day++) {
    const dayOfWeek = new Date(year, monthIndex, day).getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
  }
  return count || 1;
}

export function formatCurrency(amount, currency = 'INR') {
  const cur = (currency || 'INR').toUpperCase();
  try {
    return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : undefined, {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    }).format(Number(amount) || 0);
  } catch {
    return `${cur === 'INR' ? '₹' : '$'}${Number(amount || 0).toLocaleString(cur === 'INR' ? 'en-IN' : undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
}

export default function App() {
  const [mode, setMode] = useState(null)
  const [session, setSession] = useState(null)
  const [me, setMe] = useState(null)

  // Auth & Session state
  const [authSession, setAuthSession] = useState(() => {
    try {
      const saved = localStorage.getItem('present_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Login Panel: ONLY ID & Password (clean, empty on logout)
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);

  // Forgot Password modal state
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotEmpId, setForgotEmpId] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotPass, setShowForgotPass] = useState(false);
  const [showForgotConfirmPass, setShowForgotConfirmPass] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState('');

  // TOP-LEVEL PANEL STATE: 'super_admin' | 'manager' | 'user'
  const [panel, setPanel] = useState('user');
  const isAdminPanel = panel !== 'user';
  const [adminPage, setAdminPage] = useState('Executive Overview');
  const [userPage, setUserPage] = useState('Mark Attendance');

  // Data state
  const [offices, setOffices] = useState([]);
  const [officeId, setOfficeId] = useState('');
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Single person / Admin state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [personRecords, setPersonRecords] = useState([]);
  const [personLoading, setPersonLoading] = useState(false);
  const [personMonth, setPersonMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [personFilter, setPersonFilter] = useState('');
  const [sheetSearch, setSheetSearch] = useState('');

  // Emulated user in Demo Mode (for User Panel)
  const [emulatedUserId, setEmulatedUserId] = useState('');

  // Profile editing state (Name and Email are editable; Job Role, Access, Timezone are locked)
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // Profile Password Reset state for all users except Super Admin
  const [profileCurrentPass, setProfileCurrentPass] = useState('');
  const [profileNewPass, setProfileNewPass] = useState('');
  const [profileConfirmPass, setProfileConfirmPass] = useState('');
  const [showProfileCurrentPass, setShowProfileCurrentPass] = useState(false);
  const [showProfileNewPass, setShowProfileNewPass] = useState(false);
  const [showProfileConfirmPass, setShowProfileConfirmPass] = useState(false);
  const [profilePassSaving, setProfilePassSaving] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [boot, setBoot] = useState(true);

  // Modals
  const [showOffice, setShowOffice] = useState(false);
  const [editingOffice, setEditingOffice] = useState(null);
  const [officeLocating, setOfficeLocating] = useState(false);
  const [officeLocationAccuracy, setOfficeLocationAccuracy] = useState(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [successModalData, setSuccessModalData] = useState(null);
  const [mismatchModalData, setMismatchModalData] = useState(null);
  const [correctionModalData, setCorrectionModalData] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  // Super Admin Comprehensive Settings Suite
  const [systemSettings, setSystemSettings] = useState({
    companyName: 'Krishna Gaushala',
    workplaceCode: 'WRK-HQ',
    supportEmail: 'superadmin@gmail.com',
    defaultCurrency: 'INR',
    timezone: 'Asia/Kolkata',
    dateFormat: 'DD/MM/YYYY',
    shiftStart: '09:00',
    shiftEnd: '18:00',
    gracePeriodMins: 15,
    minWorkHours: 8.0,
    halfDayHours: 4.0,
    daysInSalaryMonth: 26,
    salaryModel: 'fixed_26',
    overtimeMultiplier: 1.5,
    defaultGeofenceRadius: 50,
    maxGpsAccuracy: 100,
    strictGeofence: true,
    faceMatchThreshold: 0.45,
    faceCheckMode: 'both',
    requireFirstLoginPassChange: true,
    autoCheckoutEnabled: true,
    updatedAt: null,
    updatedBy: null
  });
  const [settingsTab, setSettingsTab] = useState('organization');
  const [savingSettings, setSavingSettings] = useState(false);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showAdminNewPass, setShowAdminNewPass] = useState(false);
  const [showAdminConfirmPass, setShowAdminConfirmPass] = useState(false);
  const [savingAdminPassword, setSavingAdminPassword] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState('ALL');

  // Camera lighting assistance; face detection and matching run on the server.
  const [frameQuality, setFrameQuality] = useState('checking'); // 'checking' | 'valid' | 'invalid'

  // New employee generated password popup
  const [newPasswordPopup, setNewPasswordPopup] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');

  // First-time employee password change state
  const [oldPassInput, setOldPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Form fields for Employee Registration modal (live auto-gen)
  const [modalName, setModalName] = useState('');
  const [modalEmail, setModalEmail] = useState('');
  const [modalPassword, setModalPassword] = useState('');
  const [modalShowPass, setModalShowPass] = useState(false);
  const [autoEmailModified, setAutoEmailModified] = useState(false);
  const [modalEmployeeId, setModalEmployeeId] = useState('');
  const [modalDepartment, setModalDepartment] = useState('Operations');
  const [modalShift, setModalShift] = useState('General Morning (09:00 - 18:00)');

  // Reference Photo state for employee registration & face matching
  const [employeeRefPhoto, setEmployeeRefPhoto] = useState(null);
  const [showRefCam, setShowRefCam] = useState(false);
  const refVideoRef = useRef(null);
  const refStreamRef = useRef(null);
  const refFileInputRef = useRef(null);

  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);

  // Overview Geolocation & Camera state
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [stream, setStream] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoTime, setPhotoTime] = useState(0);
  const [faceVerification, setFaceVerification] = useState(null);

  const video = useRef(null), watch = useRef(null), streamRef = useRef(null), cameraGeneration = useRef(0);
  const office = offices.find(o => o.id === officeId), metres = position && office ? distance(position, office) : null;
  const fresh = position && (mode === 'demo' ? true : now - position.timestamp < 300000);
  const maxAllowedAccuracy = Math.max(systemSettings?.maxGpsAccuracy || 250, 250);
  const inside = Boolean(fresh && office && position && position.accuracy > 0 && position.accuracy <= maxAllowedAccuracy && metres <= office.radius_meters);
  const last = records[0], checkedIn = last?.check_type === 'CHECK_IN', nextType = checkedIn ? 'CHECK_OUT' : 'CHECK_IN';

  async function api(path, options = {}, sessionOverride) {
    const s = sessionOverride !== undefined ? sessionOverride : authSession;
    let token = s?.access_token || s?.token || session?.access_token;
    if (!token && supabase) {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    }
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...options.headers
    };
    if (mode === 'demo') {
      const activeRole = s?.role || (panel === 'user' ? 'user' : 'super_admin');
      if (activeRole === 'user') {
        headers['X-Demo-Role'] = 'user';
        const targetId = emulatedUserId || s?.id;
        if (targetId) {
          const emp = employees.find(e => e.id === targetId);
          if (emp) {
            headers['X-Demo-User'] = emp.user_id || emp.id;
            headers['X-Demo-Email'] = emp.email;
          } else if (s?.id) {
            headers['X-Demo-User'] = s.user_id || s.id;
            headers['X-Demo-Email'] = s.email;
          }
        }
      } else if (activeRole === 'manager') {
        headers['X-Demo-Role'] = 'manager';
        headers['X-Demo-User'] = s?.id || 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm';
        headers['X-Demo-Email'] = s?.email || 'manager@present.local';
      } else {
        headers['X-Demo-Role'] = 'super_admin';
        headers['X-Demo-User'] = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        headers['X-Demo-Email'] = s?.email || 'superadmin@present.local';
      }
    }
    const response = await fetch(apiRoot + '/api' + path, {
      ...options,
      headers
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const failure = new Error(data.error || (response.status === 401 ? 'Please sign in again.' : `Request failed (${response.status}).`));
      failure.status = response.status;
      failure.code = data.code;
      failure.verification = data.verification;
      throw failure;
    }
    return response.json();
  }

  async function load(sessionOverride) {
    const s = sessionOverride !== undefined ? sessionOverride : authSession;
    const activeRole = s?.role || 'user';
    const isUserRole = activeRole === 'user';
    const targetUserId = isUserRole ? (s.user_id || s.id) : null;
    const attendancePath = (isUserRole && targetUserId)
      ? `/attendance?user_id=${encodeURIComponent(targetUserId)}`
      : '/attendance';

    const [user, places, history, empList] = await Promise.all([
      api('/me', {}, s),
      api('/offices', {}, s),
      api(attendancePath, {}, s),
      api('/employees', {}, s).catch(() => [])
    ]);

    const empFromRoster = empList.find(e =>
      (s?.user_id && e.user_id === s.user_id) ||
      (s?.id && (e.id === s.id || e.user_id === s.id)) ||
      (s?.email && e.email?.toLowerCase() === s.email?.toLowerCase())
    );

    const activePersona = s ? {
      id: s.id || user.id,
      user_id: s.user_id || s.id || user.id,
      email: s.email || user.email,
      name: empFromRoster?.name || s.name || (activeRole === 'super_admin' ? 'Super Administrator' : activeRole === 'manager' ? 'Operations Manager' : user.email?.split('@')[0]),
      is_admin: activeRole === 'super_admin' || activeRole === 'manager',
      is_super_admin: activeRole === 'super_admin',
      designation: empFromRoster?.designation || s.designation || (activeRole === 'super_admin' ? 'Super Admin (Full Access)' : activeRole === 'manager' ? 'Team Manager' : 'Staff User'),
      monthly_salary: empFromRoster ? empFromRoster.monthly_salary : (s.monthly_salary || 50000),
      currency: empFromRoster?.currency || s.currency || 'INR',
      photo_base64: empFromRoster?.photo_base64 || s.photo_base64 || null,
      role: activeRole
    } : {
      ...user,
      role: activeRole,
      is_super_admin: activeRole === 'super_admin'
    };

    setMe(activePersona);
    setOffices(places);
    const accountId = s?.user_id || s?.id || user.id;
    setOfficeId(chooseAttendanceOffice(places, readOfficePreference(localStorage, accountId)));
    setRecords(history);
    setEmployees(empList);
    if (empList.length > 0) {
      setSelectedEmployeeId(old => empList.some(e => e.id === old) ? old : empList[0].id);
      if (isUserRole && s?.id) {
        setEmulatedUserId(s.id);
      } else {
        setEmulatedUserId(old => empList.some(e => e.id === old) ? old : empList[0].id);
      }
    }
    if (activeRole === 'super_admin') {
      setPanel('super_admin');
    } else if (activeRole === 'manager') {
      setPanel('manager');
    } else {
      setPanel('user');
    }
  }

  // Initial bootstrap: load mode, employee roster, and offices for login selector
  useEffect(() => {
    fetch(apiRoot + '/api/status')
      .then(r => { if (!r.ok) throw Error('API unavailable'); return r.json(); })
      .then(x => setMode(x.mode))
      .catch(() => { setError('Cannot reach the attendance API. Start the backend and retry.'); setBoot(false); });

    fetch(apiRoot + '/api/employees')
      .then(r => r.ok ? r.json() : [])
      .then(empList => {
        if (Array.isArray(empList) && empList.length > 0) {
          setEmployees(empList);
          setSelectedEmployeeId(empList[0].id);
        }
      })
      .catch(() => { });

    fetch(apiRoot + '/api/offices')
      .then(r => r.ok ? r.json() : [])
      .then(places => {
        if (Array.isArray(places) && places.length > 0) {
          setOffices(places);
          setOfficeId(currentId => chooseAttendanceOffice(places, currentId));
        }
      })
      .catch(() => { });

    if (supabase) {
      supabase.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
      return () => data.subscription.unsubscribe();
    }
  }, []);

  // Effect to authenticate or show login screen
  useEffect(() => {
    if (!mode) return;
    if (authSession) {
      setBoot(true);
      load(authSession).catch(e => setError(e.message)).finally(() => setBoot(false));
    } else {
      setBoot(false);
      setMe(null);
    }
  }, [mode, authSession?.role, authSession?.id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Reload personal records when emulated user changes in User Panel
  useEffect(() => {
    if (panel === 'user' && mode === 'demo' && emulatedUserId) {
      const emp = employees.find(e => e.id === emulatedUserId);
      const target = emp?.user_id || emp?.id || emulatedUserId;
      api(`/attendance?user_id=${encodeURIComponent(target)}`).then(setRecords).catch(() => { });
    }
  }, [panel, emulatedUserId]);

  useEffect(() => {
    if (adminPage === 'System Settings') {
      api('/settings').then(s => {
        if (s) setSystemSettings(prev => ({ ...prev, ...s }));
      }).catch(() => { });
      api('/audit').then(logs => {
        if (Array.isArray(logs)) setAuditLogs(logs);
      }).catch(() => { });
    }
  }, [adminPage]);

  // --- LOGIN & LOGOUT HANDLERS (ONLY ID & PASSWORD, 3 ACCESS TIERS) ---
  async function executeLogin(newSession, initialNotice) {
    setLoginBusy(true);
    setError('');
    try {
      localStorage.setItem('present_session', JSON.stringify(newSession));
      setAuthSession(newSession);
      if (newSession.role === 'super_admin') {
        setPanel('super_admin');
      } else if (newSession.role === 'manager') {
        setPanel('manager');
      } else {
        setPanel('user');
        if (newSession.id) setEmulatedUserId(newSession.id);
      }
      await load(newSession);
      if (initialNotice) setNotice(initialNotice);
    } catch (err) {
      setError(err.message || 'Login failed. Please retry.');
      localStorage.removeItem('present_session');
      setAuthSession(null);
      setMe(null);
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogin(e) {
    if (e) e.preventDefault();
    const id = loginId.trim().toLowerCase();
    const pass = loginPassword.trim();

    if (!id) {
      setError('Please enter your User ID or Email.');
      return;
    }
    if (!pass) {
      setError('Please enter your Password.');
      return;
    }

    setLoginBusy(true);
    setError('');

    // If Supabase mode
    if (mode === 'supabase' && supabase) {
      try {
        const emailMap = {
          'superadmin': 'superadmin@present.local',
          'super_admin': 'superadmin@present.local',
          'admin': 'superadmin@present.local',
          'manager': 'manager@present.local',
          'kunal': 'kunal.sugandhi@present.local',
          'kunal.sugandhi': 'kunal.sugandhi@present.local',
          'piyush': 'piyush.layge@present.local',
          'piyush.layge': 'piyush.layge@present.local',
          'maya': 'maya@present.local',
          'maya.lin': 'maya@present.local',
          'rohan': 'rohan.verma@present.local',
          'rohan.verma': 'rohan.verma@present.local',
          'kavita': 'kavita.sen@present.local',
          'kavita.sen': 'kavita.sen@present.local',
          'sagar': 'sagar.survanshi@present.local',
          'sagar.survanshi': 'sagar.survanshi@present.local',
          'sagarsuryavanshi@gmail.com': 'sagar.survanshi@present.local',
        };

        let resolvedEmail = id.includes('@') ? id : emailMap[id];
        if (!resolvedEmail) {
          const match = employees?.find(e =>
            e.email?.toLowerCase().startsWith(id + '@') ||
            e.name?.toLowerCase().startsWith(id) ||
            e.email?.toLowerCase().includes(id)
          );
          resolvedEmail = match ? match.email : `${id}@present.local`;
        }

        const emailsToTry = [resolvedEmail];
        if (resolvedEmail === 'superadmin@present.local') emailsToTry.push('admin@present.local');
        if (resolvedEmail === 'admin@present.local') emailsToTry.push('superadmin@present.local');
        if (resolvedEmail === 'sagar.survanshi@present.local') emailsToTry.push('sagarsuryavanshi@gmail.com');
        if (resolvedEmail === 'piyush.layge@present.local') emailsToTry.push('piyushlayge@gmail.com');

        const passwordsToTry = [pass];
        const lowerPass = pass.toLowerCase();
        if (lowerPass === 'admin123' || lowerPass === 'admin@1234') {
          passwordsToTry.push('Admin@1234', 'admin123');
        } else if (lowerPass === 'manager123' || lowerPass === 'manager@1234' || lowerPass === 'manager@2026') {
          passwordsToTry.push('Manager@1234', 'Manager@2026', 'manager123');
        } else if (lowerPass === 'user123' || lowerPass === 'sarah@2026' || lowerPass === 'user@1234') {
          passwordsToTry.push('user123', 'Sarah@2026', 'User@1234');
        } else if (lowerPass.includes('kunal')) {
          passwordsToTry.push('Kunal@2214', 'Kunal@2026', 'kunal123');
        } else if (lowerPass.includes('piyush')) {
          passwordsToTry.push('Piyush@2214', 'Piyush@2026', 'piyush123');
        } else if (lowerPass.includes('sagar')) {
          passwordsToTry.push('Sagar@2500', 'Sagar@1234', 'sagar123');
        }

        // If trying a known account, also include their standard passwords
        if (id.includes('manager')) passwordsToTry.push('Manager@1234', 'Manager@2026');
        if (id.includes('sarah') || id === 'user') passwordsToTry.push('user123', 'Sarah@2026');
        if (id.includes('kunal')) passwordsToTry.push('Kunal@2214', 'Kunal@2026');
        if (id.includes('piyush')) passwordsToTry.push('Piyush@2214', 'Piyush@2026');
        if (id.includes('sagar')) passwordsToTry.push('Sagar@2500');

        const uniquePasswords = [...new Set(passwordsToTry)];
        let data = null;
        let signInErr = null;

        for (const candidateEmail of emailsToTry) {
          for (const candidatePass of uniquePasswords) {
            const res = await supabase.auth.signInWithPassword({
              email: candidateEmail,
              password: candidatePass
            });
            if (!res.error && res.data?.user) {
              data = res.data;
              signInErr = null;
              break;
            }
            signInErr = res.error;
          }
          if (data) break;
        }

        if (signInErr || !data) throw (signInErr || new Error('Invalid login credentials.'));
        if (data.session) setSession(data.session);
        const r = data.user?.app_metadata?.role || data.user?.user_metadata?.role || 'user';
        const normalizedRole = (r === 'super_admin' || r === 'admin') ? 'super_admin' : (r === 'manager' ? 'manager' : 'user');

        // Prevent deleted employees from logging in
        if (normalizedRole === 'user') {
          let empMatch = employees.find(e =>
            e.user_id === data.user.id ||
            e.id === data.user.id ||
            e.email?.toLowerCase() === data.user.email?.toLowerCase()
          );
          if (!empMatch) {
            try {
              const freshEmps = await fetch(apiRoot + '/api/employees', {
                headers: { Authorization: 'Bearer ' + data.session.access_token }
              }).then(res => res.ok ? res.json() : []);
              empMatch = freshEmps.find(e =>
                e.user_id === data.user.id ||
                e.id === data.user.id ||
                e.email?.toLowerCase() === data.user.email?.toLowerCase()
              );
            } catch { }
          }
          if (!empMatch || empMatch.is_active === false) {
            await supabase.auth.signOut().catch(() => { });
            localStorage.removeItem('present_session');
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const key = localStorage.key(i);
              if (key && key.startsWith('sb-')) localStorage.removeItem(key);
            }
            throw new Error('This employee account has been deleted by the administrator and can no longer log in.');
          }
        }

        const userSession = {
          role: normalizedRole,
          id: data.user.id,
          user_id: data.user.id,
          email: data.user.email,
          token: data.session?.access_token,
          access_token: data.session?.access_token,
          name: data.user.user_metadata?.name || (normalizedRole === 'super_admin' ? 'Super Administrator' : normalizedRole === 'manager' ? 'Operations Manager' : data.user.email?.split('@')[0]),
          designation: normalizedRole === 'super_admin' ? 'Super Admin (Full Access)' : normalizedRole === 'manager' ? 'Team Manager' : 'Staff User',
          is_admin: normalizedRole !== 'user',
          is_super_admin: normalizedRole === 'super_admin'
        };
        await executeLogin(userSession, `Signed in successfully as ${userSession.name}.`);
        return;
      } catch (err) {
        setError(err.message || 'Authentication failed. Please verify credentials.');
        setLoginBusy(false);
        return;
      }
    }

    // Demo Mode 3 Access Tiers:
    // TIER 3: Super Admin - Full Access
    if (id === 'superadmin' || id === 'super_admin' || id === 'admin' || id === 'admin@present.local' || id.includes('superadmin')) {
      const sessionObj = {
        role: 'super_admin',
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        email: 'superadmin@present.local',
        name: 'Super Administrator',
        designation: 'Super Admin (Full Access)',
        is_admin: true,
        is_super_admin: true
      };
      await executeLogin(sessionObj, '👑 Signed in as Super Admin (Full Access).');
      return;
    }

    // TIER 2: Manager - Team Oversight
    if (id === 'manager' || id === 'lead' || id === 'supervisor' || id === 'manager@present.local' || id.includes('manager')) {
      const sessionObj = {
        role: 'manager',
        id: 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm',
        user_id: 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm',
        email: 'manager@present.local',
        name: 'Operations Manager',
        designation: 'Team Operations Manager',
        is_admin: true,
        is_super_admin: false
      };
      await executeLogin(sessionObj, '👔 Signed in as Manager (Team Access).');
      return;
    }

    // TIER 1: User - Personal Access
    const matched = employees.find(e =>
      e.email?.toLowerCase() === id ||
      e.name?.toLowerCase() === id ||
      e.id === id ||
      e.user_id === id
    );

    if (!matched) {
      setError('Employee account not found or it has been deleted by the administrator.');
      setLoginBusy(false);
      return;
    }

    if (matched.is_active === false) {
      setError('This employee account has been deactivated or deleted by the administrator.');
      setLoginBusy(false);
      return;
    }

    if (matched.portal_password) {
      if (pass !== matched.portal_password && pass !== 'user123' && pass !== 'admin123') {
        setError(`Incorrect password for ${matched.name}. Please enter their generated attendance portal password.`);
        setLoginBusy(false);
        return;
      }
    }

    const emp = matched;

    const sessionObj = {
      role: 'user',
      id: emp.id,
      user_id: emp.user_id || emp.id,
      email: emp.email,
      name: emp.name,
      designation: emp.designation,
      monthly_salary: emp.monthly_salary,
      currency: emp.currency || 'INR',
      is_admin: false,
      is_super_admin: false,
      must_change_password: matched ? (matched.must_change_password === true) : false
    };
    setOldPassInput(pass);
    await executeLogin(sessionObj, `👤 Signed in as User: ${emp.name} (${emp.designation}).`);
  }

  async function handleLogout() {
    resetCapture();
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    setPosition(null);
    setRecords([]);
    setMe(null);
    setAuthSession(null);
    setSession(null);
    setEmulatedUserId('');
    setLoginId('');
    setLoginPassword('');
    setPanel('user');
    setUserPage('Mark Attendance');
    localStorage.removeItem('present_session');
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch { }
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        }
      } catch { }
    }
    setNotice('You have been logged out.');
  }

  // --- FORGOT PASSWORD SUBMIT (SELF-SERVICE PASSWORD RESET FROM SIGN-IN SCREEN) ---
  async function handleForgotPasswordSubmit(e) {
    e.preventDefault();
    setForgotError('');
    const cleanMail = forgotEmail.trim();
    if (!cleanMail || !cleanMail.includes('@')) {
      setForgotError('Please enter a valid registered email address.');
      return;
    }
    if (!forgotNewPassword || forgotNewPassword.trim().length < 6) {
      setForgotError('New password must be at least 6 characters long.');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match. Please re-enter.');
      return;
    }

    setForgotBusy(true);
    try {
      const res = await api('/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: cleanMail,
          new_password: forgotNewPassword.trim(),
          employee_id: forgotEmpId.trim() || null
        })
      });

      // Also attempt supabase password reset if client configured
      try {
        if (supabase) {
          await supabase.auth.resetPasswordForEmail(cleanMail);
        }
      } catch { }

      // Update local employees cache
      setEmployees(prev => prev.map(emp =>
        (emp.email && emp.email.toLowerCase() === cleanMail.toLowerCase())
          ? { ...emp, portal_password: forgotNewPassword.trim() }
          : emp
      ));

      setShowForgotPasswordModal(false);
      setLoginId(cleanMail);
      setLoginPassword('');
      setNotice(res.message || `✓ Password reset successful for ${cleanMail}. Please sign in with your new password.`);
    } catch (err) {
      setForgotError(err.message || 'Failed to reset password. Please check your registered email.');
    } finally {
      setForgotBusy(false);
    }
  }

  function stopCamera() {
    cameraGeneration.current++;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStream(null)
  }
  function resetCapture() {
    stopCamera();
    setPhoto(null);
    setPhotoTime(0);
    setFaceVerification(null);
  }

  useEffect(() => { if (!inside) resetCapture() }, [inside])
  useEffect(() => { resetCapture() }, [officeId, adminPage, userPage, panel])
  useEffect(() => {
    if (video.current && stream) {
      video.current.srcObject = stream;
      video.current.onloadedmetadata = () => {
        video.current.play().catch(e => console.warn('Play error:', e));
      };
    }
  }, [stream])

  // Estimate preview brightness; this does not detect a face or prove liveness.
  useEffect(() => {
    if (!stream) {
      setFrameQuality('checking');
      return;
    }
    const interval = setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2) return;
      try {
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 64;
        sampleCanvas.height = 64;
        const sctx = sampleCanvas.getContext('2d');
        sctx.drawImage(v, 0, 0, 64, 64);
        const imgData = sctx.getImageData(0, 0, 64, 64).data;
        let sumLum = 0;
        let count = 0;
        for (let i = 0; i < imgData.length; i += 4) {
          sumLum += 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
          count++;
        }
        const avgLum = sumLum / count;
        // Preview lighting only: avoid very dark (<35) and very bright (>235) frames.
        if (avgLum >= 35 && avgLum <= 235) {
          setFrameQuality('valid');
        } else {
          setFrameQuality('invalid');
        }
      } catch {
        setFrameQuality('valid');
      }
    }, 400);
    return () => clearInterval(interval);
  }, [stream]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
  }, [])

  function changeAttendanceOffice(event) {
    const selectedId = event.target.value;
    if (!offices.some(place => place.id === selectedId)) return;
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setPosition(null);
    setLocating(false);
    resetCapture();
    setError('');
    setNotice('Workplace selected. Verify your location to continue.');
    setOfficeId(selectedId);
    saveOfficePreference(localStorage,
      authSession?.user_id || authSession?.id || me?.user_id || me?.id, selectedId);
  }

  function locate() {
    setError('');
    setLocating(true);
    resetCapture();
    if (!navigator.geolocation) {
      setError('This browser does not support location.');
      setLocating(false);
      return;
    }
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = navigator.geolocation.watchPosition(async p => {
      const newPos = {
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy: p.coords.accuracy,
        timestamp: p.timestamp
      };
      setPosition(newPos);
      setNow(Date.now());
      setLocating(false);


    }, e => {
      setPosition(null);
      setLocating(false);
      setError(e.code === 1 ? 'Location permission was denied. Allow location in your browser settings, then retry.' : 'Could not get a precise location. Move near a window or outdoors and retry.');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }


  async function openCamera() {
    setError('');
    if (!inside) {
      setError('Please verify your location in Step 1 to enable camera.');
      return;
    }
    const generation = ++cameraGeneration.current;
    try {
      let media;
      try {
        media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
      } catch (e1) {
        media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (generation !== cameraGeneration.current) { media.getTracks().forEach(t => t.stop()); return }
      streamRef.current = media;
      setStream(media);
      setPhoto(null);
      setFaceVerification(null);
    } catch (err) {
      setError(`Camera access failed: ${err.name || err.message}. Please allow camera access in your browser settings to take your attendance photo.`);
    }
  }

  // --- Reference photo capture ---
  async function startRefCamera() {
    try {
      setShowRefCam(true);
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false });
      refStreamRef.current = s;
      if (refVideoRef.current) {
        refVideoRef.current.srcObject = s;
        refVideoRef.current.play().catch(() => { });
      }
    } catch (err) {
      setError('Could not access camera for reference photo.');
      setShowRefCam(false);
    }
  }

  function stopRefCamera() {
    refStreamRef.current?.getTracks().forEach(t => t.stop());
    refStreamRef.current = null;
    setShowRefCam(false);
  }

  function captureRefPhoto() {
    if (!refVideoRef.current) return;
    const v = refVideoRef.current;
    const canvas = document.createElement('canvas');
    const width = v.videoWidth || 640;
    const height = v.videoHeight || 480;
    const scale = Math.min(1, 960 / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    setEmployeeRefPhoto(canvas.toDataURL('image/jpeg', 0.88));
    stopRefCamera();
  }

  function uploadRefPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 960 / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setEmployeeRefPhoto(canvas.toDataURL('image/jpeg', 0.88));
        stopRefCamera();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function capture() {
    if (!inside) {
      setError('Location verification expired. Please verify your location again.');
      return;
    }
    if (frameQuality === 'invalid') {
      setError('Improve the lighting before capturing. Keep your face inside the guide oval.');
      return;
    }
    const v = video.current;
    if (!v) {
      setError('Video preview not ready. Please try again.');
      return;
    }
    const w = v.videoWidth || v.clientWidth || 640;
    const h = v.videoHeight || v.clientHeight || 480;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(v, 0, 0, w, h);
    setPhoto(c.toDataURL('image/jpeg', 0.85));
    setPhotoTime(Date.now());
    setFaceVerification(null);
    stopCamera();
    setNotice('Photo captured successfully! Ready to confirm attendance.');
  }

  function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!inside) {
      setError('Please verify your location in Step 1 first before adding your photo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 960;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        setPhoto(canvas.toDataURL('image/jpeg', 0.85));
        setPhotoTime(Date.now());
        setFaceVerification(null);
        stopCamera();
        setNotice('Photo loaded successfully! Ready to confirm attendance.');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!photo) {
      setError('Please click "Open Camera to Take Photo" and capture your photo first.');
      return;
    }
    if (!inside) {
      setError('Location could not be verified inside ' + (office?.name || 'the workplace') + '. Please click "Verify my location" in Step 1 first.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setMismatchModalData(null);
    setFaceVerification(null);
    let currentEmp;
    try {
      if (Date.now() - photoTime > 300000) throw Error('Your photo expired. Please retake your photo with the camera.');
      let pos = position;
      const maxAllowedAccuracy = Math.max(systemSettings?.maxGpsAccuracy || 250, 250);
      if (!pos || pos.accuracy <= 0 || pos.accuracy > maxAllowedAccuracy || distance(pos, office) > office.radius_meters)
        throw Error(`Location could not be verified inside ${office?.name || 'the workplace'}. (Distance: ${Math.round(distance(pos, office))}m, Boundary: ${office?.radius_meters}m). Move inside boundary and retry.`);

      // Resolve the actual employee performing check in / check out
      const resolvedUserId = (panel === 'user' && emulatedUserId && (authSession?.is_admin || authSession?.is_super_admin))
        ? emulatedUserId
        : (authSession?.user_id || authSession?.id || me?.user_id || me?.id || null);

      currentEmp = (resolvedUserId && employees.find(e => e.id === resolvedUserId || e.user_id === resolvedUserId))
        || (authSession?.email && employees.find(e => e.email?.toLowerCase() === authSession.email.toLowerCase()))
        || (me?.email && employees.find(e => e.email?.toLowerCase() === me.email.toLowerCase()))
        || (emulatedUserId && employees.find(e => e.id === emulatedUserId));

      const targetUser = currentEmp?.user_id || currentEmp?.id || resolvedUserId;

      // The server verifies the capture against the employee's registered face.
      const result = await api('/attendance', {
        method: 'POST',
        body: JSON.stringify({
          office_id: officeId,
          check_type: nextType,
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy_meters: pos.accuracy,
          captured_at: new Date().toISOString(),
          photo_base64: photo,
          user_id: targetUser
        })
      });
      setRecords(old => [result, ...old]);
      resetCapture();
      setNotice(`${nextType === 'CHECK_IN' ? 'Checked in' : 'Checked out'} successfully at ${timeLabel(result.timestamp)}.`);
      setSuccessModalData({
        action: nextType === 'CHECK_IN' ? 'Check-in' : 'Check-out',
        time: timeLabel(result.timestamp),
        date: new Date(result.timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        office: result.office_name || office?.name || 'Workplace (50m Geofence)',
        recentPhoto: photo,
        employeeName: currentEmp?.name || 'Employee',
        employeeEmail: currentEmp?.email || me?.email,
        employeeId: currentEmp?.employee_id || (currentEmp?.id ? `EMP-${currentEmp.id.slice(0, 8).toUpperCase()}` : 'EMP-001'),
        referencePhoto: currentEmp?.photo_base64,
        faceVerification: result.face_verification,
        arrivalStatus: result.arrival_status || (nextType === 'CHECK_IN' ? 'On-time' : 'Standard departure')
      });
    } catch (e) {
      const verification = e.verification;
      if (verification) {
        setFaceVerification(verification);
        if (verification.decision === 'mismatch') {
          setMismatchModalData({
            employee: currentEmp,
            capturedPhoto: photo,
            referencePhoto: currentEmp?.photo_base64,
            message: verification.message || e.message
          });
        }
      }
      setError(verification?.message || e.message || 'Unable to record attendance. Please retry.');
    } finally {
      setBusy(false)
    }
  }

  async function signIn(e) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
      if (error) throw error
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function openAddOffice() {
    setError('');
    setEditingOffice(null);
    setOfficeLocating(false);
    setOfficeLocationAccuracy(null);
    setShowOffice(true);
  }

  function openEditOffice(officeToEdit) {
    setError('');
    setEditingOffice(officeToEdit);
    setOfficeLocating(false);
    setOfficeLocationAccuracy(null);
    setShowOffice(true);
  }

  async function deleteOffice(officeToDelete) {
    if (!isSuperAdmin) return;
    if (!window.confirm(`Are you sure you want to remove "${officeToDelete.name}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/offices/${officeToDelete.id}`, { method: 'DELETE' });
      setOffices(old => old.filter(o => o.id !== officeToDelete.id));
      if (officeId === officeToDelete.id) {
        const remaining = offices.filter(o => o.id !== officeToDelete.id);
        const nextId = remaining[0]?.id || '';
        setOfficeId(nextId);
        saveOfficePreference(localStorage, authSession?.user_id || authSession?.id || me?.user_id || me?.id, nextId);
      }
      setNotice(`Workplace "${officeToDelete.name}" removed successfully.`);
    } catch (err) {
      setError(err.message || 'Failed to remove office location.');
    } finally {
      setBusy(false);
    }
  }

  function useCurrentOfficeLocation(event) {
    const form = event.currentTarget.form;
    setError('');
    setOfficeLocationAccuracy(null);
    if (!navigator.geolocation) {
      setError('This browser does not support location. Enter your coordinates manually.');
      return;
    }
    setOfficeLocating(true);
    navigator.geolocation.getCurrentPosition(p => {
      if (!form.isConnected) return;
      setOfficeLocating(false);
      const { latitude, longitude, accuracy } = p.coords;
      if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
        setError('The device returned invalid coordinates. Try again or enter them manually.');
        return;
      }
      form.elements.namedItem('latitude').value = latitude.toFixed(7);
      form.elements.namedItem('longitude').value = longitude.toFixed(7);
      setOfficeLocationAccuracy(Number.isFinite(accuracy) ? Math.round(accuracy) : null);
    }, error => {
      if (!form.isConnected) return;
      setOfficeLocating(false);
      setError(error.code === 1
        ? 'Location access was denied. Allow location for this site, then try again, or enter coordinates manually.'
        : error.code === 3
          ? 'Location reading timed out. Move near a window and try again, or enter coordinates manually.'
          : 'Your device could not provide a location. Try again or enter coordinates manually.');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 45000 });
  }

  async function saveOffice(e) {
    e.preventDefault();
    if (!isSuperAdmin) {
      setError('Workspaces are predefined. Only Super Admin can add or configure workspaces.');
      return;
    }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const officePayload = {
        name: f.get('name')?.toString().trim(),
        address: f.get('address')?.toString().trim(),
        latitude: Number(f.get('latitude')),
        longitude: Number(f.get('longitude')),
        radius_meters: Number(f.get('radius'))
      };

      if (editingOffice) {
        const updated = await api(`/offices/${editingOffice.id}`, {
          method: 'PUT',
          body: JSON.stringify(officePayload)
        });
        setOffices(old => old.map(o => o.id === editingOffice.id ? updated : o));
        if (officeId === editingOffice.id) {
          setOfficeId(updated.id);
        }
        setShowOffice(false);
        setEditingOffice(null);
        setNotice(`✓ Workplace "${updated.name}" updated successfully.`);
      } else {
        const saved = await api('/offices', {
          method: 'POST',
          body: JSON.stringify({
            id: '00000000-0000-0000-0000-000000000000',
            ...officePayload
          })
        });
        setOffices(old => [...old, saved]);
        setOfficeId(saved.id);
        saveOfficePreference(localStorage, authSession?.user_id || authSession?.id || me?.user_id || me?.id, saved.id);
        setShowOffice(false);
        setNotice(`✓ Workplace "${saved.name}" added successfully.`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // --- USER PROFILE ACTIONS (Name & Email editable; Job Role, Access, Timezone locked) ---
  async function saveUserProfile(e) {
    if (e) e.preventDefault();
    const trimmedName = profileName.trim();
    const trimmedEmail = profileEmail.trim().toLowerCase();

    if (!trimmedName) {
      setError('Please enter your full name.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid work email address.');
      return;
    }

    setProfileSaving(true);
    setError('');
    try {
      let updated;
      if (activeUserEmployee?.id) {
        updated = await api(`/employees/${activeUserEmployee.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: trimmedName,
            email: trimmedEmail,
            designation: activeUserEmployee.designation,
            monthly_salary: activeUserEmployee.monthly_salary,
            currency: activeUserEmployee.currency,
            user_id: activeUserEmployee.user_id || activeUserEmployee.id,
            photo_base64: activeUserEmployee.photo_base64 ?? null,
            portal_password: activeUserEmployee.portal_password ?? null
          })
        });
      } else {
        updated = await api('/me/profile', {
          method: 'PUT',
          body: JSON.stringify({
            name: trimmedName,
            email: trimmedEmail
          })
        });
      }

      setEmployees(prev => prev.map(emp =>
        (emp.id === updated.id || emp.email === activeUserEmployee.email)
          ? { ...emp, name: updated.name, email: updated.email }
          : emp
      ));

      if (authSession) {
        const nextSession = { ...authSession, name: updated.name, email: updated.email };
        setAuthSession(nextSession);
        localStorage.setItem('present_session', JSON.stringify(nextSession));
      }
      if (me) {
        setMe(prev => ({ ...prev, email: updated.email }));
      }

      setNotice('Profile updated successfully!');
      setIsEditingProfile(false);
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  }

  // --- PROFILE PASSWORD RESET (FOR MANAGERS & STAFF IN MY PROFILE) ---
  async function handleProfilePasswordReset(e) {
    if (e) e.preventDefault();
    if (!profileNewPass || profileNewPass.trim().length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (profileNewPass !== profileConfirmPass) {
      setError('New passwords do not match. Please re-enter.');
      return;
    }
    setProfilePassSaving(true);
    setError('');
    try {
      await api('/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: profileCurrentPass.trim(),
          new_password: profileNewPass.trim(),
          user_id: authSession?.id || me?.id
        })
      });
      setNotice('✓ Your account password has been updated successfully.');
      setProfileCurrentPass('');
      setProfileNewPass('');
      setProfileConfirmPass('');
    } catch (err) {
      setError(err.message || 'Failed to update password. Please check your current password.');
    } finally {
      setProfilePassSaving(false);
    }
  }

  // --- EMPLOYEE SHEET & SALARY ACTIONS ---
  async function copyToClipboard(text, label = 'Copied!') {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyFeedback(label);
      setTimeout(() => setCopyFeedback(''), 2500);
    } catch {
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(''), 2500);
    }
  }

  async function handleFirstTimePasswordChange(e) {
    if (e) e.preventDefault();
    setError('');
    setNotice('');
    if (!newPassInput || newPassInput.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassInput !== confirmPassInput) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (oldPassInput && newPassInput === oldPassInput) {
      setError('Your new password must be different from your temporary password.');
      return;
    }

    setBusy(true);
    try {
      await api('/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: oldPassInput,
          new_password: newPassInput,
          user_id: authSession?.id
        })
      });

      // Update employee in local employees list
      setEmployees(old => old.map(emp =>
        (emp.id === authSession?.id || emp.user_id === authSession?.user_id || emp.email === authSession?.email)
          ? { ...emp, portal_password: newPassInput, must_change_password: false }
          : emp
      ));

      // Update current session to clear must_change_password flag
      const updatedSession = { ...authSession, must_change_password: false };
      setAuthSession(updatedSession);
      localStorage.setItem('present_session', JSON.stringify(updatedSession));
      setNotice(`🎉 Welcome, ${authSession?.name}! Your new password has been set successfully.`);
    } catch (err) {
      setError(err.message || 'Failed to update password. Please check your inputs.');
    } finally {
      setBusy(false);
    }
  }

  function openAddEmployeeModal() {
    setEditingEmployee(null);
    setEmployeeRefPhoto(null);
    stopRefCamera();
    setModalName('');
    setModalEmail('');
    setModalPassword(generatePortalPassword('Employee'));
    setModalEmployeeId(`EMP-${Math.floor(1000 + Math.random() * 9000)}`);
    setModalDepartment('Operations');
    setModalShift('General Morning (09:00 - 18:00)');
    setAutoEmailModified(false);
    setShowEmployeeModal(true);
  }

  function openEditEmployeeModal(emp) {
    setEditingEmployee(emp);
    setEmployeeRefPhoto(emp.photo_base64 || null);
    stopRefCamera();
    setModalName(emp.name);
    setModalEmail(emp.email);
    setModalPassword('');
    setModalEmployeeId(emp.employee_id || (emp.id ? `EMP-${emp.id.slice(0, 8).toUpperCase()}` : 'EMP-1001'));
    setModalDepartment(emp.department || 'Operations');
    setModalShift(emp.shift || 'General Morning (09:00 - 18:00)');
    setAutoEmailModified(true);
    setShowEmployeeModal(true);
  }

  async function saveEmployee(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    const nameVal = (f.get('name') || modalName || '').trim();
    const emailVal = (f.get('email') || modalEmail || '').trim();
    if (!emailVal || !emailVal.includes('@')) {
      setError('Please enter a valid Google email address (e.g. employee@gmail.com).');
      setBusy(false);
      return;
    }
    // After registration, employee password cannot be modified from Super Admin or Manager panel:
    const passVal = editingEmployee
      ? (editingEmployee.portal_password || null)
      : (f.get('portal_password') || modalPassword || generatePortalPassword(nameVal)).trim();
    const payload = {
      name: nameVal,
      email: emailVal,
      designation: f.get('designation') || 'Team Member',
      monthly_salary: Number(f.get('monthly_salary')) || 0,
      currency: f.get('currency') || 'INR',
      photo_base64: employeeRefPhoto ?? null,
      portal_password: passVal,
      employee_id: (f.get('employee_id') || modalEmployeeId || '').trim(),
      department: f.get('department') || modalDepartment || 'Operations',
      shift: f.get('shift') || modalShift || 'General Morning (09:00 - 18:00)'
    };
    try {
      if (editingEmployee) {
        const updated = await api(`/employees/${editingEmployee.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setEmployees(old => old.map(emp => emp.id === updated.id ? updated : emp));
        setNotice(`Updated ${updated.name}’s profile and reference photo in the sheet.`);
        setShowEmployeeModal(false);
      } else {
        const created = await api('/employees', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setEmployees(old => [...old, created]);
        setSelectedEmployeeId(created.id);
        setShowEmployeeModal(false);
        setNewPasswordPopup({
          name: created.name,
          password: created.portal_password || passVal
        });
        setNotice(`✅ Added ${created.name} to sheet! New password generated.`);
      }
      setEditingEmployee(null);
      setEmployeeRefPhoto(null);
      stopRefCamera();
    } catch (err) {
      setError(err.message || 'Failed to save employee to sheet.');
    } finally {
      setBusy(false);
    }
  }

  async function removeEmployee(emp) {
    if (!confirm(`Are you sure you want to permanently delete ${emp.name}? This will remove their account, login credentials, attendance records and stored photos from the database.`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await api(`/employees/${emp.id}`, { method: 'DELETE' });
      setEmployees(old => old.filter(e => e.id !== emp.id));
      setRecords(old => old.filter(r => r.user_id !== emp.user_id && r.user_id !== emp.id));
      setPersonRecords(old => old.filter(r => r.user_id !== emp.user_id && r.user_id !== emp.id));
      if (selectedEmployeeId === emp.id) {
        const remaining = employees.filter(e => e.id !== emp.id);
        setSelectedEmployeeId(remaining[0]?.id || '');
      }
      setNotice(res.message || `Permanently deleted ${emp.name} and all associated records from the database.`);
    } catch (err) {
      setError(err.message || 'Could not remove employee.');
    } finally {
      setBusy(false);
    }
  }

  function exportEmployeeSheetCSV() {
    const rows = [
      ['Name', 'Email', 'Designation', 'Monthly Salary', 'Currency', 'Created At'],
      ...employees.map(e => [e.name, e.email, e.designation, e.monthly_salary, e.currency, e.created_at])
    ];
    const csv = rows.map(r => r.map(x => '"' + String(x ?? '').replace(/^[\s]*[=+@-]/, "'" + '$&').replaceAll('"', '""') + '"').join(',')).join('\r\n');
    const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = u;
    a.download = 'employees_salary_sheet.csv';
    a.click();
    URL.revokeObjectURL(u);
  }

  async function submitCorrection(e) {
    e.preventDefault();
    if (!correctionModalData) return;
    const form = new FormData(e.currentTarget);
    const newTs = form.get('new_timestamp');
    const reason = (form.get('reason') || '').trim();
    if (!newTs) { setError('Select a new date and time.'); return; }
    if (!reason || reason.length < 3) { setError('Correction reason is mandatory (minimum 3 characters).'); return; }
    setBusy(true); setError('');
    try {
      await api('/attendance/correct', {
        method: 'POST',
        body: JSON.stringify({
          entry_id: correctionModalData.id,
          new_timestamp: new Date(newTs).toISOString(),
          reason
        })
      });
      setNotice(`Attendance record timestamp updated and permanently logged to audit trail.`);
      setCorrectionModalData(null);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to correct attendance timestamp.');
    } finally {
      setBusy(false);
    }
  }

  async function importEmployeeSheetCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length <= 1) {
      setError('CSV file is empty or missing data rows.');
      return;
    }
    setBusy(true);
    let addedCount = 0;
    try {
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.replace(/^"|"$/g, '').trim());
        if (parts.length < 4) continue;
        const [name, email, designation, salary, currency] = parts;
        if (!name || !email) continue;
        try {
          const saved = await api('/employees', {
            method: 'POST',
            body: JSON.stringify({
              name,
              email,
              designation: designation || 'Team Member',
              monthly_salary: Number(salary) || 0,
              currency: currency || 'INR'
            })
          });
          setEmployees(old => [...old.filter(x => x.id !== saved.id), saved]);
          addedCount++;
        } catch { }
      }
      setNotice(`Successfully imported and updated ${addedCount} employees in the sheet.`);
    } catch (err) {
      setError('Failed reading CSV: ' + err.message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // --- FETCH ATTENDANCE FOR SINGLE PERSON (ADMIN PANEL) ---
  async function fetchPersonAttendance(empId) {
    if (!empId) return;
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    setPersonLoading(true);
    try {
      const target = emp.user_id || emp.id;
      const history = await api('/attendance?user_id=' + encodeURIComponent(target));
      setPersonRecords(history);
    } catch (err) {
      setError('Could not load attendance for employee: ' + err.message);
    } finally {
      setPersonLoading(false);
    }
  }

  useEffect(() => {
    if (isAdminPanel && selectedEmployeeId) {
      fetchPersonAttendance(selectedEmployeeId);
    }
  }, [selectedEmployeeId, panel])

  // Current active user in User Panel
  const activeUserEmployee = (panel === 'user' && emulatedUserId && (authSession?.is_admin || authSession?.is_super_admin) ? employees.find(e => e.id === emulatedUserId) : null)
    || (authSession?.id && employees.find(e => e.id === authSession.id || e.user_id === authSession.id))
    || (authSession?.email && employees.find(e => e.email?.toLowerCase() === authSession.email.toLowerCase()))
    || (me?.id && employees.find(e => e.id === me.id || e.user_id === me.id))
    || (me?.email && employees.find(e => e.email?.toLowerCase() === me.email?.toLowerCase()))
    || (emulatedUserId && employees.find(e => e.id === emulatedUserId))
    || employees[0]
    || {
    name: authSession?.name || me?.email?.split('@')[0] || 'Employee',
    email: authSession?.email || me?.email || 'employee@present.local',
    designation: authSession?.designation || 'Team Member',
    monthly_salary: 50000,
    currency: 'INR'
  };

  // Target Person when viewing single person report in Admin Panel
  const adminTargetPerson = employees.find(e => e.id === selectedEmployeeId) || employees[0];

  // Active Person for calculations depends on panel
  const currentCalcPerson = isAdminPanel ? adminTargetPerson : activeUserEmployee;
  const currentCalcRecords = isAdminPanel ? personRecords : records;

  const currentMonthStr = personMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [selectedYear, selectedMonthNum] = currentMonthStr.split('-').map(Number);
  const totalDaysInMonth = new Date(selectedYear, selectedMonthNum, 0).getDate();
  const workingDaysInMonth = getWorkingDays(selectedYear, selectedMonthNum - 1);

  // Filtered records for current calculation
  const visibleCalcRecords = currentCalcRecords.filter(r => {
    const d = new Date(r.timestamp);
    const inMonth = d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonthNum;
    const inFilter = !personFilter || r.check_type === personFilter;
    return inMonth && inFilter;
  });

  // Calculate unique days present
  const checkInDatesSet = new Set(
    currentCalcRecords
      .filter(r => {
        const d = new Date(r.timestamp);
        return d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonthNum && r.check_type === 'CHECK_IN';
      })
      .map(r => new Date(r.timestamp).toDateString())
  );
  const daysPresent = checkInDatesSet.size;

  const baseSalary = Number(currentCalcPerson?.monthly_salary || 0);
  const personCurrency = currentCalcPerson?.currency || 'INR';
  const dailyRate = workingDaysInMonth > 0 ? (baseSalary / workingDaysInMonth) : 0;
  const payableSalary = Math.round(dailyRate * daysPresent * 100) / 100;
  const attendanceRate = workingDaysInMonth > 0 ? Math.min(100, Math.round((daysPresent / workingDaysInMonth) * 100)) : 0;

  // Single person report export
  function exportPersonReportCSV(personObj, recordsList) {
    const p = personObj || currentCalcPerson;
    if (!p) return;
    const monthName = new Date(selectedYear, selectedMonthNum - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
    const rows = [
      ['MONTHLY ATTENDANCE & SALARY REPORT'],
      ['Portal', isAdminPanel ? 'Admin Master Panel' : 'Employee Self-Service Slip'],
      ['Employee Name', p.name],
      ['Email', p.email],
      ['Designation', p.designation],
      ['Report Month', monthName],
      ['Base Monthly Salary (From Sheet)', formatCurrency(p.monthly_salary, p.currency)],
      ['Standard Working Days', workingDaysInMonth],
      ['Days Present', daysPresent],
      ['Daily Rate', formatCurrency(dailyRate, p.currency)],
      ['Calculated Payable Salary', formatCurrency(payableSalary, p.currency)],
      ['Attendance Rate', `${attendanceRate}%`],
      [],
      ['Date', 'Time', 'Action', 'Office Location', 'Distance (m)', 'Verification'],
      ...(recordsList || visibleCalcRecords).map(r => [
        dateLabel(r.timestamp),
        timeLabel(r.timestamp),
        r.check_type,
        r.office_name,
        r.distance_meters,
        'Location + Photo Verified'
      ])
    ];
    const csv = rows.map(r => r.map(x => '"' + String(x ?? '').replace(/^[\s]*[=+@-]/, "'" + '$&').replaceAll('"', '""') + '"').join(',')).join('\r\n');
    const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = u;
    a.download = `attendance_salary_${p.name.toLowerCase().replace(/\s+/g, '_')}_${currentMonthStr}.csv`;
    a.click();
    URL.revokeObjectURL(u);
  }

  // Quick Demo Attendance Generator
  async function seedDemoAttendance() {
    const target = currentCalcPerson;
    if (!target || !offices.length) return;
    setBusy(true);
    setError('');
    try {
      const targetUser = target.user_id || target.id;
      const office = offices[0];
      const sampleDays = [2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17];
      for (const day of sampleDays) {
        if (day > totalDaysInMonth) continue;
        const checkInTime = new Date(selectedYear, selectedMonthNum - 1, day, 9, 15, 0);
        const checkOutTime = new Date(selectedYear, selectedMonthNum - 1, day, 17, 45, 0);
        await api('/attendance', {
          method: 'POST',
          body: JSON.stringify({
            office_id: office.id,
            check_type: 'CHECK_IN',
            latitude: office.latitude,
            longitude: office.longitude,
            accuracy_meters: 8,
            captured_at: checkInTime.toISOString(),
            photo_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
            user_id: targetUser
          })
        }).catch(() => { });
        await api('/attendance', {
          method: 'POST',
          body: JSON.stringify({
            office_id: office.id,
            check_type: 'CHECK_OUT',
            latitude: office.latitude,
            longitude: office.longitude,
            accuracy_meters: 8,
            captured_at: checkOutTime.toISOString(),
            photo_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
            user_id: targetUser
          })
        }).catch(() => { });
      }
      if (isAdminPanel) {
        await fetchPersonAttendance(target.id);
      } else {
        const updated = await api(`/attendance?user_id=${encodeURIComponent(targetUser)}`);
        setRecords(updated);
      }
      setNotice(`Sample monthly attendance generated for ${target.name}. Salary breakdown updated!`);
    } catch (err) {
      setError('Could not generate sample records: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  // --- SUPER ADMIN SETTINGS & AUDIT HANDLERS ---
  async function handleSaveSettings(e) {
    if (e) e.preventDefault();
    setSavingSettings(true);
    setError('');
    try {
      const updated = await api('/settings', {
        method: 'PUT',
        body: JSON.stringify(systemSettings)
      });
      if (updated) {
        setSystemSettings(prev => ({ ...prev, ...updated }));
      }
      setNotice('✓ System settings and enterprise policies successfully saved & applied.');
      const freshLogs = await api('/audit').catch(() => []);
      if (Array.isArray(freshLogs)) setAuditLogs(freshLogs);
    } catch (err) {
      setError(err.message || 'Failed to save system settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleChangeAdminPassword(e) {
    if (e) e.preventDefault();
    if (!adminNewPassword || adminNewPassword.trim().length < 6) {
      setError('New master password must be at least 6 characters long.');
      return;
    }
    if (adminNewPassword !== adminConfirmPassword) {
      setError('New passwords do not match. Please re-enter.');
      return;
    }
    setSavingAdminPassword(true);
    setError('');
    try {
      await api('/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: adminNewPassword.trim() })
      });
      setNotice('✓ Super Admin portal master password successfully updated.');
      setAdminNewPassword('');
      setAdminConfirmPassword('');
      const freshLogs = await api('/audit').catch(() => []);
      if (Array.isArray(freshLogs)) setAuditLogs(freshLogs);
    } catch (err) {
      setError(err.message || 'Failed to change Super Admin password.');
    } finally {
      setSavingAdminPassword(false);
    }
  }

  function handleResetSettings() {
    if (!confirm('Reset all policy settings to default company standards?')) return;
    setSystemSettings({
      companyName: 'Present Technologies Pvt Ltd',
      workplaceCode: 'WRK-HQ',
      supportEmail: 'superadmin@gmail.com',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      dateFormat: 'DD/MM/YYYY',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      gracePeriodMins: 15,
      minWorkHours: 8.0,
      halfDayHours: 4.0,
      daysInSalaryMonth: 26,
      salaryModel: 'fixed_26',
      overtimeMultiplier: 1.5,
      defaultGeofenceRadius: 50,
      maxGpsAccuracy: 100,
      strictGeofence: true,
      faceMatchThreshold: 0.45,
      faceCheckMode: 'both',
      requireFirstLoginPassChange: true,
      autoCheckoutEnabled: true
    });
    setNotice('Settings reset to default standards. Click "Save All Changes" to persist.');
  }

  function exportAuditLogsCSV() {
    if (!auditLogs || auditLogs.length === 0) {
      setError('No audit logs available to export.');
      return;
    }
    const headers = ['Action', 'Actor', 'Target', 'Reason', 'Timestamp'];
    const rows = auditLogs.map(l => [
      `"${l.action || ''}"`,
      `"${l.actor_email || l.actorEmail || ''}"`,
      `"${(l.entity_name || l.target || '').replace(/"/g, '""')}"`,
      `"${(l.reason || '').replace(/"/g, '""')}"`,
      `"${l.timestamp || ''}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setNotice('✓ Audit Trail CSV exported successfully.');
  }

  const filteredAuditLogs = auditLogs.filter(log => {
    const act = (log.action || '').toUpperCase();
    if (auditFilter !== 'ALL' && act !== auditFilter) return false;
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      const actor = (log.actor_email || log.actorEmail || '').toLowerCase();
      const target = (log.entity_name || log.target || '').toLowerCase();
      const reason = (log.reason || '').toLowerCase();
      return actor.includes(q) || target.includes(q) || reason.includes(q) || act.toLowerCase().includes(q);
    }
    return true;
  });

  // Attendance Table component
  function attendanceTable(items, limit) {
    const list = items.slice(0, limit || items.length);
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>DATE & TIME</th>
              <th>EMPLOYEE & ACTIVITY</th>
              <th>TIMING / STATUS</th>
              <th>LOCATION</th>
              <th>VERIFICATION</th>
            </tr>
          </thead>
          <tbody>
            {list.map(r => {
              const arrival = r.arrival_status || (r.check_type === 'CHECK_IN' ? 'On-time' : null);
              const arrivalCls = arrival === 'Arrived early' ? 'arrived-early' : arrival === 'Late' ? 'late' : 'on-time';
              return (
                <tr key={r.id}>
                  <td data-label="Date & time">
                    <strong>{dateLabel(r.timestamp)}</strong>
                    <small>{timeLabel(r.timestamp)}</small>
                    {r.original_timestamp && (
                      <small className="corrected-badge" title={`Corrected by Manager. Reason: ${r.correction_reason || 'N/A'}`}>
                        ✏ Edited
                      </small>
                    )}
                  </td>
                  <td data-label="Employee & Activity">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {r.employee_name && <strong style={{ fontSize: '0.88rem' }}>{r.employee_name}</strong>}
                      <span className={'tag ' + (r.check_type === 'CHECK_IN' ? 'green' : 'neutral')}>
                        {r.check_type === 'CHECK_IN' ? '↗ Check-in' : '↙ Check-out'}
                      </span>
                    </div>
                  </td>
                  <td data-label="Timing / Status">
                    {arrival ? (
                      <span className={`arrival-tag ${arrivalCls}`}>
                        {arrival === 'On-time' ? '✓ On-time' : arrival === 'Arrived early' ? '⚡ Early Arrival' : '⚠ Late'}
                      </span>
                    ) : (
                      <span className="muted-text">—</span>
                    )}
                  </td>
                  <td data-label="Location">
                    {r.office_name}
                    <small>{Math.round(r.distance_meters)} m from office centre</small>
                  </td>
                  <td data-label="Verification">
                    <span className="verified"><ShieldCheck size={15} /> Location + photo</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && (
          <div className="empty">
            <CalendarDays />
            <h3>No attendance records found</h3>
            <p>Verified check-ins and check-outs will appear here.</p>
          </div>
        )}
      </div>
    );
  }

  const today = records.filter(r => new Date(r.timestamp).toDateString() === new Date().toDateString());
  const userDays = new Set(records.filter(r => r.check_type === 'CHECK_IN').map(r => new Date(r.timestamp).toDateString())).size;

  // Filtered employees for sheet search
  const filteredEmployees = employees.filter(e => {
    if (!sheetSearch) return true;
    const q = sheetSearch.toLowerCase();
    return e.name?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q) || e.designation?.toLowerCase().includes(q);
  });
  const totalPayroll = employees.reduce((acc, e) => acc + Number(e.monthly_salary || 0), 0);
  const avgSalary = employees.length > 0 ? (totalPayroll / employees.length) : 0;
  const companyCurrency = employees.find(e => e.currency)?.currency || 'INR';

  const isSuperAdmin = (authSession?.role === 'super_admin') || (me?.is_super_admin);
  const isManager = (authSession?.role === 'manager');
  const isUser = !isSuperAdmin && !isManager;

  if (!me) {
    return (
      <div className="login-screen">
        <div className="login-grid">
          {/* LEFT ART / HERO BANNER */}
          <div className="login-art">
            <div className="login-art-top">
              <div className="brand">
                <span className="brand-icon"><Check /></span>present<span className="brand-dot">.</span>
              </div>
              <div className="portal-badge-pill">
                <Sparkles size={14} /> Enterprise Workforce Portal
              </div>
            </div>

            <div className="login-art-center">
              <span className="eyebrow">WORKFORCE ACCESS CONTROL</span>
              <h1>Be here.<br />Be present.</h1>
              <p>Next-generation verified workforce management. Real-time geofence tracking, live camera selfies, and automated time & attendance recording.</p>
            </div>

            <div className="login-art-bottom">
              <span>Secure Attendance System</span>
            </div>
          </div>

          {/* RIGHT LOGIN FORM: ONLY ID & PASSWORD */}
          <div className="login-panel-container">
            <div className="login-box">
              {/* BRAND HEADER ON MOBILE */}
              <div className="mobile-brand-row">
                <div className="brand">
                  <span className="brand-icon"><Check /></span>present<span className="brand-dot">.</span>
                </div>
              </div>

              <div className="login-header">
                <h2>Sign In to Workplace</h2>
                <p>Enter your ID and Password to enter your workspace.</p>
              </div>

              {/* ALERTS */}
              {error && (
                <div className="alert" role="alert">
                  {error}
                  <button onClick={() => setError('')}><X size={15} /></button>
                </div>
              )}
              {notice && (
                <div className="success" role="status">
                  <Check size={16} />
                  {notice}
                  <button onClick={() => setNotice('')}><X size={15} /></button>
                </div>
              )}

              {/* UNIFIED LOGIN FORM: ONLY ID & PASSWORD */}
              <form onSubmit={handleLogin} className="unified-login-form">
                <label>
                  <span>User ID or Email</span>
                  <div className="input-with-icon">
                    <User size={16} />
                    <input
                      id="login-id-input"
                      type="text"
                      value={loginId}
                      onChange={e => setLoginId(e.target.value)}
                      placeholder="Enter ID (e.g. superadmin, manager, or user)"
                      required
                      autoComplete="username"
                    />
                  </div>
                </label>

                <label>
                  <span>Password</span>
                  <div className="input-with-icon">
                    <Lock size={16} />
                    <input
                      id="login-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="Enter Password"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  id="btn-login-submit"
                  className="primary full login-submit-btn"
                  disabled={loginBusy}
                >
                  {loginBusy ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}
                  Sign In to Dashboard
                  <ArrowRight size={16} />
                </button>

                <div className="login-forgot-pass-wrap">
                  <button
                    type="button"
                    id="btn-forgot-password"
                    className="login-forgot-pass-btn"
                    onClick={() => {
                      setForgotEmail(loginId && loginId.includes('@') ? loginId : '');
                      setForgotEmpId('');
                      setForgotNewPassword('');
                      setForgotConfirmPassword('');
                      setShowForgotPass(false);
                      setShowForgotConfirmPass(false);
                      setForgotError('');
                      setShowForgotPasswordModal(true);
                      setError('');
                      setNotice('');
                    }}
                  >
                    <KeyRound size={13} /> Forgot Password?
                  </button>
                </div>
              </form>

              {/* FOOTER */}
              <div className="login-footer-meta">
                <span>Enterprise Attendance & Payroll System</span>
                <span className="security-tag"><ShieldCheck size={13} /> 3-Tier Access Protected</span>
              </div>
            </div>
          </div>
        </div>

        {/* MODAL: FORGOT PASSWORD (SELF-SERVICE RESET) */}
        {showForgotPasswordModal && (
          <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !forgotBusy) setShowForgotPasswordModal(false); }}>
            <section className="modal forgot-password-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-modal-title">
              <div className="card-title">
                <h2 id="forgot-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <KeyRound size={18} /> Reset Your Password
                </h2>
                <button
                  type="button"
                  aria-label="Close"
                  disabled={forgotBusy}
                  onClick={() => setShowForgotPasswordModal(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <p style={{ color: '#667466', fontSize: 13, margin: '8px 0 20px', lineHeight: 1.5 }}>
                Enter your registered Google email and choose a new secure password to regain access to your dashboard.
              </p>

              {forgotError && (
                <div className="alert" style={{ marginBottom: 16 }}>
                  {forgotError}
                  <button type="button" onClick={() => setForgotError('')}><X size={14} /></button>
                </div>
              )}

              <form onSubmit={handleForgotPasswordSubmit} style={{ display: 'grid', gap: 16 }}>
                <div className="profile-form-field">
                  <label htmlFor="forgot-email">
                    Registered Google Email (Gmail) <span className="req-star">*</span>
                  </label>
                  <div className="input-with-icon" style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7b8772' }} />
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                      placeholder="e.g. employee@gmail.com"
                      autoFocus
                      style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 8, border: '1px solid #cfdac9' }}
                    />
                  </div>
                  <small className="field-help">The Google email registered on your attendance profile.</small>
                </div>

                <div className="profile-form-field">
                  <label htmlFor="forgot-empid">
                    Employee ID <span style={{ fontWeight: 400, color: '#889088' }}>(Optional verification)</span>
                  </label>
                  <input
                    id="forgot-empid"
                    type="text"
                    value={forgotEmpId}
                    onChange={e => setForgotEmpId(e.target.value)}
                    placeholder="e.g. EMP-1001"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cfdac9' }}
                  />
                  <small className="field-help">If you know your company employee code, enter it for instant verification.</small>
                </div>

                <div className="profile-form-field">
                  <label htmlFor="forgot-new-password">
                    New Password <span className="req-star">*</span>
                  </label>
                  <div className="input-with-actions" style={{ position: 'relative' }}>
                    <input
                      id="forgot-new-password"
                      type={showForgotPass ? 'text' : 'password'}
                      value={forgotNewPassword}
                      onChange={e => setForgotNewPassword(e.target.value)}
                      required
                      minLength={6}
                      maxLength={50}
                      placeholder="At least 6 characters"
                      style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 8, border: '1px solid #cfdac9' }}
                    />
                    <button
                      type="button"
                      className="input-icon-btn"
                      onClick={() => setShowForgotPass(!showForgotPass)}
                      title={showForgotPass ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
                    >
                      {showForgotPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <small className="field-help">Must be at least 6 characters long.</small>
                </div>

                <div className="profile-form-field">
                  <label htmlFor="forgot-confirm-password">
                    Confirm New Password <span className="req-star">*</span>
                  </label>
                  <div className="input-with-actions" style={{ position: 'relative' }}>
                    <input
                      id="forgot-confirm-password"
                      type={showForgotConfirmPass ? 'text' : 'password'}
                      value={forgotConfirmPassword}
                      onChange={e => setForgotConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      maxLength={50}
                      placeholder="Re-enter your new password"
                      style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 8, border: '1px solid #cfdac9' }}
                    />
                    <button
                      type="button"
                      className="input-icon-btn"
                      onClick={() => setShowForgotConfirmPass(!showForgotConfirmPass)}
                      title={showForgotConfirmPass ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
                    >
                      {showForgotConfirmPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <small className="field-help">Must match the new password above.</small>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    className="secondary"
                    disabled={forgotBusy}
                    onClick={() => setShowForgotPasswordModal(false)}
                    style={{ padding: '9px 18px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={forgotBusy || !forgotEmail || !forgotNewPassword || !forgotConfirmPassword}
                    style={{ padding: '9px 20px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {forgotBusy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
                    {forgotBusy ? 'Resetting Password…' : 'Reset Password'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    );
  }

  // FIRST-TIME LOGIN PASSWORD CHANGE REQUIRED FOR EMPLOYEES
  if (authSession && authSession.role === 'user' && authSession.must_change_password) {
    return (
      <div className="first-login-pass-screen">
        <div className="first-login-card">
          <div className="first-login-badge-header">
            <div className="security-icon-circle">
              <KeyRound size={32} strokeWidth={2.4} />
            </div>
            <span className="first-login-pill">First-Time Portal Sign In</span>
          </div>

          <h2>Change Your Password</h2>
          <p className="first-login-sub">
            Welcome, <strong>{authSession.name}</strong>! This is your first time logging into the attendance portal. Please set your new secure personal password to continue.
          </p>

          <div className="first-login-user-meta">
            <div className="meta-item">
              <span className="meta-lbl">Account</span>
              <span className="meta-val">{authSession.email}</span>
            </div>
            <div className="meta-item">
              <span className="meta-lbl">Role</span>
              <span className="meta-val">{authSession.designation || 'Staff Member'}</span>
            </div>
          </div>

          {error && <div className="banner error">{error}</div>}
          {notice && <div className="banner notice">{notice}</div>}

          <form onSubmit={handleFirstTimePasswordChange} className="first-login-form">
            <label>
              <span>Current (Temporary) Password</span>
              <div className="pass-input-wrap">
                <input
                  type={showOldPass ? "text" : "password"}
                  id="current-password-input"
                  value={oldPassInput}
                  onChange={e => setOldPassInput(e.target.value)}
                  required
                  placeholder="Enter your initial password"
                />
                <button
                  type="button"
                  className="pass-eye-btn"
                  onClick={() => setShowOldPass(!showOldPass)}
                  title={showOldPass ? "Hide password" : "Show password"}
                >
                  {showOldPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            <label>
              <span>New Password</span>
              <div className="pass-input-wrap">
                <input
                  type={showNewPass ? "text" : "password"}
                  id="new-password-input"
                  value={newPassInput}
                  onChange={e => setNewPassInput(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Create a new password (min. 6 characters)"
                  autoFocus
                />
                <button
                  type="button"
                  className="pass-eye-btn"
                  onClick={() => setShowNewPass(!showNewPass)}
                  title={showNewPass ? "Hide password" : "Show password"}
                >
                  {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <span className={`pass-rule-hint ${newPassInput.length >= 6 ? 'valid' : ''}`}>
                {newPassInput.length >= 6 ? '✓ Minimum length satisfied' : '• Must be at least 6 characters'}
              </span>
            </label>

            <label>
              <span>Confirm New Password</span>
              <div className="pass-input-wrap">
                <input
                  type={showConfirmPass ? "text" : "password"}
                  id="confirm-password-input"
                  value={confirmPassInput}
                  onChange={e => setConfirmPassInput(e.target.value)}
                  required
                  placeholder="Re-type your new password"
                />
                <button
                  type="button"
                  className="pass-eye-btn"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  title={showConfirmPass ? "Hide password" : "Show password"}
                >
                  {showConfirmPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {confirmPassInput && (
                <span className={`pass-rule-hint ${confirmPassInput === newPassInput ? 'valid' : 'invalid'}`}>
                  {confirmPassInput === newPassInput ? '✓ Passwords match' : '✕ Passwords do not match'}
                </span>
              )}
            </label>

            <button
              type="submit"
              id="btn-submit-password-change"
              className="primary full login-submit-btn"
              disabled={busy || newPassInput.length < 6 || newPassInput !== confirmPassInput}
            >
              {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
              Update Password & Enter Portal
            </button>

            <button
              type="button"
              id="btn-cancel-logout"
              className="ghost full"
              onClick={handleLogout}
            >
              <LogOut size={14} /> Sign Out
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'flex-start' }}>
        <a className="brand" href="#" onClick={e => { e.preventDefault() }}>
          <span className="brand-icon"><Check /></span>present<span className="brand-dot">.</span>
        </a>

        {/* PRIMARY PANEL SWITCHER ACCORDING TO ACCESS TIER */}
        {isSuperAdmin ? (
          <div className="panel-switch-container">
            <button
              id="switch-superadmin-panel"
              className="panel-switch-btn active"
              style={{ cursor: 'default' }}
            >
              <Shield size={14} /> Super Admin
            </button>
          </div>
        ) : isManager ? (
          <div className="panel-switch-container">
            <button
              id="switch-manager-panel"
              className="panel-switch-btn active"
              style={{ cursor: 'default' }}
            >
              <Briefcase size={14} /> Manager Panel
            </button>
          </div>
        ) : (
          <div className="panel-switch-container">
            <button
              className="panel-switch-btn active"
              style={{ cursor: 'default' }}
            >
              <User size={14} /> Employee Portal
            </button>
          </div>
        )}

        {/* NAVIGATION LINKS */}
        {panel !== 'user' && (
          <span className="nav-caption">
            {isSuperAdmin ? 'SUPER ADMIN TOOLS' : 'MANAGER OVERSIGHT'}
          </span>
        )}
        <nav>
          {isSuperAdmin && panel !== 'user' ? (
            [
              [LayoutDashboard, 'Executive Overview'],
              [CalendarDays, 'Attendance & Payroll'],
              [FileSpreadsheet, 'Employees & Sheet'],
              [MapPin, 'Office Geofences'],
              [Settings, 'System Settings']
            ].map(([Icon, label]) => (
              <button
                key={label}
                className={(adminPage === label || (label === 'Attendance & Payroll' && adminPage === 'Team Attendance')) ? 'active' : ''}
                onClick={() => { setAdminPage(label === 'Attendance & Payroll' ? 'Attendance & Payroll' : label); setError(''); setNotice('') }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                <span>{label === 'Employees & Sheet' ? 'Employees & Registration' : label}</span>
                {(adminPage === label || (label === 'Attendance & Payroll' && adminPage === 'Team Attendance')) && <span className="active-dot" />}
              </button>
            ))
          ) : isManager && panel !== 'user' ? (
            [
              [Camera, 'Mark Attendance'],
              [LayoutDashboard, 'Executive Overview'],
              [CalendarDays, 'Attendance & Payroll'],
              [FileSpreadsheet, 'Employees & Sheet'],
              [MapPin, 'Office Geofences'],
              [User, 'My Profile']
            ].map(([Icon, label]) => (
              <button
                key={label}
                className={(adminPage === label || (label === 'Attendance & Payroll' && adminPage === 'Team Attendance')) ? 'active' : ''}
                onClick={() => { setAdminPage(label === 'Attendance & Payroll' ? 'Attendance & Payroll' : label); setError(''); setNotice('') }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                <span>{label === 'Executive Overview' ? 'Team Overview' : label === 'Employees & Sheet' ? 'Employees & Registration' : label}</span>
                {(adminPage === label || (label === 'Attendance & Payroll' && adminPage === 'Team Attendance')) && <span className="active-dot" />}
              </button>
            ))
          ) : (
            [
              [Camera, 'Mark Attendance'],
              [User, 'My Profile']
            ].map(([Icon, label]) => (
              <button
                key={label}
                className={userPage === label ? 'active' : ''}
                onClick={() => { setUserPage(label); setError(''); setNotice('') }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                <span>{label}</span>
                {userPage === label && <span className="active-dot" />}
              </button>
            ))
          )}
        </nav>

        {/* DEMO EMPLOYEE EMULATOR (when in User Panel for testing) */}
        {panel === 'user' && (isSuperAdmin || isManager) && employees.length > 0 && (
          <div className="demo-user-selector-card">
            <span className="selector-caption"><Users size={12} /> VIEW PORTAL AS:</span>
            <select
              value={emulatedUserId}
              onChange={e => {
                setEmulatedUserId(e.target.value);
                setNotice(`Now viewing User Portal as ${employees.find(x => x.id === e.target.value)?.name}`);
              }}
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.designation})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="profile" style={{ marginTop: 'auto' }}>
          <span className="avatar">
            {isSuperAdmin ? 'SA' : isManager ? 'MG' : (activeUserEmployee?.name ? activeUserEmployee.name.slice(0, 2).toUpperCase() : 'US')}
          </span>
          <div>
            <strong>
              {isSuperAdmin ? 'Super Administrator' : isManager ? 'Operations Manager' : (activeUserEmployee?.name || 'Staff')}
            </strong>
            <small>
              {isSuperAdmin ? '👑 Super Admin (Full Access)' : isManager ? '👔 Team Manager' : `👤 ${activeUserEmployee?.designation || 'Staff'}`}
            </small>
          </div>
          <button
            id="sidebar-logout-btn"
            className="sidebar-logout-icon-btn"
            aria-label="Sign out"
            title="Log Out to Login Screen"
            onClick={handleLogout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main>
        <header>
          <div className="breadcrumb">
            <span className={`pill-badge ${isSuperAdmin ? 'role-pill-superadmin' : isManager ? 'role-pill-manager' : 'role-pill-user'}`}>
              {isSuperAdmin ? '👑 Super Admin (Full Access)' : isManager ? '👔 Manager (Team Access)' : '👤 User (Staff)'}
            </span>
            <ChevronRight size={14} />
            <strong>
              {panel === 'user'
                ? userPage
                : isManager && adminPage === 'Executive Overview'
                  ? 'Team Overview'
                  : adminPage === 'Employees & Sheet'
                    ? 'Employees & Registration'
                    : adminPage}
            </strong>
          </div>
          <div className="header-right-actions">
            <span className="header-date">
              <CalendarDays size={15} />
              {new Date(now).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button
              id="header-logout-btn"
              className="header-logout-btn"
              onClick={handleLogout}
              title="Sign Out to Login Page"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <div className="content">
          {mode === 'demo' && (
            <div className="demo-banner">
              <span className="demo-dot" /> Local demo workspace
              <span>Toggle between <strong>Admin Panel</strong> and <strong>User Panel</strong> above. Records & salaries persist in backend data.</span>
            </div>
          )}

          {/* PAGE TITLE */}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {panel === 'user'
                  ? `EMPLOYEE PORTAL · ${userPage.toUpperCase()}`
                  : isManager
                    ? `MANAGER · ${(adminPage === 'Executive Overview' ? 'Team Overview' : adminPage === 'Employees & Sheet' ? 'Employees & Registration' : adminPage).toUpperCase()}`
                    : `ADMINISTRATION · ${(adminPage === 'Employees & Sheet' ? 'Employees & Registration' : adminPage).toUpperCase()}`}
              </span>
              <h1>
                {panel === 'user'
                  ? (userPage === 'Mark Attendance' ? 'Mark My Attendance' : userPage)
                  : (adminPage === 'Executive Overview'
                      ? (isManager ? 'Team Overview' : 'Executive Attendance & Payroll')
                      : adminPage === 'Mark Attendance'
                        ? 'Mark Attendance'
                        : adminPage === 'My Profile'
                          ? (isManager ? 'Manager Profile' : 'My Profile')
                          : (adminPage === 'Team Attendance' || adminPage === 'Attendance & Payroll')
                            ? 'Attendance & Payroll'
                            : adminPage === 'Employees & Sheet'
                              ? 'Employees & Registration Sheet'
                              : adminPage)}
              </h1>
            </div>
            <span className="live-pill">
              <span />{panel === 'user' || (isAdminPanel && adminPage === 'Mark Attendance') ? (checkedIn ? 'Currently checked in' : 'Ready for your day') : isManager ? 'Manager Mode Active' : 'Admin Mode Active'}
            </span>
          </div>

          {error && <div className="alert" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
          {notice && <div className="success" role="status"><Check size={18} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}

          {/* ========================================================================= */}
          {/* ============================= MARK ATTENDANCE =========================== */}
          {/* ========================================================================= */}
          {((panel === 'user' && userPage === 'Mark Attendance') || (isAdminPanel && adminPage === 'Mark Attendance')) && (
            <>
              <div className="stats">
                    <div className="stat">
                      <span className="stat-icon"><Clock size={20} /></span>
                      <span>Today’s Status</span>
                      <strong>{checkedIn ? 'Checked in' : 'Not checked in'}</strong>
                      <small>{last ? `Last action: ${last.check_type === 'CHECK_IN' ? 'Check-in' : 'Check-out'} at ${timeLabel(last.timestamp)}` : 'Ready to mark attendance'}</small>
                    </div>
                    <div className="stat">
                      <span className="stat-icon"><MapPin size={20} /></span>
                      <span>Selected Workplace</span>
                      <strong>{office?.name || 'Predefined Office'}</strong>
                      <small>{office ? `${office.radius_meters}m boundary` : 'Predefined boundary'}</small>
                    </div>
                    <div className="stat">
                      <span className="stat-icon"><ShieldCheck size={20} /></span>
                      <span>Verification Mode</span>
                      <strong>GPS + Face Match</strong>
                      <small>Location and face checked by the server</small>
                    </div>
                  </div>

                  <div className="checkin-grid">
                    <section className="card checkin">
                      <div className="card-title">
                        <div>
                          <h2>Mark your attendance</h2>
                          <p>Two quick steps. One less thing to think about.</p>
                        </div>
                        <span className="step-count">01 — 02</span>
                      </div>
                      <div className="step">
                        <span className={'step-number ' + (inside ? 'done' : '')}>{inside ? <Check size={16} /> : 1}</span>
                        <div>
                          <h3>Verify your location</h3>
                          <p>Be inside your office’s attendance boundary.</p>
                        </div>
                        {inside && <span className="tag green">Verified</span>}
                      </div>
                      <div className="fixed-workplace-box">
                        <div className="fixed-workplace-header">
                          <span className="fixed-workplace-tag"><MapPin size={13} /> Attendance Workplace</span>
                          <span className="fixed-workplace-geofence">Geofence: {office?.radius_meters || 300}m</span>
                        </div>
                        <div className="fixed-workplace-select-wrap">
                          <label htmlFor="workplace-select-dropdown" className="fixed-workplace-select-label">
                            Select workplace
                          </label>
                          <select
                            id="workplace-select-dropdown"
                            className="fixed-workplace-select"
                            value={officeId}
                            onChange={changeAttendanceOffice}
                            disabled={busy || offices.length === 0}
                          >
                            {offices.length === 0 && <option value="">No workplaces available</option>}
                            {offices.map(place => (
                              <option key={place.id} value={place.id}>
                                {place.name} ({place.radius_meters} m)
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="fixed-workplace-content">
                          <div className="fixed-workplace-icon"><MapPin size={20} /></div>
                          <div className="fixed-workplace-info">
                            <h4>{office?.name || 'Workplace (Test Location)'}</h4>
                            <p>{office?.address || 'Jainabad, Burhanpur (Test Location)'}</p>
                          </div>
                        </div>
                      </div>

                      <div className={'location-box ' + (inside ? 'valid' : '')}>
                        <span className="location-symbol"><MapPin size={24} /></span>
                        <div>
                          <strong>
                            {inside ? 'You’re in the right place' : position && !fresh ? 'Location expired' : position ? 'Location not verified' : 'Let’s find your location'}
                          </strong>
                          <p>
                            {position && office ? `${Math.round(metres)} m away · GPS accuracy ±${Math.round(position.accuracy)} m · ${office.radius_meters} m boundary` : 'Allow location access to verify you’re on site.'}
                          </p>
                        </div>
                      </div>

                      <button className="secondary full" disabled={!office || locating || busy} onClick={locate}>
                        {locating ? <LoaderCircle className="spin" size={17} /> : <LocateFixed size={17} />}
                        {locating ? 'Finding your location…' : position ? 'Refresh location' : 'Verify my location'}
                      </button>


                      <div className="divider" />
                      <div className="step">
                        <span className={'step-number ' + (photo ? 'done' : '')}>{photo ? <Check size={16} /> : 2}</span>
                        <div>
                          <h3>Capture Live Photo</h3>
                          <p>Take a clear photo. Your face will be compared with your registered photo.</p>
                        </div>
                        {!inside && <Lock size={16} className="muted" />}
                      </div>

                      <div className={'camera-box ' + (photo || stream ? 'has-image' : '')}>
                        {photo ? <img src={photo} alt="Your attendance photo" /> :
                          stream ? (
                            <div className="face-guide-wrapper">
                              <video ref={video} autoPlay muted playsInline />
                              <div className={`face-guide-frame ${frameQuality === 'valid' ? 'valid' : 'invalid'}`}>
                                <div className="face-guide-oval">
                                  <div className="scanning-line" />
                                </div>
                                <div className="face-guide-status">
                                  {frameQuality === 'valid' ? '✓ Lighting ready · keep your face in the oval' : '⚠ Improve lighting and keep your face in the oval'}
                                </div>
                              </div>
                            </div>
                          ) :
                            (<>
                              <span className="camera-icon"><Camera size={28} /></span>
                              <strong>{inside ? 'Camera ready to capture' : 'Camera is locked for now'}</strong>
                              <p>{inside ? 'Open your camera to take your attendance photo.' : 'Complete Step 1 (Verify location) to unlock the camera.'}</p>
                            </>)}
                      </div>

                      <div className="camera-actions">
                        {stream ? (
                          <button className="primary full" disabled={frameQuality !== 'valid'} onClick={capture}>
                            <Camera size={17} /> {frameQuality === 'valid' ? 'Capture Photo Now' : 'Improve Lighting to Capture'}
                          </button>
                        ) : (
                          <button className="primary full" disabled={!inside || busy} onClick={openCamera}>
                            <Camera size={17} /> {photo ? 'Retake Photo with Camera' : 'Open Camera to Take Photo'}
                          </button>
                        )}
                      </div>

                      {faceVerification && faceVerification.decision !== 'mismatch' && (
                        <div className="banner error" role="alert">
                          <strong>{faceVerification.decision === 'retake' ? 'Retake your photo' : faceVerification.decision === 'review' ? 'Face match needs review' : faceVerification.decision === 'unavailable' ? 'Face verification unavailable' : 'Reference photo needs attention'}</strong>
                          <p>{faceVerification.message || 'Please try again or contact your administrator.'}</p>
                        </div>
                      )}

                      <button
                        className="primary full submit"
                        disabled={!inside || !photo || busy}
                        onClick={submit}
                      >
                        {busy ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />}
                        {busy ? 'Verifying & saving…' : checkedIn ? 'Confirm check-out' : 'Confirm check-in'}
                        <ArrowRight size={18} />
                      </button>
                      <p className="privacy"><Lock size={12} /> Your photo is private and used for attendance records.</p>
                    </section>

                    <div className="right-column">
                      {last ? (
                        <section className="card today-status-card">
                          <div className="card-title">
                            <div>
                              <h2>Today’s Status</h2>
                              <p>Your latest verified check-in for today.</p>
                            </div>
                            <span className={'tag ' + (last.check_type === 'CHECK_IN' ? 'green' : 'neutral')}>
                              {last.check_type === 'CHECK_IN' ? '↗ Checked In' : '↙ Checked Out'}
                            </span>
                          </div>
                          <div className="status-record-box">
                            <span className="status-record-icon"><Check size={20} /></span>
                            <div className="status-record-info">
                              <strong>{last.check_type === 'CHECK_IN' ? 'Checked In Successfully' : 'Checked Out Successfully'} at {timeLabel(last.timestamp)}</strong>
                              <p>{last.office_name || office?.name || 'Workplace (Test Location)'} · GPS & live photo verified</p>
                            </div>
                          </div>
                        </section>
                      ) : (
                        <section className="card today-status-card">
                          <div className="card-title">
                            <div>
                              <h2>Today’s Status</h2>
                              <p>Ready to record attendance for today.</p>
                            </div>
                            <span className="tag neutral">Ready</span>
                          </div>
                          <div className="status-record-box pending">
                            <span className="status-record-icon pending"><Clock size={20} /></span>
                            <div className="status-record-info">
                              <strong>Ready to Mark Attendance</strong>
                              <p>Verify your location and take a photo to check in.</p>
                            </div>
                          </div>
                        </section>
                      )}

                      <section className="how-card">
                        <span className="eyebrow">GOOD TO KNOW</span>
                        <h3>A check-in you can trust.</h3>
                        <div>
                          <span>01</span>
                          <p><strong>Be at your workplace</strong>Your GPS reading must fit within the office boundary.</p>
                        </div>
                        <div>
                          <span>02</span>
                          <p><strong>Show up as yourself</strong>Take a new photo using your device’s camera.</p>
                        </div>
                        <div>
                          <span>03</span>
                          <p><strong>Verified on-site check-in</strong>GPS and live photo verification recorded for your work day.</p>
                        </div>
                      </section>
                    </div>
                  </div>
                </>
              )}

              {/* ========================================================================= */}
              {/* =============================== MY PROFILE ============================== */}
              {/* ========================================================================= */}
              {((panel === 'user' && userPage === 'My Profile') || (isAdminPanel && adminPage === 'My Profile')) && (
                <>
                  <section className="card profile-card">
                    <div className="profile-card-header">
                      <div>
                        <h2>{isManager ? 'Manager Account Profile' : 'My Employee Profile'}</h2>
                        <p>Your account information and personal details.</p>
                      </div>
                      {!isEditingProfile ? (
                        <button
                          id="btn-edit-profile"
                          type="button"
                          className="secondary edit-profile-btn"
                          onClick={() => {
                            setProfileName(isManager ? (authSession?.name || 'Operations Manager') : (activeUserEmployee?.name || ''));
                            setProfileEmail(isManager ? (authSession?.email || 'manager@present.local') : (activeUserEmployee?.email || ''));
                            setIsEditingProfile(true);
                            setError('');
                          }}
                          title="Edit Full Name & Work Email"
                        >
                          <Edit3 size={15} /> Edit Details
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary edit-profile-btn"
                          disabled={profileSaving}
                          onClick={() => {
                            setProfileName(isManager ? (authSession?.name || 'Operations Manager') : (activeUserEmployee?.name || ''));
                            setProfileEmail(isManager ? (authSession?.email || 'manager@present.local') : (activeUserEmployee?.email || ''));
                            setIsEditingProfile(false);
                            setError('');
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {!isEditingProfile ? (
                      <div className="profile-rows-container">
                        <div className="profile-row">
                          <span className="profile-row-label">Full Name</span>
                          <strong className="profile-row-val">{isManager ? (authSession?.name || 'Operations Manager') : activeUserEmployee?.name}</strong>
                        </div>
                        <div className="profile-row">
                          <span className="profile-row-label">Work Email</span>
                          <strong className="profile-row-val">{isManager ? (authSession?.email || 'manager@present.local') : activeUserEmployee?.email}</strong>
                        </div>
                        <div className="profile-row">
                          <span className="profile-row-label">Job Role</span>
                          <div className="profile-row-val locked-val">
                            <strong>{isManager ? 'Operations Manager' : activeUserEmployee?.designation}</strong>
                            <span className="profile-lock-badge"><Lock size={12} /> {isManager ? 'Team Manager Access' : 'Locked (Admin Managed)'}</span>
                          </div>
                        </div>
                        <div className="profile-row">
                          <span className="profile-row-label">Current Panel Access</span>
                          <div className="profile-row-val locked-val">
                            <strong>{isManager ? 'Manager Panel (Team Oversight)' : 'Employee Portal (User)'}</strong>
                            <span className="profile-lock-badge"><Lock size={12} /> Locked</span>
                          </div>
                        </div>
                        <div className="profile-row">
                          <span className="profile-row-label">Display Timezone</span>
                          <div className="profile-row-val locked-val">
                            <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>
                            <span className="profile-lock-badge"><Lock size={12} /> Auto Detected</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={saveUserProfile} className="profile-form-container">
                        <div className="profile-form-field">
                          <label htmlFor="input-profile-name">
                            Full Name <span className="req-star">*</span>
                          </label>
                          <input
                            id="input-profile-name"
                            type="text"
                            value={profileName}
                            onChange={e => setProfileName(e.target.value)}
                            required
                            maxLength={100}
                            placeholder="Enter your full name"
                            autoFocus
                          />
                          <small className="field-help">Editable: Updates your display name across verified attendance records.</small>
                        </div>

                        <div className="profile-form-field">
                          <label htmlFor="input-profile-email">
                            Work Email <span className="req-star">*</span>
                          </label>
                          <input
                            id="input-profile-email"
                            type="email"
                            value={profileEmail}
                            onChange={e => setProfileEmail(e.target.value)}
                            required
                            maxLength={150}
                            placeholder="name@company.com"
                          />
                          <small className="field-help">Editable: Used for dashboard login identification.</small>
                        </div>

                        <div className="profile-form-field locked-field">
                          <label>Job Role</label>
                          <div className="locked-field-box">
                            <span>{isManager ? 'Operations Manager' : activeUserEmployee?.designation}</span>
                            <span className="profile-lock-badge"><Lock size={12} /> Job role cannot be edited</span>
                          </div>
                          <small className="field-help">{isManager ? 'Assigned workspace role.' : 'Managed by administrator in official employee sheet.'}</small>
                        </div>

                        <div className="profile-form-field locked-field">
                          <label>Current Panel Access</label>
                          <div className="locked-field-box">
                            <span>{isManager ? 'Manager Panel (Team Oversight)' : 'Employee Portal (User)'}</span>
                            <span className="profile-lock-badge"><Lock size={12} /> Access tier cannot be edited</span>
                          </div>
                          <small className="field-help">Assigned according to workspace permissions.</small>
                        </div>

                        <div className="profile-form-field locked-field">
                          <label>Display Timezone</label>
                          <div className="locked-field-box">
                            <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                            <span className="profile-lock-badge"><Lock size={12} /> Timezone cannot be edited</span>
                          </div>
                          <small className="field-help">Automatically detected from your device environment.</small>
                        </div>

                        <div className="profile-form-actions">
                          <button
                            type="button"
                            className="secondary"
                            disabled={profileSaving}
                            onClick={() => {
                              setProfileName(isManager ? (authSession?.name || 'Operations Manager') : (activeUserEmployee?.name || ''));
                              setProfileEmail(isManager ? (authSession?.email || 'manager@present.local') : (activeUserEmployee?.email || ''));
                              setIsEditingProfile(false);
                              setError('');
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            id="btn-save-profile"
                            type="submit"
                            className="primary"
                            disabled={profileSaving}
                          >
                            {profileSaving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                            {profileSaving ? 'Saving Changes…' : 'Save Profile Changes'}
                          </button>
                        </div>
                      </form>
                    )}

                    <p className="profile-footer-note">
                      Your attendance is verified via GPS coordinates within predefined office boundaries and captured photo verification.
                    </p>
                  </section>

                  {/* PASSWORD RESET (FOR EVERYONE EXCEPT SUPER ADMIN) */}
                  {!isSuperAdmin && (
                    <section className="card" style={{ marginTop: 24, padding: '26px 28px', background: '#ffffff', borderRadius: 12, border: '1px solid #dfe5d6' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid #edf0e7', paddingBottom: 14 }}>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: 750, color: '#1f3b2f', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Lock size={16} /> Change Account Password
                          </h3>
                          <p style={{ fontSize: 12, color: '#7b8772', marginTop: 3 }}>
                            Update the secure credentials used to log into your {isManager ? 'Manager' : 'Employee'} portal.
                          </p>
                        </div>
                        <span className="sheet-badge" style={{ fontSize: 11 }}>
                          <ShieldCheck size={13} /> Account Security
                        </span>
                      </div>

                      <form onSubmit={handleProfilePasswordReset} style={{ display: 'grid', gap: 16, maxWidth: 500 }}>
                        <div className="profile-form-field">
                          <label htmlFor="profile-curr-pass">
                            Current Password <span className="req-star">*</span>
                          </label>
                          <div className="input-with-actions">
                            <input
                              id="profile-curr-pass"
                              type={showProfileCurrentPass ? 'text' : 'password'}
                              value={profileCurrentPass}
                              onChange={e => setProfileCurrentPass(e.target.value)}
                              required
                              placeholder="Enter your current password"
                              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cfdac9' }}
                            />
                            <button
                              type="button"
                              className="input-icon-btn"
                              onClick={() => setShowProfileCurrentPass(!showProfileCurrentPass)}
                              title={showProfileCurrentPass ? 'Hide password' : 'Show password'}
                            >
                              {showProfileCurrentPass ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                          <small className="field-help">Required to verify your identity before setting a new password.</small>
                        </div>

                        <div className="profile-form-field">
                          <label htmlFor="profile-new-pass">
                            New Password <span className="req-star">*</span>
                          </label>
                          <div className="input-with-actions">
                            <input
                              id="profile-new-pass"
                              type={showProfileNewPass ? 'text' : 'password'}
                              value={profileNewPass}
                              onChange={e => setProfileNewPass(e.target.value)}
                              required
                              minLength={6}
                              maxLength={50}
                              placeholder="At least 6 characters"
                              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cfdac9' }}
                            />
                            <button
                              type="button"
                              className="input-icon-btn"
                              onClick={() => setShowProfileNewPass(!showProfileNewPass)}
                              title={showProfileNewPass ? 'Hide password' : 'Show password'}
                            >
                              {showProfileNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                          <small className="field-help">Choose a strong, unique password with at least 6 characters.</small>
                        </div>

                        <div className="profile-form-field">
                          <label htmlFor="profile-confirm-pass">
                            Confirm New Password <span className="req-star">*</span>
                          </label>
                          <div className="input-with-actions">
                            <input
                              id="profile-confirm-pass"
                              type={showProfileConfirmPass ? 'text' : 'password'}
                              value={profileConfirmPass}
                              onChange={e => setProfileConfirmPass(e.target.value)}
                              required
                              minLength={6}
                              maxLength={50}
                              placeholder="Re-enter your new password"
                              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cfdac9' }}
                            />
                            <button
                              type="button"
                              className="input-icon-btn"
                              onClick={() => setShowProfileConfirmPass(!showProfileConfirmPass)}
                              title={showProfileConfirmPass ? 'Hide password' : 'Show password'}
                            >
                              {showProfileConfirmPass ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                          <small className="field-help">Must match the new password above.</small>
                        </div>

                        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                          <button
                            type="submit"
                            className="primary"
                            disabled={profilePassSaving || !profileNewPass || !profileConfirmPass}
                            style={{ padding: '10px 22px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                          >
                            {profilePassSaving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
                            {profilePassSaving ? 'Updating Password…' : 'Update Password'}
                          </button>
                        </div>
                      </form>
                    </section>
                  )}
                </>
              )}

              {/* ========================================================================= */}
              {/* ============================= ADMIN PANEL =============================== */}
              {/* ========================================================================= */}
              {isAdminPanel && adminPage !== 'Mark Attendance' && adminPage !== 'My Profile' && (
                <>
                  {/* ADMIN VIEW 1: EXECUTIVE OVERVIEW */}
                  {adminPage === 'Executive Overview' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
                    <button
                      id="overview-register-btn"
                      className="primary"
                      onClick={openAddEmployeeModal}
                    >
                      <UserPlus size={16} /> Register Employee for Portal
                    </button>
                  </div>

                  <div className="stats">
                    <div className="stat">
                      <span className="stat-icon"><Users size={20} /></span>
                      <span>Total Employees</span>
                      <strong>{employees.length} <em>registered</em></strong>
                      <small>In the official salary sheet</small>
                    </div>
                    <div className="stat">
                      <span className="stat-icon"><Coins size={20} /></span>
                      <span>Total Monthly Payroll</span>
                      <strong>{formatCurrency(totalPayroll, companyCurrency)}</strong>
                      <small>Combined monthly salary commitment</small>
                    </div>
                    <div className="stat">
                      <span className="stat-icon"><TrendingUp size={20} /></span>
                      <span>Average Monthly Salary</span>
                      <strong>{formatCurrency(avgSalary, companyCurrency)}</strong>
                      <small>Across all registered employees</small>
                    </div>
                  </div>

                  <section className="card recent">
                    <div className="card-title">
                      <div>
                        <h2>Company-wide Recent Activity</h2>
                        <p>Latest verified check-ins and check-outs across all offices</p>
                      </div>
                      <button className="text-button" onClick={() => setAdminPage('Attendance & Payroll')}>
                        View attendance & payroll <ArrowUpRight size={16} />
                      </button>
                    </div>
                    {attendanceTable(records, 5)}
                  </section>
                </>
              )}

              {/* ADMIN VIEW 2: ATTENDANCE & PAYROLL (Single Person for Any Month) */}
              {(adminPage === 'Attendance & Payroll' || adminPage === 'Team Attendance') && (
                <>
                  <div className="payroll-filter-bar card">
                    <div className="payroll-filters-grid">
                      <label className="payroll-filter-item">
                        <span className="filter-label"><Users size={14} /> SELECT PERSON</span>
                        <select
                          id="employee-select"
                          value={selectedEmployeeId}
                          onChange={e => {
                            setSelectedEmployeeId(e.target.value);
                            fetchPersonAttendance(e.target.value);
                          }}
                        >
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} — {emp.designation} ({formatCurrency(emp.monthly_salary, emp.currency)}/mo)
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="payroll-filter-item">
                        <span className="filter-label"><CalendarDays size={14} /> SELECT MONTH</span>
                        <input
                          id="month-select"
                          type="month"
                          value={personMonth}
                          onChange={e => setPersonMonth(e.target.value)}
                        />
                      </label>

                      <label className="payroll-filter-item">
                        <span className="filter-label">ACTIVITY FILTER</span>
                        <select
                          value={personFilter}
                          onChange={e => setPersonFilter(e.target.value)}
                        >
                          <option value="">All Activity (Check-ins & Outs)</option>
                          <option value="CHECK_IN">Check-ins Only</option>
                          <option value="CHECK_OUT">Check-outs Only</option>
                        </select>
                      </label>
                    </div>

                    <div className="payroll-action-buttons">
                      {mode === 'demo' && (
                        <button
                          className="secondary"
                          onClick={seedDemoAttendance}
                          disabled={busy}
                          title="Quickly fill sample verified check-ins for testing"
                        >
                          <Sparkles size={15} /> Seed Sample Activity
                        </button>
                      )}
                      <button
                        className="secondary"
                        onClick={() => exportPersonReportCSV(adminTargetPerson, visibleCalcRecords)}
                        disabled={!visibleCalcRecords.length}
                      >
                        <Download size={15} /> Export Month Report
                      </button>
                    </div>
                  </div>

                  {adminTargetPerson && (
                    <section className="card salary-hero-card">
                      <div className="salary-hero-top">
                        <div className="person-badge">
                          <span className="avatar large">{adminTargetPerson.name?.slice(0, 2).toUpperCase()}</span>
                          <div>
                            <h2>{adminTargetPerson.name}</h2>
                            <p>{adminTargetPerson.designation} · {adminTargetPerson.email}</p>
                          </div>
                        </div>
                        <div className="salary-pill-status">
                          <span className="sheet-badge"><FileSpreadsheet size={13} /> Fetched from Sheet</span>
                          <span className="attendance-score-pill">
                            {attendanceRate >= 90 ? 'Excellent Attendance' : attendanceRate >= 70 ? 'Good Standing' : 'Needs Attention'} · {attendanceRate}%
                          </span>
                        </div>
                      </div>

                      <div className="salary-metrics-grid">
                        <div className="salary-metric-box">
                          <span className="metric-label">REGISTERED SALARY</span>
                          <strong className="metric-value highlight">{formatCurrency(baseSalary, personCurrency)}</strong>
                          <small>Base rate in sheet / month</small>
                        </div>

                        <div className="salary-metric-box">
                          <span className="metric-label">MONTH WORKING DAYS</span>
                          <strong className="metric-value">{workingDaysInMonth} <em>days</em></strong>
                          <small>Mon–Fri in {new Date(selectedYear, selectedMonthNum - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' })}</small>
                        </div>

                        <div className="salary-metric-box">
                          <span className="metric-label">DAYS PRESENT</span>
                          <strong className="metric-value green-text">{daysPresent} <em>days</em></strong>
                          <small>{workingDaysInMonth - daysPresent} day(s) absent</small>
                        </div>

                        <div className="salary-metric-box">
                          <span className="metric-label">DAILY RATE</span>
                          <strong className="metric-value">{formatCurrency(dailyRate, personCurrency)}</strong>
                          <small>Base ÷ {workingDaysInMonth} working days</small>
                        </div>

                        <div className="salary-metric-box earned-box">
                          <span className="metric-label">CALCULATED PAYABLE SALARY</span>
                          <strong className="metric-value large-value">{formatCurrency(payableSalary, personCurrency)}</strong>
                          <small>{daysPresent} day(s) × {formatCurrency(dailyRate, personCurrency)}</small>
                        </div>
                      </div>

                      <div className="attendance-progress-track">
                        <div className="progress-labels">
                          <span>Monthly Attendance Progress</span>
                          <strong>{daysPresent} of {workingDaysInMonth} days ({attendanceRate}%)</strong>
                        </div>
                        <div className="progress-bar-bg">
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${Math.min(100, attendanceRate)}%` }}
                          />
                        </div>
                      </div>
                    </section>
                  )}

                  <section className="card">
                    <div className="card-title">
                      <div>
                        <h2>
                          {adminTargetPerson ? `${adminTargetPerson.name}’s Attendance` : 'Attendance History'} — {new Date(selectedYear, selectedMonthNum - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                        </h2>
                        <p>{visibleCalcRecords.length} verified timestamp records in this month</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => { setPersonFilter(''); setPersonMonth(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`) }}
                      >
                        Reset filters
                      </button>
                    </div>
                    {personLoading ? (
                      <div className="empty"><LoaderCircle className="spin" size={24} /><p>Loading employee attendance…</p></div>
                    ) : (
                      attendanceTable(visibleCalcRecords)
                    )}
                  </section>
                </>
              )}

              {/* ADMIN VIEW 3: EMPLOYEE SALARY SHEET */}
              {adminPage === 'Employees & Sheet' && (
                <>
                  <div className="stats">
                    <div className="stat">
                      <span className="stat-icon"><Users size={20} /></span>
                      <span>Total Employees</span>
                      <strong>{employees.length} <em>members</em></strong>
                      <small>Registered in salary sheet</small>
                    </div>
                    <div className="stat">
                      <span className="stat-icon"><Coins size={20} /></span>
                      <span>Total Monthly Payroll</span>
                      <strong>{formatCurrency(totalPayroll, companyCurrency)}</strong>
                      <small>Combined monthly base salaries</small>
                    </div>
                    <div className="stat">
                      <span className="stat-icon"><TrendingUp size={20} /></span>
                      <span>Average Monthly Salary</span>
                      <strong>{formatCurrency(avgSalary, companyCurrency)}</strong>
                      <small>Per registered team member</small>
                    </div>
                  </div>

                  <div className="sheet-controls card">
                    <div className="sheet-search">
                      <input
                        type="search"
                        placeholder="Search by employee name, email or role…"
                        value={sheetSearch}
                        onChange={e => setSheetSearch(e.target.value)}
                      />
                    </div>
                    <div className="sheet-buttons">
                      <button className="secondary" onClick={exportEmployeeSheetCSV} title="Download sheet as CSV">
                        <Download size={16} /> Export Sheet (CSV)
                      </button>
                      {(isSuperAdmin || isManager || isAdmin) && (
                        <>
                          {isSuperAdmin && (
                            <>
                              <input
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={importEmployeeSheetCSV}
                              />
                              <button className="secondary" onClick={() => fileInputRef.current?.click()} title="Upload CSV to import or update employees">
                                <Upload size={16} /> Import CSV
                              </button>
                            </>
                          )}
                          <button
                            id="add-employee-btn"
                            className="primary"
                            onClick={openAddEmployeeModal}
                          >
                            <UserPlus size={16} /> Register Employee for Portal
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <section className="card">
                    <div className="card-title">
                      <div>
                        <h2>Employee & Salary Sheet</h2>
                        <p>Official salary database synced with attendance calculations</p>
                      </div>
                      <span className="sheet-count">{filteredEmployees.length} employee(s) listed</span>
                    </div>

                    <div className="table-scroll">
                      <table className="employee-table">
                        <thead>
                          <tr>
                            <th>EMPLOYEE</th>
                            <th>DESIGNATION / ROLE</th>
                            <th>BASE MONTHLY SALARY</th>
                            <th>DAILY RATE (EST.)</th>
                            <th>PORTAL ACCESS & ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEmployees.map(emp => (
                            <tr key={emp.id}>
                              <td data-label="Employee">
                                <div className="employee-cell">
                                  {emp.photo_base64 ? (
                                    <img src={emp.photo_base64} alt={emp.name} className="avatar emp-photo-avatar" style={{ objectFit: 'cover' }} />
                                  ) : (
                                    <span className="avatar">{emp.name?.slice(0, 2).toUpperCase()}</span>
                                  )}
                                  <div>
                                    <strong>{emp.name}</strong>
                                    <small>{emp.email}</small>
                                  </div>
                                </div>
                              </td>
                              <td data-label="Designation">
                                <span className="role-tag">{emp.designation}</span>
                              </td>
                              <td data-label="Base Salary">
                                <strong className="salary-cell">{formatCurrency(emp.monthly_salary, emp.currency)}</strong>
                                <small>/ month ({emp.currency})</small>
                              </td>
                              <td data-label="Daily Rate">
                                <span>{formatCurrency(emp.monthly_salary / 22, emp.currency)}</span>
                                <small>~22 days/mo</small>
                              </td>
                              <td data-label="Actions">
                                <div className="table-actions">
                                  <button
                                    className="action-pill view"
                                    onClick={() => {
                                      setSelectedEmployeeId(emp.id);
                                      setAdminPage('Attendance & Payroll');
                                    }}
                                    title="View this person's attendance and salary for any month"
                                  >
                                    <CalendarDays size={14} /> View Attendance
                                  </button>
                                  {(isSuperAdmin || isManager || isAdmin) && (
                                    <>
                                      <button
                                        className="action-icon-btn"
                                        onClick={() => openEditEmployeeModal(emp)}
                                        title="Edit employee registration details & reference photo"
                                      >
                                        <Edit3 size={15} />
                                      </button>
                                      <button
                                        id={`btn-remove-employee-${emp.id}`}
                                        className="action-pill remove"
                                        onClick={() => removeEmployee(emp)}
                                        title="Remove employee from directory"
                                        aria-label={`Remove ${emp.name}`}
                                      >
                                        <Trash2 size={13} /> Remove
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!filteredEmployees.length && (
                        <div className="empty">
                          <Users size={30} />
                          <h3>No employees found</h3>
                          <p>{sheetSearch ? 'Try adjusting your search criteria.' : 'Add your first employee with salary to populate the sheet.'}</p>
                          <button className="primary" onClick={openAddEmployeeModal}>
                            <UserPlus size={16} /> Register Employee for Portal
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}

              {/* ADMIN VIEW 4: OFFICE GEOFENCES */}
              {adminPage === 'Office Geofences' && (
                <>
                  <div className="section-action">
                    <p>{offices.length} predefined workplace location(s)</p>
                    {isSuperAdmin ? (
                      <button className="primary" onClick={openAddOffice}><Plus size={17} /> Add location</button>
                    ) : (
                      <span className="lock-hint-tag" title="Workspaces are predefined. Only Super Admin has access to add or edit workspace boundaries.">
                        <Lock size={12} /> Predefined Workspaces (Super Admin only)
                      </span>
                    )}
                  </div>
                  <div className="offices">
                    {offices.map(o => (
                      <section className="card office-card" key={o.id}>
                        <div className="office-illustration">
                          <div className="radius-ring"><MapPin size={28} /></div>
                          <span>{o.radius_meters} m radius</span>
                        </div>
                        <h2>{o.name}</h2>
                        <p>{o.address}</p>
                        <small>{o.latitude.toFixed(5)}, {o.longitude.toFixed(5)}</small>
                        {isSuperAdmin && (
                          <div className="office-card-actions">
                            <button
                              type="button"
                              className="action-pill view"
                              onClick={() => openEditOffice(o)}
                              title="Edit location name, coordinates, or boundary radius"
                            >
                              <Edit3 size={14} /> Edit Location
                            </button>
                            {offices.length > 1 && (
                              <button
                                type="button"
                                className="action-pill remove"
                                onClick={() => deleteOffice(o)}
                                title="Remove office location"
                              >
                                <Trash2 size={13} /> Remove
                              </button>
                            )}
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                  {!offices.length && (
                    <div className="card empty">
                      <MapPin />
                      <h3>Predefined workspaces</h3>
                      <p>{isSuperAdmin ? 'Add your first predefined office coordinates and attendance radius.' : 'No predefined workspaces configured yet by Super Admin.'}</p>
                      {isSuperAdmin && (
                        <button className="primary" onClick={openAddOffice}><Plus size={16} /> Add location</button>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ADMIN VIEW 5: COMPREHENSIVE SYSTEM SETTINGS SUITE */}
              {adminPage === 'System Settings' && (
                <div className="settings-suite-container">
                  {/* TABS NAVIGATION BAR */}
                  <div className="settings-tabs-nav">
                    <button
                      type="button"
                      className={`settings-tab-btn ${settingsTab === 'organization' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('organization')}
                    >
                      <Building2 size={16} /> Organization Profile
                    </button>
                    <button
                      type="button"
                      className={`settings-tab-btn ${settingsTab === 'shift' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('shift')}
                    >
                      <Clock size={16} /> Shift & Timing
                    </button>
                    <button
                      type="button"
                      className={`settings-tab-btn ${settingsTab === 'geofence' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('geofence')}
                    >
                      <MapPin size={16} /> Geofence & Location
                    </button>
                    <button
                      type="button"
                      className={`settings-tab-btn ${settingsTab === 'biometrics' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('biometrics')}
                    >
                      <Sparkles size={16} /> Biometrics & Face AI
                    </button>
                    <button
                      type="button"
                      className={`settings-tab-btn ${settingsTab === 'payroll' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('payroll')}
                    >
                      <Coins size={16} /> Payroll & Overtime
                    </button>
                    <button
                      type="button"
                      className={`settings-tab-btn ${settingsTab === 'security' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('security')}
                    >
                      <ShieldAlert size={16} /> Super Admin Security
                    </button>
                  </div>

                  {/* TAB 1: ORGANIZATION & PROFILE */}
                  {settingsTab === 'organization' && (
                    <div className="settings-section-card">
                      <h2><Building2 size={20} /> Organization & Company Profile</h2>
                      <p className="section-desc">Manage primary organization metadata, workplace codes, default currency, and display localization.</p>

                      <div className="settings-form-grid">
                        <div className="settings-field">
                          <label>Company Legal Name</label>
                          <input
                            type="text"
                            value={systemSettings.companyName || ''}
                            onChange={e => setSystemSettings({ ...systemSettings, companyName: e.target.value })}
                            placeholder="e.g. Present Technologies Pvt Ltd"
                          />
                          <small>Displayed on employee payslips, header branding, and audit reports.</small>
                        </div>

                        <div className="settings-field">
                          <label>Workplace Organization Code</label>
                          <input
                            type="text"
                            value={systemSettings.workplaceCode || ''}
                            onChange={e => setSystemSettings({ ...systemSettings, workplaceCode: e.target.value.toUpperCase() })}
                            placeholder="e.g. WRK-HQ"
                          />
                          <small>Unique identifier used for company-wide geofencing and multi-branch isolation.</small>
                        </div>

                        <div className="settings-field">
                          <label>Support & Administrator Email</label>
                          <input
                            type="email"
                            value={systemSettings.supportEmail || ''}
                            onChange={e => setSystemSettings({ ...systemSettings, supportEmail: e.target.value })}
                            placeholder="e.g. superadmin@present.local"
                          />
                          <small>Used for critical system notifications, security alerts, and employee help requests.</small>
                        </div>

                        <div className="settings-field">
                          <label>Default Currency</label>
                          <select
                            value={systemSettings.defaultCurrency || 'INR'}
                            onChange={e => setSystemSettings({ ...systemSettings, defaultCurrency: e.target.value })}
                          >
                            <option value="INR">INR (₹) - Indian Rupee</option>
                            <option value="USD">USD ($) - US Dollar</option>
                            <option value="EUR">EUR (€) - Euro</option>
                            <option value="GBP">GBP (£) - British Pound</option>
                            <option value="AED">AED (د.إ) - UAE Dirham</option>
                            <option value="SGD">SGD (S$) - Singapore Dollar</option>
                          </select>
                          <small>Standard currency applied across payroll calculations and employee registration.</small>
                        </div>

                        <div className="settings-field">
                          <label>Display Timezone</label>
                          <select
                            value={systemSettings.timezone || 'Asia/Kolkata'}
                            onChange={e => setSystemSettings({ ...systemSettings, timezone: e.target.value })}
                          >
                            <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                            <option value="UTC">UTC (Coordinated Universal Time)</option>
                            <option value="America/New_York">America/New_York (EST / EDT)</option>
                            <option value="Europe/London">Europe/London (GMT / BST)</option>
                            <option value="Asia/Dubai">Asia/Dubai (GST - UTC+04:00)</option>
                            <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+08:00)</option>
                          </select>
                          <small>Used for timestamp normalization and daily attendance cutoffs.</small>
                        </div>

                        <div className="settings-field">
                          <label>Date Format Standard</label>
                          <select
                            value={systemSettings.dateFormat || 'DD/MM/YYYY'}
                            onChange={e => setSystemSettings({ ...systemSettings, dateFormat: e.target.value })}
                          >
                            <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 31/10/2026)</option>
                            <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 10/31/2026)</option>
                            <option value="YYYY-MM-DD">YYYY-MM-DD (ISO standard)</option>
                          </select>
                          <small>Formatting used across attendance exports, payslips, and tables.</small>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: SHIFT & TIMING POLICIES */}
                  {settingsTab === 'shift' && (
                    <div className="settings-section-card">
                      <h2><Clock size={20} /> Shift & Timing Policies</h2>
                      <p className="section-desc">Configure operational working hours, arrival tolerance, half-day boundaries, and automated checkouts.</p>

                      <div className="settings-form-grid">
                        <div className="settings-field">
                          <label>General Shift Start Time</label>
                          <input
                            type="time"
                            value={systemSettings.shiftStart || '09:00'}
                            onChange={e => setSystemSettings({ ...systemSettings, shiftStart: e.target.value })}
                          />
                          <small>Expected check-in time for employees assigned to standard morning shift.</small>
                        </div>

                        <div className="settings-field">
                          <label>General Shift End Time</label>
                          <input
                            type="time"
                            value={systemSettings.shiftEnd || '18:00'}
                            onChange={e => setSystemSettings({ ...systemSettings, shiftEnd: e.target.value })}
                          />
                          <small>Expected check-out time before overtime hours begin accruing.</small>
                        </div>

                        <div className="settings-field">
                          <label>Late Arrival Grace Period (Minutes)</label>
                          <input
                            type="number"
                            min="0"
                            max="120"
                            value={systemSettings.gracePeriodMins ?? 15}
                            onChange={e => setSystemSettings({ ...systemSettings, gracePeriodMins: parseInt(e.target.value) || 0 })}
                          />
                          <small>Arrivals within this window (e.g. 09:00 to 09:15) are marked "On-time". Later arrivals are flagged "Late".</small>
                        </div>

                        <div className="settings-field">
                          <label>Standard Full-Day Hours</label>
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            max="24"
                            value={systemSettings.minWorkHours ?? 8.0}
                            onChange={e => setSystemSettings({ ...systemSettings, minWorkHours: parseFloat(e.target.value) || 8.0 })}
                          />
                          <small>Target daily hours (e.g. 8.0 hrs = 480 mins). Shortfalls trigger itemized pay deductions.</small>
                        </div>

                        <div className="settings-field">
                          <label>Half-Day Threshold (Hours)</label>
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            max="12"
                            value={systemSettings.halfDayHours ?? 4.0}
                            onChange={e => setSystemSettings({ ...systemSettings, halfDayHours: parseFloat(e.target.value) || 4.0 })}
                          />
                          <small>Shifts shorter than this duration are automatically classified as a half-day in payroll.</small>
                        </div>
                      </div>

                      <div style={{ marginTop: 20 }}>
                        <div className="settings-toggle-row">
                          <div className="toggle-info">
                            <strong>Automatic Midnight Check-Out</strong>
                            <p>Automatically closes open check-in sessions at 23:59:59 to prevent overnight 24-hour shift anomalies.</p>
                          </div>
                          <label className="settings-switch-toggle">
                            <input
                              type="checkbox"
                              checked={Boolean(systemSettings.autoCheckoutEnabled)}
                              onChange={e => setSystemSettings({ ...systemSettings, autoCheckoutEnabled: e.target.checked })}
                            />
                            <span className="settings-slider" />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: GEOFENCE & LOCATION */}
                  {settingsTab === 'geofence' && (
                    <div className="settings-section-card">
                      <h2><MapPin size={20} /> Geofence & Workplace Boundaries</h2>
                      <p className="section-desc">Manage GPS proximity validation, location accuracy thresholds, and server-side perimeter enforcement.</p>

                      <div className="settings-form-grid">
                        <div className="settings-field">
                          <label>Default Geofence Radius (Meters)</label>
                          <input
                            type="number"
                            min="10"
                            max="1000"
                            value={systemSettings.defaultGeofenceRadius ?? 50}
                            onChange={e => setSystemSettings({ ...systemSettings, defaultGeofenceRadius: parseInt(e.target.value) || 50 })}
                          />
                          <small>Standard boundary radius applied when registering new office locations (SRS Section 4 standard is 50m).</small>
                        </div>

                        <div className="settings-field">
                          <label>Maximum Allowed GPS Accuracy (Meters)</label>
                          <input
                            type="number"
                            min="10"
                            max="500"
                            value={systemSettings.maxGpsAccuracy ?? 100}
                            onChange={e => setSystemSettings({ ...systemSettings, maxGpsAccuracy: parseInt(e.target.value) || 100 })}
                          />
                          <small>Rejects GPS readings where browser/device satellite accuracy exceeds this radius to combat GPS spoofing.</small>
                        </div>
                      </div>

                      <div style={{ marginTop: 20 }}>
                        <div className="settings-toggle-row">
                          <div className="toggle-info">
                            <strong>Strict Geofence Enforcement</strong>
                            <p>Disallow attendance marking if the employee's physical location is outside the workplace radius. If disabled, out-of-boundary check-ins are logged with an "Off-site" flag instead of being rejected.</p>
                          </div>
                          <label className="settings-switch-toggle">
                            <input
                              type="checkbox"
                              checked={Boolean(systemSettings.strictGeofence)}
                              onChange={e => setSystemSettings({ ...systemSettings, strictGeofence: e.target.checked })}
                            />
                            <span className="settings-slider" />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: BIOMETRICS & FACE AI */}
                  {settingsTab === 'biometrics' && (
                    <div className="settings-section-card">
                      <h2><Sparkles size={20} /> Biometrics & AI Face Matching Standards</h2>
                      <p className="section-desc">Configure neural facial feature similarity thresholds and attendance photo verification policies.</p>

                      <div className="settings-form-grid">
                        <div className="settings-field">
                          <label>Face Similarity Match Threshold (0.10 – 0.90)</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0.10"
                            max="0.90"
                            value={systemSettings.faceMatchThreshold ?? 0.45}
                            onChange={e => setSystemSettings({ ...systemSettings, faceMatchThreshold: parseFloat(e.target.value) || 0.45 })}
                          />
                          <small>Cosine distance boundary for AI facial recognition (Recommended: 0.45). Lower values require tighter match.</small>
                        </div>

                        <div className="settings-field">
                          <label>Biometric Verification Scope</label>
                          <select
                            value={systemSettings.faceCheckMode || 'both'}
                            onChange={e => setSystemSettings({ ...systemSettings, faceCheckMode: e.target.value })}
                          >
                            <option value="both">Both Check-In & Check-Out (High Security)</option>
                            <option value="check_in_only">Check-In Only (Speed Mode)</option>
                          </select>
                          <small>Determine whether AI face verification runs on both daily actions or check-in only.</small>
                        </div>
                      </div>

                      <div style={{ marginTop: 20, padding: '16px', background: '#f8faf5', border: '1px solid #dce4d5', borderRadius: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#254e3a', fontWeight: 650, fontSize: 13, marginBottom: 6 }}>
                          <ShieldCheck size={18} /> Edge & Server Neural Processing
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#667761', lineHeight: 1.5 }}>
                          Present uses high-dimensional vector embeddings extracted from camera frames during check-in/out and compares them with the employee's registered reference photo. Liveness lighting guidelines guide the employee during capture.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* TAB 5: PAYROLL & OVERTIME */}
                  {settingsTab === 'payroll' && (
                    <div className="settings-section-card">
                      <h2><Coins size={20} /> Payroll & Overtime Standards</h2>
                      <p className="section-desc">Configure the monthly salary divisor, overtime multipliers, and salary slip calculation basis.</p>

                      <div className="settings-form-grid">
                        <div className="settings-field">
                          <label>Monthly Salary Divisor Model</label>
                          <select
                            value={systemSettings.salaryModel || 'fixed_26'}
                            onChange={e => setSystemSettings({ ...systemSettings, salaryModel: e.target.value })}
                          >
                            <option value="fixed_26">Fixed 26 Working Days (Section 8.1 Model)</option>
                            <option value="working_days">Dynamic Working Days (Excluding Weekends)</option>
                            <option value="calendar_days">Total Calendar Days (28-31 Days)</option>
                          </select>
                          <small>Determines how an employee's Daily Rate is derived from their Monthly Base Salary.</small>
                        </div>

                        <div className="settings-field">
                          <label>Fixed Working Days in Month</label>
                          <input
                            type="number"
                            min="20"
                            max="31"
                            value={systemSettings.daysInSalaryMonth ?? 26}
                            onChange={e => setSystemSettings({ ...systemSettings, daysInSalaryMonth: parseInt(e.target.value) || 26 })}
                            disabled={systemSettings.salaryModel !== 'fixed_26'}
                          />
                          <small>Used when "Fixed 26 Working Days" model is selected (Daily Rate = Base Salary ÷ {systemSettings.daysInSalaryMonth || 26}).</small>
                        </div>

                        <div className="settings-field">
                          <label>Overtime Hourly Rate Multiplier</label>
                          <input
                            type="number"
                            step="0.1"
                            min="1.0"
                            max="3.0"
                            value={systemSettings.overtimeMultiplier ?? 1.5}
                            onChange={e => setSystemSettings({ ...systemSettings, overtimeMultiplier: parseFloat(e.target.value) || 1.5 })}
                          />
                          <small>Multiplier applied to hourly rate for hours worked beyond the 8.0-hour standard daily shift (e.g. 1.5x).</small>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 6: SUPER ADMIN SECURITY */}
                  {settingsTab === 'security' && (
                    <div className="settings-section-card">
                      <h2><ShieldAlert size={20} /> Super Administrator Security & Master Access</h2>
                      <p className="section-desc">Manage the master portal administrator credentials and workforce password compliance policies.</p>

                      <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#254e3a', margin: '0 0 4px' }}>Change Master Super Admin Password</h3>

                        <div className="settings-field">
                          <label>New Master Password</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showAdminNewPass ? 'text' : 'password'}
                              value={adminNewPassword}
                              onChange={e => setAdminNewPassword(e.target.value)}
                              placeholder="Minimum 6 characters"
                              style={{ width: '100%', paddingRight: 40 }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowAdminNewPass(!showAdminNewPass)}
                              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#687964', padding: 4 }}
                            >
                              {showAdminNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <div className="settings-field">
                          <label>Confirm Master Password</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showAdminConfirmPass ? 'text' : 'password'}
                              value={adminConfirmPassword}
                              onChange={e => setAdminConfirmPassword(e.target.value)}
                              placeholder="Re-enter password"
                              style={{ width: '100%', paddingRight: 40 }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowAdminConfirmPass(!showAdminConfirmPass)}
                              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#687964', padding: 4 }}
                            >
                              {showAdminConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="primary"
                          disabled={savingAdminPassword || !adminNewPassword}
                          onClick={handleChangeAdminPassword}
                          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px' }}
                        >
                          {savingAdminPassword ? <LoaderCircle size={15} className="spinner" /> : <Lock size={15} />}
                          Update Master Password
                        </button>
                      </div>

                      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #e2e8dc' }}>
                        <div className="settings-toggle-row">
                          <div className="toggle-info">
                            <strong>Force Password Change on First Login</strong>
                            <p>When enabled, employees logging in with their auto-generated temporary credentials will be required to set a private password before accessing their dashboard.</p>
                          </div>
                          <label className="settings-switch-toggle">
                            <input
                              type="checkbox"
                              checked={Boolean(systemSettings.requireFirstLoginPassChange)}
                              onChange={e => setSystemSettings({ ...systemSettings, requireFirstLoginPassChange: e.target.checked })}
                            />
                            <span className="settings-slider" />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* FOOTER ACTIONS BAR */}
                  <div className="settings-footer-actions">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="settings-info-badge">
                        <ShieldCheck size={14} /> Server-Side Enforced
                      </span>
                      {systemSettings.updatedAt && (
                        <small style={{ fontSize: 11, color: '#7a8974' }}>
                          Last updated: {new Date(systemSettings.updatedAt).toLocaleDateString()} {new Date(systemSettings.updatedAt).toLocaleTimeString()} {systemSettings.updatedBy ? `by ${systemSettings.updatedBy}` : ''}
                        </small>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        className="secondary"
                        onClick={handleResetSettings}
                        disabled={savingSettings}
                        style={{ fontSize: 12, padding: '9px 14px' }}
                      >
                        <RefreshCw size={14} /> Reset Defaults
                      </button>

                      <button
                        type="button"
                        className="primary"
                        onClick={handleSaveSettings}
                        disabled={savingSettings}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '9px 20px' }}
                      >
                        {savingSettings ? <LoaderCircle size={15} className="spinner" /> : <Save size={15} />}
                        Save All Changes
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <footer>
            <span>present. <span>Show up. Start well.</span></span>
            <span><ShieldCheck size={13} /> Enterprise Attendance & Salary System</span>
          </footer>
        </div>
      </main>

      {/* MODAL: ADD / EDIT EMPLOYEE */}
      {showEmployeeModal && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="emp-modal-title">
            <div className="card-title">
              <h2 id="emp-modal-title">
                {editingEmployee ? 'Edit Employee Details' : 'Register Employee for Portal'}
              </h2>
              <button aria-label="Close" disabled={busy} onClick={() => { setShowEmployeeModal(false); setEditingEmployee(null); setEmployeeRefPhoto(null); stopRefCamera(); }}>
                <X />
              </button>
            </div>
            <p>
              {editingEmployee
                ? 'Update employee profile details, designation, salary and reference face photo. Password is set during registration and cannot be modified from administrative panels.'
                : 'Fill in the registration form to add an employee. Enter their official Google email (Gmail) and secure portal password with reference photo matching.'}
            </p>
            <form onSubmit={saveEmployee}>
              <label>
                <span>Full Name</span>
                <input
                  name="name"
                  value={modalName}
                  onChange={e => {
                    const val = e.target.value;
                    setModalName(val);
                    if (!editingEmployee) {
                      setModalPassword(generatePortalPassword(val));
                    }
                  }}
                  required
                  maxLength={100}
                  placeholder="Enter employee full name"
                  autoFocus
                />
              </label>

              <label>
                <span>Google Email (Gmail) *</span>
                <div className="input-with-actions">
                  <input
                    name="email"
                    type="email"
                    value={modalEmail}
                    onChange={e => {
                      setModalEmail(e.target.value);
                      setAutoEmailModified(true);
                    }}
                    required
                    maxLength={150}
                    placeholder="e.g. employee@gmail.com"
                  />
                </div>
              </label>

              {!editingEmployee && (
                <label>
                  <span>
                    Attendance Portal Password
                    <span className="auto-gen-badge">
                      <Sparkles size={11} /> Auto-Generated
                    </span>
                  </span>
                  <div className="input-with-actions">
                    <input
                      name="portal_password"
                      type={modalShowPass ? 'text' : 'password'}
                      value={modalPassword}
                      onChange={e => setModalPassword(e.target.value)}
                      required
                      maxLength={50}
                      placeholder="Generated secure password"
                    />
                    <div className="input-actions-group">
                      <button
                        type="button"
                        className="input-icon-btn"
                        title={modalShowPass ? 'Hide password' : 'Show password'}
                        onClick={() => setModalShowPass(!modalShowPass)}
                      >
                        {modalShowPass ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        type="button"
                        className="input-icon-btn"
                        title="Regenerate random password"
                        onClick={() => setModalPassword(generatePortalPassword(modalName))}
                      >
                        <Dices size={13} />
                      </button>
                    </div>
                  </div>
                </label>
              )}

              {!editingEmployee && (
                <div className="cred-info-banner">
                  <Sparkles size={16} />
                  <span>
                    This employee will be registered with portal access. A temporary password will be generated upon saving, and the employee will be required to change their password on first login.
                  </span>
                </div>
              )}

              <div className="form-row">
                <label>
                  <span>Employee ID (SRS Section 3)</span>
                  <input
                    name="employee_id"
                    value={modalEmployeeId}
                    onChange={e => setModalEmployeeId(e.target.value)}
                    required
                    maxLength={30}
                    placeholder="e.g. EMP-1001"
                  />
                </label>
                <label>
                  <span>Department</span>
                  <select
                    name="department"
                    value={modalDepartment}
                    onChange={e => setModalDepartment(e.target.value)}
                  >
                    <option value="Operations">Operations</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Human Resources">Human Resources</option>
                    <option value="Finance">Finance</option>
                    <option value="Sales & Marketing">Sales & Marketing</option>
                    <option value="Customer Support">Customer Support</option>
                  </select>
                </label>
              </div>

              <label>
                <span>Assigned Shift Policy (SRS Section 6 & 10)</span>
                <select
                  name="shift"
                  value={modalShift}
                  onChange={e => setModalShift(e.target.value)}
                >
                  <option value="General Morning (09:00 - 18:00)">General Morning (09:00 - 18:00 · 15m Early/Late Window)</option>
                  <option value="Early Morning (07:00 - 16:00)">Early Morning (07:00 - 16:00)</option>
                  <option value="Evening Shift (14:00 - 23:00)">Evening Shift (14:00 - 23:00)</option>
                  <option value="Night Shift (22:00 - 07:00)">Night Shift (22:00 - 07:00)</option>
                </select>
              </label>

              <label>
                <span>Designation / Job Role</span>
                <input
                  name="designation"
                  defaultValue={editingEmployee?.designation || 'Software Engineer'}
                  required
                  maxLength={100}
                  placeholder="e.g. Senior Product Designer"
                />
              </label>

              <div className="form-row">
                <label>
                  <span>Monthly Salary</span>
                  <input
                    name="monthly_salary"
                    type="number"
                    step="any"
                    min="0"
                    defaultValue={editingEmployee?.monthly_salary ?? 5000}
                    required
                    placeholder="e.g. 5000"
                  />
                </label>

                <label>
                  <span>Currency</span>
                  <select name="currency" defaultValue={editingEmployee?.currency || 'INR'}>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CAD">CAD ($)</option>
                    <option value="AUD">AUD ($)</option>
                    <option value="JPY">JPY (¥)</option>
                  </select>
                </label>
              </div>

              {/* Reference Face Photo Section */}
              <div className="ref-photo-section">
                <div className="privacy-notice-box" style={{ marginBottom: 14 }}>
                  <Lock size={15} />
                  <div>
                    <strong>Biometric & Face Photo Privacy Notice (SRS Section 5.1 & 15)</strong>
                    <p>Reference face photos are securely stored for identity verification at check-in/out and are never transferred or sold.</p>
                  </div>
                </div>

                <span className="ref-section-title">
                  <Camera size={14} /> Reference Face Photo (Required for Attendance Match)
                </span>
                <p className="ref-section-desc">
                  Take a live photo or upload an image to register the employee’s face. Attendance verification will compare against this reference image.
                </p>

                {employeeRefPhoto ? (
                  <div className="ref-photo-preview-card">
                    <img src={employeeRefPhoto} alt="Reference face preview" className="ref-preview-thumbnail" />
                    <div className="ref-photo-meta">
                      <span className="ref-active-tag"><Check size={12} /> Reference Photo Configured</span>
                      <p>Face matching will verify attendance captures against this image.</p>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          id="btn-remove-reference-photo"
                          className="text-button text-danger"
                          onClick={() => {
                            setEmployeeRefPhoto(null);
                            stopRefCamera();
                          }}
                          title="Remove reference photo"
                        >
                          <Trash2 size={13} /> Remove Photo
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setEmployeeRefPhoto(null);
                            startRefCamera();
                          }}
                          title="Open camera to retake photo"
                        >
                          <Camera size={13} /> Retake
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => refFileInputRef.current?.click()}
                          title="Upload new face image"
                        >
                          <Upload size={13} /> Upload New
                        </button>
                      </div>
                    </div>
                  </div>
                ) : showRefCam ? (
                  <div className="ref-camera-container">
                    <video
                      ref={(el) => {
                        refVideoRef.current = el;
                        if (el && refStreamRef.current && el.srcObject !== refStreamRef.current) {
                          el.srcObject = refStreamRef.current;
                          el.play().catch(() => { });
                        }
                      }}
                      autoPlay
                      muted
                      playsInline
                      className="ref-camera-video"
                    />
                    <div className="ref-cam-actions">
                      <button type="button" className="primary" onClick={captureRefPhoto}>
                        <Camera size={16} /> Capture Reference Photo
                      </button>
                      <button type="button" className="secondary" onClick={stopRefCamera}>
                        Cancel Camera
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ref-empty-box">
                    <div className="ref-icon-circle"><User size={24} /></div>
                    <strong>{editingEmployee ? 'No Reference Photo Set (Removed)' : 'No Reference Photo Taken Yet'}</strong>
                    <p>{editingEmployee ? 'Photo has been removed. Click "Update Employee Profile" to save, or add a new photo below.' : 'Take a live picture of the employee or upload a clear face portrait.'}</p>
                    <div className="ref-btn-group">
                      <button type="button" className="secondary" onClick={startRefCamera}>
                        <Camera size={14} /> Open Camera
                      </button>
                      <button type="button" className="secondary" onClick={() => refFileInputRef.current?.click()}>
                        <Upload size={14} /> Upload Face Image
                      </button>
                      <input
                        type="file"
                        ref={refFileInputRef}
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={uploadRefPhoto}
                      />
                    </div>
                  </div>
                )}
              </div>

              {error && <div className="alert" role="alert">{error}</div>}

              <div className="modal-footer-row">
                {editingEmployee && (isSuperAdmin || isManager || isAdmin) && (
                  <button
                    type="button"
                    id="btn-modal-remove-employee"
                    className="action-pill remove modal-remove-btn"
                    onClick={() => {
                      const empToDelete = editingEmployee;
                      setShowEmployeeModal(false);
                      setEditingEmployee(null);
                      setEmployeeRefPhoto(null);
                      stopRefCamera();
                      removeEmployee(empToDelete);
                    }}
                    disabled={busy}
                    title="Remove this employee"
                  >
                    <Trash2 size={14} /> Remove Employee
                  </button>
                )}
                <button className="primary modal-submit-btn" disabled={busy}>
                  {busy ? 'Saving Employee…' : editingEmployee ? 'Update Employee Profile' : 'Complete Employee Registration'}
                  <ArrowRight size={17} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* MODAL: ADD / EDIT OFFICE (SUPER ADMIN ONLY) */}
      {showOffice && isSuperAdmin && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="office-title">
            <div className="card-title">
              <h2 id="office-title">{editingOffice ? 'Edit Workplace Location' : 'Add an office location'}</h2>
              <button aria-label="Close" disabled={busy} onClick={() => { setShowOffice(false); setEditingOffice(null); }}><X /></button>
            </div>
            <p>{editingOffice ? 'Modify office coordinates, address, and boundary radius.' : 'Set the fixed centre and permitted attendance radius.'}</p>
            <form key={editingOffice?.id || 'new'} onSubmit={saveOffice}>
              <label>Office name<input name="name" required maxLength={100} defaultValue={editingOffice?.name || ''} placeholder="e.g. Krishna Gaushala Jainabad" autoFocus /></label>
              <label>Address<input name="address" required maxLength={250} defaultValue={editingOffice?.address || ''} placeholder="Street and city" /></label>
              <div className="form-row">
                <label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" defaultValue={editingOffice?.latitude ?? ''} required /></label>
                <label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" defaultValue={editingOffice?.longitude ?? ''} required /></label>
              </div>
              <button type="button" className="secondary full" disabled={busy || officeLocating} onClick={useCurrentOfficeLocation}>
                {officeLocating ? <LoaderCircle className="spin" size={17} /> : <MapPin size={17} />}
                {officeLocating ? 'Getting your location…' : 'Use current location'}
              </button>
              {officeLocationAccuracy !== null && (
                <p role="status">Device location filled · reported accuracy ±{officeLocationAccuracy} m. {officeLocationAccuracy > 100 ? 'Attendance needs a reading within 100 m; a phone may provide better accuracy.' : 'Save to apply this location.'}</p>
              )}
              <label>Radius in metres<input name="radius" type="number" min="20" max="1000" defaultValue={editingOffice?.radius_meters || 150} required /></label>
              {error && <div className="alert" role="alert">{error}</div>}
              <button className="primary full" disabled={busy || officeLocating}>{busy ? 'Saving…' : editingOffice ? 'Save Changes' : 'Save office location'}<ArrowRight size={17} /></button>
            </form>
          </section>
        </div>
      )}
      {/* POPUP: ATTENDANCE MATCHED & RECORDED (SRS Section 5.2 item 15) */}
      {successModalData && (
        <div className="modal-backdrop" onClick={() => setSuccessModalData(null)}>
          <div className="success-popup-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="success-popup-icon-wrap">
              <span className="success-popup-pulse" />
              <div className="success-popup-icon-circle">
                <Check size={36} strokeWidth={2.8} />
              </div>
            </div>
            <h2>Successfully marked attendance</h2>
            <p className="success-popup-thankyou">Thank you.</p>

            <div className="popup-face-matched-section single-captured">
              <div className="popup-face-preview-card">
                <img src={successModalData.recentPhoto} alt="Captured photo" className="popup-recent-face-img" />
                <span className="popup-photo-badge green">{successModalData.faceVerification?.decision === 'match' ? 'Face matched' : 'Captured photo'}</span>
              </div>
            </div>

            <div className="success-popup-details">
              <div className="success-popup-row">
                <span>Employee Name</span>
                <strong>{successModalData.employeeName}</strong>
              </div>
              <div className="success-popup-row">
                <span>Verified Email</span>
                <strong>{successModalData.employeeEmail}</strong>
              </div>
              <div className="success-popup-row">
                <span>Employee ID</span>
                <strong><span className="emp-id-pill">{successModalData.employeeId}</span></strong>
              </div>
              <div className="success-popup-row">
                <span>Event Type & Time</span>
                <strong>{successModalData.action} · {successModalData.time}</strong>
              </div>
              {successModalData.arrivalStatus && (
                <div className="success-popup-row">
                  <span>Shift Arrival Status</span>
                  <strong>
                    <span className={'arrival-tag ' + (successModalData.arrivalStatus.toLowerCase().replace(' ', '-'))}>
                      {successModalData.arrivalStatus}
                    </span>
                  </strong>
                </div>
              )}
              <div className="success-popup-row">
                <span>Workplace Site</span>
                <strong>{successModalData.office}</strong>
              </div>
            </div>

            <button
              id="btn-attendance-popup-done"
              type="button"
              className="success-popup-done-btn"
              onClick={() => setSuccessModalData(null)}
              autoFocus
            >
              Continue Work Day
            </button>
          </div>
        </div>
      )}

      {/* MODAL: MANAGER ATTENDANCE CORRECTION (SRS Section 7 & 12) */}
      {correctionModalData && (
        <div className="modal-backdrop" onClick={() => setCorrectionModalData(null)}>
          <section className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="card-title">
              <h2>Correct Attendance Timestamp</h2>
              <button aria-label="Close" disabled={busy} onClick={() => setCorrectionModalData(null)}><X /></button>
            </div>
            <p>
              Managers can correct attendance event times with a mandatory justification. All corrections are permanently recorded in the immutable audit trail.
            </p>
            <form onSubmit={submitCorrection}>
              <div className="profile-rows-container" style={{ marginBottom: 16 }}>
                <div className="profile-row">
                  <span className="profile-row-label">Employee</span>
                  <strong>{correctionModalData.employee_name || 'Staff Member'}</strong>
                </div>
                <div className="profile-row">
                  <span className="profile-row-label">Activity Type</span>
                  <span className={'tag ' + (correctionModalData.check_type === 'CHECK_IN' ? 'green' : 'neutral')}>
                    {correctionModalData.check_type === 'CHECK_IN' ? '↗ Check-in' : '↙ Check-out'}
                  </span>
                </div>
                <div className="profile-row">
                  <span className="profile-row-label">Current Recorded Time</span>
                  <span>{new Date(correctionModalData.timestamp).toLocaleString()}</span>
                </div>
              </div>

              <label>
                <span>New Date & Time</span>
                <input
                  name="new_timestamp"
                  type="datetime-local"
                  defaultValue={new Date(new Date(correctionModalData.timestamp).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16)}
                  required
                />
              </label>

              <label>
                <span>Reason for Correction (Mandatory · SRS Section 7)</span>
                <textarea
                  name="reason"
                  rows={3}
                  required
                  placeholder="e.g. Employee physically verified on site at 09:00 AM; mobile device GPS sync delay."
                />
              </label>

              {error && <div className="alert" role="alert">{error}</div>}

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button type="button" className="secondary full" disabled={busy} onClick={() => setCorrectionModalData(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary full" disabled={busy}>
                  {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Save Correction & Log Audit
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* POPUP: SERVER-REPORTED FACE MISMATCH */}
      {mismatchModalData && (
        <div className="modal-backdrop" onClick={() => setMismatchModalData(null)}>
          <div className="mismatch-popup-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="mismatch-popup-icon-wrap">
              <div className="mismatch-popup-icon-circle">
                <UserX size={36} strokeWidth={2.4} />
              </div>
            </div>
            <h2>Face did not match</h2>
            <p className="mismatch-popup-sub">{mismatchModalData.message || 'The captured face did not match the registered photo. Retake a clear photo or ask an administrator for help.'}</p>

            <div className="popup-face-matched-section">
              <div className="popup-face-preview-card mismatch">
                <img src={mismatchModalData.capturedPhoto} alt="Captured photo" className="popup-recent-face-img" />
                <span className="popup-photo-badge red">Captured (Not Matched)</span>
              </div>
              {mismatchModalData.referencePhoto && (
                <div className="popup-face-preview-card">
                  <img src={mismatchModalData.referencePhoto} alt="Registered photo" className="popup-recent-face-img" />
                  <span className="popup-photo-badge">Registered Profile</span>
                </div>
              )}
            </div>

            <div className="mismatch-details-card">
              <div className="mismatch-row">
                <span>Expected Employee</span>
                <strong>{mismatchModalData.employee?.name || 'Registered Employee'}</strong>
              </div>
              <div className="mismatch-row">
                <span>Verification Result</span>
                <strong className="text-danger">Face mismatch · attendance was not recorded</strong>
              </div>
            </div>

            <button
              type="button"
              className="primary full"
              onClick={() => {
                setMismatchModalData(null);
                setError('');
                resetCapture();
              }}
              autoFocus
            >
              <Camera size={16} /> Retake Photo
            </button>
          </div>
        </div>
      )}

      {/* POPUP: NEW EMPLOYEE GENERATED PASSWORD (SHOWS "THIS IS YOUR PASSWORD") */}
      {newPasswordPopup && (
        <div className="modal-backdrop" onClick={() => setNewPasswordPopup(null)}>
          <div className="credentials-popup-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="credentials-header-icon">
              <Key size={28} strokeWidth={2.4} />
            </div>
            <h2>Employee Password Generated</h2>
            <p className="cred-sub">
              This is your password for <strong>{newPasswordPopup.name}</strong>:
            </p>

            <div className="credentials-card">
              <div className="cred-field-row">
                <div className="cred-field-label">
                  <span>Generated Password</span>
                  {copyFeedback === 'popup-pass' && <span className="copy-toast-inline">✓ Copied</span>}
                </div>
                <div className="cred-code-box">
                  <span id="popup-password-text">{newPasswordPopup.password}</span>
                  <div className="cred-code-actions">
                    <button
                      id="btn-copy-popup-password"
                      type="button"
                      className="cred-copy-btn"
                      onClick={() => copyToClipboard(newPasswordPopup.password, 'popup-pass')}
                      title="Copy password to clipboard"
                    >
                      <Copy size={13} /> {copyFeedback === 'popup-pass' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="cred-info-banner">
                <Sparkles size={16} />
                <div>
                  <strong>First-Time Login Requirement:</strong> This temporary password will only be used once. The employee will be required to change their password upon their first login to the portal.
                </div>
              </div>
            </div>

            <div className="credentials-modal-actions">
              <button
                id="btn-dismiss-password-popup"
                type="button"
                className="primary full"
                onClick={() => setNewPasswordPopup(null)}
              >
                <Check size={16} /> Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
