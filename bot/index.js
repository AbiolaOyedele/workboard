import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import twilio from 'twilio';
import ws from 'ws';
import cron from 'node-cron';

Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.2 });
import {
  format,
  parse,
  subDays,
  addDays,
  previousDay,
  startOfDay,
  isValid,
} from 'date-fns';

// ── Clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } },
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

// ── Constants ─────────────────────────────────────────────────────────────────

// date-fns Day enum: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
const DAY_MAP = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

// Session TTL — "done X" replies are valid for this long after a list is sent
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Reply builder (task logging) ──────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildReply(tasks, heading) {
  const n = tasks.length;
  const deadlineCount = tasks.filter((t) => t.deadline).length;

  const sharedOpeners = [`Got it.`, `Noted.`, `Done.`, `On it.`];
  const opener = n === 1
    ? pick([...sharedOpeners, `Logged.`, `Sure thing.`])
    : pick([...sharedOpeners, `All logged.`, `Sorted.`, `Consider it done.`]);

  const captured = n === 1
    ? pick([
        `Pulled 1 task from that`,
        `Found 1 task in there`,
        `Got 1 thing from that`,
        `Picked out 1 task`,
        `1 task captured`,
      ])
    : pick([
        `Pulled ${n} tasks from that`,
        `Found ${n} tasks in there`,
        `Got ${n} things from that`,
        `Picked out ${n} tasks`,
        `${n} tasks captured`,
        `${n} things logged`,
      ]);

  const deadlineNote = deadlineCount === 1
    ? pick([
        `One has a deadline, so don't leave it too long.`,
        `One's time-sensitive — worth checking soon.`,
        `There's a deadline on one of them.`,
        `One of them has a date attached — keep an eye on it.`,
        `Heads up, one has a deadline.`,
      ])
    : pick([
        `${deadlineCount} have deadlines, worth checking soon.`,
        `${deadlineCount} are time-sensitive.`,
        `Watch those ${deadlineCount} — they have dates attached.`,
        `${deadlineCount} of them have deadlines coming up.`,
      ]);

  if (deadlineCount > 0) {
    return `${opener} ${captured} — "${heading}". ${deadlineNote}`;
  }

  if (Math.random() < 0.33) {
    const checkIn = pick([
      `Check Fey when you're ready.`,
      `Open Fey to review.`,
      `Head to Fey when you're free.`,
      `It's all in Fey.`,
      `You'll find it all in Fey.`,
    ]);
    return `${opener} ${captured} — "${heading}". ${checkIn}`;
  }

  return `${opener} ${captured} — "${heading}".`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(raw) {
  const phone = String(raw).replace(/^whatsapp:/i, '').trim();
  return phone.startsWith('+') ? phone : `+${phone}`;
}

/** Formats a date string as "Mon 26 May" */
function fmtDate(dateStr) {
  return format(new Date(dateStr + 'T00:00:00'), 'EEE d MMM');
}

/** Formats a date string as "26 May" */
function fmtDateShort(dateStr) {
  return format(new Date(dateStr + 'T00:00:00'), 'd MMM');
}

/**
 * Parses an optional date override from the message body.
 * Supported phrases: "yesterday", "today", "last <weekday>", "<Month> <day>" (e.g. "May 16").
 * Returns { date: Date, body: string } — body is the message with the prefix stripped.
 * Falls back to today if no override is detected or the phrase is unrecognised.
 */
function parseDateOverride(message) {
  const re = /^add\s+to\s+(yesterday|today|last\s+\w+|[A-Za-z]+\s+\d{1,2})[,\s\n]+([\s\S]+)/i;
  const match = message.trim().match(re);

  if (!match) return { date: startOfDay(new Date()), body: message.trim() };

  const phrase = match[1].trim().toLowerCase();
  const body = match[2].trim();
  const today = startOfDay(new Date());

  if (phrase === 'today') return { date: today, body };
  if (phrase === 'yesterday') return { date: subDays(today, 1), body };

  if (phrase.startsWith('last ')) {
    const dayName = phrase.slice(5).trim();
    const dayNum = DAY_MAP[dayName];
    if (dayNum !== undefined) {
      return { date: previousDay(today, dayNum), body };
    }
  }

  // "May 16", "June 3", etc. — parse against current year
  const parsed = parse(match[1].trim(), 'MMM d', today);
  if (isValid(parsed)) return { date: parsed, body };

  return { date: today, body };
}

// ── Session management ────────────────────────────────────────────────────────

/**
 * Persists a numbered task map for the user.
 * One row per user — upserted so only the latest list is ever stored.
 * @param {string} userId
 * @param {Record<string, string>} taskMap  e.g. { "1": "uuid", "2": "uuid" }
 */
async function saveSession(userId, taskMap) {
  await supabase
    .from('fey_sessions')
    .upsert(
      { user_id: userId, task_map: taskMap, created_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

/**
 * Retrieves the user's active session, or null if expired / not found.
 * @param {string} userId
 * @returns {Promise<Record<string, string> | null>}
 */
async function getSession(userId) {
  const { data } = await supabase
    .from('fey_sessions')
    .select('task_map, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;
  if (Date.now() - new Date(data.created_at).getTime() > SESSION_TTL_MS) return null;
  return data.task_map;
}

// ── Claude helpers ────────────────────────────────────────────────────────────

/**
 * Fast regex pre-classifier — catches the most common query patterns without
 * spending a Haiku call. Returns { intent, params } or null if no match.
 */
function preClassify(message, today) {
  const todayStr = format(today, 'yyyy-MM-dd');
  const m = message.trim().toLowerCase();

  // ── Date-specific queries ───────────────────────────────────────────────────

  // Helper: resolve a relative day phrase to YYYY-MM-DD
  const resolveRelativeDate = (phrase) => {
    const p = phrase.trim().toLowerCase();
    if (p === 'today') return todayStr;
    if (p === 'yesterday') return format(subDays(today, 1), 'yyyy-MM-dd');
    const lastMatch = p.match(/^last\s+(\w+)$/);
    if (lastMatch) {
      const dayNum = DAY_MAP[lastMatch[1]];
      if (dayNum !== undefined) return format(previousDay(today, dayNum), 'yyyy-MM-dd');
    }
    return null;
  };

  // "what tasks do I have today / for today / today's tasks" → show today's thread
  if (/\b(what|show|list).{0,30}(tasks?|todo|to-do|to do|work).{0,20}(today|for today)\b/.test(m)) {
    return { intent: 'query_date', params: { date: todayStr } };
  }
  if (/\bwhat.{0,20}(do i have|have i got|have i).{0,20}(today|for today)\b/.test(m)) {
    return { intent: 'query_date', params: { date: todayStr } };
  }
  if (/\b(today'?s?\s+(tasks?|list|todo)|tasks?\s+for\s+today)\b/.test(m)) {
    return { intent: 'query_date', params: { date: todayStr } };
  }

  // "tasks from yesterday / pending from yesterday / what did I have yesterday / last Monday tasks"
  const relativeDateMatch = m.match(
    /\b(tasks?|list|pending|work|todo|what.{0,20}(have|did))\b.{0,40}\b(yesterday|last\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/
  ) || m.match(
    /\b(yesterday|last\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b.{0,40}\b(tasks?|list|pending|work|todo)\b/
  );
  if (relativeDateMatch) {
    const phraseRaw = m.match(/\b(yesterday|last\s+\w+)\b/)?.[0];
    const resolved = phraseRaw ? resolveRelativeDate(phraseRaw) : null;
    if (resolved) return { intent: 'query_date', params: { date: resolved } };
  }

  // "what's pending / what do I have pending / pending tasks" → all pending
  if (/\b(what.{0,20}pending|pending\s+tasks?|what.{0,20}(left|to.?do)|what.{0,20}(haven't|haven.t|not)\s+(done|finished|completed))\b/.test(m)) {
    return { intent: 'query_pending', params: {} };
  }
  if (/\bshow.{0,10}(my\s+)?(pending|remaining|open)\s+(tasks?|list)\b/.test(m)) {
    return { intent: 'query_pending', params: {} };
  }

  // "what's overdue / overdue tasks / what am I late on"
  if (/\b(overdue|what.{0,20}(late|behind|missed)|late\s+tasks?)\b/.test(m)) {
    return { intent: 'query_overdue', params: {} };
  }

  // "what's due today / anything due today" → deadline-specific
  if (/\b(what.{0,20}due\s+today|anything\s+due\s+today|due\s+today|deadlines?\s+(today|for\s+today))\b/.test(m)) {
    return { intent: 'query_due_today', params: {} };
  }

  // "what did I do today / what did I finish today / completed today"
  if (/\b(what.{0,20}(did i|have i).{0,20}(done|finished|completed|got done).{0,10}today|completed\s+today|finished\s+today)\b/.test(m)) {
    return { intent: 'query_done_today', params: {} };
  }

  // "what did I finish this week / done this week"
  if (/\b(done|finished|completed).{0,15}(this\s+week|week)\b/.test(m) || /\bwhat.{0,20}(did i|have i).{0,20}(done|finished|completed).{0,10}week\b/.test(m)) {
    return { intent: 'query_done_week', params: {} };
  }

  // "what's coming up / upcoming deadlines"
  if (/\b(upcoming|coming\s+up|next\s+(2\s+weeks?|two\s+weeks?|few\s+weeks?))\b/.test(m)) {
    return { intent: 'query_upcoming', params: {} };
  }

  // "give me a summary / how am I doing / progress"
  if (/\b(summary|progress\s+(update|report)|how\s+am\s+i\s+doing|overview)\b/.test(m)) {
    return { intent: 'query_summary', params: {} };
  }

  // "move pending to tomorrow / push tasks to tomorrow / reschedule to Friday"
  const moveTomorrowMatch = /\b(move|push|reschedule|carry|shift).{0,20}(pending|tasks?|everything).{0,20}\b(tomorrow|next\s+\w+|this\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(m)
    || /\b(move|push|reschedule|carry|shift).{0,20}\b(tomorrow)\b/.test(m);
  if (moveTomorrowMatch) {
    const tomorrowStr = format(addDays(today, 1), 'yyyy-MM-dd');
    // Try to detect a specific day name, otherwise default to tomorrow
    const dayMatch = m.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (dayMatch) {
      const dayNum = DAY_MAP[dayMatch[1]];
      if (dayNum !== undefined) {
        // Find the next occurrence of that day
        let target = addDays(today, 1);
        while (format(target, 'EEEE').toLowerCase() !== dayMatch[1]) {
          target = addDays(target, 1);
        }
        return { intent: 'move_pending', params: { to_date: format(target, 'yyyy-MM-dd') } };
      }
    }
    return { intent: 'move_pending', params: { to_date: tomorrowStr } };
  }

  return null;
}

/**
 * Classifies a message into an intent + params object.
 * Returns { intent, params } — intent defaults to "add_tasks" when nothing matches.
 */
async function classifyMessage(message, today) {
  const todayStr = format(today, 'yyyy-MM-dd');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Today is ${todayStr}. Classify this WhatsApp message and return JSON only (no markdown, no explanation).

Return: { "intent": string, "params": object }

Intents and their params:
- "add_tasks"        — user is logging tasks, to-dos, or reminders. Examples: "call John tomorrow", "finish the report by Friday", "add to yesterday: fix bug". params: {}
- "query_pending"    — asking what tasks are still pending or not yet done (across all time). Examples: "what do I have pending?", "what's on my list?", "what do I need to do?", "any pending tasks?". params: {}
- "query_date"       — asking what tasks were logged on a specific date. Examples: "what tasks do I have for today?", "what do I have today?", "show me today's tasks", "what did I have on Monday?", "show me May 16", "what was logged yesterday?". params: { "date": "YYYY-MM-DD" }
- "query_due_today"  — asking specifically what is DUE today (has a deadline of today). Examples: "what's due today?", "anything due today?", "what deadlines do I have today?". params: {}
- "query_overdue"    — asking what tasks are overdue or late. Examples: "what's overdue?", "what am I behind on?", "any late tasks?". params: {}
- "query_done_today" — asking what was completed today. Examples: "what did I finish today?", "what did I get done today?". params: {}
- "query_done_week"  — asking what was completed this week. Examples: "what did I finish this week?", "weekly done list". params: {}
- "query_due_week"   — asking what is due this week. Examples: "what's due this week?". params: {}
- "query_upcoming"   — asking about upcoming deadlines (next 2 weeks). Examples: "what's coming up?", "upcoming deadlines". params: {}
- "query_summary"    — asking for a progress summary or overview. Examples: "how am I doing?", "give me a summary", "progress update". params: {}
- "copy_pending"     — asking to copy unfinished tasks from a past date to today. Examples: "copy yesterday's pending to today". params: { "from_date": "YYYY-MM-DD" }
- "move_pending"     — asking to move all pending tasks to a future date. Examples: "move pending to tomorrow", "push tasks to tomorrow", "move everything to Friday", "reschedule pending to next Monday". params: { "to_date": "YYYY-MM-DD" }

Rules:
- CRITICAL: Any message phrased as a question (starting with what, which, how, show, list, do I have, anything, any, etc.) is ALWAYS a query — never "add_tasks".
- Resolve relative date terms (today, yesterday, last Monday, May 16, etc.) to YYYY-MM-DD using today's date.
- "what tasks do I have for today?" and "what do I have today?" → "query_date" with date: "${todayStr}".
- "what do I have pending?" or "what's left to do?" → "query_pending".
- "what's due today?" → "query_due_today".
- Only use "add_tasks" when the user is clearly stating tasks to log, not asking a question.
- If nothing matches a query/action, default to "add_tasks".

Message: "${message}"`,
    }],
  });

  const text = response.content[0].text.trim();
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Calls Claude Haiku to extract tasks from a message.
 * Returns { heading: string, tasks: { title, notes, deadline }[] }.
 * Strips markdown code fences before parsing. Throws on invalid JSON.
 */
async function analyzeMessage(message, date) {
  const today = format(date, 'yyyy-MM-dd');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Today is ${today}. Analyze this WhatsApp message and return JSON only (no explanation) with:
- "heading": a short 3-6 word title summarizing the message topic
- "tasks": array of { "title": string, "notes": string|null, "deadline": "YYYY-MM-DD"|null }

Rules:
- Extract only tasks that are explicitly stated in the message. Do not infer, reword, or generate tasks that are not directly mentioned.
- Never create duplicate or reformulated versions of the same task.
- If the message contains a URL or link, treat it as a task to review or follow up on. Include the full URL in the notes field.
- notes: 1-2 sentences of context or relevant detail (include URLs here if present). null if there is nothing useful to add.
- deadline: convert relative terms (tomorrow, next Friday, end of week, etc.) to absolute ISO dates based on today. null if not mentioned.
- If the message has no clear tasks but contains a link, create a task like "Review link" or "Check [platform] post" with the URL in notes.
- ALWAYS return at least one task. If the message contains no clear action items, create a single task using the message content as the title.

Message: "${message}"`,
    }],
  });

  const text = response.content[0].text.trim();
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(cleaned);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Returns the thread ID for the given user + date, creating it if it doesn't exist.
 */
async function getOrCreateThread(userId, dateStr, heading) {
  const { data: existing } = await supabase
    .from('fey_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('message_date', dateStr)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('fey_threads')
    .insert({ user_id: userId, raw_message: '', heading, message_date: dateStr })
    .select('id')
    .single();

  if (error) throw error;
  return created.id;
}

// ── Query handlers ────────────────────────────────────────────────────────────

/** What's pending across all tasks */
async function handleQueryPending(userId) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const { data: tasks, error } = await supabase
    .from('fey_tasks')
    .select('id, title, deadline')
    .eq('user_id', userId)
    .eq('done', false)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!tasks || tasks.length === 0) return "Nothing pending. You're all caught up.";

  const taskMap = {};
  const lines = tasks.map((t, i) => {
    taskMap[String(i + 1)] = t.id;
    let line = `${i + 1}. ${t.title}`;
    if (t.deadline) {
      if (t.deadline < todayStr) line += ` — ${fmtDateShort(t.deadline)} (overdue)`;
      else if (t.deadline === todayStr) line += ` — today`;
      else line += ` — ${fmtDateShort(t.deadline)}`;
    }
    return line;
  });

  await saveSession(userId, taskMap);

  return `*Pending (${tasks.length})*\n\n${lines.join('\n')}\n\nReply "done 1, 3" to tick off.`;
}

/** Overdue tasks only */
async function handleQueryOverdue(userId) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const { data: tasks, error } = await supabase
    .from('fey_tasks')
    .select('id, title, deadline')
    .eq('user_id', userId)
    .eq('done', false)
    .not('deadline', 'is', null)
    .lt('deadline', todayStr)
    .order('deadline', { ascending: true });

  if (error) throw error;
  if (!tasks || tasks.length === 0) return "No overdue tasks.";

  const today = startOfDay(new Date());
  const taskMap = {};
  const lines = tasks.map((t, i) => {
    taskMap[String(i + 1)] = t.id;
    const days = Math.round((today - new Date(t.deadline + 'T00:00:00')) / 86400000);
    return `${i + 1}. ${t.title} — ${days}d overdue`;
  });

  await saveSession(userId, taskMap);

  return `*Overdue (${tasks.length})*\n\n${lines.join('\n')}\n\nReply "done 1" to mark complete.`;
}

/** Tasks for a specific date */
async function handleQueryDate(userId, dateStr) {
  const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd');
  const label = dateStr === todayStr ? 'Today' : fmtDate(dateStr);

  const { data: thread } = await supabase
    .from('fey_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('message_date', dateStr)
    .maybeSingle();

  if (!thread) return `Nothing logged for ${label}.`;

  const { data: tasks, error } = await supabase
    .from('fey_tasks')
    .select('id, title, done')
    .eq('thread_id', thread.id)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  if (!tasks || tasks.length === 0) return `Nothing logged for ${label}.`;

  const taskMap = {};
  const lines = tasks.map((t, i) => {
    if (!t.done) taskMap[String(i + 1)] = t.id;
    return t.done ? `~${t.title}~` : `${i + 1}. ${t.title}`;
  });

  const hasPending = Object.keys(taskMap).length > 0;
  await saveSession(userId, taskMap);

  const suffix = hasPending ? '\n\nReply "done 1" to tick off.' : '';
  return `*${label}*\n\n${lines.join('\n')}${suffix}`;
}

/** What was completed today */
async function handleQueryDoneToday(userId) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const { data: thread } = await supabase
    .from('fey_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('message_date', todayStr)
    .maybeSingle();

  if (!thread) return "Nothing logged today yet.";

  const { data: tasks, error } = await supabase
    .from('fey_tasks')
    .select('title')
    .eq('thread_id', thread.id)
    .eq('done', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  if (!tasks || tasks.length === 0) return "Nothing completed today yet.";

  return `*Completed today (${tasks.length})*\n\n${tasks.map((t) => `~${t.title}~`).join('\n')}`;
}

/** Summary of completed tasks this week (last 7 days) */
async function handleQueryDoneWeek(userId) {
  const today = startOfDay(new Date());
  const weekStartStr = format(subDays(today, 6), 'yyyy-MM-dd');
  const todayStr = format(today, 'yyyy-MM-dd');

  const { data: threads } = await supabase
    .from('fey_threads')
    .select('id')
    .eq('user_id', userId)
    .gte('message_date', weekStartStr)
    .lte('message_date', todayStr);

  if (!threads || threads.length === 0) return "Nothing logged this week yet.";

  const { data: tasks, error } = await supabase
    .from('fey_tasks')
    .select('title')
    .in('thread_id', threads.map((t) => t.id))
    .eq('done', true);

  if (error) throw error;
  if (!tasks || tasks.length === 0) return "Nothing completed this week yet.";

  return `*Completed this week (${tasks.length})*\n\n${tasks.map((t) => `~${t.title}~`).join('\n')}`;
}

/** Tasks due today */
async function handleQueryDueToday(userId) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const { data: tasks, error } = await supabase
    .from('fey_tasks')
    .select('id, title')
    .eq('user_id', userId)
    .eq('done', false)
    .eq('deadline', todayStr)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!tasks || tasks.length === 0) return "Nothing due today.";

  const taskMap = {};
  const lines = tasks.map((t, i) => { taskMap[String(i + 1)] = t.id; return `${i + 1}. ${t.title}`; });

  await saveSession(userId, taskMap);

  return `*Due today (${tasks.length})*\n\n${lines.join('\n')}\n\nReply "done 1" to tick off.`;
}

/** Tasks due in the next 7 days */
async function handleQueryDueWeek(userId) {
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  const weekEndStr = format(addDays(today, 6), 'yyyy-MM-dd');

  const { data: tasks, error } = await supabase
    .from('fey_tasks')
    .select('id, title, deadline')
    .eq('user_id', userId)
    .eq('done', false)
    .gte('deadline', todayStr)
    .lte('deadline', weekEndStr)
    .order('deadline', { ascending: true });

  if (error) throw error;
  if (!tasks || tasks.length === 0) return "Nothing due this week.";

  const taskMap = {};
  const lines = tasks.map((t, i) => {
    taskMap[String(i + 1)] = t.id;
    return `${i + 1}. ${t.title} — ${fmtDate(t.deadline)}`;
  });

  await saveSession(userId, taskMap);

  return `*Due this week (${tasks.length})*\n\n${lines.join('\n')}\n\nReply "done 1" to tick off.`;
}

/** Upcoming deadlines in the next 14 days */
async function handleQueryUpcoming(userId) {
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  const futureStr = format(addDays(today, 13), 'yyyy-MM-dd');

  const { data: tasks, error } = await supabase
    .from('fey_tasks')
    .select('id, title, deadline')
    .eq('user_id', userId)
    .eq('done', false)
    .not('deadline', 'is', null)
    .gte('deadline', todayStr)
    .lte('deadline', futureStr)
    .order('deadline', { ascending: true });

  if (error) throw error;
  if (!tasks || tasks.length === 0) return "No deadlines in the next 2 weeks.";

  const taskMap = {};
  const lines = tasks.map((t, i) => {
    taskMap[String(i + 1)] = t.id;
    return `${i + 1}. ${t.title} — ${fmtDate(t.deadline)}`;
  });

  await saveSession(userId, taskMap);

  return `*Upcoming deadlines (${tasks.length})*\n\n${lines.join('\n')}\n\nReply "done 1" to tick off.`;
}

/** Weekly progress summary */
async function handleQuerySummary(userId) {
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  const weekStartStr = format(subDays(today, 6), 'yyyy-MM-dd');

  const { data: threads } = await supabase
    .from('fey_threads')
    .select('id')
    .eq('user_id', userId)
    .gte('message_date', weekStartStr)
    .lte('message_date', todayStr);

  let completed = 0, pending = 0, overdue = 0;

  if (threads && threads.length > 0) {
    const { data: tasks, error } = await supabase
      .from('fey_tasks')
      .select('done, deadline')
      .in('thread_id', threads.map((t) => t.id));

    if (error) throw error;

    (tasks || []).forEach((t) => {
      if (t.done) completed++;
      else if (t.deadline && t.deadline < todayStr) overdue++;
      else pending++;
    });
  }

  const total = completed + pending + overdue;
  if (total === 0) return "Nothing logged this week yet.";

  const pct = Math.round((completed / total) * 100);
  let mood;
  if (pct >= 80) mood = 'Great work this week.';
  else if (pct >= 50) mood = 'Good progress — keep going.';
  else mood = 'Plenty to get through — you got this.';

  const overdueStr = overdue > 0 ? `\nOverdue: ${overdue}` : '';
  return `*This week*\n\nCompleted: ${completed}\nPending: ${pending}${overdueStr}\n\n${pct}% done — ${mood}`;
}

/** Copy pending tasks from a past date into today's thread */
async function handleCopyPending(userId, fromDateStr) {
  const { data: fromThread } = await supabase
    .from('fey_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('message_date', fromDateStr)
    .maybeSingle();

  if (!fromThread) return `No tasks found for ${fmtDate(fromDateStr)}.`;

  const { data: pending, error } = await supabase
    .from('fey_tasks')
    .select('title, notes, deadline')
    .eq('thread_id', fromThread.id)
    .eq('done', false)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  if (!pending || pending.length === 0) return `No pending tasks on ${fmtDate(fromDateStr)}.`;

  const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd');
  const threadId = await getOrCreateThread(userId, todayStr, 'Carried over tasks');

  const { count: existingCount } = await supabase
    .from('fey_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', threadId);

  const rows = pending.map((t, i) => ({
    thread_id: threadId,
    user_id: userId,
    title: t.title,
    notes: t.notes,
    deadline: t.deadline,
    done: false,
    sort_order: (existingCount ?? 0) + i,
  }));

  const { error: insertError } = await supabase.from('fey_tasks').insert(rows);
  if (insertError) throw insertError;

  const taskLines = pending.map((t) => `• ${t.title}`).join('\n');
  return `Copied ${pending.length} task${pending.length > 1 ? 's' : ''} from ${fmtDate(fromDateStr)} to today.\n\n${taskLines}`;
}

/**
 * Move all pending tasks to a target date's thread.
 * The originals are marked done so they leave the pending list.
 */
async function handleMovePending(userId, toDateStr) {
  const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd');
  const toLabel = toDateStr === todayStr ? 'today' : fmtDate(toDateStr);

  // Fetch all pending tasks across all threads
  const { data: pending, error } = await supabase
    .from('fey_tasks')
    .select('id, title, notes, deadline')
    .eq('user_id', userId)
    .eq('done', false)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!pending || pending.length === 0) return "Nothing pending to move.";

  // Get or create the target thread
  const threadId = await getOrCreateThread(userId, toDateStr, 'Moved tasks');

  const { count: existingCount } = await supabase
    .from('fey_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', threadId);

  // Insert copies into the target thread
  const rows = pending.map((t, i) => ({
    thread_id: threadId,
    user_id: userId,
    title: t.title,
    notes: t.notes,
    deadline: t.deadline,
    done: false,
    sort_order: (existingCount ?? 0) + i,
  }));

  const { error: insertError } = await supabase.from('fey_tasks').insert(rows);
  if (insertError) throw insertError;

  // Mark originals as done so they leave the pending list
  const { error: doneError } = await supabase
    .from('fey_tasks')
    .update({ done: true })
    .in('id', pending.map((t) => t.id));

  if (doneError) throw doneError;

  const taskLines = pending.map((t) => `• ${t.title}`).join('\n');
  return `Moved ${pending.length} task${pending.length > 1 ? 's' : ''} to ${toLabel}.\n\n${taskLines}`;
}

/** Mark tasks done by number from the user's last session */
async function handleDone(userId, numbersStr) {
  const session = await getSession(userId);

  if (!session) {
    return "Your last list has expired. Send a query to get a fresh one.";
  }

  const numbers = numbersStr.match(/\d+/g) || [];
  const taskIds = [...new Set(numbers.map((n) => session[n]).filter(Boolean))];

  if (taskIds.length === 0) {
    return "None of those numbers matched your last list. Send a query again.";
  }

  const { error } = await supabase
    .from('fey_tasks')
    .update({ done: true })
    .in('id', taskIds)
    .eq('user_id', userId);

  if (error) throw error;

  return `Marked ${taskIds.length} task${taskIds.length > 1 ? 's' : ''} as done.`;
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false })); // Twilio sends URL-encoded form data
app.use(express.json());

// ── POST /webhook — inbound WhatsApp messages from Twilio ─────────────────────

app.post('/webhook', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const reply = (msg) => {
    twiml.message(msg);
    res.type('text/xml').send(twiml.toString());
  };

  try {
    const fromRaw = req.body.From || '';
    const messageBody = (req.body.Body || '').trim();
    const phone = normalizePhone(fromRaw);

    if (!messageBody) return reply('Empty message received. Try again.');

    // ── 1. Verify sender ────────────────────────────────────────────────────
    const { data: connection } = await supabase
      .from('whatsapp_connections')
      .select('user_id, verified')
      .eq('phone_number', phone)
      .maybeSingle();

    if (!connection) {
      return reply("Your WhatsApp number isn't connected to WorkBoard. Go to Settings to connect.");
    }
    if (!connection.verified) {
      return reply("Your number isn't verified yet. Check WorkBoard settings.");
    }

    const { user_id } = connection;

    // ── 2. Handle "done X, Y" completions ──────────────────────────────────
    // Accepts: "done 1", "done 1, 3", "done 9 and 10", "done 1, 2 and 3"
    const doneMatch = messageBody.match(/^done\b([\s\d,]+(?:and[\s\d,]+)*)$/i);
    if (doneMatch && /\d/.test(doneMatch[1])) {
      return reply(await handleDone(user_id, doneMatch[1]));
    }

    // ── 3. Classify message intent ──────────────────────────────────────────
    const today = startOfDay(new Date());
    // Try fast regex pre-classifier first — avoids a Haiku call for obvious queries
    const { intent, params } = preClassify(messageBody, today) ?? await classifyMessage(messageBody, today);

    // ── 4. Route to query / action handlers ────────────────────────────────
    if (intent !== 'add_tasks') {
      let result;

      switch (intent) {
        case 'query_pending':    result = await handleQueryPending(user_id); break;
        case 'query_overdue':    result = await handleQueryOverdue(user_id); break;
        case 'query_date':       result = await handleQueryDate(user_id, params.date); break;
        case 'query_done_today': result = await handleQueryDoneToday(user_id); break;
        case 'query_done_week':  result = await handleQueryDoneWeek(user_id); break;
        case 'query_due_today':  result = await handleQueryDueToday(user_id); break;
        case 'query_due_week':   result = await handleQueryDueWeek(user_id); break;
        case 'query_upcoming':   result = await handleQueryUpcoming(user_id); break;
        case 'query_summary':    result = await handleQuerySummary(user_id); break;
        case 'copy_pending':     result = await handleCopyPending(user_id, params.from_date); break;
        case 'move_pending':     result = await handleMovePending(user_id, params.to_date); break;
        default: break;
      }

      if (result) return reply(result);
    }

    // ── 5. Add tasks (default path) ─────────────────────────────────────────
    const { date, body } = parseDateOverride(messageBody);
    const dateStr = format(date, 'yyyy-MM-dd');

    const [{ heading, tasks }, { data: existingThread, error: lookupError }] = await Promise.all([
      analyzeMessage(body, date),
      supabase
        .from('fey_threads')
        .select('id')
        .eq('user_id', user_id)
        .eq('message_date', dateStr)
        .maybeSingle(),
    ]);

    if (lookupError) throw lookupError;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return reply("Couldn't extract any tasks from your message. Try again.");
    }

    let threadId;
    if (existingThread) {
      threadId = existingThread.id;
    } else {
      const { data: newThread, error: threadError } = await supabase
        .from('fey_threads')
        .insert({
          user_id,
          raw_message: body,
          heading: String(heading || body).slice(0, 120),
          message_date: dateStr,
        })
        .select('id')
        .single();

      if (threadError) throw threadError;
      threadId = newThread.id;
    }

    const { count: existingCount } = await supabase
      .from('fey_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('thread_id', threadId);

    const rows = tasks.slice(0, 20).map((task, i) => ({
      thread_id: threadId,
      user_id,
      title: String(task.title || '').trim(),
      notes: task.notes ? String(task.notes).trim() : null,
      deadline: task.deadline || null,
      done: false,
      sort_order: (existingCount ?? 0) + i,
    }));

    const { error: insertError } = await supabase.from('fey_tasks').insert(rows);
    if (insertError) throw insertError;

    return reply(buildReply(rows, heading));

  } catch (err) {
    Sentry.captureException(err);
    console.error('[webhook]', err);

    const isClaudeError = typeof err?.status === 'number';
    const isDbError = !isClaudeError && typeof err?.code === 'string' && err?.details !== undefined;
    const isParseError = err instanceof SyntaxError;

    if (isClaudeError) return reply('Fey is down a bit. Try again in a moment.');
    if (isDbError) return reply("Fey received your message but couldn't save it. Try again.");
    if (isParseError) return reply("Fey couldn't make sense of your message. Try rephrasing it.");
    return reply("Something went wrong on our end. Try again shortly.");
  }
});

// ── POST /verify/send — send a 6-digit code to the user's WhatsApp ────────────

app.post('/verify/send', async (req, res) => {
  try {
    const { phone_number, user_id } = req.body;
    if (!phone_number || !user_id) {
      return res.status(400).json({ error: 'phone_number and user_id are required.' });
    }

    const phone = normalizePhone(phone_number);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase.from('verification_codes').delete().eq('phone_number', phone);

    const { error: codeError } = await supabase
      .from('verification_codes')
      .insert({ phone_number: phone, code, expires_at: expiresAt });
    if (codeError) throw codeError;

    const { error: connError } = await supabase
      .from('whatsapp_connections')
      .upsert(
        { user_id, phone_number: phone, verified: false },
        { onConflict: 'user_id' },
      );
    if (connError) throw connError;

    await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${phone}`,
      body: `Your WorkBoard verification code is: ${code}. It expires in 10 minutes.`,
    });

    return res.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err);
    console.error('[verify/send]', err);
    return res.status(500).json({ error: 'Failed to send verification code. Try again.' });
  }
});

// ── POST /verify/confirm — confirm the code and mark the number as verified ───

app.post('/verify/confirm', async (req, res) => {
  try {
    const { phone_number, code } = req.body;
    if (!phone_number || !code) {
      return res.status(400).json({ error: 'phone_number and code are required.' });
    }

    const phone = normalizePhone(phone_number);
    const now = new Date().toISOString();

    const { data: record } = await supabase
      .from('verification_codes')
      .select('code, expires_at')
      .eq('phone_number', phone)
      .maybeSingle();

    if (!record) {
      return res.status(400).json({ error: 'No verification code found. Request a new one.' });
    }
    if (record.expires_at < now) {
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }
    if (record.code !== String(code).trim()) {
      return res.status(400).json({ error: 'Incorrect code.' });
    }

    const { error: updateError } = await supabase
      .from('whatsapp_connections')
      .update({ verified: true, connected_at: now })
      .eq('phone_number', phone);
    if (updateError) throw updateError;

    await supabase.from('verification_codes').delete().eq('phone_number', phone);

    return res.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err);
    console.error('[verify/confirm]', err);
    return res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Reminders ─────────────────────────────────────────────────────────────────

/**
 * Reads a single app_setting for a user.
 * Returns the string value or null if not set.
 */
async function getUserSetting(userId, key) {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle();
  return data?.value ?? null;
}

/**
 * Sends a WhatsApp message from the bot to a user's registered number.
 */
async function sendWhatsApp(phoneNumber, body) {
  await twilioClient.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: `whatsapp:${phoneNumber}`,
    body,
  });
}

/**
 * Deadline reminders — sends a message listing tasks due today.
 * Only runs for users who have fey_deadline_reminders = "true".
 */
async function runDeadlineReminders() {
  const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd');

  const { data: connections } = await supabase
    .from('whatsapp_connections')
    .select('user_id, phone_number')
    .eq('verified', true);

  if (!connections?.length) return;

  for (const conn of connections) {
    try {
      const enabled = await getUserSetting(conn.user_id, 'fey_deadline_reminders');
      if (enabled !== 'true') continue;

      const { data: tasks } = await supabase
        .from('fey_tasks')
        .select('id, title')
        .eq('user_id', conn.user_id)
        .eq('done', false)
        .eq('deadline', todayStr)
        .order('created_at', { ascending: true });

      if (!tasks?.length) continue;

      const taskMap = {};
      const lines = tasks.map((t, i) => {
        taskMap[String(i + 1)] = t.id;
        return `${i + 1}. ${t.title}`;
      });
      await saveSession(conn.user_id, taskMap);

      const msg = `*Reminder* — ${tasks.length} task${tasks.length > 1 ? 's' : ''} due today:\n\n${lines.join('\n')}\n\nReply "done 1" to tick off.`;
      await sendWhatsApp(conn.phone_number, msg);
    } catch (err) {
      Sentry.captureException(err);
      console.error('[reminders:deadline]', conn.user_id, err.message);
    }
  }
}

/**
 * Daily nudge — sends a short encouraging message with the pending task count.
 * Only runs for users who have fey_daily_nudge = "true" and have pending tasks.
 */
async function runDailyNudge() {
  const { data: connections } = await supabase
    .from('whatsapp_connections')
    .select('user_id, phone_number')
    .eq('verified', true);

  if (!connections?.length) return;

  const nudgeOpeners = [
    (n) => `Morning. ${n} task${n > 1 ? 's' : ''} pending — let's get through them.`,
    (n) => `New day. You've got ${n} thing${n > 1 ? 's' : ''} waiting.`,
    (n) => `Hey — ${n} pending task${n > 1 ? 's' : ''}. You've got this.`,
    (n) => `Good morning. ${n} task${n > 1 ? 's' : ''} still on your list.`,
    (n) => `${n} thing${n > 1 ? 's' : ''} to get done today. Make it count.`,
  ];

  for (const conn of connections) {
    try {
      const enabled = await getUserSetting(conn.user_id, 'fey_daily_nudge');
      if (enabled !== 'true') continue;

      const { data: pending } = await supabase
        .from('fey_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', conn.user_id)
        .eq('done', false);

      const count = pending?.length ?? 0;
      if (count === 0) continue;

      const opener = pick(nudgeOpeners)(count);
      const msg = `${opener}\n\nSend "show pending" to see your list.`;
      await sendWhatsApp(conn.phone_number, msg);
    } catch (err) {
      Sentry.captureException(err);
      console.error('[reminders:nudge]', conn.user_id, err.message);
    }
  }
}

/**
 * Runs every hour on the hour.
 * Checks which users have a reminder time matching the current UTC hour
 * and dispatches deadline reminders + daily nudges accordingly.
 */
cron.schedule('0 * * * *', async () => {
  const currentHour = new Date().getUTCHours();
  console.log(`[cron] tick — UTC hour ${currentHour}`);

  // Fetch all verified connections
  const { data: connections } = await supabase
    .from('whatsapp_connections')
    .select('user_id')
    .eq('verified', true);

  if (!connections?.length) return;

  // Build list of users whose reminder time matches this hour
  const activeUserIds = new Set();
  for (const conn of connections) {
    const timeStr = await getUserSetting(conn.user_id, 'fey_reminder_time') ?? '08:00';
    const [h] = timeStr.split(':').map(Number);
    if (h === currentHour) activeUserIds.add(conn.user_id);
  }

  if (activeUserIds.size === 0) return;

  console.log(`[cron] sending reminders to ${activeUserIds.size} user(s)`);
  await Promise.allSettled([
    runDeadlineReminders(),
    runDailyNudge(),
  ]);
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Bot server listening on port ${PORT}`));
