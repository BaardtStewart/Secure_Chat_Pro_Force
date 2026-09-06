import { useState } from 'react';
import { SCREENS, ThemeCtx, DARK, LIGHT } from './screens.jsx';

export default function App() {
  const [current, setCurrent] = useState('invite_gate');
  const [theme, setTheme] = useState('dark');
  const [showGroups, setShowGroups] = useState(true);

  const C = theme === 'dark' ? DARK : LIGHT;
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  const toggleShowGroups = () => setShowGroups(s => !s);
  const Screen = SCREENS[current];

  return (
    <ThemeCtx.Provider value={{ C, theme, toggleTheme, showGroups, toggleShowGroups }}>
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
