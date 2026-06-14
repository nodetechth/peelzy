import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  passwordRecoveryMode: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithApple: (
    identityToken: string,
    nonce: string,
    fullName?: string | null
  ) => Promise<{ error: Error | null }>;
  sendPasswordResetEmail: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  clearPasswordRecoveryMode: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleAuthLink = async (url: string | null) => {
      if (!url) return;

      const params = getUrlParams(url);
      const type = params.get('type');

      const code = params.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && type === 'recovery') {
          setPasswordRecoveryMode(true);
        }
        return;
      }

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) return;

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (!error) {
        setPasswordRecoveryMode(type === 'recovery');
      }
    };

    Linking.getInitialURL().then(handleAuthLink);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleAuthLink(url);
    });

    return () => subscription.remove();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'peelzy://auth/callback',
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signInWithApple = async (
    identityToken: string,
    nonce: string,
    fullName?: string | null
  ) => {
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce,
    });

    if (!error && fullName) {
      await supabase.auth.updateUser({
        data: { display_name: fullName },
      });
    }

    return { error };
  };

  const sendPasswordResetEmail = async (email: string) => {
    const redirectTo = 'peelzy://update-password';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      setPasswordRecoveryMode(false);
    }
    return { error };
  };

  const clearPasswordRecoveryMode = () => {
    setPasswordRecoveryMode(false);
  };

  const signOut = async () => {
    setPasswordRecoveryMode(false);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        passwordRecoveryMode,
        signUp,
        signIn,
        signInWithApple,
        sendPasswordResetEmail,
        updatePassword,
        clearPasswordRecoveryMode,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function getUrlParams(url: string): URLSearchParams {
  const [, query = ''] = url.split('?');
  const [, fragment = ''] = url.split('#');
  return new URLSearchParams([query, fragment].filter(Boolean).join('&'));
}
