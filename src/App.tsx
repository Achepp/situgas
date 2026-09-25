import { useState, useEffect, useRef, useTransition } from 'react';
import { User } from './types';
import LoginPage from './components/LoginPage';
import LecturerPortal from './components/LecturerPortal';
import StudentPortal from './components/StudentPortal';
import AdminPortal from './components/AdminPortal';
import { supabase } from './lib/supabase';
import { setIdToken } from './lib/api';

const USER_STORAGE_KEY = 'situgas_user';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(USER_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isPending, startTransition] = useTransition();

  const currentUserRef = useRef<User | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Load and listen to user auth session from Supabase
  useEffect(() => {
    let active = true;
    setIsLoadingAuth(true);

    const handleSession = async (session: any, event?: string) => {
      if (!active) return;

      // If explicitly signed out, clear everything
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(USER_STORAGE_KEY);
        currentUserRef.current = null;
        setIdToken(null);
        setCurrentUser(null);
        setIsLoadingAuth(false);
        return;
      }

      if (session?.user) {
        try {
          const token = session.access_token;
          setIdToken(token);

          // Small delay (50ms) to ensure Supabase internal client authorization header is ready
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (!active) return;

          // Attempt to fetch user profile from profiles table
          const { data: dbUser, error: dbError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (dbError) {
            console.warn('Supabase profiles query warning:', dbError);
          }

          const rawRole = (
            dbUser?.role ||
            session.user.user_metadata?.role ||
            currentUserRef.current?.role ||
            ''
          ).toLowerCase().trim();

          if (rawRole === 'admin' || rawRole === 'administrator') {
            const adminUser: User = {
              uid: session.user.id,
              role: 'admin',
              email: dbUser?.email || session.user.email || currentUserRef.current?.email || '',
              name: dbUser?.name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || currentUserRef.current?.name || 'Administrator',
              avatarUrl: dbUser?.avatar_url || currentUserRef.current?.avatarUrl || '',
              idNumber: dbUser?.nim || currentUserRef.current?.idNumber || undefined,
            };
            try {
              localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(adminUser));
            } catch {}
            currentUserRef.current = adminUser;
            setCurrentUser(adminUser);
          } else if (rawRole === 'lecturer') {
            const lecturerUser: User = {
              uid: session.user.id,
              role: 'lecturer',
              email: dbUser?.email || session.user.email || currentUserRef.current?.email || '',
              name: dbUser?.name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || currentUserRef.current?.name || 'Dosen',
              avatarUrl: dbUser?.avatar_url || currentUserRef.current?.avatarUrl || '',
              idNumber: dbUser?.nim || currentUserRef.current?.idNumber || undefined,
            };
            try {
              localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(lecturerUser));
            } catch {}
            currentUserRef.current = lecturerUser;
            setCurrentUser(lecturerUser);
          } else if (rawRole === 'student') {
            const studentUser: User = {
              uid: session.user.id,
              role: 'student',
              email: dbUser?.email || session.user.email || `${dbUser?.nim || session.user.id}@students.situgas.local`,
              name: dbUser?.name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || currentUserRef.current?.name || 'Mahasiswa',
              avatarUrl: dbUser?.avatar_url || currentUserRef.current?.avatarUrl || '',
              idNumber: dbUser?.nim || currentUserRef.current?.idNumber || undefined,
            };
            try {
              localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(studentUser));
            } catch {}
            currentUserRef.current = studentUser;
            setCurrentUser(studentUser);
          } else {
            // Unknown role. If user is already active with this uid, keep it!
            if (currentUserRef.current && currentUserRef.current.uid === session.user.id) {
              console.log('Preserving active session for user:', session.user.id);
            } else {
              console.warn('Unrecognized role, clearing session:', rawRole);
              localStorage.removeItem(USER_STORAGE_KEY);
              currentUserRef.current = null;
              await supabase.auth.signOut();
              setCurrentUser(null);
            }
          }
        } catch (e) {
          console.error('Error verifying Supabase user session:', e);
          // Preserve existing currentUserRef if already logged in to prevent sudden logout
          if (!currentUserRef.current) {
            setCurrentUser(null);
          }
        }
      } else {
        // No session found
        if (!currentUserRef.current) {
          setIdToken(null);
          setCurrentUser(null);
        } else {
          // Double check with getSession before assuming logged out
          const { data } = await supabase.auth.getSession();
          if (!data?.session) {
            localStorage.removeItem(USER_STORAGE_KEY);
            currentUserRef.current = null;
            setIdToken(null);
            setCurrentUser(null);
          }
        }
      }
      setIsLoadingAuth(false);
    };

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session, 'INITIAL_SESSION');
    });

    // Event listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      handleSession(session, event);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = (user: User) => {
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {}
    currentUserRef.current = user;
    startTransition(() => {
      setCurrentUser(user);
    });
  };

  const handleLogout = async () => {
    setIsLoadingAuth(true);
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
      currentUserRef.current = null;
      await supabase.auth.signOut();
      setIdToken(null);
      setCurrentUser(null);
    } catch (e) {
      console.error('Error signing out:', e);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B2147]"></div>
        <p className="mt-4 text-xs font-semibold text-[#0B2147]">Memuat SITugas...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen font-sans antialiased text-gray-900 bg-background selection:bg-secondary selection:text-white">
      {!currentUser ? (
        <LoginPage onLogin={handleLogin} />
      ) : currentUser.role === 'admin' ? (
        <AdminPortal
          user={currentUser}
          onLogout={handleLogout}
        />
      ) : currentUser.role === 'lecturer' ? (
        <LecturerPortal
          user={currentUser}
          onLogout={handleLogout}
        />
      ) : (
        <StudentPortal
          user={currentUser}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
