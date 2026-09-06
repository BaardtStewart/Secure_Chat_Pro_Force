import { useState } from 'react';
import { SCREENS, ThemeCtx, DARK, LIGHT, hexToRgba } from './screens.jsx';

export default function App() {
  const [current, setCurrent] = useState('invite_gate');
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

  return (
    <ThemeCtx.Provider value={{
      C, theme, toggleTheme, showGroups, toggleShowGroups,
      companyName, setCompanyName, companyPrimary, setCompanyPrimary,
      companySecondary, setCompanySecondary, companyLogoUploaded, setCompanyLogoUploaded,
    }}>
      <div
        style={{
          height: '100dvh',
          width: '100vw',
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
