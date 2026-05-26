import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Check, Plus, Loader2, Sparkles, CheckCircle2, Clock, AlertTriangle, Edit2, Eye, Ban, Folder, File, FileText, Image, Film, Download, X, Layers, ChevronDown, ExternalLink } from 'lucide-react';
import { formatFileSize, isImageType, isPdfType } from '../utils/cloudinary';

import { getContrastColor } from '../utils/colorContrast';

// Matches http:// and https:// URLs
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

function renderWithLinks(text, isDone) {
  const parts = [];
  let lastIndex = 0;
  let match;
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    const url = match[0];
    parts.push(
      <a
        key={`l-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-0.5 underline underline-offset-2 decoration-dotted hover:decoration-solid transition-all ${
          isDone ? 'text-gray-400' : 'text-blue-500 hover:text-blue-700'
        }`}
        title={url}
      >
        {url.length > 40 ? url.slice(0, 40) + '…' : url}
        <ExternalLink size={10} className="flex-shrink-0 opacity-70" />
      </a>
    );
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`t-end`}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : text;
}

function getTodayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Read-only task row ────────────────────────────────────────────────────────
function SharedTaskRow({ task, permission, onToggleDone, onTogglePaid }) {
  const todayStr = getTodayStr();
  const isOverdue = !task.done && task.deadline && task.deadline < todayStr;
  const isToday = !task.done && task.deadline === todayStr;
  const canEdit = permission === 'edit';

  return (
    <div className={`group flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-gray-50 transition-all ${
      isOverdue ? 'border-l-2 border-red-400 pl-3' : ''
    }`}>
      {/* Checkbox — mirrors TaskItem exactly */}
      <span
        role="checkbox"
        aria-checked={task.done}
        onClick={canEdit ? onToggleDone : undefined}
        className={`rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          canEdit ? 'cursor-pointer' : 'cursor-default'
        }`}
        style={{
          width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...(task.done
            ? { backgroundColor: 'var(--accent, #ED64A6)', borderColor: 'var(--accent, #ED64A6)' }
            : { borderColor: '#d1d5db' }),
        }}
      >
        {task.done && <Check size={11} strokeWidth={3} className="text-white" />}
      </span>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium break-words ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {renderWithLinks(task.title, task.done)}
        </p>
        {task.deadline && (
          <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : isToday ? 'text-amber-500 font-medium' : 'text-gray-400'}`}>
            Due: {formatDate(task.deadline)}
          </span>
        )}
      </div>

      {/* Paid badge — edit only */}
      {canEdit && task.done && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePaid(); }}
          className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
            task.paid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {task.paid ? 'Paid' : 'Unpaid'}
        </button>
      )}
    </div>
  );
}

// ── Error page ────────────────────────────────────────────────────────────────
function ErrorPage({ title = 'Link Unavailable', message = 'This link is no longer available.' }) {
  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center px-6 text-center">
      <img src="/favicon.svg" alt="WorkBoard" className="w-9 h-9 rounded-xl mb-8" />
      <p className="font-display text-2xl font-bold text-gray-900 mb-2">{title}</p>
      <p className="text-gray-500 text-sm max-w-xs">{message}</p>
    </div>
  );
}

// ── Welcome page ──────────────────────────────────────────────────────────────
function WelcomePage({ shareRecord, clientName, onAccept, prefillCode }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(prefillCode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const codeFromLink = Boolean(prefillCode);

  const handleAccept = async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!code.trim()) { setError('Please enter your invite code'); return; }
    setLoading(true);
    setError('');

    const normalized = code.trim().toUpperCase();

    // Validate invite code
    const { data: invite, error: inviteErr } = await supabase
      .from('shared_client_invites')
      .select('*')
      .eq('shared_client_id', shareRecord.id)
      .eq('code', normalized)
      .maybeSingle();

    if (inviteErr || !invite) {
      setError('Invalid invite code. Please check and try again.');
      setLoading(false);
      return;
    }
    if (invite.status === 'revoked') {
      setError('This invite code has been revoked. Please request a new one.');
      setLoading(false);
      return;
    }
    if (invite.status === 'used') {
      setError('This invite code has already been used.');
      setLoading(false);
      return;
    }

    // Create member row
    const { data: member, error: memberErr } = await supabase
      .from('shared_client_members')
      .insert({ shared_client_id: shareRecord.id, name: name.trim() })
      .select()
      .single();
    if (memberErr) { setError("Couldn't join the workspace. Please try again."); setLoading(false); return; }

    // Mark invite code as used
    await supabase
      .from('shared_client_invites')
      .update({ status: 'used', member_id: member.id, member_name: name.trim() })
      .eq('id', invite.id);

    // Persist membership + code ID in localStorage
    localStorage.setItem(
      `workboard_member_${shareRecord.token}`,
      JSON.stringify({ id: member.id, name: member.name, codeId: invite.id })
    );

    // Link the shared client to this user's account (if logged in) or queue it for after sign-up
    const linkedPayload = {
      token: shareRecord.token,
      client_name: shareRecord.client_name || '',
      client_color: shareRecord.client_color || '#D1FAE5',
      client_logo: shareRecord.client_logo || '',
      owner_name: shareRecord.owner_name || '',
    };
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase
        .from('user_linked_clients')
        .upsert({ user_id: session.user.id, ...linkedPayload }, { onConflict: 'user_id,token' });
    } else {
      // Queue for after login / sign-up
      const existing = JSON.parse(localStorage.getItem('workboard_pending_shares') || '[]');
      const already = existing.some((p) => p.token === linkedPayload.token);
      if (!already) {
        localStorage.setItem('workboard_pending_shares', JSON.stringify([...existing, linkedPayload]));
      }
    }

    onAccept({ id: member.id, name: member.name });
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <img src="/favicon.svg" alt="WorkBoard" className="w-8 h-8 rounded-xl mb-8 mx-auto" />
        <h1 className="font-display text-2xl font-bold text-gray-900 text-center mb-1">
          {shareRecord.owner_name} has shared
        </h1>
        <p className="font-display text-2xl font-bold text-center mb-8" style={{ color: 'var(--accent, #ED64A6)' }}>
          {clientName}
        </p>

        <div className="space-y-3">
          <input
            autoFocus
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAccept()}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm outline-none focus:border-gray-400 transition-all"
          />

          {codeFromLink ? (
            /* Code came from the URL — show it as read-only pill */
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-50 border border-green-100">
              <Check size={14} className="text-green-500 flex-shrink-0" />
              <span className="text-xs text-green-700 font-medium">Invite code</span>
              <span className="ml-auto font-mono text-xs font-bold tracking-widest text-green-800">{code}</span>
            </div>
          ) : (
            /* No code in URL — let them type it */
            <input
              type="text"
              placeholder="Invite code (e.g. ABCD-EFGH)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAccept()}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm outline-none focus:border-gray-400 transition-all font-mono tracking-widest uppercase"
            />
          )}

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          <button
            onClick={handleAccept}
            disabled={loading || !name.trim() || !code.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent, #ED64A6)' }}
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            Accept & View
          </button>
          <p className="text-xs text-gray-400 text-center">
            {codeFromLink
              ? 'Just enter your name to join the workspace.'
              : 'You need an invite code from the workspace owner to join.'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Shared dashboard ──────────────────────────────────────────────────────────
// ── Inline file preview ───────────────────────────────────────────────────────
function SharedFilePreview({ file, onClose }) {
  if (!file) return null;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{file.file_name}</p>
            <p className="text-xs text-gray-400">{formatFileSize(file.file_size)}{file.uploader_name ? ` · ${file.uploader_name}` : ''}</p>
          </div>
          <a href={file.file_url} download={file.file_name} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <Download size={12} /> Download
          </a>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden p-4 bg-gray-50 flex items-center justify-center min-h-0">
          {isImageType(file.file_type) ? (
            <img src={file.file_url} alt={file.file_name} className="max-w-full max-h-full object-contain rounded-xl" />
          ) : isPdfType(file.file_type) ? (
            <iframe src={file.file_url} title={file.file_name} className="w-full h-full rounded-xl border-0" style={{ minHeight: '60vh' }} />
          ) : file.file_type === 'video' ? (
            <video src={file.file_url} controls className="max-w-full max-h-full rounded-xl bg-black">
              Your browser does not support video playback.
            </video>
          ) : (
            <div className="flex flex-col items-center gap-4 text-gray-400">
              <File size={52} strokeWidth={1} />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">{file.file_name}</p>
                <p className="text-xs text-gray-400 mt-1">Preview not available</p>
              </div>
              <a href={file.file_url} target="_blank" rel="noopener noreferrer" download={file.file_name}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--accent, #ED64A6)' }}>
                <Download size={14} /> Download to view
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Files section for shared page ────────────────────────────────────────────
function SharedFilesSection({ clientId }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!clientId) return;
    async function load() {
      setLoading(true);
      const [cf, tf] = await Promise.all([
        supabase.from('client_files').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('task_files').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      ]);
      const combined = [
        ...(cf.data || []).map((f) => ({ ...f, _source: 'client' })),
        ...(tf.data || []).map((f) => ({ ...f, _source: 'task' })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setFiles(combined);
      setLoading(false);
    }
    load();
  }, [clientId]);

  if (loading) return null;
  if (files.length === 0) return null;

  const iconFor = (f) => {
    if (isImageType(f.file_type)) return <Image size={16} className="text-pink-400" />;
    if (isPdfType(f.file_type)) return <FileText size={16} className="text-red-400" />;
    if (f.file_type === 'video') return <Film size={16} className="text-purple-400" />;
    if (f.file_type === 'document') return <FileText size={16} className="text-blue-400" />;
    return <File size={16} className="text-gray-400" />;
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-sm font-semibold text-gray-700">Files</p>
          <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md">{files.length}</span>
        </div>

        {/* Image grid for images */}
        {files.some((f) => isImageType(f.file_type)) && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {files.filter((f) => isImageType(f.file_type)).slice(0, 6).map((f) => (
              <div key={f.id} onClick={() => setPreview(f)}
                className="aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity">
                <img src={f.file_url} alt={f.file_name} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {/* List for non-images */}
        {files.filter((f) => !isImageType(f.file_type)).map((f) => (
          <div key={f.id} onClick={() => setPreview(f)}
            className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
              {iconFor(f)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{f.file_name}</p>
              <p className="text-xs text-gray-400">{formatFileSize(f.file_size)}</p>
            </div>
            <Download size={13} className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
          </div>
        ))}
      </div>

      {preview && <SharedFilePreview file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

// ── Campaign card grid — click opens full campaign view ───────────────────────
function SharedCampaignsSection({ campaigns, onSelect, todayStr }) {
  if (!campaigns || campaigns.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Layers size={15} className="text-gray-400" />
        <h2 className="font-display text-base font-semibold text-gray-900">Campaigns</h2>
        <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md">{campaigns.length}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {campaigns.map((campaign) => {
          const bg       = campaign.color || '#E9D5FF';
          const tc       = getContrastColor(bg);
          const done     = campaign.tasks.filter((t) => t.done).length;
          const total    = campaign.tasks.length;
          const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
          const hasOverdue = campaign.tasks.some((t) => !t.done && t.deadline && t.deadline < todayStr);

          return (
            <button
              key={campaign.id}
              onClick={() => onSelect(campaign)}
              className="flex flex-col text-left rounded-2xl p-4 sm:p-5 hover:opacity-90 transition-opacity cursor-pointer"
              style={{ backgroundColor: bg }}
            >
              {/* Top row */}
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-white/60" style={{ color: tc }}>
                  <Layers size={11} />
                  {done}/{total} tasks
                </span>
                {hasOverdue && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-red-100/80 text-red-600">
                    <AlertTriangle size={10} /> Overdue
                  </span>
                )}
              </div>

              {/* Name */}
              <div className="flex items-center gap-2 mb-1 flex-1">
                {campaign.logo && (
                  <img src={campaign.logo} alt={campaign.name} className="w-6 h-6 rounded-lg object-contain bg-white/70 p-0.5 flex-shrink-0" />
                )}
                <h3 className="font-display text-lg font-bold leading-snug" style={{ color: tc }}>{campaign.name}</h3>
              </div>
              <p className="text-sm mb-3 opacity-70" style={{ color: tc }}>{done} completed · {total - done} pending</p>

              {/* Progress bar */}
              <div className="h-1.5 bg-white/40 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: tc, opacity: 0.5 }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Full campaign workspace view (read-only) ──────────────────────────────────
function SharedCampaignView({ campaign, clientName, clientColor, onBack, todayStr }) {
  const bg = campaign.color || '#E9D5FF';
  const tc = getContrastColor(bg);
  const tasks = campaign.tasks || [];
  const done     = tasks.filter((t) => t.done).length;
  const total    = tasks.length;
  const pending  = tasks.filter((t) => !t.done).length;
  const overdue  = tasks.filter((t) => !t.done && t.deadline && t.deadline < todayStr);
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
  const pendingTasks   = tasks.filter((t) => !t.done);
  const completedTasks = tasks.filter((t) => t.done);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#F7F8FA] overflow-hidden max-w-full">

      {/* ── Main column ── */}
      <div className="flex-1 p-4 lg:p-8 lg:pr-4 min-w-0 overflow-y-auto overflow-x-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <img src="/favicon.svg" alt="WorkBoard" className="w-8 h-8 rounded-xl opacity-80" />
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← {clientName}
          </button>
        </div>

        {/* Hero banner */}
        <div className="rounded-2xl p-6 mb-6 overflow-hidden" style={{ backgroundColor: bg }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            {campaign.logo ? (
              <img src={campaign.logo} alt={campaign.name} className="w-14 h-14 rounded-2xl object-contain bg-white p-1 flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-display font-bold bg-white/50 flex-shrink-0" style={{ color: tc }}>
                {campaign.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-3xl leading-tight font-bold truncate" style={{ color: tc }}>
                {campaign.name}
              </h1>
              <p className="text-sm mt-0.5 opacity-70" style={{ color: tc }}>
                {total} task{total !== 1 ? 's' : ''} total
              </p>
            </div>
          </div>
        </div>

        {/* Tasks card */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">
            Tasks <span className="font-normal text-gray-400">{total} total</span>
          </p>

          {pendingTasks.length > 0 && (
            <div className="mb-2">
              {pendingTasks.map((task) => {
                const isOverdue = !task.done && task.deadline && task.deadline < todayStr;
                const isToday   = !task.done && task.deadline === todayStr;
                return (
                  <div key={task.id} className={`flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-gray-50 ${isOverdue ? 'border-l-2 border-red-400 pl-3' : ''}`}>
                    <span
                      className="rounded-md border-2 flex-shrink-0"
                      style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: '#d1d5db' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 break-words">{renderWithLinks(task.title, false)}</p>
                      {task.deadline && (
                        <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : isToday ? 'text-amber-500 font-medium' : 'text-gray-400'}`}>
                          Due: {formatDate(task.deadline)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {completedTasks.length > 0 && (
            <details className={pendingTasks.length > 0 ? 'mt-3' : ''}>
              <summary className="text-xs font-semibold text-gray-400 cursor-pointer select-none list-none flex items-center gap-1.5 py-2">
                <ChevronDown size={12} /> {completedTasks.length} completed
              </summary>
              <div className="opacity-60 mt-1">
                {completedTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-gray-50">
                    <span
                      className="rounded-md border-2 flex-shrink-0"
                      style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderColor: bg }}
                    >
                      <Check size={11} strokeWidth={3} style={{ color: tc }} />
                    </span>
                    <p className="text-sm font-medium text-gray-400 line-through break-words">{renderWithLinks(task.title, true)}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {total === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">No tasks yet.</p>
          )}
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div className="w-full lg:w-[260px] lg:flex-shrink-0 p-4 lg:p-5 lg:pl-2 space-y-4 overflow-y-auto overflow-x-hidden">

        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-4">Overview</p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${bg}33` }}>
                <CheckCircle2 size={16} style={{ color: bg }} />
              </div>
              <div>
                <p className="font-mono font-semibold text-gray-900">{done}</p>
                <p className="text-xs text-gray-400">Completed</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Clock size={16} className="text-gray-400" />
              </div>
              <div>
                <p className="font-mono font-semibold text-gray-900">{pending}</p>
                <p className="text-xs text-gray-400">Pending</p>
              </div>
            </div>
            {overdue.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={16} className="text-red-500" />
                </div>
                <div>
                  <p className="font-mono font-semibold text-red-600">{overdue.length}</p>
                  <p className="text-xs text-red-400">Overdue</p>
                </div>
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-400">Progress</p>
                <p className="text-xs font-mono font-semibold text-gray-700">{pct}%</p>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: bg }} />
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
          <Sparkles size={20} className="mx-auto mb-2" style={{ color: 'var(--accent, #ED64A6)' }} />
          <p className="text-sm font-semibold text-gray-800 mb-1">Like what you see?</p>
          <p className="text-xs text-gray-400 mb-3">Track your own clients & campaigns with WorkBoard.</p>
          <button
            onClick={onBack}
            className="w-full py-2.5 rounded-xl text-white text-xs font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--accent, #ED64A6)' }}
          >
            Try WorkBoard free
          </button>
        </div>
      </div>
    </div>
  );
}

const FILTER_OPTIONS = [
  { value: 'all',      label: 'All Tasks' },
  { value: 'overdue',  label: 'Overdue' },
  { value: 'today',    label: 'Due Today' },
  { value: 'tomorrow', label: 'Due Tomorrow' },
];

function SharedDashboard({ shareRecord, client, tasks, setTasks, member, permission }) {
  const navigate = useNavigate();
  const [newTask, setNewTask]         = useState('');
  const [addingTask, setAddingTask]   = useState(false);
  const [addTaskError, setAddTaskError] = useState('');
  const [filter, setFilter]         = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterPos, setFilterPos]   = useState({ top: 0, left: 0 });
  const [campaigns, setCampaigns]   = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const filterBtnRef  = useRef(null);
  const filterDropRef = useRef(null);
  const taskInputRef  = useRef(null);

  // Load campaigns + their tasks once
  useEffect(() => {
    async function loadCampaigns() {
      const [camRes, taskRes] = await Promise.all([
        supabase.from('client_campaigns').select('*').eq('client_id', client.id).order('sort_order'),
        supabase.from('campaign_tasks').select('*').eq('client_id', client.id).order('sort_order'),
      ]);
      setCampaigns((camRes.data || []).map((c) => ({
        ...c,
        tasks: (taskRes.data || [])
          .filter((t) => t.campaign_id === c.id)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      })));
    }
    loadCampaigns();
  }, [client.id]);

  const todayStr = getTodayStr();
  const tomorrowStr = (() => {
    const n = new Date(); n.setDate(n.getDate() + 1);
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();

  useEffect(() => {
    const handler = (e) => {
      if (filterDropRef.current && !filterDropRef.current.contains(e.target) &&
          filterBtnRef.current && !filterBtnRef.current.contains(e.target))
        setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const textColor   = getContrastColor(client.color);
  const totalTasks  = tasks.length;
  const doneTasks   = tasks.filter((t) => t.done).length;
  const pendingCount = tasks.filter((t) => !t.done).length;
  const pct         = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const overdueTasks = tasks.filter((t) => !t.done && t.deadline && t.deadline < todayStr);
  const totalEarned = tasks.filter((t) => t.paid).reduce((s, t) => s + (t.amount || 0), 0);
  const totalPending = tasks.filter((t) => !t.paid && (t.amount || 0) > 0).reduce((s, t) => s + (t.amount || 0), 0);
  const canEdit     = permission === 'edit';

  const filterTask = (t) => {
    if (filter === 'overdue')  return !t.done && t.deadline && t.deadline < todayStr;
    if (filter === 'today')    return t.deadline === todayStr;
    if (filter === 'tomorrow') return t.deadline === tomorrowStr;
    return true;
  };
  const allFiltered    = tasks.filter(filterTask);
  const pendingTasks   = allFiltered.filter((t) => !t.done);
  const completedTasks = allFiltered.filter((t) => t.done);
  const currentLabel   = FILTER_OPTIONS.find((o) => o.value === filter)?.label || 'All Tasks';

  const handleToggleDone = async (task) => {
    const newDone = !task.done;
    const { error } = await supabase
      .from('tasks')
      .update({ done: newDone, paid: newDone ? task.paid : false })
      .eq('id', task.id);
    if (!error)
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, done: newDone, paid: newDone ? t.paid : false } : t));
  };

  const handleTogglePaid = async (task) => {
    const newPaid = !task.paid;
    const { error } = await supabase.from('tasks').update({ paid: newPaid }).eq('id', task.id);
    if (!error) setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, paid: newPaid } : t));
  };

  const handleAddTask = async () => {
    if (!newTask.trim() || !canEdit) return;
    setAddingTask(true);
    setAddTaskError('');
    const maxSort = tasks.length > 0 ? Math.max(...tasks.map((t) => t.sort_order ?? 0)) + 1 : 0;
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        client_id: client.id, user_id: shareRecord.owner_id,
        title: newTask.trim(), done: false, paid: false, amount: 0, currency: 'NGN', sort_order: maxSort,
      })
      .select().single();
    if (!error && data) {
      setTasks((prev) => [...prev, {
        id: data.id, title: data.title, done: data.done, paid: data.paid,
        amount: data.amount, currency: data.currency, deadline: data.deadline || null,
        sort_order: data.sort_order ?? maxSort,
      }]);
      setNewTask('');
    } else if (error) {
      setAddTaskError("Couldn't add task. Please try again.");
    }
    setAddingTask(false);
  };

  // If a campaign is selected, show the full campaign view
  if (selectedCampaign) {
    return (
      <SharedCampaignView
        campaign={selectedCampaign}
        clientName={client.name}
        clientColor={client.color}
        onBack={() => setSelectedCampaign(null)}
        todayStr={todayStr}
      />
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#F7F8FA] overflow-hidden max-w-full">

      {/* ── Main column ── */}
      <div className="flex-1 p-4 lg:p-8 lg:pr-4 min-w-0 overflow-y-auto overflow-x-hidden">

        {/* Top bar — logo + viewing-as */}
        <div className="flex items-center justify-between mb-6">
          <img src="/favicon.svg" alt="WorkBoard" className="w-8 h-8 rounded-xl opacity-80" />
          <span className="text-xs text-gray-400">
            Viewing as <span className="font-medium text-gray-600">{member.name}</span>
          </span>
        </div>

        {/* Hero banner — identical to ClientWorkspace */}
        <div className="rounded-2xl p-6 mb-6 overflow-hidden" style={{ backgroundColor: client.color }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            {client.logo ? (
              <img src={client.logo} alt={client.name} className="w-14 h-14 rounded-2xl object-contain bg-white p-1 flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-display font-bold bg-white/50 flex-shrink-0" style={{ color: textColor }}>
                {client.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-3xl leading-tight font-bold truncate" style={{ color: textColor }}>
                {client.name}
              </h1>
              <p className="text-sm mt-0.5 opacity-70" style={{ color: textColor }}>
                {totalTasks} task{totalTasks !== 1 ? 's' : ''} total · shared by {shareRecord.owner_name}
              </p>
            </div>
            <span className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/40" style={{ color: textColor }}>
              {canEdit ? <Edit2 size={12} /> : <Eye size={12} />}
              {canEdit ? 'Can edit' : 'View only'}
            </span>
          </div>
        </div>

        {/* Task card — matches ClientWorkspace p-4 sm:p-5 layout */}
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          {/* Card header: label + filter dropdown */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-700">
              Tasks <span className="font-normal text-gray-400">{totalTasks} total</span>
            </p>
            <div className="relative" ref={filterBtnRef}>
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setFilterPos({ top: rect.bottom + 6, left: rect.left });
                  setFilterOpen((v) => !v);
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                {currentLabel} <ChevronDown size={12} />
              </button>
            </div>
          </div>

          {/* Filter dropdown — portal-style fixed */}
          {filterOpen && (
            <div
              ref={filterDropRef}
              className="fixed bg-white rounded-xl shadow-lg border border-gray-100 z-50 py-1 w-40"
              style={{ top: filterPos.top, left: filterPos.left }}
            >
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setFilter(opt.value); setFilterOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                    filter === opt.value ? '' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                  style={filter === opt.value ? { color: client.color } : {}}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Pending tasks */}
          {pendingTasks.length > 0 && (
            <div className="mb-2">
              {pendingTasks.map((task) => (
                <SharedTaskRow key={task.id} task={task} permission={permission}
                  onToggleDone={() => handleToggleDone(task)}
                  onTogglePaid={() => handleTogglePaid(task)} />
              ))}
            </div>
          )}

          {/* Completed — collapsible like real workspace */}
          {completedTasks.length > 0 && (
            <details className={pendingTasks.length > 0 ? 'mt-3' : ''}>
              <summary className="text-xs font-semibold text-gray-400 cursor-pointer select-none list-none flex items-center gap-1.5 py-2">
                <ChevronDown size={12} /> {completedTasks.length} completed
              </summary>
              <div className="opacity-60 mt-1">
                {completedTasks.map((task) => (
                  <SharedTaskRow key={task.id} task={task} permission={permission}
                    onToggleDone={() => handleToggleDone(task)}
                    onTogglePaid={() => handleTogglePaid(task)} />
                ))}
              </div>
            </details>
          )}

          {pendingTasks.length === 0 && completedTasks.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">
              {filter !== 'all' ? `No tasks match "${currentLabel}"` : 'No tasks yet.'}
            </p>
          )}

          {/* Add task — edit only */}
          {canEdit && (
            <div className="mt-4 border-t border-gray-100 pt-4">
            {addTaskError && (
              <p className="text-xs text-red-500 mb-2">{addTaskError}</p>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={taskInputRef}
                type="text"
                placeholder="Add a new task…"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                className="flex-1 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm outline-none transition-all min-w-0"
                onFocus={(e) => { e.target.style.borderColor = client.color; }}
                onBlur={(e)  => { e.target.style.borderColor = ''; }}
              />
              <button
                onClick={handleAddTask}
                disabled={!newTask.trim() || addingTask}
                className="flex items-center gap-1.5 px-4 py-2.5 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all flex-shrink-0"
                style={{ backgroundColor: client.color, color: textColor }}
              >
                {addingTask ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
                Add
              </button>
            </div>
            </div>
          )}
        </div>

        {/* Campaigns — in main column like real workspace */}
        <SharedCampaignsSection
          campaigns={campaigns}
          onSelect={setSelectedCampaign}
          todayStr={todayStr}
        />
      </div>

      {/* ── Right sidebar — mirrors ClientWorkspace ── */}
      <div className="w-full lg:w-[260px] lg:flex-shrink-0 p-4 lg:p-5 lg:pl-2 space-y-4 overflow-y-auto overflow-x-hidden">

        {/* Overview + progress bar merged (exactly like ClientWorkspace) */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-4">Overview</p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${client.color}22` }}>
                <CheckCircle2 size={16} style={{ color: client.color }} />
              </div>
              <div>
                <p className="font-mono font-semibold text-gray-900">{doneTasks}</p>
                <p className="text-xs text-gray-400">Completed</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Clock size={16} className="text-gray-400" />
              </div>
              <div>
                <p className="font-mono font-semibold text-gray-900">{pendingCount}</p>
                <p className="text-xs text-gray-400">Pending</p>
              </div>
            </div>
            {overdueTasks.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={16} className="text-red-500" />
                </div>
                <div>
                  <p className="font-mono font-semibold text-red-600">{overdueTasks.length}</p>
                  <p className="text-xs text-red-400">Overdue</p>
                </div>
              </div>
            )}
          </div>
          {/* Progress bar — inside Overview, not a separate card */}
          {totalTasks > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-400">Progress</p>
                <p className="text-xs font-mono font-semibold text-gray-700">{pct}%</p>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: client.color }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Earnings — editor only */}
        {canEdit && (totalEarned > 0 || totalPending > 0) && (
          <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-3">Earnings</p>
            <div className="space-y-3">
              {totalEarned > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Total earned</p>
                  <p className="font-mono text-xl font-bold text-green-600">{totalEarned.toLocaleString()}</p>
                </div>
              )}
              {totalPending > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Pending</p>
                  <p className="font-mono text-lg font-semibold text-amber-500">{totalPending.toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Files */}
        <SharedFilesSection clientId={client.id} />

        {/* Try WorkBoard CTA */}
        <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
          <Sparkles size={20} className="mx-auto mb-2" style={{ color: 'var(--accent, #ED64A6)' }} />
          <p className="text-sm font-semibold text-gray-800 mb-1">Like what you see?</p>
          <p className="text-xs text-gray-400 mb-3">Track your own clients & tasks with WorkBoard.</p>
          <button
            onClick={() => navigate(`/register?from_share=true&token=${shareRecord.token}`)}
            className="w-full py-2.5 rounded-xl text-white text-xs font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--accent, #ED64A6)' }}
          >
            Try WorkBoard free
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Access revoked page ───────────────────────────────────────────────────────
function AccessRevokedPage({ token }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-xs">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
          <Ban size={28} className="text-red-400" />
        </div>
        <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">Access Revoked</h1>
        <p className="text-sm text-gray-500 mb-8 leading-relaxed">
          Your access to this workspace has been removed by the owner.
        </p>
        <button
          onClick={() => navigate(`/register?from_share=true&token=${token}`)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--accent, #ED64A6)' }}
        >
          <Sparkles size={15} />
          Try WorkBoard free
        </button>
        <p className="text-xs text-gray-400 mt-4">
          Create your own workspace and invite your clients.
        </p>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function SharedClientPage() {
  const { token } = useParams();
  const location = useLocation();
  const prefillCode = new URLSearchParams(location.search).get('code') || '';
  const [phase, setPhase] = useState('loading'); // loading | error | welcome | dashboard | revoked
  const [errorTitle, setErrorTitle] = useState('Link Unavailable');
  const [errorMessage, setErrorMessage] = useState('This link is no longer available.');
  const [shareRecord, setShareRecord] = useState(null);
  const [client, setClient] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [member, setMember] = useState(null);
  const [memberPermission, setMemberPermission] = useState('view');

  useEffect(() => {
    let realtimeChannel;

    async function init() {
      const stored = localStorage.getItem(`workboard_member_${token}`);
      const storedMember = stored ? JSON.parse(stored) : null;

      // Fetch share record — no auth required (RLS disabled)
      // Query without active filter so we can give a specific message for each failure case
      const { data: share, error: shareErr } = await supabase
        .from('shared_clients')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (shareErr) {
        setErrorTitle('Something went wrong');
        setErrorMessage("We couldn't load this workspace. Try refreshing the page.");
        setPhase('error'); return;
      }
      if (!share) {
        setErrorTitle('Workspace Not Found');
        setErrorMessage('This workspace no longer exists. The owner may have deleted their account.');
        setPhase('error'); return;
      }
      if (!share.active) {
        setErrorTitle('Workspace Deactivated');
        setErrorMessage('The owner has deactivated this shared workspace.');
        setPhase('error'); return;
      }
      setShareRecord(share);

      // Build client object from cached fields in shared_clients
      const clientObj = {
        id: share.client_id,
        name: share.client_name || 'Shared Workspace',
        color: share.client_color || '#D1FAE5',
        logo: share.client_logo || '',
      };
      setClient(clientObj);

      // Fetch tasks — requires tasks table RLS to be disabled
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .eq('client_id', share.client_id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      setTasks((tasksData || []).map((t) => ({
        id: t.id, title: t.title, done: t.done, paid: t.paid,
        amount: t.amount || 0, currency: t.currency || 'NGN',
        deadline: t.deadline || null, sort_order: t.sort_order ?? 0,
      })));

      if (storedMember) {
        // 1. Verify invite code is still valid (not revoked)
        if (storedMember.codeId) {
          const { data: codeRow } = await supabase
            .from('shared_client_invites')
            .select('status')
            .eq('id', storedMember.codeId)
            .maybeSingle();

          if (!codeRow || codeRow.status === 'revoked') {
            localStorage.removeItem(`workboard_member_${token}`);
            setPhase('revoked');
            return;
          }
        }

        // 2. Verify member row still exists
        const { data: memberRow } = await supabase
          .from('shared_client_members')
          .select('id, permission')
          .eq('id', storedMember.id)
          .maybeSingle();

        if (!memberRow) {
          localStorage.removeItem(`workboard_member_${token}`);
          setPhase('revoked');
          return;
        }

        setMember(storedMember);
        setMemberPermission(memberRow.permission || 'view');
        setPhase('dashboard');

        // Realtime: detect kick while actively viewing (invite code revoked)
        realtimeChannel = supabase
          .channel(`member-revoke-${storedMember.id}`)
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'shared_client_members',
              filter: `id=eq.${storedMember.id}`,
            },
            () => {
              localStorage.removeItem(`workboard_member_${token}`);
              setPhase('revoked');
            }
          )
          .subscribe();
      } else {
        setPhase('welcome');
      }
    }

    init();
    return () => { if (realtimeChannel) supabase.removeChannel(realtimeChannel); };
  }, [token]);

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-300" />
      </div>
    );
  }

  if (phase === 'error') return <ErrorPage title={errorTitle} message={errorMessage} />;

  if (phase === 'revoked') return <AccessRevokedPage token={token} />;

  if (phase === 'welcome') {
    return (
      <WelcomePage
        shareRecord={shareRecord}
        clientName={client?.name || ''}
        prefillCode={prefillCode}
        onAccept={(m) => {
          setMember(m);
          setMemberPermission(shareRecord?.permission || 'view');
          setPhase('dashboard');
        }}
      />
    );
  }

  return (
    <SharedDashboard
      shareRecord={shareRecord}
      client={client}
      tasks={tasks}
      setTasks={setTasks}
      member={member}
      permission={memberPermission}
    />
  );
}
