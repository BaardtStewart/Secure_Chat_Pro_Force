import { useState, useEffect } from 'react';
import { SCREENS, ThemeCtx, DARK, LIGHT, hexToRgba } from './screens.jsx';
import { supabase } from './supabaseClient.js';

export default function App() {
  // Read once on load — the invite token travels in the URL both on the
  // very first visit (from a real invite link) and again when Supabase
  // redirects back after a magic link is clicked (see RegisterEmail,
  // which encodes it into emailRedirectTo specifically so it survives
  // that round trip).
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'));
  const [current, setCurrent] = useState('invite_gate');
  const [authChecked, setAuthChecked] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [showGroups, setShowGroups] = useState(true);

  // Company branding — must mirror the dev wireframe's App() component
  // exactly. Every screen that renders the shared TopBar (which is most
  // of them) reads companyName/companyLogoUploaded, and every screen
  // reads C.accent/C.accentDim — all of this must exist here or the
  // whole app throws on first render.
  const [companyName, setCompanyName] = useState('Pro Force Security');
  const [companyPrimary, setCompanyPrimary] = useState('#C41230');
  const [companySecondary, setCompanySecondary] = useState('#D4A017');
  const [companyLogoUploaded, setCompanyLogoUploaded] = useState(false);

  // Which specific group is currently open — set by GroupsList when a
  // group is tapped, read by GroupDetail. Screens have no other way to
  // pass data to each other (nav() only ever carries a screen id), so
  // anything a screen needs to know about "what was just tapped" has to
  // live here at the root, the same way inviteToken already does.
  const [selectedGroup, setSelectedGroup] = useState(null); // { id, name }

  // On load, and whenever Supabase's own auth state changes (this fires
  // the moment a magic link redirect establishes a real session), decide
  // where to route: an existing session with an existing profile goes
  // straight to Home; an existing session with NO profile yet (mid
  // registration, just verified) goes to Profile Setup to finish; no
  // session at all starts the normal invite flow.
  useEffect(() => {
    let active = true;

    async function routeForSession(session) {
      if (!session) {
        if (active) { setAuthChecked(true); }
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!active) return;
      setCurrent(profile ? 'company_feed' : 'register_profile');
      setAuthChecked(true);
    }

    supabase.auth.getSession().then(({ data }) => routeForSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      routeForSession(session);
    });

    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const baseC = theme === 'dark' ? DARK : LIGHT;
  const brandDim = hexToRgba(companyPrimary, theme === 'dark' ? 0.13 : 0.08);
  const C = {
    ...baseC,
    accent: companyPrimary,
    accentDim: brandDim,
    avatarBg: brandDim,
    headerBg: `linear-gradient(155deg,${hexToRgba(companyPrimary, 0.12)} 0%,${baseC.bg} 100%)`,
    alert: companySecondary,
  };
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  const toggleShowGroups = () => setShowGroups(s => !s);
  const Screen = SCREENS[current];

  // Avoid flashing the Invite Gate for a returning, already-logged-in user
  // while we're still checking — a blank screen for a moment is more
  // honest than a wrong one that immediately jumps away.
  if (!authChecked) {
    return <div style={{ height: '100dvh', width: '100vw', background: '#09090F' }} />;
  }

  return (
    <ThemeCtx.Provider value={{
      C, theme, toggleTheme, showGroups, toggleShowGroups,
      companyName, setCompanyName, companyPrimary, setCompanyPrimary,
      companySecondary, setCompanySecondary, companyLogoUploaded, setCompanyLogoUploaded,
      inviteToken, selectedGroup, setSelectedGroup,
    }}>
      <div
        className="pf-app-shell"
        style={{
          background: C.bg,
          position: 'relative',
          overflow: 'hidden',
          transition: 'background 0.3s',
          // Respect notches / home-indicator safe areas on real devices
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {Screen && <Screen nav={setCurrent} />}
      </div>
    </ThemeCtx.Provider>
  );
}
