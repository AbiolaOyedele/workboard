import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Upload, RefreshCw, Trash2, RotateCcw, X, Palette, User, Type,
  Monitor, Sparkles, History, Database, LogOut, ChevronDown, ChevronRight,
  CreditCard, Edit3, Image, Camera, Mail, Lock, AlertTriangle,
  Building2, Phone, Globe, MapPin, FileText, ExternalLink, Link2,
  Plus, Check, Zap, Bell, Star, DollarSign, Shield,
  ToggleLeft, ArrowRight, Webhook, CheckCircle2, MessageSquare, Loader2,
} from 'lucide-react';
import WhatsNewPopup from '../components/WhatsNewPopup';
import ChangelogPopup from '../components/ChangelogPopup';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const BOT_URL = import.meta.env.VITE_BOT_URL || 'http://localhost:3001';

const THEME_COLORS = [
  '#ED64A6', '#F56565', '#ED8936', '#38B2AC',
  '#9F7AEA', '#667EEA', '#48BB78', '#4299E1',
];

const NAV = [
  'Profile', 'Branding', 'Business Info', 'Payments',
  'General', 'Emails', 'Integrations', 'WhatsApp', 'Billing',
];

const normalizeHex = (val) => { const t = val.trim(); return t.startsWith('#') ? t : `#${t}`; };
const isValidHex = (val) => /^#[0-9A-Fa-f]{6}$/.test(normalizeHex(val));

function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function escapeCsvField(val) {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function rowToCSV(fields) { return fields.map(escapeCsvField).join(','); }

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0"
      style={checked ? { backgroundColor: 'var(--accent)' } : { backgroundColor: '#e5e7eb' }}
    >
      <span
        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform"
        style={{ left: checked ? '18px' : '2px' }}
      />
    </button>
  );
}

function SettingRow({ icon: Icon, title, description, action, border = true, children }) {
  return (
    <div className={`flex items-center gap-4 py-4 ${border ? 'border-b border-gray-100' : ''}`}>
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-gray-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
        {children}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

function SectionGroup({ title, children, className = '' }) {
  return (
    <div className={`mb-8 ${className}`}>
      {title && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</p>}
      <div className="bg-white rounded-2xl shadow-sm px-5">{children}</div>
    </div>
  );
}

function NavItem({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}

const selectClass = 'w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all appearance-none cursor-pointer';
const inputClass = 'w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all';

// ── Invoice layout previews ───────────────────────────────────────────────────

function LayoutPreview({ id }) {
  if (id === 'left_aligned') return (
    <div className="p-2 h-full flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <div className="h-2 w-10 bg-gray-800 rounded-sm" />
        <div className="h-1 w-7 bg-gray-300 rounded-sm" />
      </div>
      <div className="flex-1 space-y-0.5 pt-1">
        <div className="h-px w-full bg-gray-200" />
        <div className="h-px w-3/4 bg-gray-100" />
        <div className="h-px w-1/2 bg-gray-100" />
      </div>
      <div className="flex justify-end">
        <div className="h-1.5 w-8 bg-gray-700 rounded-sm" />
      </div>
    </div>
  );
  if (id === 'bold_header') return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="h-7 flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 20%, white)' }}>
        <div className="h-1.5 w-14 rounded-sm" style={{ backgroundColor: 'var(--accent)' }} />
      </div>
      <div className="flex-1 p-1.5 space-y-0.5">
        <div className="h-px w-full bg-gray-200" />
        <div className="h-px w-3/4 bg-gray-100" />
        <div className="h-px w-1/2 bg-gray-100" />
      </div>
    </div>
  );
  if (id === 'classic') return (
    <div className="h-full flex flex-col items-center gap-1 p-2">
      <div className="w-5 h-5 rounded-full bg-gray-200" />
      <div className="h-1.5 w-10 bg-gray-700 rounded-sm" />
      <div className="w-full space-y-0.5 pt-1">
        <div className="h-px w-full bg-gray-200" />
        <div className="h-px w-3/4 bg-gray-100 mx-auto" />
        <div className="h-px w-1/2 bg-gray-100 mx-auto" />
      </div>
    </div>
  );
  if (id === 'brutalist') return (
    <div className="h-full border-2 border-gray-800 rounded-lg overflow-hidden">
      <div className="bg-gray-900 h-5 flex items-center px-1.5">
        <div className="h-1 w-8 bg-white rounded-sm" />
      </div>
      <div className="p-1.5 space-y-0.5">
        <div className="h-px w-full bg-gray-500" />
        <div className="h-px w-3/4 bg-gray-400" />
      </div>
    </div>
  );
  return null;
}

const INVOICE_LAYOUTS = [
  { id: 'left_aligned', label: 'Left Aligned' },
  { id: 'bold_header',  label: 'Bold Header' },
  { id: 'classic',      label: 'Classic' },
  { id: 'brutalist',    label: 'Brutalist' },
];

const PAGE_BG_PRESETS = [
  { id: 'preset-1', style: 'linear-gradient(135deg,#f5f7fa 0%,#c3cfe2 100%)' },
  { id: 'preset-2', style: 'linear-gradient(135deg,#ffecd2 0%,#fcb69f 100%)' },
  { id: 'preset-3', style: 'linear-gradient(135deg,#a1c4fd 0%,#c2e9fb 100%)' },
  { id: 'preset-4', style: 'linear-gradient(135deg,#d4fc79 0%,#96e6a1 100%)' },
  { id: 'preset-5', style: 'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)' },
  { id: 'preset-6', style: 'linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)' },
];

const PAYMENT_METHODS = [
  'Bank Transfer', 'Stripe', 'Credit Card', 'PayPal',
  'Cash', 'Check', 'Cryptocurrency', 'Wise', 'Revolut',
];

const PAYMENT_FIELD_OPTIONS = [
  'Bank', 'Account Name', 'Account Number', 'Routing Number',
  'SWIFT/BIC', 'IBAN', 'BSB', 'Sort Code', 'IFSC',
  'Email', 'Phone', 'Username', 'Wallet Address', 'Network', 'Reference',
];

const METHOD_DEFAULT_FIELDS = {
  'Bank Transfer': ['Bank', 'Account Name', 'Account Number', 'Sort Code'],
  'Stripe': ['Email'],
  'Credit Card': ['Reference'],
  'PayPal': ['Email'],
  'Cash': ['Reference'],
  'Check': ['Account Name', 'Reference'],
  'Cryptocurrency': ['Wallet Address', 'Network'],
  'Wise': ['Email', 'Account Name'],
  'Revolut': ['Phone', 'Username'],
};

const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD MMM YYYY'];

const LANGUAGES = ['English', 'French', 'Spanish', 'German', 'Portuguese', 'Italian', 'Dutch', 'Arabic'];

const CURRENCIES = [
  { code: 'USD', flag: '🇺🇸', label: 'USD – US Dollar' },
  { code: 'EUR', flag: '🇪🇺', label: 'EUR – Euro' },
  { code: 'GBP', flag: '🇬🇧', label: 'GBP – British Pound' },
  { code: 'NGN', flag: '🇳🇬', label: 'NGN – Nigerian Naira' },
  { code: 'CAD', flag: '🇨🇦', label: 'CAD – Canadian Dollar' },
  { code: 'AUD', flag: '🇦🇺', label: 'AUD – Australian Dollar' },
  { code: 'JPY', flag: '🇯🇵', label: 'JPY – Japanese Yen' },
  { code: 'CHF', flag: '🇨🇭', label: 'CHF – Swiss Franc' },
  { code: 'INR', flag: '🇮🇳', label: 'INR – Indian Rupee' },
  { code: 'ZAR', flag: '🇿🇦', label: 'ZAR – South African Rand' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function Settings({ clients, refetch }) {
  const {
    settings, saveSetting, refreshExchangeRate,
    trash, restoreFromTrash, deleteForever, showToast, dismissToast,
  } = useSettings();
  const { user, signOut } = useAuth();

  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'Profile';
  const [activeSection, setActiveSection] = useState(NAV.includes(initialTab) ? initialTab : 'Profile');

  // Keep tab in sync if search params change (e.g. from GettingStartedChecklist link)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && NAV.includes(tab)) setActiveSection(tab);
  }, [searchParams]);

  // Fetch WhatsApp connection status on mount
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('whatsapp_connections')
      .select('phone_number, verified, connected_at')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setWaConnection(data || null);
        if (data?.phone_number) setWaPhone(data.phone_number);
        setWaLoading(false);
      });
  }, [user?.id]);

  // ── Shared state ────────────────────────────────────────────────────────────
  const [accentHexInput, setAccentHexInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const avatarRef    = useRef(null);
  const logoRef      = useRef(null);
  const coverRef     = useRef(null);
  const pageBgImgRef = useRef(null);
  const bodyFontRef  = useRef(null);
  const headingFontRef = useRef(null);
  const importFileRef  = useRef(null);

  // ── Profile state ────────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(
    settings.username || user?.user_metadata?.full_name || ''
  );
  const [pwForm, setPwForm]   = useState({ new: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [deleteStep, setDeleteStep] = useState(0); // 0=idle 1=confirm
  const [deleteText, setDeleteText] = useState('');

  // ── Payments state ───────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState(() => {
    try { return JSON.parse(settings.payment_templates || '[]'); } catch { return []; }
  });
  const [showTplForm, setShowTplForm] = useState(false);
  const [editingTpl, setEditingTpl]   = useState(null);
  const [tplForm, setTplForm] = useState({ name: '', method: 'Bank Transfer', fields: [] });
  const [addFieldOpen, setAddFieldOpen] = useState(false);

  // ── Clients label ────────────────────────────────────────────────────────────
  const [clientsLabelInput, setClientsLabelInput] = useState(settings.clients_label || 'Clients');

  // ── Page background tab ──────────────────────────────────────────────────────
  const [pageBgTab, setPageBgTab] = useState(settings.page_bg_type || 'color');

  // ── WhatsApp state ───────────────────────────────────────────────────────────
  const [waConnection, setWaConnection]   = useState(null);
  const [waLoading, setWaLoading]         = useState(true);
  const [waPhone, setWaPhone]             = useState('');
  const [waCodeSent, setWaCodeSent]       = useState(false);
  const [waCode, setWaCode]               = useState('');
  const [waSending, setWaSending]         = useState(false);
  const [waVerifying, setWaVerifying]     = useState(false);
  const [waError, setWaError]             = useState('');
  const [waDisconnecting, setWaDisconnecting] = useState(false);

  // ── Fey reminder state ───────────────────────────────────────────────────────
  const feyDeadlineReminders = settings.fey_deadline_reminders === 'true';
  const feyDailyNudge        = settings.fey_daily_nudge === 'true';
  const feyReminderTime      = settings.fey_reminder_time || '08:00';

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Avatar must be under 2 MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => saveSetting('avatar_url', reader.result);
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { showToast('Logo must be under 500 KB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => saveSetting('logo', reader.result);
    reader.readAsDataURL(file);
  };

  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) { showToast('Cover must be under 1 MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => saveSetting('cover_image', reader.result);
    reader.readAsDataURL(file);
  };

  const handlePageBgImgUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Background image must be under 2 MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => { saveSetting('page_bg_image', reader.result); saveSetting('page_bg_type', 'image'); };
    reader.readAsDataURL(file);
  };

  const handleBodyFontUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Font must be under 2 MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      const name = file.name.replace(/\.[^.]+$/, '');
      saveSetting('custom_font', reader.result);
      saveSetting('custom_font_name', name);
      saveSetting('font_family', 'custom');
    };
    reader.readAsDataURL(file);
  };

  const handleHeadingFontUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Font must be under 2 MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      const name = file.name.replace(/\.[^.]+$/, '');
      saveSetting('custom_heading_font', reader.result);
      saveSetting('custom_heading_font_name', name);
      saveSetting('heading_font', 'custom');
    };
    reader.readAsDataURL(file);
  };

  const handleRefreshRate = async () => {
    setRefreshing(true);
    await refreshExchangeRate();
    setRefreshing(false);
    showToast('Exchange rate updated');
  };

  const handleAccentHex = (val) => {
    setAccentHexInput(val);
    if (isValidHex(val)) saveSetting('accent_color', normalizeHex(val));
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (pwForm.new !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    if (pwForm.new.length < 6) { setPwError('Minimum 6 characters'); return; }
    const { error } = await supabase.auth.updateUser({ password: pwForm.new });
    if (error) { setPwError(error.message); }
    else { setPwSuccess(true); setPwForm({ new: '', confirm: '' }); }
  };

  const handleDeleteAccount = async () => {
    if (deleteText !== 'DELETE') { setPwError(''); return; }
    try {
      const uid = user?.id;
      if (!uid) return;
      await supabase.from('tasks').delete().eq('user_id', uid);
      await supabase.from('retainer_payments').delete().eq('user_id', uid);
      await supabase.from('clients').delete().eq('user_id', uid);
      await supabase.from('standalone_tasks').delete().eq('user_id', uid);
      await supabase.from('task_groups').delete().eq('user_id', uid);
      await supabase.from('shared_clients').delete().eq('owner_id', uid);
      await supabase.from('trash').delete().eq('user_id', uid);
      await supabase.from('app_settings').delete().eq('user_id', uid);
      await signOut();
    } catch (err) {
      showToast(`Delete failed: ${err.message}`);
    }
  };

  // Templates
  const saveTemplates = (tpls) => {
    setTemplates(tpls);
    saveSetting('payment_templates', JSON.stringify(tpls));
  };
  const openNewTemplate = () => {
    setEditingTpl(null);
    const defaultFields = (METHOD_DEFAULT_FIELDS['Bank Transfer'] || []).map((label) => ({ label, value: '' }));
    setTplForm({ name: '', method: 'Bank Transfer', fields: defaultFields });
    setShowTplForm(true);
    setAddFieldOpen(false);
  };

  const handleMethodChange = (method) => {
    const defaultFields = (METHOD_DEFAULT_FIELDS[method] || []).map((label) => ({ label, value: '' }));
    setTplForm((f) => ({ ...f, method, fields: defaultFields }));
  };
  const openEditTemplate = (tpl, idx) => {
    setEditingTpl(idx);
    // Normalize legacy string fields to {label, value} objects
    const fields = (tpl.fields || []).map((f) => typeof f === 'string' ? { label: f, value: '' } : f);
    setTplForm({ name: tpl.name, method: tpl.method, fields });
    setShowTplForm(true);
    setAddFieldOpen(false);
  };
  const saveTplForm = () => {
    if (!tplForm.name.trim()) { showToast('Template needs a name'); return; }
    if (editingTpl !== null) {
      const next = templates.map((t, i) => i === editingTpl ? { ...tplForm } : t);
      saveTemplates(next);
    } else {
      saveTemplates([...templates, { ...tplForm }]);
    }
    setShowTplForm(false);
  };
  const deleteTemplate = (idx) => saveTemplates(templates.filter((_, i) => i !== idx));
  const addFieldToTpl = (field) => {
    if (tplForm.fields.find((f) => f.label === field)) return;
    setTplForm((f) => ({ ...f, fields: [...f.fields, { label: field, value: '' }] }));
    setAddFieldOpen(false);
  };
  const removeFieldFromTpl = (label) => {
    setTplForm((f) => ({ ...f, fields: f.fields.filter((x) => x.label !== label) }));
  };
  const updateFieldValue = (label, value) => {
    setTplForm((f) => ({ ...f, fields: f.fields.map((x) => x.label === label ? { ...x, value } : x) }));
  };

  // Restore / trash
  const handleRestore = async (item) => {
    const result = await restoreFromTrash(item, clients);
    if (result?.error) { showToast(`Restore failed: ${result.error}`); return; }
    let toastId = null;
    const timer = setTimeout(() => { toastId = showToast('Restored successfully, refreshing...'); }, 1000);
    if (refetch) await refetch();
    clearTimeout(timer);
    if (toastId !== null) dismissToast(toastId);
    showToast(result?.autoRestoredClient ? 'Client and task restored' : `"${item.item_name}" restored`);
  };
  const handleDeleteForever = async (item) => {
    await deleteForever(item.id);
    showToast(`"${item.item_name}" permanently deleted`);
  };

  // Data export / import
  const handleExportData = () => {
    const headers = 'client_name,client_color,retainer_amount,task_title,task_done,task_paid,task_amount,task_currency,task_deadline,task_created_at';
    const rows = [];
    (clients || []).forEach((c) => {
      if (!c.tasks || c.tasks.length === 0) {
        rows.push(rowToCSV([c.name, c.color || '', c.retainer || 0, '', '', '', '', '', '', '']));
      } else {
        c.tasks.forEach((t) => rows.push(rowToCSV([c.name, c.color || '', c.retainer || 0, t.title || '', t.done ? 'true' : 'false', t.paid ? 'true' : 'false', t.amount || 0, t.currency || 'NGN', t.deadline || '', t.createdAt || ''])));
      }
    });
    downloadCSV(`workboard-export-${todayStr()}.csv`, [headers, ...rows].join('\n'));
  };
  const handleExportPayments = () => {
    const headers = 'client_name,task_title,amount,currency,type,month,paid_at';
    const rows = [];
    (clients || []).forEach((c) => {
      (c.tasks || []).forEach((t) => {
        if (t.paid) rows.push(rowToCSV([c.name, t.title || '', t.amount || 0, t.currency || 'NGN', 'task', '', '']));
      });
      if (c.retainerPaid && typeof c.retainerPaid === 'object') {
        Object.entries(c.retainerPaid).forEach(([month, paid]) => {
          if (paid) rows.push(rowToCSV([c.name, '', c.retainer || 0, 'NGN', 'retainer', month, '']));
        });
      }
    });
    downloadCSV(`workboard-payments-${todayStr()}.csv`, [headers, ...rows].join('\n'));
  };
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (IS_DEMO) { showToast('Import is disabled in demo mode'); return; }
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length < 2) throw new Error('CSV appears to be empty or has no data rows');
      const expected = 'client_name,client_color,retainer_amount,task_title,task_done,task_paid,task_amount,task_currency,task_deadline,task_created_at';
      if (lines[0].trim() !== expected) throw new Error('CSV headers do not match WorkBoard export format');
      const dataRows = lines.slice(1).map((line) => {
        const fields = []; let current = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { if (inQ && line[i + 1] === '"') { current += '"'; i++; } else inQ = !inQ; }
          else if (ch === ',' && !inQ) { fields.push(current); current = ''; }
          else current += ch;
        }
        fields.push(current);
        return { client_name: fields[0] || '', client_color: fields[1] || '#ED64A6', retainer_amount: fields[2] || '0', task_title: fields[3] || '', task_done: fields[4] || 'false', task_paid: fields[5] || 'false', task_amount: fields[6] || '0', task_currency: fields[7] || 'NGN', task_deadline: fields[8] || '', task_created_at: fields[9] || '' };
      });
      const grouped = {};
      dataRows.forEach((row) => { if (!row.client_name) return; if (!grouped[row.client_name]) grouped[row.client_name] = []; grouped[row.client_name].push(row); });
      let ci = 0, ti = 0;
      for (const [name, rows] of Object.entries(grouped)) {
        const existing = (clients || []).find((c) => c.name.toLowerCase() === name.toLowerCase());
        let clientId;
        if (existing) { clientId = existing.id; }
        else {
          const { data: nc, error: cErr } = await supabase.from('clients').insert({ name, color: rows[0].client_color || '#ED64A6', retainer: parseFloat(rows[0].retainer_amount) || 0, user_id: user?.id }).select().single();
          if (cErr) throw cErr;
          clientId = nc.id; ci++;
        }
        for (const row of rows) {
          if (!row.task_title) continue;
          const { error: tErr } = await supabase.from('tasks').insert({ client_id: clientId, title: row.task_title, done: row.task_done === 'true', paid: row.task_paid === 'true', amount: parseFloat(row.task_amount) || 0, currency: row.task_currency || 'NGN', deadline: row.task_deadline || null, user_id: user?.id });
          if (tErr) throw tErr;
          ti++;
        }
      }
      showToast(`Imported ${ci} client${ci !== 1 ? 's' : ''} and ${ti} task${ti !== 1 ? 's' : ''}`);
      if (refetch) await refetch();
    } catch (err) { showToast(`Import failed: ${err.message}`); }
    finally { setImporting(false); }
  };

  // ── Section renderers ─────────────────────────────────────────────────────────

  const renderProfile = () => {
    const googleUser = user?.app_metadata?.provider === 'google' || user?.identities?.some((i) => i.provider === 'google');
    const avatarSrc = settings.avatar_url || user?.user_metadata?.avatar_url || '';
    const initials = (fullName || user?.email || '?').slice(0, 2).toUpperCase();

    return (
      <>
        {/* Avatar */}
        <SectionGroup title="Profile Photo">
          <div className="py-5 flex items-center gap-5">
            <div className="relative group flex-shrink-0">
              {avatarSrc ? (
                <img src={avatarSrc} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover border border-gray-200" />
              ) : (
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: 'var(--accent)' }}>
                  {initials}
                </div>
              )}
              <button
                onClick={() => avatarRef.current?.click()}
                className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Camera size={16} className="text-white" />
              </button>
              <input ref={avatarRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Profile photo</p>
              <p className="text-xs text-gray-400 mt-0.5 mb-2">PNG or JPG · max 2 MB</p>
              <div className="flex gap-2">
                <button onClick={() => avatarRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                  <Upload size={11} />Upload
                </button>
                {avatarSrc && (
                  <button onClick={() => saveSetting('avatar_url', '')} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-xl text-xs font-medium text-red-500 hover:bg-red-100 transition-colors">
                    <X size={11} />Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </SectionGroup>

        {/* Identity */}
        <SectionGroup title="Identity">
          <SettingRow icon={User} title="Full Name" description="Shown across the app">
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => saveSetting('username', fullName.trim())}
              placeholder="e.g. Alex Johnson"
              className="mt-2 w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all"
            />
          </SettingRow>
          <SettingRow icon={Mail} title="Email" description="Managed by your auth provider" border={false}>
            <div className="mt-2 flex items-center gap-2">
              <input type="email" value={user?.email || ''} readOnly className="flex-1 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-500 cursor-not-allowed" />
              <span className="text-xs text-gray-400 italic whitespace-nowrap">Cannot be changed here</span>
            </div>
          </SettingRow>
        </SectionGroup>

        {/* Hourly Rate */}
        <SectionGroup title="Billing">
          <SettingRow icon={DollarSign} title="Hourly Rate" description="Used on invoices and quotes" border={false}>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-gray-500 font-medium">{settings.currency || 'NGN'}</span>
              <input
                type="number"
                value={settings.hourly_rate}
                onChange={(e) => saveSetting('hourly_rate', e.target.value)}
                placeholder="0.00"
                className="flex-1 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all"
              />
              <span className="text-xs text-gray-400">/ hr</span>
            </div>
          </SettingRow>
        </SectionGroup>

        {/* Change Password */}
        {!googleUser && (
          <SectionGroup title="Change Password">
            <div className="py-4 space-y-3">
              <input type="password" placeholder="New password" value={pwForm.new} onChange={(e) => setPwForm((f) => ({ ...f, new: e.target.value }))} className={inputClass} />
              <input type="password" placeholder="Confirm new password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} className={inputClass} />
              {pwError && <p className="text-xs text-red-500">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-green-600">Password updated successfully</p>}
              <button onClick={handleChangePassword} className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90" style={{ backgroundColor: 'var(--accent)' }}>
                Update password
              </button>
            </div>
          </SectionGroup>
        )}

        {/* Account */}
        <SectionGroup title="Account">
          {!IS_DEMO && user ? (
            <SettingRow icon={LogOut} title={user.email} description="Signed in" border={false}
              action={
                <button onClick={signOut} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-opacity" style={{ backgroundColor: 'var(--accent)' }}>
                  <LogOut size={13} />Sign Out
                </button>
              }
            />
          ) : (
            <p className="text-sm text-gray-400 py-6 text-center">Not signed in</p>
          )}
        </SectionGroup>

        {/* Danger Zone */}
        <SectionGroup title="Danger Zone">
          <div className="py-4">
            {deleteStep === 0 ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Delete Account</p>
                  <p className="text-xs text-gray-400 mt-0.5">Permanently deletes your account and all data</p>
                </div>
                <button
                  onClick={() => { setDeleteStep(1); setDeleteText(''); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <AlertTriangle size={14} />Delete Account
                </button>
              </div>
            ) : (
              <div className="border border-red-200 rounded-xl p-4 bg-red-50 space-y-3">
                <p className="text-sm font-semibold text-red-700">This cannot be undone.</p>
                <p className="text-xs text-red-600">All clients, tasks, payments, and settings will be permanently deleted. Type <strong>DELETE</strong> below to confirm.</p>
                <input
                  type="text"
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="w-full px-3 py-2 rounded-xl border border-red-200 bg-white text-sm outline-none focus:border-red-400"
                />
                <div className="flex gap-2">
                  <button onClick={() => { setDeleteStep(0); setDeleteText(''); }} className="flex-1 py-2 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteText !== 'DELETE'}
                    className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Delete my account
                  </button>
                </div>
              </div>
            )}
          </div>
        </SectionGroup>
      </>
    );
  };

  const renderBranding = () => (
    <>
      {/* Business Logo */}
      <SectionGroup title="Logo &amp; Cover">
        <SettingRow icon={Image} title="Business Logo" description="PNG or JPG · max 500 KB">
          <div className="mt-2 flex items-center gap-3">
            {settings.logo && (
              <div className="relative group">
                <img src={settings.logo} alt="Logo" className="w-10 h-10 rounded-xl object-contain bg-white border border-gray-200" />
                <button onClick={() => saveSetting('logo', '')} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={8} />
                </button>
              </div>
            )}
            <button onClick={() => logoRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">
              <Upload size={12} />Upload Logo
            </button>
            <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
          </div>
        </SettingRow>
        <SettingRow icon={Image} title="Header Cover Image" description="Displayed on invoice headers · max 1 MB" border={false}>
          <div className="mt-2 flex items-center gap-3">
            {settings.cover_image && (
              <div className="relative group">
                <img src={settings.cover_image} alt="Cover" className="h-10 rounded-xl object-cover border border-gray-200" style={{ maxWidth: 120 }} />
                <button onClick={() => saveSetting('cover_image', '')} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={8} />
                </button>
              </div>
            )}
            <button onClick={() => coverRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">
              <Upload size={12} />Upload Cover
            </button>
            <input ref={coverRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
          </div>
        </SettingRow>
      </SectionGroup>

      {/* Invoice Layout */}
      <SectionGroup title="Invoice Layout">
        <div className="py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {INVOICE_LAYOUTS.map(({ id, label }) => {
              const active = (settings.invoice_layout || 'left_aligned') === id;
              return (
                <button
                  key={id}
                  onClick={() => saveSetting('invoice_layout', id)}
                  className="flex flex-col items-center gap-2"
                >
                  <div
                    className={`w-full h-20 rounded-xl border-2 overflow-hidden transition-all ${active ? '' : 'border-gray-200 hover:border-gray-300'}`}
                    style={active ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent)' } : {}}
                  >
                    <LayoutPreview id={id} />
                  </div>
                  <span className={`text-xs font-medium ${active ? '' : 'text-gray-500'}`} style={active ? { color: 'var(--accent)' } : {}}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </SectionGroup>

      {/* Invoice Colors */}
      <SectionGroup title="Invoice Colors">
        <div className="py-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-2">Font Color</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="w-8 h-8 rounded-lg border border-gray-200 flex-shrink-0 relative overflow-hidden">
                <div className="absolute inset-0" style={{ backgroundColor: settings.invoice_font_color || '#1a1a1a' }} />
                <input type="color" value={settings.invoice_font_color || '#1a1a1a'} onChange={(e) => saveSetting('invoice_font_color', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
              </div>
              <span className="text-sm font-mono text-gray-600">{settings.invoice_font_color || '#1a1a1a'}</span>
            </label>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2">Background Color</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="w-8 h-8 rounded-lg border border-gray-200 flex-shrink-0 relative overflow-hidden">
                <div className="absolute inset-0" style={{ backgroundColor: settings.invoice_bg_color || '#ffffff' }} />
                <input type="color" value={settings.invoice_bg_color || '#ffffff'} onChange={(e) => saveSetting('invoice_bg_color', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
              </div>
              <span className="text-sm font-mono text-gray-600">{settings.invoice_bg_color || '#ffffff'}</span>
            </label>
          </div>
        </div>
      </SectionGroup>

      {/* Page Background */}
      <SectionGroup title="Page Background">
        <div className="py-4">
          <div className="flex gap-2 mb-4">
            {['color', 'image', 'video'].map((t) => (
              <button
                key={t}
                onClick={() => { setPageBgTab(t); if (t !== 'video') saveSetting('page_bg_type', t); }}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${pageBgTab === t ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                style={pageBgTab === t ? { backgroundColor: 'var(--accent)' } : {}}
              >
                {t}
              </button>
            ))}
          </div>

          {pageBgTab === 'color' && (
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="w-10 h-10 rounded-xl border border-gray-200 flex-shrink-0 relative overflow-hidden">
                <div className="absolute inset-0" style={{ backgroundColor: settings.page_bg_color || '#f9fafb' }} />
                <input type="color" value={settings.page_bg_color || '#f9fafb'} onChange={(e) => { saveSetting('page_bg_color', e.target.value); saveSetting('page_bg_type', 'color'); }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Background color</p>
                <p className="text-xs text-gray-400 font-mono">{settings.page_bg_color || '#f9fafb'}</p>
              </div>
            </label>
          )}

          {pageBgTab === 'image' && (
            <div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {PAGE_BG_PRESETS.map((preset) => {
                  const active = settings.page_bg_image === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => { saveSetting('page_bg_image', preset.id); saveSetting('page_bg_type', 'image'); }}
                      className={`h-14 rounded-xl border-2 transition-all ${active ? '' : 'border-transparent hover:border-gray-300'}`}
                      style={{ background: preset.style, borderColor: active ? 'var(--accent)' : undefined }}
                    />
                  );
                })}
                <button
                  onClick={() => pageBgImgRef.current?.click()}
                  className="h-14 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors flex items-center justify-center gap-1 text-xs text-gray-400"
                >
                  <Upload size={12} />Custom
                </button>
                <input ref={pageBgImgRef} type="file" accept="image/*" onChange={handlePageBgImgUpload} className="hidden" />
              </div>
              {settings.page_bg_image && !settings.page_bg_image.startsWith('preset-') && (
                <p className="text-xs text-gray-400">Custom image set · <button onClick={() => saveSetting('page_bg_image', '')} className="text-red-400 hover:underline">Remove</button></p>
              )}
            </div>
          )}

          {pageBgTab === 'video' && (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-400">Video backgrounds coming soon</p>
            </div>
          )}
        </div>
      </SectionGroup>

      {/* Accent Color */}
      <SectionGroup title="Accent Color">
        <div className="py-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {THEME_COLORS.map((color) => (
              <button key={color} onClick={() => { saveSetting('accent_color', color); setAccentHexInput(''); }}
                className="w-7 h-7 rounded-full transition-all hover:scale-110"
                style={{ backgroundColor: color, outline: settings.accent_color === color ? `2px solid ${color}` : '2px solid transparent', outlineOffset: '2px' }}
              />
            ))}
            <label className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors relative overflow-hidden" title="Custom color">
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" value={settings.accent_color} onChange={(e) => { saveSetting('accent_color', e.target.value); setAccentHexInput(e.target.value); }} />
              <span className="text-gray-400 text-xs font-bold pointer-events-none">+</span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg border border-gray-200 flex-shrink-0" style={{ backgroundColor: settings.accent_color }} />
            <input type="text" placeholder="#ED64A6" value={accentHexInput} onChange={(e) => handleAccentHex(e.target.value)} maxLength={7}
              className="w-32 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm font-mono outline-none focus:border-gray-400 transition-all" />
            <span className="text-xs text-gray-400">Custom hex</span>
          </div>
          {/* Color mode */}
          <div>
            <p className="text-xs text-gray-400 mb-2">Client &amp; campaign colors</p>
            <div className="flex gap-2">
              {[
                { value: 'custom', label: 'Custom colors', desc: 'Each card uses its own chosen color' },
                { value: 'accent', label: 'Use accent color', desc: 'Force accent color on all cards' },
              ].map((opt) => {
                const active = (settings.color_mode || 'custom') === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => saveSetting('color_mode', opt.value)}
                    className="flex-1 text-left px-4 py-3 rounded-xl border-2 transition-all"
                    style={active
                      ? { borderColor: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 8%, white)' }
                      : { borderColor: '#e5e7eb', backgroundColor: 'white' }
                    }
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {/* Color preview swatch */}
                      <div className="flex gap-1">
                        {opt.value === 'custom'
                          ? ['#FBD5E1', '#D1FAE5', '#DBEAFE'].map((c) => (
                              <div key={c} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                            ))
                          : [1, 2, 3].map((i) => (
                              <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                            ))
                        }
                      </div>
                      <span className="text-xs font-semibold text-gray-700">{opt.label}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-2">Card size</p>
            <div className="relative w-48">
              <select value={settings.card_size || 'medium'} onChange={(e) => saveSetting('card_size', e.target.value)} className={selectClass}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </SectionGroup>

      {/* Typography */}
      <SectionGroup title="Typography">
        <div className="py-4 space-y-5">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Body Font</p>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <select value={settings.font_family || ''} onChange={(e) => saveSetting('font_family', e.target.value)} className={selectClass}>
                  <option value="">Default (NoirPro)</option>
                  {settings.custom_font_name && <option value="custom">Custom: {settings.custom_font_name}</option>}
                  <option value="Lato">Lato</option>
                  <option value="Urbanist">Urbanist</option>
                  <option value="Spectral">Spectral</option>
                  <option value="Spectral SC">Spectral SC</option>
                  <option value="Playfair Display">Playfair Display</option>
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <button onClick={() => bodyFontRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                <Upload size={12} />Upload
              </button>
              <input ref={bodyFontRef} type="file" accept=".ttf,.otf,.woff2" onChange={handleBodyFontUpload} className="hidden" />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-medium text-gray-500 mb-2">Heading Font</p>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <select value={settings.heading_font || ''} onChange={(e) => saveSetting('heading_font', e.target.value)} className={selectClass}>
                  <option value="">Default (NoirPro)</option>
                  {settings.custom_heading_font_name && <option value="custom">Custom: {settings.custom_heading_font_name}</option>}
                  <option value="Lato">Lato</option>
                  <option value="Urbanist">Urbanist</option>
                  <option value="Spectral">Spectral</option>
                  <option value="Spectral SC">Spectral SC</option>
                  <option value="Playfair Display">Playfair Display</option>
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <button onClick={() => headingFontRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                <Upload size={12} />Upload
              </button>
              <input ref={headingFontRef} type="file" accept=".ttf,.otf,.woff2" onChange={handleHeadingFontUpload} className="hidden" />
            </div>
          </div>
        </div>
      </SectionGroup>
    </>
  );

  const renderBusinessInfo = () => (
    <>
      <SectionGroup title="Business Details">
        <SettingRow icon={Building2} title="Business Name" description="Appears in the FROM section on invoices">
          <input type="text" value={settings.company_name} onChange={(e) => saveSetting('company_name', e.target.value)} placeholder="e.g. Studio Co." className="mt-2 w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
        </SettingRow>
        <SettingRow icon={Mail} title="Business Email">
          <input type="email" value={settings.business_email} onChange={(e) => saveSetting('business_email', e.target.value)} placeholder="hello@yourbusiness.com" className="mt-2 w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
        </SettingRow>
        <SettingRow icon={Phone} title="Phone">
          <input type="tel" value={settings.business_phone} onChange={(e) => saveSetting('business_phone', e.target.value)} placeholder="+1 (555) 000-0000" className="mt-2 w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
        </SettingRow>
        <SettingRow icon={Globe} title="Website">
          <input type="url" value={settings.business_website} onChange={(e) => saveSetting('business_website', e.target.value)} placeholder="https://yourbusiness.com" className="mt-2 w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
        </SettingRow>
        <SettingRow icon={MapPin} title="Business Address">
          <textarea value={settings.business_address} onChange={(e) => saveSetting('business_address', e.target.value)} rows={3} placeholder="123 Main St, City, Country" className="mt-2 w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all resize-none" />
        </SettingRow>
        <SettingRow icon={FileText} title="Tax ID / VAT Number" border={false}>
          <input type="text" value={settings.tax_id} onChange={(e) => saveSetting('tax_id', e.target.value)} placeholder="e.g. GB123456789" className="mt-2 w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
        </SettingRow>
      </SectionGroup>

      <SectionGroup>
        <div className="py-3">
          <button
            onClick={() => setActiveSection('Payments')}
            className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--accent)' }}
          >
            <CreditCard size={15} />Payment Details
            <ArrowRight size={13} />
          </button>
          <p className="text-xs text-gray-400 mt-0.5 ml-5">Configure payment methods shown on documents</p>
        </div>
      </SectionGroup>
    </>
  );

  const renderPayments = () => (
    <>
      <SectionGroup title="Settings">
        <SettingRow icon={FileText} title="Show payment details on documents" description="Includes your payment info on invoices and quotes" border={false}
          action={<Toggle checked={settings.show_payment_on_docs !== 'false'} onChange={(v) => saveSetting('show_payment_on_docs', String(v))} />}
        />
      </SectionGroup>

      <SectionGroup title="Payment Templates">
        {templates.length === 0 && !showTplForm ? (
          <div className="py-10 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
              <CreditCard size={20} className="text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 font-medium">No payment templates yet</p>
            <button onClick={openNewTemplate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90" style={{ backgroundColor: 'var(--accent)' }}>
              <Plus size={14} />Create first template
            </button>
          </div>
        ) : (
          <>
            {templates.map((tpl, idx) => (
              <div key={idx} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{tpl.name}</p>
                  <p className="text-xs text-gray-400">{tpl.method} · {tpl.fields.length} field{tpl.fields.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => openEditTemplate(tpl, idx)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
                  <Edit3 size={13} />
                </button>
                <button onClick={() => deleteTemplate(idx)} className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <div className="py-3">
              <button onClick={openNewTemplate} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                <Plus size={12} />Add template
              </button>
            </div>
          </>
        )}
      </SectionGroup>

      {/* Template form */}
      {showTplForm && (
        <SectionGroup title={editingTpl !== null ? 'Edit Template' : 'New Template'}>
          <div className="py-4 space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Template Name</p>
              <input type="text" value={tplForm.name} onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. UK Bank Transfer" className={inputClass} />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Payment Method</p>
              <div className="relative">
                <select value={tplForm.method} onChange={(e) => handleMethodChange(e.target.value)} className={selectClass}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400">Fields</p>
                <div className="relative">
                  <button onClick={() => setAddFieldOpen((o) => !o)} className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                    <Plus size={11} />Add field
                  </button>
                  {addFieldOpen && (
                    <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-lg z-10 overflow-hidden">
                      {PAYMENT_FIELD_OPTIONS.filter((f) => !tplForm.fields.find((x) => x.label === f)).map((field) => (
                        <button key={field} onClick={() => addFieldToTpl(field)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          {field}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {tplForm.fields.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No fields added yet</p>
              ) : (
                <div className="space-y-2 mt-1">
                  {tplForm.fields.map(({ label, value }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-32 flex-shrink-0 font-medium">{label}</span>
                      <input
                        value={value}
                        onChange={(e) => updateFieldValue(label, e.target.value)}
                        placeholder={`Enter ${label.toLowerCase()}…`}
                        className={`${inputClass} flex-1 text-sm py-1.5`}
                      />
                      <button onClick={() => removeFieldFromTpl(label)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowTplForm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={saveTplForm} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-opacity" style={{ backgroundColor: 'var(--accent)' }}>
                Save
              </button>
            </div>
          </div>
        </SectionGroup>
      )}
    </>
  );

  const renderGeneral = () => {
    const cl = settings.clients_label || 'Clients';
    const APP_MODES = [
      { value: 'dual',    label: 'Dual',           description: `${cl} + Tasks` },
      { value: 'clients', label: `${cl} Only`,     description: 'Tasks hidden' },
      { value: 'tasks',   label: 'Tasks Only',     description: `${cl} hidden` },
    ];
    const currentMode = settings.app_mode || 'dual';

    return (
      <>
        <SectionGroup title="Localisation">
          <SettingRow icon={Globe} title="Default Invoice Language">
            <div className="mt-2 relative max-w-xs">
              <select value={settings.invoice_language || 'English'} onChange={(e) => saveSetting('invoice_language', e.target.value)} className={selectClass}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </SettingRow>
          <SettingRow icon={DollarSign} title="Currency">
            <div className="mt-2 relative max-w-xs">
              <select value={settings.currency || 'NGN'} onChange={(e) => saveSetting('currency', e.target.value)} className={selectClass}>
                {CURRENCIES.map(({ code, flag, label }) => <option key={code} value={code}>{flag} {label}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button onClick={handleRefreshRate} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-xs text-gray-500 hover:bg-gray-200 transition-colors disabled:opacity-50">
                <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />Refresh rates
              </button>
              {settings.exchange_rate_updated_at && <span className="text-xs text-gray-400">Updated {settings.exchange_rate_updated_at}</span>}
              {(() => { let r = null; try { r = JSON.parse(settings.exchange_rates); } catch { /* ignore */ } if (!r) return null; return <span className="text-xs text-gray-400 font-mono">1 USD = ₦{(r.NGN || 0).toLocaleString()} · £{(r.GBP || 0).toFixed(2)} · €{(r.EUR || 0).toFixed(2)}</span>; })()}
            </div>
          </SettingRow>
          <SettingRow icon={FileText} title="Default Tax Rate" description="Applied to new invoices" border={false}>
            <div className="mt-2 flex items-center gap-2 max-w-xs">
              <input type="number" min="0" max="100" value={settings.default_tax_rate} onChange={(e) => saveSetting('default_tax_rate', e.target.value)} placeholder="0" className="flex-1 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </SettingRow>
        </SectionGroup>

        <SectionGroup title="Document Numbering">
          <div className="py-4 space-y-4">
            {[
              { label: 'Invoice', prefixKey: 'invoice_prefix', nextKey: 'invoice_next', defaultPrefix: 'INV-' },
              { label: 'Quote',   prefixKey: 'quote_prefix',   nextKey: 'quote_next',   defaultPrefix: 'QT-' },
              { label: 'Receipt', prefixKey: 'receipt_prefix', nextKey: 'receipt_next', defaultPrefix: 'REC-' },
            ].map(({ label, prefixKey, nextKey, defaultPrefix }) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input type="text" value={settings[prefixKey] || defaultPrefix} onChange={(e) => saveSetting(prefixKey, e.target.value)} placeholder={defaultPrefix}
                      className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
                    <p className="text-[10px] text-gray-400 mt-1">Prefix</p>
                  </div>
                  <div className="flex-1">
                    <input type="text" value={settings[nextKey] || '001'} onChange={(e) => saveSetting(nextKey, e.target.value)} placeholder="001"
                      className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
                    <p className="text-[10px] text-gray-400 mt-1">Next number</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-sm font-medium text-gray-800">Include date in number</p>
                <p className="text-xs text-gray-400 mt-0.5">e.g. INV-2025-001</p>
              </div>
              <Toggle checked={settings.include_date_in_number === 'true'} onChange={(v) => saveSetting('include_date_in_number', String(v))} />
            </div>
          </div>
        </SectionGroup>

        <SectionGroup title="Defaults">
          <SettingRow icon={FileText} title="Payment Terms" description="Days until invoice is due">
            <div className="mt-2 flex items-center gap-2 max-w-xs">
              <input type="number" min="0" value={settings.payment_terms_days || '14'} onChange={(e) => saveSetting('payment_terms_days', e.target.value)} className="flex-1 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
              <span className="text-sm text-gray-500">days</span>
            </div>
          </SettingRow>
          <SettingRow icon={FileText} title="Quote Valid Until">
            <div className="mt-2 flex items-center gap-2 max-w-xs">
              <input type="number" min="0" value={settings.quote_valid_days || '30'} onChange={(e) => saveSetting('quote_valid_days', e.target.value)} className="flex-1 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
              <span className="text-sm text-gray-500">days</span>
            </div>
          </SettingRow>
          <SettingRow icon={FileText} title="Date Format">
            <div className="mt-2 relative max-w-xs">
              <select value={settings.date_format || 'MM/DD/YYYY'} onChange={(e) => saveSetting('date_format', e.target.value)} className={selectClass}>
                {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </SettingRow>
          <SettingRow icon={FileText} title="Default Invoice Notes">
            <textarea value={settings.default_invoice_notes} onChange={(e) => saveSetting('default_invoice_notes', e.target.value)} rows={3} placeholder="e.g. Thank you for your business!" className="mt-2 w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all resize-none" />
          </SettingRow>
          <SettingRow icon={FileText} title="Auto-generate Receipt" description="Automatically create a receipt when invoice is paid" border={false}
            action={<Toggle checked={settings.auto_generate_receipt === 'true'} onChange={(v) => saveSetting('auto_generate_receipt', String(v))} />}
          />
        </SectionGroup>

        <SectionGroup title="Sharing">
          <SettingRow icon={Link2} title="Revoke public link on payment" description="Shared links expire after the invoice is paid" border={false}
            action={<Toggle checked={settings.revoke_link_on_payment === 'true'} onChange={(v) => saveSetting('revoke_link_on_payment', String(v))} />}
          />
        </SectionGroup>

        <SectionGroup title="App Mode">
          <div className="py-4">
            <div className="grid grid-cols-3 gap-2">
              {APP_MODES.map(({ value, label, description }) => (
                <button key={value} onClick={() => saveSetting('app_mode', value)}
                  className={`rounded-xl p-3 text-left border-2 transition-all ${currentMode === value ? 'border-transparent' : 'border-gray-100 hover:border-gray-200'}`}
                  style={currentMode === value ? { borderColor: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 8%, white)' } : {}}
                >
                  <p className="text-sm font-semibold mb-0.5" style={currentMode === value ? { color: 'var(--accent)' } : { color: '#374151' }}>{label}</p>
                  <p className="text-xs text-gray-400 leading-snug">{description}</p>
                </button>
              ))}
            </div>
          </div>
        </SectionGroup>

        <SectionGroup title="Dashboard">
          <div className="py-4 space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Heading</p>
              <textarea value={settings.dashboard_heading} onChange={(e) => saveSetting('dashboard_heading', e.target.value)} rows={2} className="w-full px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all resize-none" placeholder={`Track your\nwork & earnings`} />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Subtitle <span className="italic">(optional)</span></p>
              <input type="text" value={settings.dashboard_subtitle} onChange={(e) => saveSetting('dashboard_subtitle', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" placeholder="A short tagline or welcome message" />
            </div>
          </div>
        </SectionGroup>

        <SectionGroup title={`${cl} Label`}>
          <div className="py-4">
            <p className="text-xs text-gray-400 mb-2">Rename &ldquo;{cl}&rdquo; throughout the app</p>
            <input type="text" value={clientsLabelInput} onChange={(e) => setClientsLabelInput(e.target.value)} onBlur={(e) => saveSetting('clients_label', e.target.value.trim() || 'Clients')} placeholder="Clients" className="w-full max-w-xs px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all" />
          </div>
        </SectionGroup>

        <SectionGroup title="Data">
          <SettingRow icon={Upload} title="Export Data" description="Download all clients and tasks as CSV"
            action={<button onClick={handleExportData} className="px-3 py-2 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">Export</button>}
          />
          <SettingRow icon={CreditCard} title="Export Payments" description="Download paid task and retainer records"
            action={<button onClick={handleExportPayments} className="px-3 py-2 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">Export</button>}
          />
          <SettingRow icon={Database} title="Import Data" description="Import from a WorkBoard-format CSV" border={false}
            action={
              <>
                <button onClick={() => importFileRef.current?.click()} disabled={importing} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-60">
                  {importing ? <><RefreshCw size={12} className="animate-spin" />Importing…</> : <><Upload size={12} />Choose file</>}
                </button>
                <input ref={importFileRef} type="file" accept=".csv" onChange={handleImportFile} className="hidden" />
              </>
            }
          />
        </SectionGroup>

        <SectionGroup title="Updates">
          <SettingRow icon={Sparkles} title="What's New" description="Latest release highlights"
            action={<button onClick={() => setWhatsNewOpen(true)} className="px-3 py-2 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">View</button>}
          />
          <SettingRow icon={History} title="Changelog" description="Full version history" border={false}
            action={<button onClick={() => setChangelogOpen(true)} className="px-3 py-2 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors">View</button>}
          />
        </SectionGroup>

        <SectionGroup title="Trash · deleted after 45 days">
          <div className="py-2">
            {trash.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Trash is empty</p>
            ) : (
              <>
                <div className="flex justify-end py-2">
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Permanently delete all ${trash.length} item${trash.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
                      await Promise.all(trash.map((item) => deleteForever(item.id)));
                      showToast('Trash cleared');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={11} />Clear all
                  </button>
                </div>
                <div className="space-y-2 pb-2">
                  {trash.map((item) => {
                    const daysLeft = Math.ceil((new Date(item.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.item_name}</p>
                          <p className="text-xs text-gray-400">
                            {item.item_type === 'client' ? (settings.clients_label || 'Client') : item.item_type === 'task_group' ? 'Task Group' : item.item_type === 'standalone_task' ? 'Standalone Task' : 'Task'} · {daysLeft}d left
                          </p>
                        </div>
                        <button onClick={() => handleRestore(item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors" style={{ backgroundColor: 'var(--accent)' }}>
                          <RotateCcw size={11} />Restore
                        </button>
                        <button onClick={() => handleDeleteForever(item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors">
                          <Trash2 size={11} />Delete
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </SectionGroup>
      </>
    );
  };

  const renderEmails = () => {
    const toggles = [
      { key: 'email_acceptance',      label: 'Acceptance notifications',        desc: 'When a client accepts a quote or proposal' },
      { key: 'email_payment_received', label: 'Payment received',                desc: 'When a payment is marked as received' },
      { key: 'email_stripe',           label: 'Stripe payment notifications',     desc: 'Notifications from Stripe for processed payments' },
      { key: 'email_project_activity', label: 'Project activity notifications',   desc: 'Updates on project and task changes' },
      { key: 'email_chat_from',        label: 'Chat messages from customers',     desc: 'When a customer sends you a message' },
      { key: 'email_chat_to',          label: 'Chat messages to customers',       desc: 'Confirmation when you send a message' },
      { key: 'email_auto_reminders',   label: 'Auto payment reminders',           desc: 'Automated reminders sent to clients before due dates' },
    ];

    return (
      <SectionGroup title="Email Notifications">
        {toggles.map(({ key, label, desc }, i) => (
          <SettingRow key={key} icon={Bell} title={label} description={desc} border={i < toggles.length - 1}
            action={<Toggle checked={settings[key] !== 'false'} onChange={(v) => saveSetting(key, String(v))} />}
          />
        ))}
      </SectionGroup>
    );
  };

  const renderIntegrations = () => {
    const integrations = [
      { name: 'Stripe',    desc: 'Accept card payments on invoices', icon: '💳', status: 'connect' },
      { name: 'Webhooks',  desc: 'Send events to external services', icon: '🔗', status: 'connect' },
      { name: 'Zapier',    desc: 'Automate workflows across apps',   icon: '⚡', status: 'connect' },
      { name: 'PayPal',    desc: 'Accept PayPal payments',           icon: '🅿️', status: 'soon' },
      { name: 'Notion',    desc: 'Sync projects with Notion',        icon: '📝', status: 'soon' },
      { name: 'Slack',     desc: 'Get notifications in Slack',       icon: '💬', status: 'soon' },
    ];

    return (
      <SectionGroup title="Integrations">
        <div className="py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {integrations.map(({ name, desc, icon, status }) => (
            <div key={name} className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${status === 'soon' ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
              <span className="text-2xl leading-none">{icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-gray-800">{name}</p>
                  {status === 'soon' && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full uppercase tracking-wide">Soon</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 leading-snug mb-3">{desc}</p>
                {status === 'connect' ? (
                  <button
                    onClick={() => showToast(`${name} integration coming soon`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    <Zap size={11} />Connect
                  </button>
                ) : (
                  <button disabled className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 bg-gray-100 cursor-not-allowed">
                    Coming Soon
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionGroup>
    );
  };

  const renderBilling = () => {
    const proFeatures = [
      'Unlimited invoices and quotes',
      'Unlimited projects and tasks',
      'Unlimited proposals',
      'Unlimited customers',
      'Expense tracking',
      'Custom invoice themes',
      'PDF export and sharing',
      'Priority support',
    ];
    return (
      <>
        <SectionGroup title="Current Plan">
          <div className="py-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-bold text-gray-900">Free Trial</span>
                  <span className="px-2 py-0.5 text-xs font-semibold text-amber-700 bg-amber-100 rounded-full">Active</span>
                </div>
                <p className="text-sm text-gray-500">You have full access during your trial period.</p>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 15%, white)' }}>
                <Star size={20} style={{ color: 'var(--accent)' }} />
              </div>
            </div>
            <button
              onClick={() => showToast('Pro upgrade coming soon')}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              Upgrade to Pro
            </button>
          </div>
        </SectionGroup>

        <SectionGroup title="Pro Features">
          <div className="py-4 space-y-3">
            {proFeatures.map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <CheckCircle2 size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span className="text-sm text-gray-700">{feat}</span>
              </div>
            ))}
            <div className="pt-3">
              <button
                onClick={() => showToast('Pro upgrade coming soon')}
                className="w-full py-3 rounded-xl text-sm font-semibold border-2 transition-colors hover:opacity-90"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                Upgrade to Pro — Unlock all features
              </button>
            </div>
          </div>
        </SectionGroup>
      </>
    );
  };

  const renderWhatsApp = () => {
    const isConnected = waConnection?.verified === true && !waCodeSent;
    const isPending   = waCodeSent || (waConnection && !waConnection.verified);

    const handleSendCode = async () => {
      if (!waPhone.trim()) { setWaError('Enter your WhatsApp phone number.'); return; }
      setWaSending(true);
      setWaError('');
      try {
        const res  = await fetch(`${BOT_URL}/verify/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number: waPhone.trim(), user_id: user.id }),
        });
        const json = await res.json();
        if (!res.ok) { setWaError(json.error || 'Failed to send code.'); return; }
        setWaCodeSent(true);
        setWaCode('');
      } catch {
        setWaError('Could not reach the bot server. Is it running?');
      } finally {
        setWaSending(false);
      }
    };

    const handleVerify = async () => {
      if (!waCode.trim()) { setWaError('Enter the 6-digit code.'); return; }
      setWaVerifying(true);
      setWaError('');
      try {
        const res  = await fetch(`${BOT_URL}/verify/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number: waPhone.trim(), code: waCode.trim() }),
        });
        const json = await res.json();
        if (!res.ok) { setWaError(json.error || 'Verification failed.'); return; }
        const { data } = await supabase
          .from('whatsapp_connections')
          .select('phone_number, verified, connected_at')
          .eq('user_id', user.id)
          .maybeSingle();
        setWaConnection(data || null);
        setWaCodeSent(false);
        setWaCode('');
      } catch {
        setWaError('Could not reach the bot server. Is it running?');
      } finally {
        setWaVerifying(false);
      }
    };

    const handleDisconnect = async () => {
      setWaDisconnecting(true);
      const { error } = await supabase
        .from('whatsapp_connections')
        .delete()
        .eq('user_id', user.id);
      if (!error) {
        setWaConnection(null);
        setWaPhone('');
        setWaCodeSent(false);
        setWaCode('');
      }
      setWaDisconnecting(false);
    };

    return (
      <>
        <SectionGroup title="Connection">
          {waLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : isConnected ? (
            <div className="py-4">
              <SettingRow
                icon={MessageSquare}
                title="Connected"
                description={waConnection.phone_number}
                border={false}
                action={
                  <button
                    onClick={handleDisconnect}
                    disabled={waDisconnecting}
                    className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {waDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                }
              >
                <span className="inline-flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-xs text-green-600 font-medium">Active</span>
                </span>
              </SettingRow>
            </div>
          ) : isPending ? (
            <div className="py-4 space-y-4">
              <p className="text-sm text-gray-500">
                A 6-digit code was sent to{' '}
                <span className="font-medium text-gray-800">{waPhone}</span> on WhatsApp.
                Enter it below.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={waCode}
                  onChange={(e) => { setWaCode(e.target.value.replace(/\D/g, '')); setWaError(''); }}
                  className={`${inputClass} max-w-[140px] tracking-widest text-center font-mono`}
                />
                <button
                  onClick={handleVerify}
                  disabled={waVerifying}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {waVerifying ? 'Verifying…' : 'Verify'}
                </button>
              </div>
              {waError && <p className="text-xs text-red-500">{waError}</p>}
              <button
                onClick={() => { setWaError(''); handleSendCode(); }}
                disabled={waSending}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors disabled:opacity-50"
              >
                {waSending ? 'Sending…' : 'Resend code'}
              </button>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              <p className="text-sm text-gray-500">
                Connect your WhatsApp number to add tasks by sending a message to your Twilio number.
              </p>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="tel"
                  placeholder="+1 555 000 0000"
                  value={waPhone}
                  onChange={(e) => { setWaPhone(e.target.value); setWaError(''); }}
                  className={`${inputClass} max-w-[220px]`}
                />
                <button
                  onClick={handleSendCode}
                  disabled={waSending}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {waSending ? 'Sending…' : 'Connect WhatsApp'}
                </button>
              </div>
              {waError && <p className="text-xs text-red-500">{waError}</p>}
              <p className="text-xs text-gray-400">
                Enter your number in international format — e.g. +2348012345678
              </p>
            </div>
          )}
        </SectionGroup>

        <SectionGroup title="Reminders">
          <SettingRow
            icon={Bell}
            title="Deadline reminders"
            description="Get a WhatsApp message on the day a task is due"
            action={
              <Toggle
                checked={feyDeadlineReminders}
                onChange={(v) => saveSetting('fey_deadline_reminders', String(v))}
              />
            }
          />
          <SettingRow
            icon={Sparkles}
            title="Daily nudge"
            description="A morning check-in with how many tasks you have pending"
            action={
              <Toggle
                checked={feyDailyNudge}
                onChange={(v) => saveSetting('fey_daily_nudge', String(v))}
              />
            }
          />
          {(feyDeadlineReminders || feyDailyNudge) && (
            <SettingRow
              icon={Star}
              title="Reminder time"
              description="Time reminders are sent — in UTC"
              border={false}
              action={
                <select
                  value={feyReminderTime}
                  onChange={(e) => saveSetting('fey_reminder_time', e.target.value)}
                  className="px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-all"
                >
                  {['05:00','06:00','07:00','08:00','09:00','10:00','11:00','12:00'].map((t) => (
                    <option key={t} value={t}>{t} UTC</option>
                  ))}
                </select>
              }
            />
          )}
        </SectionGroup>

        <SectionGroup title="How to use">
          <div className="py-4 space-y-3">
            <p className="text-sm text-gray-600">
              Once connected, send a WhatsApp message to your Twilio number. Tasks are grouped by date automatically.
            </p>
            <div className="space-y-2">
              {[
                { label: 'Add tasks for today',  example: 'Write blog intro, update invoice, email client' },
                { label: 'Add to yesterday',     example: 'add to yesterday, write blog intro, update invoice' },
                { label: 'Add to a past date',   example: 'add to May 16, write blog intro' },
                { label: 'Add to a past weekday', example: 'add to last Monday, review Q2 report' },
              ].map(({ label, example }) => (
                <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                  <p className="text-xs text-gray-700 font-mono">{example}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionGroup>
      </>
    );
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'Profile':       return renderProfile();
      case 'Branding':      return renderBranding();
      case 'Business Info': return renderBusinessInfo();
      case 'Payments':      return renderPayments();
      case 'General':       return renderGeneral();
      case 'Emails':        return renderEmails();
      case 'Integrations':  return renderIntegrations();
      case 'WhatsApp':      return renderWhatsApp();
      case 'Billing':       return renderBilling();
      default:              return null;
    }
  };

  return (
    <>
      <div className="flex min-h-screen page-enter">
        {/* Left nav (desktop) */}
        <div className="hidden md:flex flex-col w-52 flex-shrink-0 p-6 pt-8 border-r border-gray-100 bg-white/50">
          <h1 className="font-display text-xl font-bold text-gray-900 mb-6">Settings</h1>
          <div className="space-y-0.5">
            {NAV.map((item) => (
              <NavItem key={item} label={item} active={activeSection === item} onClick={() => setActiveSection(item)} />
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-4 md:p-8 overflow-y-auto max-w-2xl">
          {/* Mobile header */}
          <div className="md:hidden mb-4">
            <h1 className="font-display text-2xl font-bold text-gray-900">Settings</h1>
          </div>

          {/* Desktop breadcrumb */}
          <div className="hidden md:flex items-center gap-1 text-sm text-gray-400 mb-8">
            <span>Settings</span>
            <ChevronRight size={14} />
            <span className="text-gray-700 font-medium">{activeSection}</span>
          </div>

          {/* Mobile nav pills */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
            {NAV.map((item) => (
              <button
                key={item}
                onClick={() => setActiveSection(item)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeSection === item ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
                style={activeSection === item ? { backgroundColor: 'var(--accent)' } : {}}
              >
                {item}
              </button>
            ))}
          </div>

          {renderSection()}
        </div>
      </div>

      {whatsNewOpen && <WhatsNewPopup open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />}
      {changelogOpen && <ChangelogPopup open={changelogOpen} onClose={() => setChangelogOpen(false)} />}
    </>
  );
}
