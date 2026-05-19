import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let resolved = false;

    const finishLoading = (nextSession) => {
      if (!mounted || resolved) return;
      resolved = true;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    };

    // Subscribe first so we never miss an auth event. INITIAL_SESSION fires once
    // Supabase has resolved the session from storage OR processed any OAuth
    // callback hash/code in the URL. SIGNED_IN also marks auth as ready.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        finishLoading(nextSession);
      }
      // On login or sign-up: flush any pending shared-client links queued while the user was logged out
      if ((event === 'SIGNED_IN') && nextSession?.user) {
        const pending = JSON.parse(localStorage.getItem('workboard_pending_shares') || '[]');
        if (pending.length > 0) {
          Promise.all(
            pending.map((payload) =>
              supabase
                .from('user_linked_clients')
                .upsert({ user_id: nextSession.user.id, ...payload }, { onConflict: 'user_id,token' })
            )
          ).then(() => localStorage.removeItem('workboard_pending_shares'));
        }
      }
    });

    // Safety net: if INITIAL_SESSION doesn't fire (edge case), resolve via
    // getSession() after a short delay. This also catches persisted sessions
    // where the library has already fired its events before our subscribe.
    const fallback = setTimeout(async () => {
      if (resolved) return;
      const { data: { session: fallbackSession } } = await supabase.auth.getSession();
      finishLoading(fallbackSession);
    }, 500);

    // Periodically verify the user still exists on the server.
    // getUser() validates against Supabase — unlike getSession() it won't
    // return a deleted user. Fires every 2 minutes.
    const heartbeat = setInterval(async () => {
      if (!mounted) return;
      const { error } = await supabase.auth.getUser();
      if (error) await supabase.auth.signOut();
    }, 2 * 60 * 1000);

    return () => {
      mounted = false;
      clearTimeout(fallback);
      clearInterval(heartbeat);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // Redirect to app root — the dashboard lives at "/", there is no "/dashboard" route
    const redirectTo = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
