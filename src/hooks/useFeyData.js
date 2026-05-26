import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useFeyData(userId) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    try {
      const [threadsRes, tasksRes] = await Promise.all([
        supabase
          .from('fey_threads')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('fey_tasks')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true }),
      ]);

      if (threadsRes.error) throw threadsRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const tasksByThread = {};
      (tasksRes.data || []).forEach((t) => {
        if (!tasksByThread[t.thread_id]) tasksByThread[t.thread_id] = [];
        tasksByThread[t.thread_id].push(t);
      });

      setThreads(
        (threadsRes.data || []).map((th) => ({
          ...th,
          tasks: tasksByThread[th.id] || [],
        })),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchData();

    const channel = supabase
      .channel(`fey:${userId}`)
      // New thread created by Fey
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fey_threads', filter: `user_id=eq.${userId}` },
        () => setTimeout(fetchData, 500),
      )
      // New task added by Fey
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fey_tasks', filter: `user_id=eq.${userId}` },
        () => setTimeout(fetchData, 500),
      )
      // Task marked done / edited by Fey (e.g. "done 1, 3" via WhatsApp)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fey_tasks', filter: `user_id=eq.${userId}` },
        () => setTimeout(fetchData, 500),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchData]);

  const toggleTask = useCallback(async (taskId, done) => {
    setThreads((prev) =>
      prev.map((th) => ({
        ...th,
        tasks: th.tasks.map((t) => (t.id === taskId ? { ...t, done } : t)),
      })),
    );
    await supabase.from('fey_tasks').update({ done }).eq('id', taskId);
  }, []);

  const deleteThread = useCallback(async (threadId) => {
    setThreads((prev) => prev.filter((th) => th.id !== threadId));
    await supabase.from('fey_threads').delete().eq('id', threadId);
  }, []);

  const updateTask = useCallback(async (taskId, updates) => {
    setThreads((prev) =>
      prev.map((th) => ({
        ...th,
        tasks: th.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
      })),
    );
    await supabase.from('fey_tasks').update(updates).eq('id', taskId);
  }, []);

  const deleteTask = useCallback(async (taskId) => {
    setThreads((prev) =>
      prev.map((th) => ({
        ...th,
        tasks: th.tasks.filter((t) => t.id !== taskId),
      })),
    );
    await supabase.from('fey_tasks').delete().eq('id', taskId);
  }, []);

  const addTask = useCallback(async (threadId, title) => {
    const thread = threads.find((th) => th.id === threadId);
    const maxOrder = thread && thread.tasks.length > 0
      ? Math.max(...thread.tasks.map((t) => t.sort_order ?? 0))
      : -1;

    const { data, error: insertError } = await supabase
      .from('fey_tasks')
      .insert({
        thread_id: threadId,
        user_id: userId,
        title: title.trim(),
        notes: null,
        deadline: null,
        done: false,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    setThreads((prev) =>
      prev.map((th) =>
        th.id === threadId ? { ...th, tasks: [...th.tasks, data] } : th,
      ),
    );
  }, [threads, userId]);

  return { threads, loading, error, toggleTask, updateTask, deleteThread, deleteTask, addTask, refetch: fetchData };
}
