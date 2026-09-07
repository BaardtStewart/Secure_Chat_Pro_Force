import { useState, useEffect, Component } from 'react';
import { SCREENS, ThemeCtx, DARK, LIGHT, hexToRgba } from './screens.jsx';
import { supabase } from './supabaseClient.js';
import { fetchUnreadSummary } from './dataLayer.js';

// A crash on any single screen previously meant a blank or frozen page,
// with no way to know what actually broke — genuinely undebuggable on a
// phone with no dev console. This catches that crash and shows the real
// error message and a reload button instead, so whatever goes wrong is at
// least visible and reportable, on any device. Must be a class component
// — React does not support this via hooks.
class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Screen crashed:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#09090F', gap: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 700 }}>Something went wrong on this screen</div>
          <div style={{ color: '#B0B0C0', fontSize: 12, maxWidth: 320, wordBreak: 'break-word', background: '#18181F', padding: 12, borderRadius: 8, fontFamily: 'monospace' }}>
            {this.state.error.message || String(this.state.error)}
          </div>
          <div onClick={() => window.location.reload()} style={{ background: '#C41230', color: '#FFFFFF', padding: '12px 24px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Reload App</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  // Read once on load — the invite token travels in the URL both on the
  // very first visit (from a real invite link) and again when Supabase
  // redirects back after a magic link is clicked (see RegisterEmail,
  // which encodes it into emailRedirectTo specifically so it survives
  // that round trip).
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'));
  const [current, setCurrent] = useState('invite_gate');
  const [authChecked, setAuthChecked] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [showGroups, setShowGroups] = useState(false);

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
  // Which post is currently open — same reasoning as selectedGroup above.
  // Set by any feed just before navigating to post_detail.
  const [selectedPostId, setSelectedPostId] = useState(null);
  // The logged-in user's own id — needed by every screen that shows posts,
  // to decide whether to offer Edit/Delete on a given post (only the
  // author, or an admin, should ever see those options).
  const [currentUserId, setCurrentUserId] = useState(null);

  // Real unread counts for the three bottom-nav badges — previously these
  // read from a static mock array and never actually reflected what's in
  // the database. refreshUnread is called by any screen after it marks
  // something read, so badges clear rather than staying stuck.
  const [unread, setUnread] = useState({ company: 0, groups: 0, public: 0 });
  const refreshUnread = () => {
    fetchUnreadSummary().then(setUnread).catch(() => { /* not signed in yet, or a transient error — badges just stay at their last known value */ });
  };

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
        if (active) {
          // This was the actual bug: previously, no session ALWAYS meant
          // "start the new-user flow", with no path back in for someone
          // whose session had simply expired. A real invite link (?invite=
          // in the URL) still means "brand new user" — but no invite token
          // at all now correctly means "returning user, please verify
          // again", routed straight to the same real email-verification
          // screen used at registration. Because that screen calls the
          // genuine Supabase magic-link API, and a returning user already
          // has a profile, the routing logic below (once their new session
          // lands) sends them straight to Company Feed — no invite, and no
          // re-creating their profile, required.
          setCurrent(inviteToken ? 'invite_gate' : 'register_verify_choice');
          setAuthChecked(true);
        }
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!active) return;
      setCurrentUserId(session.user.id);
      setCurrent(profile ? 'company_feed' : 'register_profile');
      setAuthChecked(true);
      if (profile) refreshUnread();
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

  // index.html hardcodes a dark background on <body> so there's no flash
  // of white before React mounts — but that means switching to light mode
  // only ever recolours the app's own div, not the body behind it. Any
  // sliver of body visible around the edges (notch/home-indicator safe
  // areas, or a sub-pixel gap) stays stuck dark regardless of theme unless
  // body itself is kept in sync here.
  useEffect(() => {
    document.body.style.background = C.bg;
  }, [C.bg]);

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
      inviteToken, setInviteToken, selectedGroup, setSelectedGroup,
      selectedPostId, setSelectedPostId, currentUserId,
      unread, refreshUnread,
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
        {Screen && <ScreenErrorBoundary><Screen nav={setCurrent} /></ScreenErrorBoundary>}
      </div>
    </ThemeCtx.Provider>
  );
}
