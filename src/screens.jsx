import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "./supabaseClient.js";
import * as db from "./dataLayer.js";
import QRCode from "qrcode";

// ─── Theme Palettes ────────────────────────────────────────────────────────────
const DARK = {
  bg:        '#09090F',
  surface:   '#111118',
  surface2:  '#18181F',
  border:    '#23232F',
  accent:    '#C41230',
  accentDim: 'rgba(196,18,48,0.13)',
  alert:     '#D4A017',
  danger:    '#FF4757',
  success:   '#22C55E',
  tp:        '#F4F4FF',
  ts:        '#7A7A90',
  ts2:       '#3D3D52',
  avatarBg:  '#2A1018',
  navBg:     '#111118',
  headerBg:  'linear-gradient(155deg,#2A1018 0%,#09090F 100%)',
  sidebarBg: '#0A0A10',
};

const LIGHT = {
  bg:        '#F4F4F8',
  surface:   '#FFFFFF',
  surface2:  '#EBEBF0',
  border:    '#DCDCE6',
  accent:    '#C41230',
  accentDim: 'rgba(196,18,48,0.08)',
  alert:     '#9B6F00',
  danger:    '#D42B2B',
  success:   '#16A34A',
  tp:        '#0D0D1A',
  ts:        '#525268',
  ts2:       '#9898A8',
  avatarBg:  'rgba(196,18,48,0.09)',
  navBg:     '#FFFFFF',
  headerBg:  'linear-gradient(155deg,rgba(196,18,48,0.12) 0%,#F4F4F8 100%)',
  sidebarBg: '#EEEEF4',
};

// ─── Theme Context ─────────────────────────────────────────────────────────────
const ThemeCtx = createContext(null);
const useTheme = () => useContext(ThemeCtx);

// Converts a hex colour to an rgba() string at a given opacity — used so
// accentDim and button glows always match whatever companyPrimary is
// currently set to, rather than staying hardcoded to crimson regardless of
// the chosen brand colour. Placed here, near the top of the file, rather
// than near the root App component, specifically so it's never at risk of
// being excluded if this file is trimmed to build a production bundle.
const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// "8 min ago" / "3h ago" / "2 days ago" style relative time — real posts
// carry a genuine created_at timestamp instead of the mock data's
// hand-written time strings, so every real-data screen needs this.
const timeAgo = isoString => {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

// A post's badge_label is just a plain string from the database (no colour
// stored alongside it) — this maps a handful of known labels to a sensible
// colour, falling back to the theme's accent for anything else, so real
// posts still get the same visual treatment the mock data always had.
const badgeColorFor = (label, C) => {
  if (!label) return C.accent;
  const upper = label.toUpperCase();
  if (upper.includes('ANNOUNCEMENT') || upper.includes('HANDOVER')) return C.alert;
  if (upper.includes('ALERT')) return C.danger;
  return C.accent;
};

// ─── Shared UI Primitives ──────────────────────────────────────────────────────
const Avatar = ({ letter = 'P', size = 40 }) => {
  const { C } = useTheme();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: C.avatarBg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: C.accent, fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
      fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1,
    }}>{letter}</div>
  );
};

const Badge = ({ children, color }) => {
  const { C } = useTheme();
  const col = color || C.accent;
  return (
    <span style={{
      background: col + '22', color: col, fontSize: 11, fontWeight: 700,
      padding: '2px 7px', borderRadius: 20, letterSpacing: 0.5,
      border: `1px solid ${col}44`, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
};

const ThemeToggle = ({ value, onToggle }) => {
  const { C } = useTheme();
  return (
    <div onClick={onToggle} style={{
      width: 46, height: 26, borderRadius: 13, cursor: 'pointer',
      background: value ? C.accent : C.surface2,
      border: `1.5px solid ${value ? C.accent : C.border}`,
      position: 'relative', transition: 'all 0.2s', flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: 2, width: 18, height: 18, borderRadius: 9,
        background: value ? '#FFFFFF' : C.ts,
        left: value ? 22 : 2, transition: 'left 0.2s',
      }} />
    </div>
  );
};

// Tappable icon wrapper — guarantees a 44x44 minimum hit area around small glyphs.
const IconTap = ({ children, onClick, size = 44 }) => (
  <div onClick={onClick} style={{
    width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
  }}>{children}</div>
);

// A group-of-people icon, used everywhere "Groups" is represented. Built
// as an SVG using currentColor rather than an emoji (like 👥), because an
// emoji always renders in its own fixed native colours regardless of CSS —
// it can't be tinted for the active nav state or adapted between light and
// dark themes the way this needs to be. Whatever `color` is set on an
// ancestor, this icon follows automatically.
const GroupIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8.5" cy="8" r="3" fill="currentColor" />
    <path d="M2.5 19c0-3.31 2.69-6 6-6s6 2.69 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <circle cx="17" cy="8.5" r="2.5" fill="currentColor" opacity="0.6" />
    <path d="M14.5 13.2c2.9 0.3 5.1 2.6 5.1 5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.6" />
  </svg>
);

const TopBar = ({ title, back, onBack, right, logo }) => {
  const { C, companyName, companyLogoUploaded } = useTheme();
  const isDefaultBrand = companyName === 'Pro Force Security';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '8px 10px',
      background: C.surface, borderBottom: `1px solid ${C.border}`,
      position: 'sticky', top: 0, zIndex: 10, gap: 6, flexShrink: 0,
      justifyContent: logo ? 'center' : 'flex-start',
    }}>
      {back && (
        <IconTap onClick={onBack}><span style={{ color: C.accent, fontSize: 22, lineHeight: 1 }}>←</span></IconTap>
      )}
      {logo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{companyLogoUploaded ? '🖼' : '🛡'}</div>
          {isDefaultBrand ? (
            <span style={{ color: C.tp, fontSize: 15, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1.5 }}>
              PRO FORCE <span style={{ color: C.accent }}>SECURE</span>
            </span>
          ) : (
            <span style={{ color: C.tp, fontSize: 15, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1.5 }}>{companyName.toUpperCase()}</span>
          )}
        </div>
      ) : (
        <span style={{ color: C.tp, fontSize: 16, fontWeight: 700, flex: 1, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 0.5, marginLeft: back ? 0 : 6 }}>{title}</span>
      )}
      {!logo && right}
    </div>
  );
};

// Module-level group data — single source of truth for unread counts
// shared by BottomNav badges, GroupsList, and CompanyFeed groups row.
// scope: 'company' (normal — this company only) vs 'platform' (the one
// shared space every company on Pro Force Secure can see and post in).
const MY_GROUPS = [
  { init: 'SC', label: 'Sandton CBD Site',   members: 14,  vis: 'Members Only', unread: 3, allMembers: false, scope: 'company'  },
  { init: 'NA', label: 'Night Shift Alpha',  members: 8,   vis: 'Members Only', unread: 1, allMembers: false, scope: 'company'  },
  { init: 'AM', label: 'All Members',        members: 47,  vis: 'Public',       unread: 7, allMembers: true,  scope: 'company'  },
  { init: 'VD', label: 'VIP Detail – June',  members: 5,   vis: 'Members Only', unread: 0, allMembers: false, scope: 'company'  },
  { init: '🌐', label: 'Public — All Companies', members: 1204, vis: 'Public', unread: 2, allMembers: false, scope: 'platform' },
];
const DISCOVER_GROUPS = [
  { init: 'WC', label: 'Western Cape Region', members: 22, vis: 'Public' },
];
// Home badge = unread posts from this company's own All Members group only
// (does NOT include the platform-wide space — that's a deliberate choice,
// see Section 4.11 of the master document; easy to change later if wanted)
const COMPANY_UNREAD = MY_GROUPS.filter(g => g.allMembers).reduce((sum, g) => sum + g.unread, 0);
// Groups badge = unread across CLOSED/specific groups only — deliberately
// excludes the company-wide All Members group and the platform-wide Public
// group, since both of those now have their own dedicated nav tabs. This
// tab is specifically about the groups you'd manage or post to directly.
const GROUPS_UNREAD = MY_GROUPS.filter(g => !g.allMembers && g.scope === 'company').reduce((sum, g) => sum + g.unread, 0);
// Public badge = unread from the single platform-wide group specifically.
const PUBLIC_UNREAD = MY_GROUPS.filter(g => g.scope === 'platform').reduce((sum, g) => sum + g.unread, 0);

const BottomNav = ({ active, onNavigate }) => {
  const { C, unread } = useTheme();
  // Falls back to the old mock-derived constants only when `unread` isn't
  // provided at all — i.e. the chat-preview sandbox, which has no real
  // backend to fetch from. The real production App.jsx always provides
  // `unread`, fetched from get_my_groups() (see dataLayer.js).
  const items = [
    { id: 'company_feed', icon: '🏢', label: 'Company', badge: unread ? unread.company : COMPANY_UNREAD },
    { id: 'groups_list',  icon: 'group', label: 'Groups', badge: unread ? unread.groups : GROUPS_UNREAD  },
    { id: 'public_feed',  icon: '🌐', label: 'Public',  badge: unread ? unread.public : PUBLIC_UNREAD  },
    { id: 'profile_view', icon: '⚙️', label: 'Settings', badge: 0             },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
      background: C.navBg, borderTop: `1px solid ${C.border}`,
      display: 'flex', padding: '8px 0 18px',
    }}>
      {items.map((item, i) => (
        <div
          key={i}
          onClick={() => onNavigate(item.id)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', minHeight: 44, justifyContent: 'center' }}
        >
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            {item.icon === 'group' ? (
              <span style={{ display: 'inline-flex', color: active === item.id ? C.accent : C.ts2, opacity: active === item.id ? 1 : 0.7, transition: 'color 0.2s, opacity 0.2s' }}><GroupIcon size={20} /></span>
            ) : (
              <span style={{ fontSize: 20, opacity: active === item.id ? 1 : 0.35, transition: 'opacity 0.2s' }}>{item.icon}</span>
            )}
            {item.badge > 0 && active !== item.id && (
              <div style={{
                position: 'absolute', top: -5, right: -7,
                minWidth: 16, height: 16, borderRadius: 8,
                background: C.accent, border: `1.5px solid ${C.navBg}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#FFFFFF', fontWeight: 800, padding: '0 3px',
              }}>{item.badge > 99 ? '99+' : item.badge}</div>
            )}
          </div>
          <span style={{ fontSize: 10, color: active === item.id ? C.accent : C.ts2, fontWeight: active === item.id ? 700 : 400, transition: 'color 0.2s' }}>{item.label}</span>
          {active === item.id && <div style={{ width: 4, height: 4, borderRadius: 2, background: C.accent }} />}
        </div>
      ))}
    </div>
  );
};

// ─── Overlay system — backdrop + card, used for confirmations and pickers ─────
const SheetOverlay = ({ visible, onClose, children, anchor = 'center' }) => {
  const { C } = useTheme();
  if (!visible) return null;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60,
      display: 'flex', alignItems: anchor === 'bottom' ? 'flex-end' : 'center',
      justifyContent: 'center', padding: anchor === 'bottom' ? 0 : 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: anchor === 'bottom' ? '20px 20px 0 0' : 16,
        padding: 20, width: '100%', maxWidth: anchor === 'bottom' ? '100%' : 300,
        maxHeight: anchor === 'bottom' ? '74%' : 'auto', overflowY: 'auto',
        boxShadow: '0 -10px 50px rgba(0,0,0,0.5)',
      }}>
        {anchor === 'bottom' && <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 14px' }} />}
        {children}
      </div>
    </div>
  );
};

// Standardised confirmation dialog for every destructive action in the app.
const ConfirmDialog = ({ visible, title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }) => {
  const { C } = useTheme();
  return (
    <SheetOverlay visible={visible} onClose={onCancel} anchor="center">
      <div style={{ width: 44, height: 44, borderRadius: 12, background: danger ? `${C.danger}20` : C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 14 }}>{danger ? '⚠️' : '❓'}</div>
      <div style={{ color: C.tp, fontSize: 16, fontWeight: 700, marginBottom: 8, fontFamily: 'Rajdhani, sans-serif' }}>{title}</div>
      <div style={{ color: C.ts, fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div onClick={onCancel} style={{ flex: 1, padding: '12px', textAlign: 'center', borderRadius: 10, border: `1px solid ${C.border}`, color: C.tp, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</div>
        <div onClick={onConfirm} style={{ flex: 1, padding: '12px', textAlign: 'center', borderRadius: 10, background: danger ? C.danger : C.accent, color: '#FFFFFF', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{confirmLabel}</div>
      </div>
    </SheetOverlay>
  );
};

// Standardised empty-state for any list view with no content yet.
const EmptyState = ({ icon = '📭', title, message, ctaLabel, onCta }) => {
  const { C } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '36px 24px' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 14 }}>{icon}</div>
      <div style={{ color: C.tp, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ color: C.ts, fontSize: 13, lineHeight: 1.5, maxWidth: 240 }}>{message}</div>
      {ctaLabel && (
        <div onClick={onCta} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 10, background: C.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{ctaLabel}</div>
      )}
    </div>
  );
};

// Standardised 6-box OTP display — used everywhere a received SMS code is entered.
const OtpBoxes = ({ digits, onTapBox, error }) => {
  const { C } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} onClick={() => onTapBox(i)} style={{
          flex: 1, height: 54, borderRadius: 10, background: C.surface2,
          border: `1.5px solid ${error ? C.danger : i < digits.length ? C.accent : C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.tp, fontSize: 22, fontWeight: 700, cursor: 'pointer', transition: 'border-color 0.15s',
        }}>{digits[i] || ''}</div>
      ))}
    </div>
  );
};

// Standardised resend control — countdown + tappable resend, with confirmation feedback.
const ResendControl = ({ phone, seconds, resent, onResend }) => {
  const { C } = useTheme();
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ color: C.tp, fontSize: 13, fontWeight: 600 }}>{resent ? 'Code resent ✓' : "Didn't receive a code?"}</div>
        <div style={{ color: C.ts, fontSize: 11, marginTop: 2 }}>{resent ? `Check messages on ${phone}` : `Resend available in 0:${seconds < 10 ? '0' + seconds : seconds}`}</div>
      </div>
      <div onClick={onResend} style={{ color: C.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '8px 14px', border: `1px solid ${C.accent}44`, borderRadius: 8 }}>Resend OTP</div>
    </div>
  );
};

// Standardised numeric PIN pad — shared between App Code login and App Code creation.
const PinPad = ({ digits, onDigit, onDelete }) => {
  const { C } = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, width: '100%', maxWidth: 280 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k, i) => (
        <div key={i} onClick={() => k === '⌫' ? onDelete() : k !== '' ? onDigit(String(k)) : null} style={{
          height: 64, borderRadius: 14, background: k === '' ? 'transparent' : C.surface,
          border: k === '' ? 'none' : `1px solid ${C.border}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: k === '⌫' ? C.accent : C.tp, fontSize: k === '⌫' ? 22 : 24,
          fontWeight: 600, cursor: k !== '' ? 'pointer' : 'default',
        }}>{k}</div>
      ))}
    </div>
  );
};

// Form field label — applied consistently above every editable input.
const FieldLabel = ({ children }) => {
  const { C } = useTheme();
  return <label style={{ color: C.ts, fontSize: 11, letterSpacing: 1, display: 'block', marginBottom: 8 }}>{children}</label>;
};

// Real, genuinely editable single-line input — visually distinct from read-only display rows
// via a focus ring and native cursor.
const TextField = ({ value, onChange, placeholder, type = 'text' }) => {
  const { C } = useTheme();
  return (
    <input
      className="pf-input"
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', background: C.surface2, border: `1.5px solid ${C.border}`, borderRadius: 10,
        padding: '13px 14px', color: C.tp, fontSize: 14, fontFamily: 'Inter, sans-serif',
        outline: 'none',
      }}
    />
  );
};

const TextAreaField = ({ value, onChange, placeholder, rows = 3 }) => {
  const { C } = useTheme();
  return (
    <textarea
      className="pf-textarea"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%', background: C.surface2, border: `1.5px solid ${C.border}`, borderRadius: 10,
        padding: '13px 14px', color: C.tp, fontSize: 14, fontFamily: 'Inter, sans-serif',
        outline: 'none', resize: 'none',
      }}
    />
  );
};

// A read-only display row — deliberately flatter than TextField, no border emphasis,
// so it reads unambiguously as "information shown to you", not "something you can edit".
const ReadOnlyRow = ({ icon, value, badge }) => {
  const { C } = useTheme();
  return (
    <div style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.85 }}>
      {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      <span style={{ color: C.ts, fontSize: 14, flex: 1 }}>{value}</span>
      {badge && <span style={{ color: C.success, fontSize: 11, fontWeight: 700 }}>{badge}</span>}
    </div>
  );
};

// A slim, compact company-brand mark — for screens that need their OWN
// identity as the primary header content (a specific group's name, or the
// user's own profile), where the full centered TopBar logo lockup would
// compete with or replace that identity entirely. Keeps branding visible
// everywhere in the app without overriding what a screen is actually about.
const BrandStrip = ({ dark } = {}) => {
  const { C, companyName, companyLogoUploaded } = useTheme();
  const isDefaultBrand = companyName === 'Pro Force Security';
  const textColor = dark ? 'rgba(255,255,255,0.85)' : C.ts;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px 0' }}>
      <div style={{ width: 16, height: 16, borderRadius: 4, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, flexShrink: 0 }}>{companyLogoUploaded ? '🖼' : '🛡'}</div>
      <span style={{ color: textColor, fontSize: 10, fontWeight: 700, letterSpacing: 0.8 }}>
        {isDefaultBrand ? 'PRO FORCE SECURE' : companyName.toUpperCase()}
      </span>
    </div>
  );
};

// Small circular camera-badge that overlays the bottom-right corner of an
// avatar. Used identically wherever a profile photo can be changed
// (Registration, Edit Profile), and as a consistent-looking shortcut into
// Edit Profile from the read-only Profile View — same visual language
// everywhere, whether it triggers a simulated upload or a navigation.
const AvatarUploadBadge = ({ onClick, uploaded, size = 28 }) => {
  const { C } = useTheme();
  return (
    <div onClick={onClick} style={{
      position: 'absolute', bottom: 0, right: 0, width: size, height: size, borderRadius: '50%',
      background: uploaded ? C.success : C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, cursor: 'pointer', transition: 'background 0.15s',
    }}>{uploaded ? '✓' : '📷'}</div>
  );
};

// A single tappable square/rounded photo tile — used for group photos and
// company logos. Tap to simulate choosing a file; the same selected-state
// treatment (solid accent border, swapped icon) appears everywhere this is
// used, so the interaction feels identical regardless of which screen it's on.
const PhotoUploadTile = ({ uploaded, onToggle, size = 72, radius = 18 }) => {
  const { C } = useTheme();
  return (
    <div
      onClick={onToggle}
      style={{
        width: size, height: size, borderRadius: radius,
        background: uploaded ? C.accentDim : C.surface2,
        border: `2px ${uploaded ? 'solid' : 'dashed'} ${uploaded ? C.accent : C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.36, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
      }}
    >{uploaded ? '🖼' : '📷'}</div>
  );
};

// The "generate an invite" card — QR placeholder, Copy Link, Share, and a
// validity caption. Previously the member-facing Invite screen and the
// admin's Invites tab each had their own separately-written version of
// this, wired inconsistently (one had working Copy feedback, the other had
// neither button wired at all). Both now use this single component, so an
// invite card looks and behaves exactly the same regardless of which
// screen someone reaches it from.
const InviteGeneratorCard = ({ title, expiryLabel = '48 hours', extraNote, groupId = null }) => {
  const { C } = useTheme();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [invite, setInvite] = useState(null); // { token, url }
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    db.createInvite(groupId)
      .then(result => { if (active) setInvite(result); })
      .catch(err => { if (active) setError(err.message || 'Could not generate an invite.'); });
    return () => { active = false; };
  }, [groupId]);

  // A real, scannable QR code — generated client-side from the actual
  // invite URL, not a static placeholder glyph. Coloured to match the
  // current company's brand accent (C.accent already reflects whatever
  // was set in Company Branding) so it doesn't look like a generic,
  // unbranded code, and the light modules match this card's own
  // background so it blends in rather than sitting in a stark white box.
  useEffect(() => {
    if (!invite?.url) { setQrDataUrl(null); return; }
    let active = true;
    QRCode.toDataURL(invite.url, {
      margin: 1,
      width: 300,
      color: { dark: C.accent, light: C.surface2 },
    })
      .then(url => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setQrDataUrl(null); }); // falls back to the placeholder glyph below — link/copy/share still work regardless
    return () => { active = false; };
  }, [invite?.url, C.accent, C.surface2]);

  const copyLink = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
    } catch {
      setError('Could not copy automatically — long-press the link above to copy it manually.');
    }
  };

  const shareLink = async () => {
    if (!invite) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Join Pro Force Secure', url: invite.url }); setShared(true); }
      catch { /* user cancelled the native share sheet — not an error */ }
    } else {
      copyLink();
      setShared(true);
    }
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      {title && <div style={{ color: C.tp, fontSize: 15, fontWeight: 700, fontFamily: 'Rajdhani, sans-serif' }}>{title}</div>}
      <div style={{ width: 150, height: 150, borderRadius: 14, background: C.surface2, border: `2px solid ${C.accent}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 70, overflow: 'hidden' }}>
        {qrDataUrl ? <img src={qrDataUrl} alt="Scan to join" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : '▦'}
      </div>

      {error && <div style={{ color: C.danger, fontSize: 12, textAlign: 'center' }}>⚠️ {error}</div>}
      {!invite && !error && <div style={{ color: C.ts, fontSize: 12 }}>Generating your invite…</div>}
      {invite && (
        <div style={{ width: '100%', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.ts, fontSize: 11, wordBreak: 'break-all', textAlign: 'center' }}>{invite.url}</div>
      )}

      <div style={{ textAlign: 'center', color: C.ts, fontSize: 12, lineHeight: 1.5 }}>
        Link valid for <span style={{ color: C.tp }}>{expiryLabel}</span> · Single use only
        {extraNote && <><br />{extraNote}</>}
      </div>
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <div onClick={copyLink} style={{ flex: 1, padding: '12px', textAlign: 'center', borderRadius: 8, background: invite ? C.accent : C.surface2, color: invite ? '#FFFFFF' : C.ts2, fontSize: 13, fontWeight: 800, cursor: invite ? 'pointer' : 'default' }}>{copied ? 'Copied ✓' : 'Copy Link'}</div>
        <div onClick={shareLink} style={{ flex: 1, padding: '12px', textAlign: 'center', borderRadius: 8, border: `1px solid ${C.border}`, color: invite ? C.tp : C.ts2, fontSize: 13, cursor: invite ? 'pointer' : 'default' }}>{shared ? 'Shared ✓' : '↗ Share'}</div>
      </div>
    </div>
  );
};

// The "⋯" post options sheet — used identically everywhere a post appears
// (Company Feed, Public Feed, Group Detail, Post Detail), so options never
// differ depending on which screen you happened to open them from. Edit
// and Delete only ever appear for the post's own author — not shown at
// all otherwise, rather than shown-but-disabled, since a visible-but-dead
// option invites exactly the kind of confusion this whole app has been
// fixed for once already this session.
const PostOptionsMenu = ({ post, visible, onClose, currentUserId, onDeleted, onEditRequested }) => {
  const { C } = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const isOwner = !!(post && currentUserId && post.author_id === currentUserId);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await db.deletePost(post.id);
      setConfirmDelete(false);
      onClose();
      onDeleted?.(post.id);
    } catch (err) {
      setDeleteError(err.message || 'Could not delete this post.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <SheetOverlay visible={visible} onClose={onClose} anchor="bottom">
        <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, marginBottom: 10 }}>POST OPTIONS</div>
        {isOwner && (
          <div onClick={() => { onClose(); onEditRequested?.(post); }} style={{ padding: '13px 4px', color: C.tp, fontSize: 14, cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}>✏️ Edit post</div>
        )}
        <div onClick={() => onClose()} style={{ padding: '13px 4px', color: C.tp, fontSize: 14, cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}>📋 Copy link</div>
        <div onClick={() => onClose()} style={{ padding: '13px 4px', color: C.tp, fontSize: 14, cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}>↗ Share externally</div>
        {isOwner ? (
          <div onClick={() => setConfirmDelete(true)} style={{ padding: '13px 4px', color: C.danger, fontSize: 14, cursor: 'pointer' }}>🗑 Delete post</div>
        ) : (
          <div onClick={() => onClose()} style={{ padding: '13px 4px', color: C.danger, fontSize: 14, cursor: 'pointer' }}>🚩 Report post</div>
        )}
      </SheetOverlay>
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this post?"
        message={deleteError || 'This removes it for everyone who could see it. This cannot be undone.'}
        confirmLabel={deleting ? 'Deleting…' : 'Delete Post'}
        onCancel={() => { setConfirmDelete(false); setDeleteError(''); }}
        onConfirm={handleDelete}
      />
    </>
  );
};

// Inline edit sheet for a post's own text — reused wherever a post can be
// edited, so editing looks and behaves identically no matter which feed
// you started from.
const EditPostSheet = ({ post, visible, onClose, onSaved }) => {
  const { C } = useTheme();
  const [body, setBody] = useState(post?.body || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setBody(post?.body || ''); }, [post?.id]);

  const save = async () => {
    if (!body.trim()) return;
    setSaving(true);
    setError('');
    try {
      await db.updatePost(post.id, body.trim());
      onSaved?.(post.id, body.trim());
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetOverlay visible={visible} onClose={onClose} anchor="bottom">
      <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, marginBottom: 14 }}>EDIT POST</div>
      <TextAreaField value={body} onChange={setBody} rows={4} placeholder="Edit your post…" />
      {error && <div style={{ color: C.danger, fontSize: 12, marginTop: 8 }}>⚠️ {error}</div>}
      <div onClick={save} style={{ marginTop: 14, background: C.accent, borderRadius: 10, padding: '13px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.65 : 1 }}>{saving ? 'SAVING…' : 'SAVE CHANGES'}</div>
    </SheetOverlay>
  );
};

// Shared "how do you want to verify?" choice — phone OTP vs email magic
// link. Used identically during registration and in Reset Credentials, so
// choosing a verification method looks and behaves the same everywhere.
const VerifyMethodChoice = ({ onChoose, subtitle }) => {
  const { C } = useTheme();
  const options = [
    { id: 'phone', icon: '📱', title: 'Verify by Phone', desc: 'Get a 6-digit code to enter' },
    { id: 'email', icon: '✉️', title: 'Verify by Email', desc: 'Get a magic link sent to your inbox' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {subtitle && <div style={{ color: C.ts, fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}>{subtitle}</div>}
      {options.map(opt => (
        <div key={opt.id} onClick={() => onChoose(opt.id)} style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{opt.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.tp, fontSize: 15, fontWeight: 700 }}>{opt.title}</div>
            <div style={{ color: C.ts, fontSize: 12, marginTop: 2 }}>{opt.desc}</div>
          </div>
          <span style={{ color: C.ts2, fontSize: 18 }}>›</span>
        </div>
      ))}
    </div>
  );
};

// ─── SCREEN 1: Invite Gate ─────────────────────────────────────────────────────
const InviteGate = ({ nav }) => {
  const { C, inviteToken, setInviteToken } = useTheme();
  const [checking, setChecking] = useState(!!inviteToken);
  const [result, setResult] = useState(null); // { valid, companyName, reason } | null
  const [pastedCode, setPastedCode] = useState('');
  const [pasteError, setPasteError] = useState('');

  useEffect(() => {
    if (!inviteToken) { setChecking(false); return; }
    let active = true;
    setChecking(true);
    db.validateInviteToken(inviteToken)
      .then(r => { if (active) setResult(r); })
      .catch(err => { if (active) setResult({ valid: false, reason: err.message || 'error' }); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [inviteToken]);

  const reasonMessage = {
    already_used: 'This invite has already been used — ask whoever sent it for a fresh one.',
    expired: 'This invite has expired — ask whoever sent it for a fresh one.',
    not_found: "That invite code doesn't match anything — double-check it was copied in full.",
    missing: 'Enter the invite code or link you were given below.',
  };

  // Accepts either a bare token or a full pasted URL like
  // https://.../?invite=abc123 — most people will paste the whole link
  // their invite arrived as, not just the raw code.
  const submitPastedCode = () => {
    const trimmed = pastedCode.trim();
    if (!trimmed) return;
    let token = trimmed;
    try {
      const url = new URL(trimmed);
      token = url.searchParams.get('invite') || trimmed;
    } catch { /* not a URL — treat the whole thing as the raw code, which is correct */ }
    setPasteError('');
    setInviteToken(token);
  };

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '56px 28px 44px', transition: 'background 0.3s' }}>
      <div />
      {checking ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 90, height: 90, borderRadius: 26, background: hexToRgba(C.accent, 0.12), border: `2px solid ${hexToRgba(C.accent, 0.45)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>🛡</div>
          <div style={{ color: C.ts, fontSize: 13 }}>Checking your invite…</div>
        </div>
      ) : result?.valid ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 90, height: 90, borderRadius: '50%', background: `${C.success}20`, border: `2px solid ${C.success}88`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>✅</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: C.success, fontSize: 20, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Invite Confirmed</div>
            <div style={{ color: C.ts, fontSize: 13, marginTop: 10, lineHeight: 1.6, maxWidth: 280 }}>You've been invited to join <span style={{ color: C.tp, fontWeight: 700 }}>{result.companyName}</span> on Pro Force Secure.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, width: '100%' }}>
          <div style={{ width: 90, height: 90, borderRadius: 26, background: hexToRgba(C.accent, 0.12), border: `2px solid ${hexToRgba(C.accent, 0.45)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, boxShadow: `0 0 60px ${hexToRgba(C.accent, 0.18)}` }}>🛡</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: C.tp, fontSize: 28, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 3, lineHeight: 1.1 }}>
              PRO FORCE<br /><span style={{ color: C.accent }}>SECURE</span>
            </div>
            <div style={{ color: C.ts, fontSize: 13, marginTop: 12, lineHeight: 1.6, maxWidth: 260 }}>Private platform for authorised personnel only. Access requires a valid invitation.</div>
          </div>
          {result && (
            <div style={{ color: C.danger, fontSize: 13, textAlign: 'center', maxWidth: 280 }}>⚠️ {reasonMessage[result.reason] || 'This invite could not be verified.'}</div>
          )}
          <div style={{ width: '100%' }}>
            <FieldLabel>PASTE YOUR INVITE LINK OR CODE</FieldLabel>
            <TextField value={pastedCode} onChange={setPastedCode} placeholder="https://... or the code itself" />
            {pasteError && <div style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>{pasteError}</div>}
          </div>
        </div>
      )}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {result?.valid ? (
          <div onClick={() => nav('register_verify_choice')} style={{ background: C.success, borderRadius: 12, padding: '16px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1.5, cursor: 'pointer', boxShadow: '0 4px 24px rgba(34,197,94,0.35)' }}>CONTINUE →</div>
        ) : !checking && (
          <>
            <div onClick={submitPastedCode} style={{ background: pastedCode.trim() ? C.accent : C.surface2, borderRadius: 12, padding: '16px', textAlign: 'center', color: pastedCode.trim() ? '#FFFFFF' : C.ts2, fontWeight: 800, fontSize: 14, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1.5, cursor: pastedCode.trim() ? 'pointer' : 'default' }}>CHECK INVITE</div>
            <div style={{ textAlign: 'center', color: C.ts2, fontSize: 11, marginTop: 6, letterSpacing: 0.3 }}>🔒 End-to-end encrypted · Invite only · Not public</div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── SCREEN 1b: Choose Verification Method ─────────────────────────────────────
const RegisterVerifyChoice = ({ nav }) => {
  const { C, inviteToken } = useTheme();
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="" {...(inviteToken ? { back: true, onBack: () => nav('invite_gate') } : {})} />
      <div style={{ flex: 1, padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ color: C.tp, fontSize: 26, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Verify your identity</div>
          {!inviteToken && <div style={{ color: C.ts, fontSize: 13, marginTop: 6 }}>Your session has ended — verify again to get back into your account.</div>}
        </div>
        <VerifyMethodChoice
          subtitle="Choose how you'd like to receive your verification code."
          onChoose={method => nav(method === 'phone' ? 'register_phone' : 'register_email')}
        />
        <div style={{ background: C.surface, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
          <span style={{ color: C.accent, flexShrink: 0 }}>🔒</span>
          <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>{inviteToken ? "Either method confirms you're a real person before you can join. You can change your registered contact details later from Edit Profile." : "This confirms it's really you — no new account is created if you already have one."}</span>
        </div>
        {!inviteToken && (
          <div onClick={() => nav('invite_gate')} style={{ textAlign: 'center', color: C.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>New here? Enter your invite code instead</div>
        )}
      </div>
    </div>
  );
};

// ─── SCREEN 1c: Enter Email ─────────────────────────────────────────────────────
const RegisterEmail = ({ nav }) => {
  const { C, inviteToken } = useTheme();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const sendMagicLink = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    setError('');
    // Preserve the invite token across the round-trip to the user's inbox
    // and back — Supabase's redirect is a real page reload, so anything
    // held only in memory (like inviteToken right now) would otherwise be
    // lost. Encoding it into the redirect URL means it's still there when
    // the browser comes back after the link is clicked.
    const redirectTo = `${window.location.origin}${window.location.pathname}${inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ''}`;
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo },
    });
    setSending(false);
    if (sendError) { setError(sendError.message); return; }
    nav('register_email_sent');
  };

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="" back onBack={() => nav('register_verify_choice')} />
      <div style={{ flex: 1, padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ color: C.tp, fontSize: 26, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Enter your email</div>
          <div style={{ color: C.ts, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>We'll send you a magic link to verify your identity — no password needed</div>
        </div>
        <div>
          <FieldLabel>EMAIL ADDRESS</FieldLabel>
          <TextField value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
        </div>
        {error && (
          <div style={{ background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, padding: '12px 14px', color: C.danger, fontSize: 13 }}>⚠️ {error}</div>
        )}
        <div
          onClick={sendMagicLink}
          style={{
            background: C.accent, borderRadius: 10, padding: '15px', textAlign: 'center', color: '#FFFFFF',
            fontWeight: 800, fontSize: 14, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1,
            cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.65 : 1,
            boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.35)}`,
          }}
        >{sending ? 'SENDING…' : 'SEND MAGIC LINK'}</div>
        <div style={{ background: C.surface, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
          <span style={{ color: C.accent, flexShrink: 0 }}>🔒</span>
          <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>Your email is encrypted and never shared. It is used only to verify your identity.</span>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN 1d: Magic Link Sent ─────────────────────────────────────────────────
const RegisterEmailSent = ({ nav }) => {
  const { C } = useTheme();
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '56px 28px 44px', transition: 'background 0.3s' }}>
      <div />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 90, height: 90, borderRadius: 26, background: C.accentDim, border: `2px solid ${hexToRgba(C.accent, 0.45)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>✉️</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: C.tp, fontSize: 20, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Check your inbox</div>
          <div style={{ color: C.ts, fontSize: 13, marginTop: 10, lineHeight: 1.6, maxWidth: 260 }}>We've sent a real magic link to your email. Open it on this device to continue — the link expires in 15 minutes.</div>
        </div>
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.ts, fontSize: 13 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: C.accent, animation: 'pf-pulse 1.4s ease-in-out infinite' }} />
          Waiting for you to click the link…
        </div>
        <div onClick={() => nav('register_email')} style={{ color: C.ts2, fontSize: 11, textAlign: 'center', cursor: 'pointer', marginTop: 4 }}>Didn't get it? Check spam, or go back to try a different address.</div>
      </div>
    </div>
  );
};

// ─── SCREEN 2: Enter Phone ─────────────────────────────────────────────────────
const RegisterPhone = ({ nav }) => {
  const { C } = useTheme();
  const [phone, setPhone] = useState('');
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="" back onBack={() => nav('register_verify_choice')} />
      <div style={{ flex: 1, padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ color: C.tp, fontSize: 26, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Enter your cell number</div>
          <div style={{ color: C.ts, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>We'll send you a one-time PIN to verify your identity</div>
        </div>
        <div>
          <FieldLabel>MOBILE NUMBER</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface2, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '4px 14px' }}>
            <span style={{ fontSize: 18 }}>🇿🇦</span>
            <span style={{ color: C.ts, fontSize: 14 }}>+27</span>
            <div style={{ width: 1, height: 20, background: C.border }} />
            <input className="pf-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="82 000 0000" style={{ flex: 1, background: 'transparent', border: 'none', padding: '13px 0', color: C.tp, fontSize: 15, outline: 'none' }} />
          </div>
          <div style={{ color: C.ts2, fontSize: 11, marginTop: 6 }}>Enter without leading 0 · e.g. 82 000 0000</div>
        </div>
        <div onClick={() => nav('register_otp')} style={{ background: C.accent, borderRadius: 10, padding: '15px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, cursor: 'pointer', boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.35)}` }}>SEND VERIFICATION CODE</div>
        <div style={{ background: C.surface, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
          <span style={{ color: C.accent, flexShrink: 0 }}>🔒</span>
          <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>Your number is encrypted and never shared. It is used only to verify your identity.</span>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN 3: OTP Verify ──────────────────────────────────────────────────────
const RegisterOTP = ({ nav }) => {
  const { C } = useTheme();
  const [digits, setDigits] = useState([]);
  const [resent, setResent] = useState(false);
  const tapBox = i => {
    if (i < digits.length) return;
    const next = [...digits, Math.floor(Math.random() * 9) + 1].slice(0, 6);
    setDigits(next);
    if (next.length === 6) setTimeout(() => nav('register_profile'), 350);
  };
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="" back onBack={() => nav('register_phone')} />
      <div style={{ flex: 1, padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ color: C.tp, fontSize: 26, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Verify your number</div>
          <div style={{ color: C.ts, fontSize: 13, marginTop: 8 }}>Verifying <span style={{ color: C.tp, fontWeight: 600 }}>+27 82 000 0000</span></div>
        </div>
        <div style={{ background: C.accentDim, border: `1px solid ${hexToRgba(C.accent, 0.3)}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 16 }}>🧪</span>
          <div>
            <div style={{ color: C.ts, fontSize: 11, letterSpacing: 0.5 }}>TEST MODE — no SMS sent</div>
            <div style={{ color: C.tp, fontSize: 15, fontWeight: 700, marginTop: 2, letterSpacing: 2 }}>482 913</div>
          </div>
        </div>
        <div>
          <FieldLabel>6-DIGIT CODE</FieldLabel>
          <OtpBoxes digits={digits} onTapBox={tapBox} />
          <div style={{ color: C.ts2, fontSize: 11, marginTop: 8 }}>Tap any box to simulate entry for this prototype</div>
        </div>
        <ResendControl phone="+27 82 000 0000" seconds={38} resent={resent} onResend={() => setResent(true)} />
      </div>
    </div>
  );
};

// ─── SCREEN 4: Profile Setup ───────────────────────────────────────────────────
const RegisterProfile = ({ nav }) => {
  const { C, inviteToken } = useTheme();
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const completeSetup = async () => {
    if (!name.trim()) { setError('Display name is required.'); return; }
    setSaving(true);
    setError('');

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) throw new Error('Your session has expired — please verify again.');
      const user = userData.user;

      // Re-validate the invite right before consuming it — it may have
      // expired or been used by someone else in the time since it was
      // first checked, and we'd rather catch that here with a clear
      // message than have the database silently reject the insert later.
      if (!inviteToken) throw new Error('No invite found for this session. Please start again from your invite link.');
      const { data: inviteCheck, error: inviteErr } = await supabase.rpc('validate_invite', { raw_token: inviteToken });
      if (inviteErr) throw inviteErr;
      const result = Array.isArray(inviteCheck) ? inviteCheck[0] : inviteCheck;
      if (!result?.valid) throw new Error(`This invite is no longer valid (${result?.reason || 'unknown reason'}).`);

      // Encrypt each field individually via the same narrow, purpose-built
      // RPC every screen uses — never sent in plaintext to the table.
      const { data: nameEnc, error: nameErr } = await supabase.rpc('encrypt_field', { plaintext: name.trim() });
      if (nameErr) throw nameErr;
      let aboutEnc = null;
      if (about.trim()) {
        const { data, error: aboutErr } = await supabase.rpc('encrypt_field', { plaintext: about.trim() });
        if (aboutErr) throw aboutErr;
        aboutEnc = data;
      }
      let emailEnc = null;
      if (user.email) {
        const { data, error: emailErr } = await supabase.rpc('encrypt_field', { plaintext: user.email });
        if (emailErr) throw emailErr;
        emailEnc = data;
      }

      const { error: insertErr } = await supabase.from('profiles').insert({
        id: user.id,
        company_id: result.company_id,
        display_name_enc: nameEnc,
        about_enc: aboutEnc,
        email_enc: emailEnc,
        email_verified: true,
        verification_method: 'email_magic_link',
      });
      if (insertErr) throw insertErr;

      // Mark the invite used now that the profile genuinely exists —
      // doing this AFTER the insert succeeds, not before, so a failed
      // insert never burns a single-use invite for nothing.
      await supabase.rpc('consume_invite', { raw_token: inviteToken, new_user_id: user.id });

      // If this invite pointed at a specific group, join it now.
      if (result.group_id) {
        await supabase.from('group_members').insert({ group_id: result.group_id, user_id: user.id });
      }

      nav('company_feed');
    } catch (err) {
      setError(err.message || 'Something went wrong creating your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <div style={{ padding: '48px 24px 20px' }}>
        <div style={{ color: C.tp, fontSize: 24, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Set up your profile</div>
        <div style={{ color: C.ts, fontSize: 13, marginTop: 4 }}>How you'll appear to members on the platform</div>
      </div>
      <div style={{ flex: 1, padding: '0 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 82, height: 82, borderRadius: '50%', background: photoUploaded ? C.accentDim : C.surface2, border: `2px ${photoUploaded ? 'solid' : 'dashed'} ${photoUploaded ? C.accent : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, transition: 'all 0.15s' }}>{photoUploaded ? '🖼' : '👤'}</div>
            <AvatarUploadBadge uploaded={photoUploaded} onClick={() => setPhotoUploaded(true)} />
          </div>
          {photoUploaded && <span style={{ color: C.success, fontSize: 11, fontWeight: 600 }}>✓ Photo selected</span>}
          {!photoUploaded && <span style={{ color: C.ts2, fontSize: 11 }}>Tap to simulate choosing a photo</span>}
        </div>
        <div>
          <FieldLabel>DISPLAY NAME</FieldLabel>
          <TextField value={name} onChange={setName} placeholder="e.g. John Khumalo" />
        </div>
        <div>
          <FieldLabel>ABOUT (OPTIONAL)</FieldLabel>
          <TextAreaField value={about} onChange={setAbout} placeholder="e.g. Site supervisor · North sector" rows={2} />
        </div>
        {error && (
          <div style={{ background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, padding: '12px 14px', color: C.danger, fontSize: 13 }}>⚠️ {error}</div>
        )}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10 }}>
          <span style={{ color: C.accent, flexShrink: 0 }}>🔒</span>
          <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>Your profile is encrypted. Only platform members can find you. Your number is never displayed.</span>
        </div>
        <div
          onClick={saving ? undefined : completeSetup}
          style={{ background: C.accent, borderRadius: 10, padding: '15px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.65 : 1, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.35)}`, marginBottom: 24 }}
        >{saving ? 'CREATING YOUR PROFILE…' : 'COMPLETE SETUP →'}</div>
      </div>
    </div>
  );
};

// ─── SCREEN 5: Company Feed ─────────────────────────────────────────────────────
const CompanyFeed = ({ nav }) => {
  const { C, showGroups, refreshUnread, currentUserId, setSelectedPostId } = useTheme();
  const [liked, setLiked] = useState({});
  const [menuPost, setMenuPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [posts, setPosts] = useState(null); // null = still loading
  const [error, setError] = useState('');
  const [groups, setGroups] = useState(null);

  useEffect(() => {
    let active = true;
    db.fetchAllVisiblePosts()
      .then(all => { if (active) setPosts(db.filterCompanyPosts(all)); })
      .catch(err => { if (active) setError(err.message || 'Could not load your feed.'); });

    db.fetchMyGroups()
      .then(all => { if (active) setGroups(db.filterClosedGroups(all)); })
      .catch(() => { if (active) setGroups([]); });

    db.getMyCompanyContext()
      .then(({ allMembersGroupId }) => db.markGroupRead(allMembersGroupId))
      .then(() => { if (active) refreshUnread(); })
      .catch(() => { /* best-effort */ });

    return () => { active = false; };
  }, []);

  const toggleLike = (id, currentlyLiked) => {
    setLiked(p => ({ ...p, [id]: !currentlyLiked }));
    db.toggleLike(id, currentlyLiked).catch(() => setLiked(p => ({ ...p, [id]: currentlyLiked })));
  };

  const openPost = id => { setSelectedPostId(id); nav('post_detail'); };
  const handleDeleted = id => setPosts(prev => prev.filter(p => p.id !== id));
  const handleEdited = (id, newBody) => setPosts(prev => prev.map(p => p.id === id ? { ...p, body: newBody } : p));

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', position: 'relative', transition: 'background 0.3s' }}>
      <TopBar logo />

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
        {showGroups && (
          <div style={{ padding: '14px 0 12px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 14, paddingLeft: 16, overflowX: 'auto' }}>
              {groups && groups.map(g => {
                const initials = g.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <div key={g.id} onClick={() => nav('group_detail')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.avatarBg, border: `2.5px solid ${C.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontSize: 13, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif' }}>{initials}</div>
                    <span style={{ color: C.ts, fontSize: 10, textAlign: 'center', whiteSpace: 'pre', lineHeight: 1.2, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                  </div>
                );
              })}
              <div onClick={() => nav('create_group')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, cursor: 'pointer', paddingRight: 16 }}>
                <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.surface2, border: `2px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ts2, fontSize: 24 }}>+</div>
                <span style={{ color: C.ts2, fontSize: 10 }}>New</span>
              </div>
            </div>
          </div>
        )}

        {posts === null && !error && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: C.ts, fontSize: 13 }}>Loading your feed…</div>
        )}
        {error && (
          <div style={{ margin: 16, padding: '14px', background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, color: C.danger, fontSize: 13 }}>⚠️ {error}</div>
        )}
        {posts && posts.length === 0 && (
          <EmptyState icon="📢" title="No company posts yet" message="Announcements and updates for everyone at your company will show up here." />
        )}
        {posts && posts.map(p => (
          <div key={p.id} style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
              <Avatar letter={(p.author_name || 'M')[0]} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: C.tp, fontSize: 14, fontWeight: 700 }}>{p.author_name}</span>
                  {p.badge_label && <Badge color={badgeColorFor(p.badge_label, C)}>{p.badge_label}</Badge>}
                </div>
                <div style={{ color: C.ts, fontSize: 11, marginTop: 2 }}>{p.group_name} · {timeAgo(p.created_at)}</div>
              </div>
              <IconTap onClick={() => setMenuPost(p)}><span style={{ color: C.ts2, fontSize: 20, lineHeight: 1 }}>⋯</span></IconTap>
            </div>
            <div style={{ color: C.tp, fontSize: 14, lineHeight: 1.55, marginBottom: p.has_media ? 12 : 0 }}>{p.body}</div>
            {p.has_media && <div style={{ height: 150, borderRadius: 10, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ts2, fontSize: 13, border: `1px solid ${C.border}` }}>📷 Media attached · tap to view</div>}
            <div style={{ display: 'flex', gap: 4, marginTop: 12, alignItems: 'center' }}>
              <div onClick={() => toggleLike(p.id, liked[p.id] ?? p.liked_by_me)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: (liked[p.id] ?? p.liked_by_me) ? C.accent : C.ts, fontSize: 13, fontWeight: (liked[p.id] ?? p.liked_by_me) ? 700 : 400 }}>
                <span>{(liked[p.id] ?? p.liked_by_me) ? '👍🏽' : '👍'}</span>{Number(p.like_count) + ((liked[p.id] === true && !p.liked_by_me) ? 1 : (liked[p.id] === false && p.liked_by_me) ? -1 : 0)}
              </div>
              <div onClick={() => openPost(p.id)} style={{ padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: C.ts, fontSize: 13 }}>💬 {p.comment_count}</div>
              <div onClick={() => setMenuPost(p)} style={{ padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: C.ts, fontSize: 13, marginLeft: 'auto' }}>↗ Share</div>
            </div>
          </div>
        ))}
      </div>

      <div onClick={() => nav('create_post')} style={{ position: 'absolute', bottom: 88, right: 16, width: 52, height: 52, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#FFFFFF', cursor: 'pointer', boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.55)}`, zIndex: 5 }}>+</div>

      <PostOptionsMenu post={menuPost} visible={!!menuPost} onClose={() => setMenuPost(null)} currentUserId={currentUserId} onDeleted={handleDeleted} onEditRequested={setEditingPost} />
      <EditPostSheet post={editingPost} visible={!!editingPost} onClose={() => setEditingPost(null)} onSaved={handleEdited} />

      <BottomNav active="company_feed" onNavigate={nav} />
    </div>
  );
};

// ─── SCREEN 5b: Public Feed ─────────────────────────────────────────────────────
// The platform-wide space every company on Pro Force Secure shares (Section
// 4.11). Structurally identical to Company Feed, but scoped to the single
// scope='platform' group instead of this company's All Members group —
// deliberately built as its own screen rather than a mode-flag on Company
// Feed, since the two now have separate nav tabs and separate audiences.
const PublicFeed = ({ nav }) => {
  const { C, refreshUnread, currentUserId, setSelectedPostId } = useTheme();
  const [liked, setLiked] = useState({});
  const [menuPost, setMenuPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    db.fetchAllVisiblePosts()
      .then(all => { if (active) setPosts(db.filterPublicPosts(all)); })
      .catch(err => { if (active) setError(err.message || 'Could not load the public feed.'); });

    db.getMyCompanyContext()
      .then(({ publicGroupId }) => db.markGroupRead(publicGroupId))
      .then(() => { if (active) refreshUnread(); })
      .catch(() => { /* best-effort */ });

    return () => { active = false; };
  }, []);

  const toggleLike = (id, currentlyLiked) => {
    setLiked(p => ({ ...p, [id]: !currentlyLiked }));
    db.toggleLike(id, currentlyLiked).catch(() => setLiked(p => ({ ...p, [id]: currentlyLiked })));
  };

  const openPost = id => { setSelectedPostId(id); nav('post_detail'); };
  const handleDeleted = id => setPosts(prev => prev.filter(p => p.id !== id));
  const handleEdited = (id, newBody) => setPosts(prev => prev.map(p => p.id === id ? { ...p, body: newBody } : p));

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', position: 'relative', transition: 'background 0.3s' }}>
      <TopBar logo />
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.surface2, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 14 }}>🌐</span>
        <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.4 }}>Visible to every company on Pro Force Secure — nothing posted here is private to yours.</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
        {posts === null && !error && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: C.ts, fontSize: 13 }}>Loading the public feed…</div>
        )}
        {error && (
          <div style={{ margin: 16, padding: '14px', background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, color: C.danger, fontSize: 13 }}>⚠️ {error}</div>
        )}
        {posts && posts.length === 0 && (
          <EmptyState icon="🌐" title="Nothing shared platform-wide yet" message="Posts here are visible to every company on Pro Force Secure. Be the first to share something useful." />
        )}
        {posts && posts.map(p => (
          <div key={p.id} style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
              <Avatar letter={(p.author_name || 'M')[0]} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: C.tp, fontSize: 14, fontWeight: 700 }}>{p.author_name}</span>
                  {p.badge_label && <Badge color={badgeColorFor(p.badge_label, C)}>{p.badge_label}</Badge>}
                </div>
                <div style={{ color: C.ts, fontSize: 11, marginTop: 2 }}>{p.group_name} · {timeAgo(p.created_at)}</div>
              </div>
              <IconTap onClick={() => setMenuPost(p)}><span style={{ color: C.ts2, fontSize: 20, lineHeight: 1 }}>⋯</span></IconTap>
            </div>
            <div style={{ color: C.tp, fontSize: 14, lineHeight: 1.55 }}>{p.body}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 12, alignItems: 'center' }}>
              <div onClick={() => toggleLike(p.id, liked[p.id] ?? p.liked_by_me)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: (liked[p.id] ?? p.liked_by_me) ? C.accent : C.ts, fontSize: 13, fontWeight: (liked[p.id] ?? p.liked_by_me) ? 700 : 400 }}>
                <span>{(liked[p.id] ?? p.liked_by_me) ? '👍🏽' : '👍'}</span>{Number(p.like_count) + ((liked[p.id] === true && !p.liked_by_me) ? 1 : (liked[p.id] === false && p.liked_by_me) ? -1 : 0)}
              </div>
              <div onClick={() => openPost(p.id)} style={{ padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: C.ts, fontSize: 13 }}>💬 {p.comment_count}</div>
              <div onClick={() => setMenuPost(p)} style={{ padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: C.ts, fontSize: 13, marginLeft: 'auto' }}>↗ Share</div>
            </div>
          </div>
        ))}
      </div>

      <div onClick={() => nav('create_post')} style={{ position: 'absolute', bottom: 88, right: 16, width: 52, height: 52, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#FFFFFF', cursor: 'pointer', boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.55)}`, zIndex: 5 }}>+</div>

      <PostOptionsMenu post={menuPost} visible={!!menuPost} onClose={() => setMenuPost(null)} currentUserId={currentUserId} onDeleted={handleDeleted} onEditRequested={setEditingPost} />
      <EditPostSheet post={editingPost} visible={!!editingPost} onClose={() => setEditingPost(null)} onSaved={handleEdited} />

      <BottomNav active="public_feed" onNavigate={nav} />
    </div>
  );
};

// ─── SCREEN 6: Post Detail ─────────────────────────────────────────────────────
const PostDetail = ({ nav }) => {
  const { C, selectedPostId, currentUserId } = useTheme();
  const [post, setPost] = useState(null); // null = loading, undefined-ish 'not found' handled via error
  const [postError, setPostError] = useState('');
  const [liked, setLiked] = useState(null); // null = follow post.liked_by_me until explicitly toggled
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState(null);
  const [commentsError, setCommentsError] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadComments = () => {
    if (!selectedPostId) return;
    db.fetchPostComments(selectedPostId)
      .then(setComments)
      .catch(err => setCommentsError(err.message || 'Could not load comments.'));
  };

  useEffect(() => {
    if (!selectedPostId) { setPostError('No post selected.'); return; }
    let active = true;
    db.fetchAllVisiblePosts()
      .then(all => {
        if (!active) return;
        const found = db.filterPostById(all, selectedPostId);
        if (!found) { setPostError('This post is no longer available.'); return; }
        setPost(found);
      })
      .catch(err => { if (active) setPostError(err.message || 'Could not load this post.'); });
    loadComments();
    return () => { active = false; };
  }, [selectedPostId]);

  const toggleLike = () => {
    const currentlyLiked = liked ?? post.liked_by_me;
    setLiked(!currentlyLiked);
    db.toggleLike(post.id, currentlyLiked).catch(() => setLiked(currentlyLiked));
  };

  const sendComment = async () => {
    const trimmed = comment.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await db.addComment(post.id, trimmed);
      setComment('');
      loadComments(); // refetch so the new comment shows with your real decrypted name, not a guessed local echo
    } catch (err) {
      setCommentsError(err.message || 'Could not send your comment.');
    } finally {
      setSending(false);
    }
  };

  const handleDeleted = () => nav('company_feed'); // the post you were viewing no longer exists — nowhere sensible to stay
  const handleEdited = (id, newBody) => setPost(prev => prev ? { ...prev, body: newBody } : prev);

  if (postError) {
    return (
      <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
        <TopBar title="Post" back onBack={() => nav('company_feed')} />
        <EmptyState icon="⚠️" title="Can't show this post" message={postError} />
      </div>
    );
  }

  if (!post) {
    return (
      <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
        <TopBar title="Post" back onBack={() => nav('company_feed')} />
        <div style={{ padding: '40px 16px', textAlign: 'center', color: C.ts, fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  const displayLiked = liked ?? post.liked_by_me;

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', position: 'relative', transition: 'background 0.3s' }}>
      <TopBar title="Post" back onBack={() => nav('company_feed')} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 72 }}>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
            <Avatar letter={(post.author_name || 'M')[0]} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: C.tp, fontSize: 14, fontWeight: 700 }}>{post.author_name}</span>
                {post.badge_label && <Badge color={badgeColorFor(post.badge_label, C)}>{post.badge_label}</Badge>}
              </div>
              <div style={{ color: C.ts, fontSize: 11, marginTop: 2 }}>{post.group_name} · {timeAgo(post.created_at)}</div>
            </div>
            <IconTap onClick={() => setMenuOpen(true)}><span style={{ color: C.ts2, fontSize: 20, lineHeight: 1 }}>⋯</span></IconTap>
          </div>
          <div style={{ color: C.tp, fontSize: 14, lineHeight: 1.6, marginBottom: post.has_media ? 12 : 0 }}>{post.body}</div>
          {post.has_media && <div style={{ height: 180, borderRadius: 10, background: C.surface2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ts2, fontSize: 13, marginBottom: 14 }}>📷 Media attached · tap to view</div>}
          <div style={{ display: 'flex', gap: 4, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
            <div onClick={toggleLike} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: displayLiked ? C.accent : C.ts, fontSize: 13, fontWeight: displayLiked ? 700 : 400 }}>
              {displayLiked ? '👍🏽' : '👍'} {Number(post.like_count) + ((liked === true && !post.liked_by_me) ? 1 : (liked === false && post.liked_by_me) ? -1 : 0)} likes
            </div>
            <div style={{ padding: '6px 10px', color: C.ts, fontSize: 13 }}>💬 {comments ? comments.length : post.comment_count} comments</div>
          </div>
        </div>
        <div style={{ padding: '0 16px' }}>
          <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, marginBottom: 14, paddingTop: 14 }}>COMMENTS</div>
          {commentsError && <div style={{ padding: '14px', background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, color: C.danger, fontSize: 13, marginBottom: 14 }}>⚠️ {commentsError}</div>}
          {comments === null && !commentsError && <div style={{ color: C.ts, fontSize: 13, paddingBottom: 14 }}>Loading comments…</div>}
          {comments && comments.length === 0 && <div style={{ color: C.ts2, fontSize: 13, paddingBottom: 14 }}>No comments yet — be the first to reply.</div>}
          {comments && comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <Avatar letter={(c.author_name || 'M')[0]} size={34} />
              <div style={{ flex: 1 }}>
                <div style={{ background: C.surface, borderRadius: 10, padding: '10px 12px', border: `1px solid ${C.border}` }}>
                  <div style={{ color: C.accent, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{c.author_name}</div>
                  <div style={{ color: C.tp, fontSize: 13, lineHeight: 1.45 }}>{c.body}</div>
                </div>
                <div style={{ color: C.ts2, fontSize: 11, marginTop: 4, paddingLeft: 4 }}>{timeAgo(c.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <Avatar letter="Y" size={32} />
        <input className="pf-input" value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()} placeholder="Add a comment…" style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 20, padding: '9px 14px', color: C.tp, fontSize: 14, outline: 'none' }} />
        <div onClick={sendComment} style={{ width: 36, height: 36, borderRadius: '50%', background: comment.trim() && !sending ? C.accent : C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: comment.trim() && !sending ? 'pointer' : 'default', flexShrink: 0, transition: 'background 0.15s' }}>
          <span style={{ color: comment.trim() && !sending ? '#FFFFFF' : C.ts2, fontSize: 16, fontWeight: 900 }}>↑</span>
        </div>
      </div>

      <PostOptionsMenu post={post} visible={menuOpen} onClose={() => setMenuOpen(false)} currentUserId={currentUserId} onDeleted={handleDeleted} onEditRequested={() => setEditing(true)} />
      <EditPostSheet post={editing ? post : null} visible={editing} onClose={() => setEditing(false)} onSaved={handleEdited} />
    </div>
  );
};

// ─── SCREEN 7: Create Post ─────────────────────────────────────────────────────
const CreatePost = ({ nav }) => {
  const { C, companyName, selectedGroup } = useTheme();
  // Multi-select now — a single post action can genuinely target Company
  // AND a specific Group AND Public all at once (each becomes its own
  // real post row server-side; see createPost in dataLayer.js).
  const [selectedAudiences, setSelectedAudiences] = useState(() => selectedGroup ? ['groups'] : ['company']);
  const toggleAudience = id => setSelectedAudiences(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const [body, setBody] = useState('');
  const [closedGroups, setClosedGroups] = useState(null);
  const [groupsError, setGroupsError] = useState('');
  // If opened from within a specific group (Group Detail's own FAB), that
  // group is pre-checked here — solves "link the Post To to the correct
  // group when you open new chat". If opened generically (Company/Public
  // Feed's FAB), selectedGroup may still hold a stale value from an
  // earlier visit; that's an acceptable, visible, easily-corrected default
  // rather than a silent one, since the whole selector stays editable.
  const [selectedGroupIds, setSelectedGroupIds] = useState(() => selectedGroup ? [selectedGroup.id] : []);
  const toggleGroup = id => setSelectedGroupIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const [media, setMedia] = useState(null); // { path, type, url } | null — one attachment per post, for now
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const photoInputRef = useState(() => ({ current: null }))[0];
  const reelInputRef = useState(() => ({ current: null }))[0];
  const fileInputRef = useState(() => ({ current: null }))[0];

  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    db.fetchMyGroups()
      .then(all => {
        const closed = db.filterClosedGroups(all);
        setClosedGroups(closed);
        if (closed.length === 0) setSelectedAudiences(prev => prev.filter(a => a !== 'groups'));
      })
      .catch(err => setGroupsError(err.message || 'Could not load your groups.'));
  }, []);

  const audienceOptions = [
    { id: 'company', icon: '🏢', label: 'Company' },
    { id: 'groups',  icon: 'group', label: 'Groups' },
    { id: 'public',  icon: '🌐', label: 'Public'  },
  ];

  const handleFilePicked = async (e, type) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const result = await db.uploadPostMedia(file, type);
      setMedia(result);
    } catch (err) {
      setError(err.message || 'Could not upload that file.');
    } finally {
      setUploading(false);
    }
  };

  const attachLocation = () => {
    if (!navigator.geolocation) { setError('Location is not available on this device.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setMedia({ type: 'location', lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => { setError('Could not get your location — check permissions and try again.'); setLocating(false); },
      { timeout: 10000 }
    );
  };

  const canPost = body.trim() && selectedAudiences.length > 0 && (!selectedAudiences.includes('groups') || selectedGroupIds.length > 0) && !posting && !uploading;
  const submit = async () => {
    if (!canPost) return;
    setPosting(true);
    setError('');
    try {
      await db.createPost({
        audiences: selectedAudiences,
        groupIds: selectedAudiences.includes('groups') ? selectedGroupIds : undefined,
        body: body.trim(),
        media: media && media.type !== 'location' ? media : null, // a location isn't stored in post_media — it's just attached context, not a file
      });
      nav(selectedAudiences.includes('company') ? 'company_feed' : selectedAudiences.includes('public') ? 'public_feed' : 'groups_list');
    } catch (err) {
      setError(err.message || 'Could not create the post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '48px 16px 14px', background: C.surface, borderBottom: `1px solid ${C.border}`, justifyContent: 'space-between', gap: 12 }}>
        <span onClick={() => nav('company_feed')} style={{ color: C.ts, fontSize: 14, cursor: 'pointer' }}>Cancel</span>
        <span style={{ color: C.tp, fontSize: 16, fontWeight: 700, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>New Post</span>
        <div onClick={submit} style={{ background: canPost ? C.accent : C.surface2, borderRadius: 20, padding: '7px 18px', color: canPost ? '#FFFFFF' : C.ts2, fontWeight: 700, fontSize: 13, cursor: canPost ? 'pointer' : 'default' }}>{posting ? 'Posting…' : 'POST'}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Avatar letter="Y" />
          <textarea className="pf-textarea" value={body} onChange={e => setBody(e.target.value)} placeholder="What's happening on site?" rows={4} style={{ flex: 1, background: 'transparent', border: 'none', color: C.tp, fontSize: 15, lineHeight: 1.6, outline: 'none', resize: 'none' }} />
        </div>

        {uploading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.ts, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: C.accent, animation: 'pf-pulse 1.4s ease-in-out infinite' }} />Uploading…
          </div>
        )}
        {media && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', alignSelf: 'flex-start' }}>
            <span style={{ fontSize: 14 }}>{media.type === 'photo' ? '📷' : media.type === 'reel' ? '🎥' : media.type === 'location' ? '📍' : '📎'}</span>
            <span style={{ color: C.ts, fontSize: 12 }}>
              {media.type === 'photo' ? 'Photo attached' : media.type === 'reel' ? 'Reel attached' : media.type === 'location' ? `Current location (${media.lat.toFixed(4)}, ${media.lng.toFixed(4)})` : 'File attached'}
            </span>
            <span onClick={() => setMedia(null)} style={{ color: C.danger, fontSize: 13, cursor: 'pointer', marginLeft: 4 }}>✕</span>
          </div>
        )}

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, marginBottom: 10 }}>POST TO <span style={{ opacity: 0.6 }}>(select any combination)</span></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: selectedAudiences.includes('groups') ? 14 : 0 }}>
            {audienceOptions.map(opt => {
              const active = selectedAudiences.includes(opt.id);
              const disabled = opt.id === 'groups' && closedGroups !== null && closedGroups.length === 0;
              return (
                <div
                  key={opt.id}
                  onClick={() => !disabled && toggleAudience(opt.id)}
                  style={{ flex: 1, padding: '10px 6px', textAlign: 'center', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', background: active ? C.accentDim : 'transparent', border: `1.5px solid ${active ? C.accent : C.border}`, position: 'relative', opacity: disabled ? 0.4 : 1 }}
                >
                  {active && <div style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#FFF', fontSize: 9, fontWeight: 800 }}>✓</span></div>}
                  <div style={{ fontSize: 16, marginBottom: 4, display: 'flex', justifyContent: 'center', color: active ? C.accent : C.ts }}>{opt.icon === 'group' ? <GroupIcon size={16} /> : opt.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? C.accent : C.ts }}>{opt.label}</div>
                </div>
              );
            })}
          </div>

          {selectedAudiences.includes('company') && (
            <div style={{ color: C.ts, fontSize: 12, lineHeight: 1.4, marginBottom: 6 }}>🏢 Visible to every member of {companyName}.</div>
          )}
          {selectedAudiences.includes('public') && (
            <div style={{ color: C.ts, fontSize: 12, lineHeight: 1.4, marginBottom: 6 }}>🌐 Visible to every company on Pro Force Secure.</div>
          )}
          {selectedAudiences.includes('groups') && (
            <div>
              {groupsError && <div style={{ color: C.danger, fontSize: 12, marginBottom: 8 }}>⚠️ {groupsError}</div>}
              {closedGroups === null && !groupsError && <div style={{ color: C.ts, fontSize: 12 }}>Loading your groups…</div>}
              {closedGroups && closedGroups.length === 0 && <div style={{ color: C.ts, fontSize: 12 }}>You're not in any closed groups yet — create one from the Groups tab first.</div>}
              {closedGroups && closedGroups.length > 1 && (
                <div
                  onClick={() => setSelectedGroupIds(selectedGroupIds.length === closedGroups.length ? [] : closedGroups.map(g => g.id))}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', background: C.surface2, border: `1px dashed ${C.border}`, marginBottom: 8 }}
                >
                  <div style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${selectedGroupIds.length === closedGroups.length ? C.accent : C.border}`, background: selectedGroupIds.length === closedGroups.length ? C.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {selectedGroupIds.length === closedGroups.length && <span style={{ color: '#FFF', fontSize: 12, fontWeight: 800 }}>✓</span>}
                  </div>
                  <span style={{ color: C.ts, fontSize: 13, fontStyle: 'italic' }}>{selectedGroupIds.length === closedGroups.length ? 'All groups selected' : `Select all ${closedGroups.length} groups`}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {closedGroups && closedGroups.map(g => {
                  const checked = selectedGroupIds.includes(g.id);
                  const initials = g.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <div key={g.id} onClick={() => toggleGroup(g.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', background: checked ? C.accentDim : C.surface2, border: `1.5px solid ${checked ? C.accent : 'transparent'}` }}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${checked ? C.accent : C.border}`, background: checked ? C.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {checked && <span style={{ color: '#FFF', fontSize: 12, fontWeight: 800 }}>✓</span>}
                      </div>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: C.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                      <span style={{ color: C.tp, fontSize: 14 }}>{g.name}</span>
                    </div>
                  );
                })}
              </div>
              {closedGroups && closedGroups.length > 0 && (
                <div style={{ color: selectedGroupIds.length ? C.ts : C.danger, fontSize: 11, marginTop: 10 }}>
                  {selectedGroupIds.length ? `Posting to ${selectedGroupIds.length} group${selectedGroupIds.length > 1 ? 's' : ''}` : 'Select at least one group to post to'}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, padding: '12px 14px', color: C.danger, fontSize: 13 }}>⚠️ {error}</div>
        )}

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10 }}>
          <span style={{ color: C.accent, fontSize: 13 }}>🔐</span>
          <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.4 }}>This post will be end-to-end encrypted. Only members of the selected audience(s) can read it.</span>
        </div>
      </div>

      <input ref={el => photoInputRef.current = el} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFilePicked(e, 'photo')} />
      <input ref={el => reelInputRef.current = el} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => handleFilePicked(e, 'reel')} />
      <input ref={el => fileInputRef.current = el} type="file" style={{ display: 'none' }} onChange={e => handleFilePicked(e, 'file')} />

      <div style={{ background: C.surface, borderTop: `1px solid ${C.border}`, padding: '12px 20px 20px', display: 'flex', gap: 28, alignItems: 'center' }}>
        <div onClick={() => photoInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <span style={{ fontSize: 22 }}>📷</span><span style={{ color: C.ts2, fontSize: 10 }}>Photo</span>
        </div>
        <div onClick={() => reelInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <span style={{ fontSize: 22 }}>🎥</span><span style={{ color: C.ts2, fontSize: 10 }}>Reel</span>
        </div>
        <div onClick={attachLocation} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <span style={{ fontSize: 22 }}>{locating ? '⏳' : '📍'}</span><span style={{ color: C.ts2, fontSize: 10 }}>Location</span>
        </div>
        <div onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <span style={{ fontSize: 22 }}>📎</span><span style={{ color: C.ts2, fontSize: 10 }}>Attach</span>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN 8: Groups List ─────────────────────────────────────────────────────
const GroupsList = ({ nav }) => {
  const { C, setSelectedGroup } = useTheme();
  const [tab, setTab] = useState('mine');
  const [myGroups, setMyGroups] = useState(null);
  const [discoverGroups, setDiscoverGroups] = useState(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(null);

  const loadMine = () => db.fetchMyGroups().then(all => setMyGroups(db.filterClosedGroups(all))).catch(err => setError(err.message || 'Could not load your groups.'));
  const loadDiscover = () => db.fetchDiscoverableGroups().then(setDiscoverGroups).catch(err => setError(err.message || 'Could not load discoverable groups.'));

  useEffect(() => { loadMine(); }, []);
  useEffect(() => { if (tab === 'discover' && discoverGroups === null) loadDiscover(); }, [tab]);

  const list = tab === 'mine' ? myGroups : discoverGroups;

  const initialsFor = name => (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const handleJoin = async g => {
    setJoining(g.id);
    try {
      await db.joinGroup(g.id);
      setDiscoverGroups(prev => prev.filter(x => x.id !== g.id));
      loadMine(); // refresh My Groups since it now includes this one
    } catch (err) {
      setError(err.message || 'Could not join that group.');
    } finally {
      setJoining(null);
    }
  };

  const openGroup = g => {
    setSelectedGroup({ id: g.id, name: g.name });
    nav('group_detail');
  };

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', position: 'relative', transition: 'background 0.3s' }}>
      <TopBar logo />
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
        {[['mine', 'My Groups'], ['discover', 'Discover']].map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ flex: 1, textAlign: 'center', padding: '12px', color: tab === id ? C.accent : C.ts, fontSize: 13, fontWeight: tab === id ? 700 : 400, borderBottom: `2px solid ${tab === id ? C.accent : 'transparent'}`, cursor: 'pointer' }}>{label}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 96 }}>
        {error && (
          <div style={{ padding: '14px', background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, color: C.danger, fontSize: 13 }}>⚠️ {error}</div>
        )}
        {list === null && !error && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: C.ts, fontSize: 13 }}>Loading…</div>
        )}
        {list && list.length === 0 && tab === 'mine' && (
          <EmptyState icon="◉" title="You're not in any closed groups yet" message="Groups you create or are added to will show up here." />
        )}
        {list && list.length === 0 && tab === 'discover' && (
          <EmptyState icon="🔍" title="Nothing to discover right now" message="You're already a member of every public group available. New public groups will appear here." />
        )}
        {list && list.map(g => (
          <div key={g.id} onClick={() => tab === 'mine' && openGroup(g)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px', display: 'flex', gap: 12, alignItems: 'center', cursor: tab === 'mine' ? 'pointer' : 'default' }}>
            <div style={{ width: 50, height: 50, borderRadius: 12, background: C.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontSize: 14, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', flexShrink: 0 }}>{initialsFor(g.name)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ color: C.tp, fontSize: 14, fontWeight: 700 }}>{g.name}</span>
                {tab === 'mine' && g.unread_count > 0 && <div style={{ width: 18, height: 18, borderRadius: 9, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#FFFFFF', fontWeight: 800 }}>{g.unread_count}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: C.ts, fontSize: 12 }}>👥 {g.member_count}</span>
                {tab === 'mine' && <Badge color={g.visibility === 'public' ? C.alert : C.ts}>{g.visibility === 'public' ? 'Public' : 'Members Only'}</Badge>}
              </div>
            </div>
            {tab === 'discover' ? (
              <div onClick={e => { e.stopPropagation(); handleJoin(g); }} style={{ padding: '7px 14px', borderRadius: 20, background: C.accent, color: '#FFFFFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: joining === g.id ? 0.6 : 1 }}>{joining === g.id ? 'Joining…' : 'Join'}</div>
            ) : (
              <span style={{ color: C.ts2, fontSize: 18 }}>›</span>
            )}
          </div>
        ))}
      </div>

      <div onClick={() => nav('create_group')} style={{ position: 'absolute', bottom: 88, right: 16, width: 52, height: 52, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#FFFFFF', cursor: 'pointer', boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.55)}`, zIndex: 5 }}>+</div>

      <BottomNav active="groups_list" onNavigate={nav} />
    </div>
  );
};

// ─── SCREEN 9: Group Detail ────────────────────────────────────────────────────
const GroupDetail = ({ nav }) => {
  const { C, selectedGroup, refreshUnread, currentUserId, setSelectedPostId } = useTheme();
  const [tab, setTab] = useState('posts');
  const [confirm, setConfirm] = useState(null);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');
  const [members, setMembers] = useState(null);
  const [membersError, setMembersError] = useState('');
  const [liked, setLiked] = useState({});
  const [menuPost, setMenuPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const groupName = selectedGroup?.name || 'Group';
  const initials = groupName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  useEffect(() => {
    if (!selectedGroup?.id) { setPosts([]); return; }
    let active = true;
    db.fetchAllVisiblePosts()
      .then(all => { if (active) setPosts(db.filterGroupPosts(all, selectedGroup.id)); })
      .catch(err => { if (active) setError(err.message || 'Could not load this group\u2019s posts.'); });

    db.markGroupRead(selectedGroup.id)
      .then(() => { if (active) refreshUnread(); })
      .catch(() => { /* best-effort */ });

    return () => { active = false; };
  }, [selectedGroup?.id]);

  useEffect(() => {
    if (tab !== 'members' || members !== null || !selectedGroup?.id) return;
    let active = true;
    db.fetchGroupMembers(selectedGroup.id)
      .then(list => { if (active) setMembers(list); })
      .catch(err => { if (active) setMembersError(err.message || 'Could not load members.'); });
    return () => { active = false; };
  }, [tab, selectedGroup?.id]);

  const toggleLike = (id, currentlyLiked) => {
    setLiked(p => ({ ...p, [id]: !currentlyLiked }));
    db.toggleLike(id, currentlyLiked).catch(() => setLiked(p => ({ ...p, [id]: currentlyLiked })));
  };
  const openPost = id => { setSelectedPostId(id); nav('post_detail'); };
  const handleDeleted = id => setPosts(prev => prev.filter(p => p.id !== id));
  const handleEdited = (id, newBody) => setPosts(prev => prev.map(p => p.id === id ? { ...p, body: newBody } : p));

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', position: 'relative', transition: 'background 0.3s' }}>
      <div style={{ background: C.headerBg, padding: '40px 16px 16px', position: 'relative' }}>
        <BrandStrip />
        <IconTap onClick={() => nav('groups_list')}><span style={{ position: 'absolute', top: 34, left: 4, color: C.tp, fontSize: 22 }}>←</span></IconTap>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginTop: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: C.avatarBg, border: `2px solid ${C.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontWeight: 800, fontSize: 15, fontFamily: 'Rajdhani, sans-serif' }}>{initials}</div>
          <div>
            <div style={{ color: C.tp, fontSize: 18, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>{groupName}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
              <span style={{ color: C.ts, fontSize: 12 }}>👥 members</span><Badge>Group</Badge>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        {[['posts', 'Posts'], ['members', 'Members'], ['about', 'About']].map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ flex: 1, textAlign: 'center', padding: '11px', color: tab === id ? C.accent : C.ts, fontSize: 13, fontWeight: tab === id ? 700 : 400, borderBottom: `2px solid ${tab === id ? C.accent : 'transparent'}`, cursor: 'pointer' }}>{label}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 70 }}>
        {tab === 'posts' && (
          <>
            {error && <div style={{ margin: 16, padding: '14px', background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, color: C.danger, fontSize: 13 }}>⚠️ {error}</div>}
            {posts === null && !error && <div style={{ padding: '40px 16px', textAlign: 'center', color: C.ts, fontSize: 13 }}>Loading posts…</div>}
            {posts && posts.length === 0 && <EmptyState icon="💬" title="No posts in this group yet" message="Posts shared with this group will show up here." />}
            {posts && posts.map(p => (
              <div key={p.id} style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                  <Avatar letter={(p.author_name || 'M')[0]} size={36} />
                  <div style={{ flex: 1 }}><div style={{ color: C.tp, fontSize: 13, fontWeight: 700 }}>{p.author_name}</div><div style={{ color: C.ts, fontSize: 11 }}>{timeAgo(p.created_at)}</div></div>
                  <IconTap onClick={() => setMenuPost(p)}><span style={{ color: C.ts2, fontSize: 20, lineHeight: 1 }}>⋯</span></IconTap>
                </div>
                <div style={{ color: C.tp, fontSize: 14, lineHeight: 1.5 }}>{p.body}</div>
                {p.has_media && <div style={{ height: 110, borderRadius: 8, background: C.surface2, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ts2, fontSize: 12, border: `1px solid ${C.border}` }}>📷 Media attached</div>}
                <div style={{ display: 'flex', gap: 4, marginTop: 10, alignItems: 'center' }}>
                  <div onClick={() => toggleLike(p.id, liked[p.id] ?? p.liked_by_me)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: (liked[p.id] ?? p.liked_by_me) ? C.accent : C.ts, fontSize: 13, fontWeight: (liked[p.id] ?? p.liked_by_me) ? 700 : 400 }}>
                    <span>{(liked[p.id] ?? p.liked_by_me) ? '👍🏽' : '👍'}</span>{Number(p.like_count) + ((liked[p.id] === true && !p.liked_by_me) ? 1 : (liked[p.id] === false && p.liked_by_me) ? -1 : 0)}
                  </div>
                  <div onClick={() => openPost(p.id)} style={{ padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: C.ts, fontSize: 13 }}>💬 {p.comment_count}</div>
                </div>
              </div>
            ))}
          </>
        )}
        {tab === 'members' && (
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {membersError && <div style={{ padding: '14px', background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, color: C.danger, fontSize: 13 }}>⚠️ {membersError}</div>}
            {members === null && !membersError && <div style={{ padding: '20px 0', textAlign: 'center', color: C.ts, fontSize: 13 }}>Loading members…</div>}
            {members && members.length === 0 && <EmptyState icon="👥" title="No members yet" message="Members of this group will appear here." />}
            {members && members.map(m => (
              <div key={m.user_id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar letter={(m.display_name || 'M')[0]} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.tp, fontSize: 14, fontWeight: 600 }}>{m.display_name}</div>
                </div>
                {m.role === 'admin' && <Badge color={C.alert}>ADMIN</Badge>}
              </div>
            ))}
            <div onClick={() => nav('member_invite')} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, cursor: 'pointer', paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.surface2, border: `1px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontSize: 20 }}>+</div>
              <span style={{ color: C.accent, fontSize: 14 }}>Invite member to group</span>
            </div>
          </div>
        )}
        {tab === 'about' && (
          <div style={{ padding: 16 }}>
            {[['Group', groupName], ['Visibility', 'Members Only']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${C.border}` }}><span style={{ color: C.ts, fontSize: 13 }}>{k}</span><span style={{ color: C.tp, fontSize: 13, fontWeight: 500 }}>{v}</span></div>
            ))}
            <div onClick={() => setConfirm({ title: 'Leave this group?', message: `You will stop receiving updates from ${groupName}. You can be re-invited by an existing member at any time.`, confirmLabel: 'Leave Group', onConfirm: () => nav('groups_list') })} style={{ marginTop: 20, padding: '12px', textAlign: 'center', borderRadius: 10, border: `1px solid ${C.danger}44`, color: C.danger, fontSize: 14, cursor: 'pointer' }}>Leave Group</div>
            <div onClick={() => setConfirm({ title: 'Delete this group?', message: `All posts, comments, and media in ${groupName} will be permanently removed for all members. This cannot be undone.`, confirmLabel: 'Delete Group', onConfirm: () => nav('groups_list') })} style={{ marginTop: 10, padding: '12px', textAlign: 'center', borderRadius: 10, border: `1px solid ${C.danger}44`, color: C.danger, fontSize: 14, cursor: 'pointer' }}>Delete Group</div>
          </div>
        )}
      </div>
      <div onClick={() => nav('create_post')} style={{ position: 'absolute', bottom: 16, right: 16, width: 50, height: 50, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, cursor: 'pointer', boxShadow: `0 4px 18px ${hexToRgba(C.accent, 0.55)}` }}>✏️</div>

      <PostOptionsMenu post={menuPost} visible={!!menuPost} onClose={() => setMenuPost(null)} currentUserId={currentUserId} onDeleted={handleDeleted} onEditRequested={setEditingPost} />
      <EditPostSheet post={editingPost} visible={!!editingPost} onClose={() => setEditingPost(null)} onSaved={handleEdited} />
      <ConfirmDialog visible={!!confirm} {...(confirm || {})} onCancel={() => setConfirm(null)} onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }} />
    </div>
  );
};

// ─── SCREEN 10: Create Group ───────────────────────────────────────────────────
const CreateGroup = ({ nav }) => {
  const { C, setSelectedGroup } = useTheme();
  const [vis, setVis] = useState('members');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) { setError('Group name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const created = await db.createGroup({
        name: name.trim(),
        description: desc.trim(),
        location: location.trim(),
        visibility: vis === 'public' ? 'public' : 'members_only',
      });
      setSelectedGroup({ id: created.id, name: created.name });
      nav('group_detail');
    } catch (err) {
      setError(err.message || 'Could not create the group. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="Create Group" back onBack={() => nav('groups_list')} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0' }}>
          <PhotoUploadTile uploaded={photoUploaded} onToggle={() => setPhotoUploaded(true)} />
          {photoUploaded && <span style={{ color: C.success, fontSize: 11, fontWeight: 600 }}>✓ Photo selected</span>}
        </div>
        <div>
          <FieldLabel>GROUP NAME</FieldLabel>
          <TextField value={name} onChange={setName} placeholder="e.g. Night Shift Alpha" />
        </div>
        <div>
          <FieldLabel>DESCRIPTION (OPTIONAL)</FieldLabel>
          <TextAreaField value={desc} onChange={setDesc} placeholder="What is this group for?" rows={2} />
        </div>
        <div>
          <FieldLabel>LOCATION / SITE</FieldLabel>
          <TextField value={location} onChange={setLocation} placeholder="e.g. Midrand Industrial Zone" />
        </div>
        <div>
          <FieldLabel>VISIBILITY</FieldLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['members', '🔒 Members Only', 'Only invited members see posts'], ['public', '👁 All Members', 'Anyone on the platform']].map(([id, label, desc]) => (
              <div key={id} onClick={() => setVis(id)} style={{ flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', background: vis === id ? C.accentDim : C.surface, border: `1.5px solid ${vis === id ? C.accent : C.border}` }}>
                <div style={{ color: vis === id ? C.accent : C.tp, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                <div style={{ color: C.ts, fontSize: 11, lineHeight: 1.3 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>ADD MEMBERS</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.surface2, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '0 14px' }}>
            <span style={{ color: C.ts2 }}>🔍</span>
            <input className="pf-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members by name" style={{ flex: 1, background: 'transparent', border: 'none', padding: '13px 0', color: C.tp, fontSize: 14, outline: 'none' }} />
          </div>
          <div style={{ color: C.ts2, fontSize: 11, marginTop: 6 }}>You'll be added automatically as this group's first member. Invite others once it's created.</div>
        </div>
        {error && (
          <div style={{ background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, padding: '12px 14px', color: C.danger, fontSize: 13 }}>⚠️ {error}</div>
        )}
        <div
          onClick={saving ? undefined : submit}
          style={{ background: C.accent, borderRadius: 10, padding: '15px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.65 : 1, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.35)}`, marginBottom: 24 }}
        >{saving ? 'CREATING…' : 'CREATE GROUP'}</div>
      </div>
    </div>
  );
};

// ─── SCREEN E1: Edit Profile ───────────────────────────────────────────────────
const EditProfile = ({ nav }) => {
  const { C } = useTheme();
  const [step, setStep] = useState('edit'); // 'edit' | 'new_number' | 'otp'
  const [name, setName] = useState('Yusuf Plaatjies');
  const [about, setAbout] = useState('Field Supervisor · Western Cape Sites');
  const [newNumber, setNewNumber] = useState('');
  const [numberUpdated, setNumberUpdated] = useState(false);
  const [otp, setOtp] = useState([]);
  const [resent, setResent] = useState(false);
  const [photoUploaded, setPhotoUploaded] = useState(false);

  const tapOtp = i => {
    if (i < otp.length) return;
    const next = [...otp, Math.floor(Math.random() * 9) + 1].slice(0, 6);
    setOtp(next);
    if (next.length === 6) setTimeout(() => { setNumberUpdated(true); setOtp([]); setStep('edit'); setResent(false); }, 400);
  };

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar
        title={step === 'edit' ? 'Edit Profile' : step === 'new_number' ? 'Change Number' : 'Verify New Number'}
        back
        onBack={() => step === 'edit' ? nav('profile_view') : (setStep('edit'), setOtp([]), setResent(false))}
      />

      {step === 'edit' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '4px 0 8px' }}>
            <div style={{ position: 'relative' }}>
              <Avatar letter="Y" size={82} />
              <AvatarUploadBadge uploaded={photoUploaded} onClick={() => setPhotoUploaded(true)} />
            </div>
            {photoUploaded && <span style={{ color: C.success, fontSize: 11, fontWeight: 600 }}>✓ Photo selected</span>}
          </div>

          <div>
            <FieldLabel>DISPLAY NAME</FieldLabel>
            <TextField value={name} onChange={setName} placeholder="Your name" />
          </div>

          <div>
            <FieldLabel>ABOUT</FieldLabel>
            <TextAreaField value={about} onChange={setAbout} placeholder="A short line about your role" rows={2} />
          </div>

          <div>
            <FieldLabel>CELL NUMBER</FieldLabel>
            <ReadOnlyRow icon="🇿🇦" value={numberUpdated ? '+27 71 555 0199' : '+27 82 000 0000'} badge="VERIFIED ✓" />
            <div onClick={() => setStep('new_number')} style={{ marginTop: 8, color: C.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Change cell number</div>
            {numberUpdated && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: `${C.success}18`, borderRadius: 8, color: C.success, fontSize: 12 }}>✓ Number updated and verified</div>
            )}
          </div>

          <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10 }}>
            <span style={{ color: C.accent, flexShrink: 0 }}>🔒</span>
            <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>Changing your cell number requires OTP verification. Your name and about info update immediately and remain encrypted.</span>
          </div>

          <div onClick={() => nav('profile_view')} style={{ background: C.accent, borderRadius: 10, padding: '15px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.35)}` }}>SAVE CHANGES</div>
        </div>
      )}

      {step === 'new_number' && (
        <div style={{ flex: 1, padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ color: C.tp, fontSize: 22, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Enter new number</div>
            <div style={{ color: C.ts, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>We'll send a verification code to confirm this number belongs to you</div>
          </div>
          <div>
            <FieldLabel>NEW MOBILE NUMBER</FieldLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface2, border: `1.5px solid ${C.accent}60`, borderRadius: 10, padding: '4px 14px' }}>
              <span style={{ fontSize: 18 }}>🇿🇦</span>
              <span style={{ color: C.ts, fontSize: 14 }}>+27</span>
              <div style={{ width: 1, height: 20, background: C.border }} />
              <input className="pf-input" type="tel" value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="71 555 0199" style={{ flex: 1, background: 'transparent', border: 'none', padding: '13px 0', color: C.tp, fontSize: 15, outline: 'none' }} />
            </div>
            <div style={{ color: C.ts2, fontSize: 11, marginTop: 6 }}>Enter without leading 0 · e.g. 71 555 0199</div>
          </div>
          <div onClick={() => { setStep('otp'); setResent(false); }} style={{ background: C.accent, borderRadius: 10, padding: '15px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.35)}` }}>SEND VERIFICATION CODE</div>
        </div>
      )}

      {step === 'otp' && (
        <div style={{ flex: 1, padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div>
            <div style={{ color: C.tp, fontSize: 22, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Verify new number</div>
            <div style={{ color: C.ts, fontSize: 13, marginTop: 8 }}>Code sent to <span style={{ color: C.tp, fontWeight: 600 }}>+27 71 555 0199</span></div>
          </div>
          <div>
            <FieldLabel>6-DIGIT CODE</FieldLabel>
            <OtpBoxes digits={otp} onTapBox={tapOtp} />
          </div>
          <ResendControl phone="+27 71 555 0199" seconds={30} resent={resent} onResend={() => setResent(true)} />
          <div style={{ textAlign: 'center', color: C.ts2, fontSize: 11 }}>Tap any digit box above to simulate entry for this prototype</div>
        </div>
      )}
    </div>
  );
};

// ─── SCREEN 11: Profile View ───────────────────────────────────────────────────
const ProfileView = ({ nav }) => {
  const { C } = useTheme();
  const [confirm, setConfirm] = useState(null);
  const [profile, setProfile] = useState(null); // null = loading
  const [profileError, setProfileError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    db.fetchMyProfileSummary()
      .then(p => { if (active) setProfile(p); })
      .catch(err => { if (active) setProfileError(err.message || 'Could not load your profile.'); });
    return () => { active = false; };
  }, []);

  const display = [
    { section: 'DISPLAY', items: [
      { icon: '🔔', label: 'Notifications', screen: 'notifications_settings' },
      { icon: '🎨', label: 'Appearance', screen: 'appearance_settings' },
      { icon: '📰', label: 'Feed Display', screen: 'feed_display_settings' },
    ]},
    { section: 'SECURITY', items: [
      { icon: '🔐', label: 'Login & Security', screen: 'security_settings' },
    ]},
    { section: 'ACCOUNT', items: [
      { icon: '📱', label: 'Add to Home Screen', screen: null },
      { icon: '📤', label: 'Invite a Member', screen: 'member_invite' },
    ]},
    // Only ever shown to a real admin — checked against the actual role
    // fetched from the database, not assumed. This was previously missing
    // entirely, for every user regardless of role, which is the real
    // reason it looked invisible rather than merely hidden.
    ...(profile?.role === 'admin' ? [{ section: 'ADMIN', items: [
      { icon: '🛡️', label: 'Admin Dashboard', screen: 'admin_dashboard' },
    ]}] : []),
  ];

  const displayName = profile?.displayName || 'Member';
  const contactLine = profile
    ? (profile.verificationMethod === 'phone_otp'
        ? `${profile.phone || '—'} · ${profile.phoneVerified ? 'Verified ✓' : 'Unverified'}`
        : `${profile.email || '—'} · ${profile.emailVerified ? 'Verified ✓' : 'Unverified'}`)
    : '';

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await db.signOut();
      nav('login_screen');
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', position: 'relative', transition: 'background 0.3s' }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, paddingBottom: 22 }}>
        <BrandStrip />
        <div style={{ padding: '18px 16px 0' }}>
        <div style={{ color: C.tp, fontSize: 18, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1.5, marginBottom: 18 }}>MY PROFILE</div>
        {profileError && <div style={{ padding: '12px 14px', background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {profileError}</div>}
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            <Avatar letter={displayName[0]} size={76} />
            <AvatarUploadBadge onClick={() => nav('edit_profile')} size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.tp, fontSize: 18, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 0.5 }}>{profile === null && !profileError ? 'Loading…' : displayName}</div>
            {profile && <div style={{ color: C.ts, fontSize: 12, marginTop: 3 }}>{contactLine}</div>}
            {profile?.about && <div style={{ color: C.ts, fontSize: 13, marginTop: 5, lineHeight: 1.3 }}>{profile.about}</div>}
            <div style={{ marginTop: 10 }}>
              <div onClick={() => nav('edit_profile')} style={{ display: 'inline-block', border: `1px solid ${C.border}`, borderRadius: 20, padding: '5px 14px', color: C.tp, fontSize: 12, cursor: 'pointer' }}>Edit Profile</div>
            </div>
          </div>
        </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 72 }}>
        {display.map(group => (
          <div key={group.section}>
            <div style={{ padding: '18px 16px 0' }}>
              <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>{group.section}</div>
            </div>
            <div style={{ padding: '0 16px' }}>
              {group.items.map(item => (
                <div key={item.label} onClick={() => item.screen && nav(item.screen)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', minHeight: 44 }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span style={{ flex: 1, color: C.tp, fontSize: 14 }}>{item.label}</span>
                  <span style={{ color: C.ts2 }}>›</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ padding: '22px 16px 0' }}>
          <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>SESSION</div>
        </div>
        <div style={{ padding: '0 16px' }}>
          <div onClick={signingOut ? undefined : handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: `1px solid ${C.border}`, cursor: signingOut ? 'default' : 'pointer', minHeight: 44, opacity: signingOut ? 0.6 : 1 }}>
            <span style={{ fontSize: 18 }}>🚪</span>
            <span style={{ flex: 1, color: C.tp, fontSize: 14 }}>{signingOut ? 'Signing out…' : 'Sign Out'}</span>
            <span style={{ color: C.ts2 }}>›</span>
          </div>
        </div>

        <div style={{ padding: '20px 16px 0' }}>
          <div
            onClick={() => setConfirm({
              title: 'Delete your profile?',
              message: 'This permanently removes your account, posts, and encryption keys from Pro Force Secure. Group members will no longer see your content. This cannot be undone.',
              confirmLabel: 'Delete Profile',
              onConfirm: () => nav('login_screen'),
            })}
            style={{ background: `${C.danger}10`, border: `1px solid ${C.danger}33`, borderRadius: 12, padding: '14px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 18 }}>🗑</span>
            <span style={{ flex: 1, color: C.danger, fontSize: 14, fontWeight: 600 }}>Delete Profile</span>
          </div>
        </div>
      </div>
      <BottomNav active="profile_view" onNavigate={nav} />

      <ConfirmDialog visible={!!confirm} {...(confirm || {})} onCancel={() => setConfirm(null)} onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }} />
    </div>
  );
};

// ─── SCREEN 12: Notifications Settings ────────────────────────────────────────
const NotificationsSettings = ({ nav }) => {
  const { C } = useTheme();
  const [s, setS] = useState({ push: true, popup: true, sounds: true, comments: true, group: true, announce: true, mentions: false });
  const toggle = k => setS(p => ({ ...p, [k]: !p[k] }));
  const items = [
    { key: 'push', label: 'Push Notifications', sub: 'Alerts when the app is in the background' },
    { key: 'popup', label: 'Popup Banners', sub: 'Show on-screen banners for new alerts' },
    { key: 'sounds', label: 'Notification Sounds', sub: 'Play a sound with each alert' },
    { key: 'comments', label: 'Comments on my posts', sub: 'When someone replies to your post' },
    { key: 'group', label: 'Group Posts', sub: 'New posts in groups you belong to' },
    { key: 'announce', label: 'Announcements', sub: 'Platform-wide updates from admin' },
    { key: 'mentions', label: 'Mentions', sub: 'When someone tags you in a comment' },
  ];
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="Notifications" back onBack={() => nav('profile_view')} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {items.map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.tp, fontSize: 14 }}>{item.label}</div>
              <div style={{ color: C.ts, fontSize: 12, marginTop: 3 }}>{item.sub}</div>
            </div>
            <ThemeToggle value={s[item.key]} onToggle={() => toggle(item.key)} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── SCREEN 13: Appearance Settings ───────────────────────────────────────────
const AppearanceSettings = ({ nav }) => {
  const { C, theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="Appearance" back onBack={() => nav('profile_view')} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        <div style={{ padding: '20px 0 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.tp, fontSize: 15, fontWeight: 700 }}>Dark Mode</div>
              <div style={{ color: C.ts, fontSize: 12, marginTop: 3 }}>{isDark ? 'Currently active — optimised for low-light environments' : 'Switch on for low-light and night use'}</div>
            </div>
            <ThemeToggle value={isDark} onToggle={toggleTheme} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div onClick={() => !isDark && toggleTheme()} style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: `2px solid ${isDark ? C.accent : C.border}`, cursor: 'pointer' }}>
              <div style={{ background: '#09090F', padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#2A1018', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.accent, fontWeight: 700 }}>S</div>
                  <div style={{ flex: 1 }}><div style={{ background: '#F4F4FF', borderRadius: 2, height: 7, width: '70%', marginBottom: 3 }} /><div style={{ background: '#3D3D52', borderRadius: 2, height: 5, width: '50%' }} /></div>
                </div>
                <div style={{ background: '#23232F', borderRadius: 4, height: 32 }} />
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <div style={{ background: C.accent, borderRadius: 3, height: 6, width: 30 }} />
                  <div style={{ background: '#3D3D52', borderRadius: 3, height: 6, width: 24 }} />
                </div>
              </div>
              <div style={{ background: '#111118', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: isDark ? C.accent : '#7A7A90', fontWeight: 700 }}>🌙 Dark</span>
                {isDark && <span style={{ fontSize: 10, color: C.accent, marginLeft: 'auto' }}>✓ Active</span>}
              </div>
            </div>

            <div onClick={() => isDark && toggleTheme()} style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: `2px solid ${!isDark ? C.accent : C.border}`, cursor: 'pointer' }}>
              <div style={{ background: '#F4F4F8', padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${hexToRgba(C.accent, 0.1)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.accent, fontWeight: 700 }}>S</div>
                  <div style={{ flex: 1 }}><div style={{ background: '#0D0D1A', borderRadius: 2, height: 7, width: '70%', marginBottom: 3 }} /><div style={{ background: '#9898A8', borderRadius: 2, height: 5, width: '50%' }} /></div>
                </div>
                <div style={{ background: '#DCDCE6', borderRadius: 4, height: 32 }} />
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <div style={{ background: C.accent, borderRadius: 3, height: 6, width: 30 }} />
                  <div style={{ background: '#9898A8', borderRadius: 3, height: 6, width: 24 }} />
                </div>
              </div>
              <div style={{ background: '#FFFFFF', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: !isDark ? C.accent : '#9898A8', fontWeight: 700 }}>☀️ Light</span>
                {!isDark && <span style={{ fontSize: 10, color: C.accent, marginLeft: 'auto' }}>✓ Active</span>}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.ts, fontSize: 12, letterSpacing: 1, marginBottom: 12 }}>ABOUT APPEARANCE</div>
          {[
            ['🌙', 'Dark Mode', 'Near-black backgrounds with crimson red accents. Best for low-light and night operations.'],
            ['☀️', 'Light Mode', 'White backgrounds with the same red and gold brand colours. Best for bright outdoor environments.'],
            ['🎨', 'Brand colours', 'Pro Force Crimson Red and Gold remain consistent across both modes.'],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ color: C.tp, fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{title}</div>
                <div style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN 14: Feed Display Settings ─────────────────────────────────────────
const FeedDisplaySettings = ({ nav }) => {
  const { C, showGroups, toggleShowGroups } = useTheme();
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="Feed Display" back onBack={() => nav('profile_view')} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        <div style={{ padding: '20px 0 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.tp, fontSize: 15, fontWeight: 700 }}>Show Groups on Feed</div>
              <div style={{ color: C.ts, fontSize: 12, marginTop: 3 }}>{showGroups ? 'Groups row appears at the top of your Company Feed' : 'Company Feed shows posts only — maximum reading space'}</div>
            </div>
            <ThemeToggle value={showGroups} onToggle={toggleShowGroups} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div onClick={() => !showGroups && toggleShowGroups()} style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: `2px solid ${showGroups ? C.accent : C.border}`, cursor: 'pointer' }}>
              <div style={{ background: C.bg, padding: '10px' }}>
                <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: C.avatarBg, border: `1.5px solid ${C.accent}` }} />
                  ))}
                </div>
                <div style={{ background: C.surface2, borderRadius: 3, height: 5, width: '80%', marginBottom: 4 }} />
                <div style={{ background: C.surface2, borderRadius: 3, height: 5, width: '60%', marginBottom: 8 }} />
                <div style={{ background: C.surface2, borderRadius: 3, height: 5, width: '70%' }} />
              </div>
              <div style={{ background: C.surface, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: showGroups ? C.accent : C.ts2, fontWeight: 700 }}>◉ With Groups</span>
                {showGroups && <span style={{ fontSize: 10, color: C.accent, marginLeft: 'auto' }}>✓ Active</span>}
              </div>
            </div>

            <div onClick={() => showGroups && toggleShowGroups()} style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: `2px solid ${!showGroups ? C.accent : C.border}`, cursor: 'pointer' }}>
              <div style={{ background: C.bg, padding: '10px' }}>
                <div style={{ background: C.surface2, borderRadius: 3, height: 5, width: '80%', marginBottom: 4 }} />
                <div style={{ background: C.surface2, borderRadius: 3, height: 5, width: '60%', marginBottom: 6 }} />
                <div style={{ background: C.surface2, borderRadius: 3, height: 5, width: '70%', marginBottom: 6 }} />
                <div style={{ background: C.surface2, borderRadius: 3, height: 5, width: '75%', marginBottom: 6 }} />
                <div style={{ background: C.surface2, borderRadius: 3, height: 5, width: '55%' }} />
              </div>
              <div style={{ background: C.surface, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: !showGroups ? C.accent : C.ts2, fontWeight: 700 }}>▦ Feed Only</span>
                {!showGroups && <span style={{ fontSize: 10, color: C.accent, marginLeft: 'auto' }}>✓ Active</span>}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 0' }}>
          <div style={{ color: C.ts, fontSize: 12, letterSpacing: 1, marginBottom: 12 }}>ABOUT FEED DISPLAY</div>
          {[
            ['◉', 'With Groups', 'Quick access to your group avatars right above the feed. Best if you actively jump between several site groups.'],
            ['▦', 'Feed Only', 'Removes the groups row entirely for a denser, distraction-free feed. Best for users who mainly read updates.'],
            ['💾', 'Saved automatically', 'Your preference is remembered and applied every time you open the app.'],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ color: C.tp, fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{title}</div>
                <div style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN 15: Member Invite ──────────────────────────────────────────────────
const MemberInvite = ({ nav }) => {
  const { C } = useTheme();
  const [invites, setInvites] = useState(null);
  const [invitesError, setInvitesError] = useState('');

  useEffect(() => {
    db.fetchMyRecentInvites()
      .then(setInvites)
      .catch(err => setInvitesError(err.message || 'Could not load your recent invites.'));
  }, []);

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="Invite a Member" back onBack={() => nav('profile_view')} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <InviteGeneratorCard extraNote="Share only with people you know" />

        <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10 }}>
          <span style={{ color: C.accent, flexShrink: 0 }}>🔒</span>
          <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>Invites can only come from inside Pro Force Secure. This link cannot be discovered or shared publicly outside the app.</span>
        </div>

        <div>
          <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, marginBottom: 10 }}>YOUR RECENT INVITES</div>
          {invitesError && <div style={{ padding: '12px 14px', background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 10, color: C.danger, fontSize: 13 }}>⚠️ {invitesError}</div>}
          {invites === null && !invitesError && <div style={{ color: C.ts, fontSize: 13 }}>Loading…</div>}
          {invites && invites.length === 0 && <div style={{ color: C.ts2, fontSize: 13 }}>You haven't sent any invites yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invites && invites.map(inv => (
              <div key={inv.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: C.tp, fontSize: 13, fontWeight: 600 }}>{inv.status === 'used' ? `Used by ${inv.consumedByName || 'a member'}` : inv.status === 'expired' ? 'Invite expired' : 'Invite pending'}</div>
                  <div style={{ color: C.ts, fontSize: 11 }}>{timeAgo(inv.createdAt)}</div>
                </div>
                <Badge color={inv.status === 'used' ? C.ts : inv.status === 'expired' ? C.danger : C.accent}>{inv.status.toUpperCase()}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN L1: Login — Returning User ────────────────────────────────────────
const LoginScreen = ({ nav }) => {
  const { C, companyName, companyLogoUploaded } = useTheme();
  const [mode, setMode] = useState('appcode'); // 'none' | 'faceid' | 'appcode'
  const isDefaultBrand = companyName === 'Pro Force Security';
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '56px 28px 44px', transition: 'background 0.3s' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 78, height: 78, borderRadius: 22, background: C.accentDim, border: `2px solid ${C.accent}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, boxShadow: `0 0 50px ${C.accentDim}` }}>{companyLogoUploaded ? '🖼' : '🛡'}</div>
        <div style={{ textAlign: 'center' }}>
          {isDefaultBrand ? (
            <div style={{ color: C.tp, fontSize: 24, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 3 }}>PRO FORCE <span style={{ color: C.accent }}>SECURE</span></div>
          ) : (
            <div style={{ color: C.tp, fontSize: 24, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 2 }}>{companyName.toUpperCase()}</div>
          )}
          <div style={{ color: C.ts, fontSize: 13, marginTop: 6 }}>Welcome back</div>
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 50, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontSize: 13, fontWeight: 700, fontFamily: 'Rajdhani, sans-serif' }}>Y</div>
          <div>
            <div style={{ color: C.tp, fontSize: 14, fontWeight: 700 }}>Yusuf Plaatjies</div>
            <div style={{ color: C.ts, fontSize: 12 }}>+27 82 *** ****</div>
          </div>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mode === 'faceid' && (
            <div onClick={() => nav('login_faceid')} style={{ background: C.accent, borderRadius: 12, padding: '16px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, cursor: 'pointer', boxShadow: `0 4px 24px ${hexToRgba(C.accent, 0.4)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🔒</span> USE FACE ID / FINGERPRINT
            </div>
          )}
          {mode === 'appcode' && (
            <div onClick={() => nav('login_appcode')} style={{ background: C.accent, borderRadius: 12, padding: '16px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, cursor: 'pointer', boxShadow: `0 4px 24px ${hexToRgba(C.accent, 0.4)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🔢</span> ENTER APP CODE
            </div>
          )}
          {mode === 'none' && (
            <div onClick={() => nav('register_otp')} style={{ background: C.accent, borderRadius: 12, padding: '16px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, cursor: 'pointer', boxShadow: `0 4px 24px ${hexToRgba(C.accent, 0.4)}` }}>
              SEND OTP TO MY NUMBER
            </div>
          )}

          {mode !== 'none' && (
            <div onClick={() => nav('register_otp')} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px', textAlign: 'center', color: C.ts, fontSize: 14, cursor: 'pointer' }}>
              Use OTP instead
            </div>
          )}
          <div onClick={() => nav('reset_credentials')} style={{ textAlign: 'center', color: C.accent, fontSize: 13, cursor: 'pointer', marginTop: 4, fontWeight: 600 }}>
            Forgot / Reset login credentials
          </div>
        </div>

        <div style={{ marginTop: 8, padding: '10px 14px', background: C.surface2, borderRadius: 10, border: `1px solid ${C.border}`, width: '100%' }}>
          <div style={{ color: C.ts2, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>PROTOTYPE: SIMULATE SECURITY MODE</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['none', '📨 OTP'], ['faceid', '🔒 Face ID'], ['appcode', '🔢 Code']].map(([id, label]) => (
              <div key={id} onClick={() => setMode(id)} style={{ flex: 1, padding: '6px', textAlign: 'center', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: mode === id ? C.accentDim : 'transparent', border: `1px solid ${mode === id ? C.accent : C.border}`, color: mode === id ? C.accent : C.ts, fontWeight: mode === id ? 700 : 400 }}>{label}</div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', color: C.ts2, fontSize: 11 }}>🔒 End-to-end encrypted · Invite only</div>
    </div>
  );
};

// ─── SCREEN L2: Login — Face ID ───────────────────────────────────────────────
const LoginFaceID = ({ nav }) => {
  const { C } = useTheme();
  const [state, setState] = useState('idle'); // 'idle' | 'scanning' | 'success' | 'fail'
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '56px 28px 44px', transition: 'background 0.3s' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ color: C.tp, fontSize: 22, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Biometric Login</div>
        <div style={{ color: C.ts, fontSize: 13 }}>Use Face ID or fingerprint to sign in</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div onClick={() => setState(s => s === 'idle' ? 'scanning' : s === 'scanning' ? 'success' : 'idle')} style={{ width: 140, height: 140, borderRadius: '50%', border: `3px solid ${state === 'success' ? C.success : state === 'fail' ? C.danger : state === 'scanning' ? C.accent : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'border-color 0.3s', boxShadow: state === 'scanning' ? `0 0 40px ${C.accent}44` : state === 'success' ? `0 0 40px ${C.success}40` : 'none' }}>
          <div style={{ width: 110, height: 110, borderRadius: '50%', background: state === 'success' ? `${C.success}18` : C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52 }}>
            {state === 'success' ? '✅' : state === 'fail' ? '❌' : '🔒'}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: state === 'success' ? C.success : state === 'fail' ? C.danger : C.tp, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            {state === 'idle' ? 'Tap to scan' : state === 'scanning' ? 'Scanning…' : state === 'success' ? 'Identity confirmed' : 'Not recognised — try again'}
          </div>
          <div style={{ color: C.ts, fontSize: 12 }}>
            {state === 'success' ? 'Redirecting to your feed…' : 'Supported: Face ID · Touch ID · Fingerprint'}
          </div>
        </div>
        {state === 'success' && (
          <div onClick={() => nav('company_feed')} style={{ background: C.success, borderRadius: 12, padding: '14px 40px', color: '#FFF', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>CONTINUE →</div>
        )}
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div onClick={() => nav('login_appcode')} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px', textAlign: 'center', color: C.ts, fontSize: 14, cursor: 'pointer' }}>Use App Code instead</div>
        <div onClick={() => nav('reset_credentials')} style={{ textAlign: 'center', color: C.accent, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Forgot / Reset credentials</div>
      </div>
    </div>
  );
};

// ─── SCREEN L3: Login — App Code ──────────────────────────────────────────────
const LoginAppCode = ({ nav }) => {
  const { C } = useTheme();
  const [digits, setDigits] = useState([]);
  const [error, setError] = useState(false);
  const addDigit = d => {
    if (digits.length >= 6) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === 6) {
      if (next.join('') === '123456') { setTimeout(() => nav('company_feed'), 400); }
      else { setTimeout(() => { setDigits([]); setError(true); setTimeout(() => setError(false), 1500); }, 400); }
    }
  };
  const del = () => setDigits(d => d.slice(0, -1));
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <div style={{ padding: '48px 24px 20px' }}>
        <IconTap onClick={() => nav('login_screen')}><span style={{ color: C.accent, fontSize: 13 }}>← Back</span></IconTap>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: C.tp, fontSize: 22, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Enter App Code</div>
            <div style={{ color: error ? C.danger : C.ts, fontSize: 13, marginTop: 6, transition: 'color 0.2s' }}>{error ? 'Incorrect code — try again' : '6-digit code to access your account'}</div>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            {[0,1,2,3,4,5].map(i => (
              <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: i < digits.length ? (error ? C.danger : C.accent) : C.surface2, border: `2px solid ${i < digits.length ? (error ? C.danger : C.accent) : C.border}`, transition: 'background 0.15s' }} />
            ))}
          </div>
          <PinPad digits={digits} onDigit={addDigit} onDelete={del} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <div onClick={() => nav('login_faceid')} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px', textAlign: 'center', color: C.ts, fontSize: 14, cursor: 'pointer' }}>Use Face ID instead</div>
          <div onClick={() => nav('reset_credentials')} style={{ textAlign: 'center', color: C.accent, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Forgot code · Reset via OTP</div>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN L4: Reset Credentials ─────────────────────────────────────────────
const ResetCredentials = ({ nav }) => {
  const { C } = useTheme();
  const [step, setStep] = useState('choose'); // 'choose' | 'confirm' | 'otp' | 'email_sent' | 'success'
  const [method, setMethod] = useState('phone');
  const [otp, setOtp] = useState([]);
  const [resent, setResent] = useState(false);
  const tapOtp = i => {
    if (i < otp.length) return;
    const next = [...otp, Math.floor(Math.random() * 9) + 1].slice(0, 6);
    setOtp(next);
    if (next.length === 6) setTimeout(() => setStep('success'), 500);
  };
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <div style={{ padding: '48px 24px 20px' }}>
        <IconTap onClick={() => step === 'choose' ? nav('login_screen') : setStep('choose')}><span style={{ color: C.accent, fontSize: 13 }}>← Back</span></IconTap>
      </div>
      <div style={{ flex: 1, padding: '8px 24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {step === 'choose' && <>
          <div>
            <div style={{ color: C.tp, fontSize: 24, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Reset Login</div>
          </div>
          <VerifyMethodChoice
            subtitle="Choose how you'd like to verify it's really you."
            onChoose={m => { setMethod(m); setStep('confirm'); }}
          />
        </>}

        {step === 'confirm' && <>
          <div>
            <div style={{ color: C.tp, fontSize: 24, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Reset Login</div>
            <div style={{ color: C.ts, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
              {method === 'phone'
                ? "We'll send a one-time PIN to your registered number to verify your identity and reset your login credentials."
                : "We'll send a magic link to your registered email to verify your identity and reset your login credentials."}
            </div>
          </div>
          <ReadOnlyRow icon={method === 'phone' ? '📱' : '✉️'} value={method === 'phone' ? '+27 82 *** ****' : 'y•••••@email.com'} />
          <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10 }}>
            <span style={{ color: C.alert, flexShrink: 0 }}>⚠️</span>
            <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>Resetting will clear your current Face ID and App Code settings. You can re-enable them after logging in.</span>
          </div>
          <div onClick={() => setStep(method === 'phone' ? 'otp' : 'email_sent')} style={{ background: C.accent, borderRadius: 10, padding: '15px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.35)}` }}>{method === 'phone' ? 'SEND RESET CODE' : 'SEND MAGIC LINK'}</div>
        </>}

        {step === 'otp' && <>
          <div>
            <div style={{ color: C.tp, fontSize: 24, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Enter Reset Code</div>
            <div style={{ color: C.ts, fontSize: 13, marginTop: 6 }}>Verifying <span style={{ color: C.tp, fontWeight: 600 }}>+27 82 *** ****</span></div>
          </div>
          <div style={{ background: C.accentDim, border: `1px solid ${hexToRgba(C.accent, 0.3)}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>🧪</span>
            <div>
              <div style={{ color: C.ts, fontSize: 11, letterSpacing: 0.5 }}>TEST MODE — no SMS sent</div>
              <div style={{ color: C.tp, fontSize: 15, fontWeight: 700, marginTop: 2, letterSpacing: 2 }}>719 402</div>
            </div>
          </div>
          <div>
            <FieldLabel>6-DIGIT CODE</FieldLabel>
            <OtpBoxes digits={otp} onTapBox={tapOtp} />
          </div>
          <ResendControl phone="+27 82 *** ****" seconds={45} resent={resent} onResend={() => setResent(true)} />
        </>}

        {step === 'email_sent' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: 22, background: C.accentDim, border: `2px solid ${hexToRgba(C.accent, 0.45)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>✉️</div>
            <div>
              <div style={{ color: C.tp, fontSize: 20, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Check your inbox</div>
              <div style={{ color: C.ts, fontSize: 13, marginTop: 10, lineHeight: 1.6, maxWidth: 260 }}>We've sent a magic link to your registered email. Open it on this device to continue.</div>
            </div>
            <div onClick={() => setStep('success')} style={{ background: C.success, borderRadius: 12, padding: '14px 32px', color: '#FFFFFF', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>✓ SIMULATE: I CLICKED THE LINK</div>
          </div>
        )}

        {step === 'success' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: `${C.success}18`, border: `2px solid ${C.success}80`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>✅</div>
            <div>
              <div style={{ color: C.tp, fontSize: 22, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>Identity Verified</div>
              <div style={{ color: C.ts, fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>Your login credentials have been reset. You can now access your account and set up new security preferences.</div>
            </div>
            <div onClick={() => nav('company_feed')} style={{ background: C.accent, borderRadius: 10, padding: '15px 40px', color: '#FFFFFF', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.35)}` }}>CONTINUE TO APP →</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── SCREEN L5: Security Settings ─────────────────────────────────────────────
const SecuritySettings = ({ nav }) => {
  const { C } = useTheme();
  const [faceID, setFaceID] = useState(false);
  const [appCode, setAppCode] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [sessions, setSessions] = useState([
    { id: 's1', device: 'Samsung Galaxy A54', location: 'Durban, ZA', time: 'Active now', current: true },
    { id: 's2', device: 'iPhone 14', location: 'Cape Town, ZA', time: '2 days ago', current: false },
  ]);
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="Login & Security" back onBack={() => nav('profile_view')} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px' }}>

        <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, padding: '16px 0 10px' }}>LOGIN SECURITY</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🔒</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.tp, fontSize: 14, fontWeight: 600 }}>Face ID / Fingerprint</div>
                <div style={{ color: C.ts, fontSize: 12, marginTop: 2 }}>Use your device biometrics to log in instantly</div>
              </div>
              <ThemeToggle value={faceID} onToggle={() => { setFaceID(f => !f); if (appCode && !faceID) setAppCode(false); }} />
            </div>
            {faceID && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: C.surface2, borderRadius: 8, display: 'flex', gap: 8 }}>
                <span style={{ color: C.accent, fontSize: 12 }}>✓</span>
                <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.4 }}>Face ID enabled. You'll be prompted on next login. OTP remains available as fallback.</span>
              </div>
            )}
          </div>

          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🔢</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.tp, fontSize: 14, fontWeight: 600 }}>App Code</div>
                <div style={{ color: C.ts, fontSize: 12, marginTop: 2 }}>Set a 6-digit PIN to secure your login</div>
              </div>
              <ThemeToggle value={appCode} onToggle={() => { setAppCode(c => !c); if (faceID && !appCode) setFaceID(false); }} />
            </div>
            {appCode && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <div onClick={() => nav('set_app_code')} style={{ flex: 1, padding: '9px', textAlign: 'center', borderRadius: 8, border: `1px solid ${C.accent}44`, color: C.accent, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Change Code</div>
                <div onClick={() => nav('login_appcode')} style={{ flex: 1, padding: '9px', textAlign: 'center', borderRadius: 8, border: `1px solid ${C.border}`, color: C.ts, fontSize: 13, cursor: 'pointer' }}>Test Code</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, marginBottom: 16 }}>
          <span style={{ color: C.ts, fontSize: 13, flexShrink: 0 }}>ℹ️</span>
          <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>Only one login method can be active at a time. OTP via SMS is always available as a fallback for all methods.</span>
        </div>

        <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, padding: '8px 0 10px' }}>CREDENTIALS</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <div onClick={() => nav('reset_credentials')} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📨</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.tp, fontSize: 14, fontWeight: 600 }}>Reset via OTP</div>
              <div style={{ color: C.ts, fontSize: 12, marginTop: 2 }}>Send a code to +27 82 *** **** to reset</div>
            </div>
            <span style={{ color: C.ts2 }}>›</span>
          </div>
          <div onClick={() => nav('edit_profile')} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📱</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.tp, fontSize: 14, fontWeight: 600 }}>Change Registered Number</div>
              <div style={{ color: C.ts, fontSize: 12, marginTop: 2 }}>Handled from Edit Profile, verified via OTP</div>
            </div>
            <span style={{ color: C.ts2 }}>›</span>
          </div>
        </div>

        <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, padding: '8px 0 10px' }}>ACTIVE SESSIONS</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          {sessions.map((s, i) => (
            <div key={s.id} style={{ padding: '14px 16px', borderBottom: i < sessions.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>📱</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: C.tp, fontSize: 13, fontWeight: 600 }}>{s.device}</span>
                  {s.current && <span style={{ background: `${C.success}22`, color: C.success, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>THIS DEVICE</span>}
                </div>
                <div style={{ color: C.ts, fontSize: 11, marginTop: 2 }}>{s.location} · {s.time}</div>
              </div>
              {!s.current && (
                <span
                  onClick={() => setConfirm({ title: 'Revoke this session?', message: `${s.device} will be signed out immediately and will need to verify via OTP to log in again.`, confirmLabel: 'Revoke', onConfirm: () => setSessions(prev => prev.filter(x => x.id !== s.id)) })}
                  style={{ color: C.danger, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                >Revoke</span>
              )}
            </div>
          ))}
        </div>
        <div
          onClick={() => setConfirm({ title: 'Sign out of all devices?', message: 'Every device currently signed in — including this one — will be logged out immediately. You will need to verify via OTP to log back in.', confirmLabel: 'Sign Out All', onConfirm: () => nav('login_screen') })}
          style={{ padding: '12px', textAlign: 'center', borderRadius: 10, border: `1px solid ${C.danger}44`, color: C.danger, fontSize: 14, cursor: 'pointer' }}
        >Sign Out of All Devices</div>
      </div>

      <ConfirmDialog visible={!!confirm} {...(confirm || {})} onCancel={() => setConfirm(null)} onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }} />
    </div>
  );
};

// ─── SCREEN L6: Set App Code ───────────────────────────────────────────────────
const SetAppCode = ({ nav }) => {
  const { C } = useTheme();
  const [step, setStep] = useState('create'); // 'create' | 'confirm'
  const [digits, setDigits] = useState([]);
  const [first, setFirst] = useState([]);
  const [error, setError] = useState(false);
  const addDigit = d => {
    if (digits.length >= 6) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === 6) {
      if (step === 'create') { setTimeout(() => { setFirst(next); setDigits([]); setStep('confirm'); }, 300); }
      else {
        if (next.join('') === first.join('')) { setTimeout(() => nav('security_settings'), 400); }
        else { setTimeout(() => { setDigits([]); setError(true); setTimeout(() => setError(false), 1500); }, 300); }
      }
    }
  };
  const del = () => setDigits(d => d.slice(0, -1));
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title={step === 'create' ? 'Set App Code' : 'Confirm App Code'} back onBack={() => step === 'confirm' ? (setStep('create'), setDigits([]), setFirst([])) : nav('security_settings')} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '24px 24px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: C.tp, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{step === 'create' ? 'Create a 6-digit App Code' : 'Confirm your App Code'}</div>
            <div style={{ color: error ? C.danger : C.ts, fontSize: 13, transition: 'color 0.2s' }}>{error ? "Codes don't match — try again" : step === 'create' ? 'This code will be required to log in' : 'Enter the same code again to confirm'}</div>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            {[0,1,2,3,4,5].map(i => (
              <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: i < digits.length ? (error ? C.danger : C.accent) : C.surface2, border: `2px solid ${i < digits.length ? (error ? C.danger : C.accent) : C.border}`, transition: 'background 0.15s' }} />
            ))}
          </div>
          <PinPad digits={digits} onDigit={addDigit} onDelete={del} />
        </div>
        <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 14px', width: '100%', display: 'flex', gap: 8 }}>
          <span style={{ color: C.accent, flexShrink: 0 }}>🔐</span>
          <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.4 }}>Your App Code is stored locally on this device only. It cannot be recovered — use OTP reset if forgotten.</span>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN 16: Admin Dashboard ────────────────────────────────────────────────
const AdminDashboard = ({ nav }) => {
  const { C } = useTheme();
  const [tab, setTab] = useState('overview');
  const [confirm, setConfirm] = useState(null);
  const [users, setUsers] = useState([
    { init: 'N', name: 'Naledi R', phone: '+27 83 ***', status: 'admin', posts: 31 },
    { init: 'S', name: 'Sipho M', phone: '+27 82 ***', status: 'active', posts: 12 },
    { init: 'T', name: 'Thabo K', phone: '+27 73 ***', status: 'active', posts: 7 },
    { init: 'J', name: 'James P', phone: '+27 71 ***', status: 'flagged', posts: 2 },
  ]);
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [flaggedDismissed, setFlaggedDismissed] = useState(false);
  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="Admin Dashboard" back onBack={() => nav('company_feed')} right={<Badge color={C.alert}>ADMIN</Badge>} />
      <div style={{ display: 'flex', background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
        {[['overview','Overview'],['users','Users'],['posts','Flagged'],['invites','Invites']].map(([id,label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ padding: '11px 16px', flexShrink: 0, color: tab===id ? C.accent : C.ts, fontSize: 13, fontWeight: tab===id ? 700 : 400, borderBottom: `2px solid ${tab===id ? C.accent : 'transparent'}`, cursor: 'pointer' }}>{label}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['47','Total Members','👥',C.accent],['184','Active Posts','📋',C.alert],['9','Groups','◉','#8B6914'],['2','Flagged','⚠️',C.danger]].map(([val,lbl,icon,color]) => (
                <div key={lbl} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px' }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
                  <div style={{ color, fontSize: 26, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif' }}>{val}</div>
                  <div style={{ color: C.ts, fontSize: 12, marginTop: 2 }}>{lbl}</div>
                </div>
              ))}
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px' }}>
              <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, marginBottom: 12 }}>QUICK ACTIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[['+ Generate Invite QR / Link','invites',C.accent],['👥 Manage Users','users',C.tp],['⚠️ Review Flagged Content','posts',C.alert]].map(([label,target,color]) => (
                  <div key={label} onClick={() => setTab(target)} style={{ padding: '12px', borderRadius: 8, border: `1px solid ${C.border}`, color, fontSize: 14, cursor: 'pointer', background: C.surface2 }}>{label}</div>
                ))}
                <div onClick={() => nav('company_branding')} style={{ padding: '12px', borderRadius: 8, border: `1px solid ${C.border}`, color: C.tp, fontSize: 14, cursor: 'pointer', background: C.surface2 }}>🎨 Company Branding</div>
              </div>
            </div>
          </div>
        )}
        {tab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ color: C.ts }}>🔍</span><span style={{ color: C.ts2, fontSize: 14 }}>Search members…</span>
            </div>
            {users.map(u => (
              <div key={u.name} style={{ background: C.surface, border: `1px solid ${u.status==='flagged' ? C.danger+'55' : C.border}`, borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                  <Avatar letter={u.init} size={36} />
                  <div style={{ flex: 1 }}><div style={{ color: C.tp, fontSize: 14, fontWeight: 700 }}>{u.name}</div><div style={{ color: C.ts, fontSize: 12 }}>{u.phone} · {u.posts} posts</div></div>
                  <Badge color={u.status==='admin' ? C.alert : u.status==='flagged' ? C.danger : C.accent}>{u.status.toUpperCase()}</Badge>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div onClick={() => { setRenaming(u.name); setRenameValue(u.name); }} style={{ flex: 1, padding: '8px 4px', textAlign: 'center', borderRadius: 8, border: `1px solid ${C.ts2}55`, color: C.ts, fontSize: 12, cursor: 'pointer', fontWeight: 600, minHeight: 36 }}>Edit Name</div>
                  <div
                    onClick={() => setConfirm({ title: `Block ${u.name}?`, message: `${u.name} will lose access to Pro Force Secure immediately and will be removed from all groups. This can be reversed by an admin later.`, confirmLabel: 'Block User', onConfirm: () => {} })}
                    style={{ flex: 1, padding: '8px 4px', textAlign: 'center', borderRadius: 8, border: `1px solid ${C.danger}55`, color: C.danger, fontSize: 12, cursor: 'pointer', fontWeight: 600, minHeight: 36 }}
                  >Block</div>
                  <div
                    onClick={() => setConfirm({
                      title: u.status === 'admin' ? `Revoke admin from ${u.name}?` : `Make ${u.name} an admin?`,
                      message: u.status === 'admin'
                        ? `${u.name} will lose admin permissions and become a regular member. They can be made admin again later.`
                        : `${u.name} will gain full admin permissions, including the ability to block users and moderate content.`,
                      confirmLabel: u.status === 'admin' ? 'Revoke Admin' : 'Make Admin',
                      danger: u.status === 'admin',
                      onConfirm: () => setUsers(prev => prev.map(x => x.name === u.name ? { ...x, status: x.status === 'admin' ? 'active' : 'admin' } : x)),
                    })}
                    style={{ flex: 1, padding: '8px 4px', textAlign: 'center', borderRadius: 8, border: `1px solid ${C.alert}55`, color: C.alert, fontSize: 12, cursor: 'pointer', fontWeight: 600, minHeight: 36 }}
                  >{u.status === 'admin' ? 'Revoke Admin' : 'Make Admin'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'posts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!flaggedDismissed && (
              <div style={{ background: C.danger+'10', border: `1px solid ${C.danger}44`, borderRadius: 12, padding: '14px' }}>
                <div style={{ color: C.danger, fontSize: 11, letterSpacing: 0.5, marginBottom: 10 }}>⚠️ REPORTED BY 2 MEMBERS</div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}><Avatar letter="J" size={34} /><div><div style={{ color: C.tp, fontSize: 13, fontWeight: 700 }}>James P</div><div style={{ color: C.ts, fontSize: 11 }}>All Members · 2h ago</div></div></div>
                <div style={{ color: C.tp, fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>"Content that was flagged by members as inappropriate for the platform…"</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div
                    onClick={() => setConfirm({ title: 'Remove this post?', message: 'The post will be deleted for all members immediately. This cannot be undone.', confirmLabel: 'Remove Post', onConfirm: () => setFlaggedDismissed(true) })}
                    style={{ flex: 1, padding: '9px', textAlign: 'center', borderRadius: 8, background: C.danger+'22', color: C.danger, fontSize: 13, cursor: 'pointer', fontWeight: 700, minHeight: 36 }}
                  >Remove Post</div>
                  <div onClick={() => setFlaggedDismissed(true)} style={{ flex: 1, padding: '9px', textAlign: 'center', borderRadius: 8, border: `1px solid ${C.border}`, color: C.ts, fontSize: 13, cursor: 'pointer', minHeight: 36 }}>Dismiss</div>
                  <div
                    onClick={() => setConfirm({ title: 'Block James P?', message: 'James P will lose access to Pro Force Secure immediately and will be removed from all groups.', confirmLabel: 'Block User', onConfirm: () => setFlaggedDismissed(true) })}
                    style={{ flex: 1, padding: '9px', textAlign: 'center', borderRadius: 8, border: `1px solid ${C.alert}44`, color: C.alert, fontSize: 13, cursor: 'pointer', minHeight: 36 }}
                  >Block User</div>
                </div>
              </div>
            )}
            <EmptyState icon="✅" title={flaggedDismissed ? 'No flagged content' : 'No other flagged content'} message="When members report a post or comment, it will appear here for review." />
          </div>
        )}
        {tab === 'invites' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <InviteGeneratorCard title="Generate New Invite" extraNote="Token invalidates on first scan" />
            {[{ name: 'Invite #047', sent: '2h ago', status: 'Used', who: 'Sipho M' }, { name: 'Invite #048', sent: '1h ago', status: 'Pending', who: '—' }].map(inv => (
              <div key={inv.name} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ color: C.tp, fontSize: 13, fontWeight: 600 }}>{inv.name}</div><div style={{ color: C.ts, fontSize: 11 }}>{inv.sent} · {inv.who}</div></div>
                <Badge color={inv.status === 'Used' ? C.ts : C.accent}>{inv.status.toUpperCase()}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <SheetOverlay visible={!!renaming} onClose={() => setRenaming(null)} anchor="bottom">
        <div style={{ color: C.ts, fontSize: 11, letterSpacing: 1, marginBottom: 14 }}>EDIT MEMBER NAME</div>
        <FieldLabel>DISPLAY NAME</FieldLabel>
        <TextField value={renameValue} onChange={setRenameValue} placeholder="Member name" />
        <div
          onClick={() => {
            setUsers(prev => prev.map(x => x.name === renaming ? { ...x, name: renameValue.trim() || x.name } : x));
            setRenaming(null);
          }}
          style={{ marginTop: 16, background: C.accent, borderRadius: 10, padding: '13px', textAlign: 'center', color: '#FFFFFF', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}
        >SAVE NAME</div>
      </SheetOverlay>

      <ConfirmDialog visible={!!confirm} {...(confirm || {})} onCancel={() => setConfirm(null)} onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }} />
    </div>
  );
};

// ─── SCREEN 17: Company Branding (Admin) ───────────────────────────────────────
// Decides whether black or white text/checkmark reads clearly on a given
// swatch colour, using standard relative luminance — needed once black and
// white are both selectable swatches, since a white checkmark disappears on
// a white swatch and a black one disappears on a black swatch.
const contrastTextColor = hex => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0D0D1A' : '#FFFFFF';
};

const CompanyBranding = ({ nav }) => {
  const { C, companyName, setCompanyName, companyPrimary, setCompanyPrimary, companySecondary, setCompanySecondary, companyLogoUploaded, setCompanyLogoUploaded } = useTheme();
  // Staged/local values — editable here, but only committed to the shared
  // app-wide state (and therefore visible anywhere else) when Save is tapped.
  const [name, setName] = useState(companyName);
  const [primary, setPrimary] = useState(companyPrimary);
  const [secondary, setSecondary] = useState(companySecondary);
  const [logoUploaded, setLogoUploaded] = useState(companyLogoUploaded);
  const [saved, setSaved] = useState(false);

  const swatches = {
    primary: [C.accent, '#1E4FD6', '#0E8F5C', '#6B21A8', '#B45309', '#000000', '#FFFFFF'],
    secondary: ['#D4A017', '#7A7A90', '#0EA5A5', '#DB2777', '#334155', '#000000', '#FFFFFF'],
  };

  const commit = () => {
    setCompanyName(name);
    setCompanyPrimary(primary);
    setCompanySecondary(secondary);
    setCompanyLogoUploaded(logoUploaded);
    setSaved(true);
  };

  const Swatch = ({ hex, selected, onSelect }) => (
    <div
      onClick={onSelect}
      style={{
        width: 36, height: 36, borderRadius: 10, background: hex, cursor: 'pointer',
        border: `1.5px solid ${C.border}`,                          // always-visible outline — matters most for white/near-white swatches
        boxShadow: selected ? `0 0 0 2.5px ${C.tp}` : 'none',       // selection ring, layered separately so it never fights the outline
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {selected && <span style={{ color: contrastTextColor(hex), fontSize: 14, fontWeight: 800 }}>✓</span>}
    </div>
  );

  return (
    <div style={{ height: '100%', background: C.bg, display: 'flex', flexDirection: 'column', transition: 'background 0.3s' }}>
      <TopBar title="Company Branding" back onBack={() => nav('admin_dashboard')} right={<Badge color={C.alert}>ADMIN</Badge>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10 }}>
          <span style={{ color: C.accent, flexShrink: 0 }}>🏢</span>
          <span style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>These settings apply platform-wide for every member of your company only. Other companies using Pro Force Secure never see or are affected by your branding.</span>
        </div>

        <div>
          <FieldLabel>COMPANY NAME</FieldLabel>
          <TextField value={name} onChange={setName} placeholder="Your company name" />
          <div style={{ color: C.ts2, fontSize: 11, marginTop: 6 }}>Shown on the login screen and throughout the app in place of "Pro Force Secure"</div>
        </div>

        <div>
          <FieldLabel>COMPANY LOGO</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              onClick={() => setLogoUploaded(true)}
              style={{
                width: 64, height: 64, borderRadius: 16,
                background: logoUploaded ? C.accentDim : C.surface2,
                border: `2px ${logoUploaded ? 'solid' : 'dashed'} ${logoUploaded ? C.accent : C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
              }}
            >
              {logoUploaded ? '🖼' : '📷'}
            </div>
            <div>
              <div style={{ color: C.ts, fontSize: 12, lineHeight: 1.5 }}>PNG or SVG, square, at least 512×512px. Replaces the shield icon used on the login screen and app icon.</div>
              {logoUploaded && <div style={{ color: C.success, fontSize: 12, marginTop: 6, fontWeight: 600 }}>✓ Logo selected — tap again to choose a different file</div>}
              {!logoUploaded && <div style={{ color: C.ts2, fontSize: 11, marginTop: 4 }}>Tap the box to simulate choosing a file for this prototype</div>}
            </div>
          </div>
        </div>

        <div>
          <FieldLabel>PRIMARY COLOR</FieldLabel>
          <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            {swatches.primary.map(hex => <Swatch key={hex} hex={hex} selected={primary === hex} onSelect={() => setPrimary(hex)} />)}
          </div>
          <div style={{ color: C.ts, fontSize: 12 }}>Used for buttons, active states, and accents throughout the app — this is the "Pro Force Crimson" equivalent for your company.</div>
        </div>

        <div>
          <FieldLabel>SECONDARY COLOR</FieldLabel>
          <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            {swatches.secondary.map(hex => <Swatch key={hex} hex={hex} selected={secondary === hex} onSelect={() => setSecondary(hex)} />)}
          </div>
          <div style={{ color: C.ts, fontSize: 12 }}>Used for secondary badges and highlights — the "Pro Force Gold" equivalent.</div>
        </div>

        <div>
          <FieldLabel>LIVE PREVIEW</FieldLabel>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: primary === '#FFFFFF' || primary === '#000000' ? `1.5px solid ${C.border}` : 'none' }}>{logoUploaded ? '🖼' : '🛡'}</div>
            <div style={{ color: C.tp, fontSize: 16, fontWeight: 800, fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1 }}>{name || 'Your Company'}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ padding: '8px 16px', borderRadius: 8, background: primary, color: contrastTextColor(primary), fontSize: 12, fontWeight: 700, border: primary === '#FFFFFF' ? `1px solid ${C.border}` : 'none' }}>Primary Button</div>
              <div style={{ padding: '8px 16px', borderRadius: 8, background: `${secondary}22`, color: secondary, fontSize: 12, fontWeight: 700, border: `1px solid ${secondary}44` }}>Badge</div>
            </div>
          </div>
        </div>

        <div onClick={commit} style={{ background: C.accent, borderRadius: 10, padding: '15px', textAlign: 'center', color: contrastTextColor(primary), fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', letterSpacing: 1, boxShadow: `0 4px 20px ${hexToRgba(C.accent, 0.35)}` }}>SAVE BRANDING</div>
        {saved && (
          <div style={{ textAlign: 'center', color: C.success, fontSize: 13 }}>✓ Saved — the app's colours, name, and icon have updated everywhere. Check the login screen or any other screen's top bar.</div>
        )}
      </div>
    </div>
  );
};

// ─── Screen Registry ───────────────────────────────────────────────────────────
const SCREENS = {
  invite_gate: InviteGate, register_verify_choice: RegisterVerifyChoice,
  register_phone: RegisterPhone, register_otp: RegisterOTP,
  register_email: RegisterEmail, register_email_sent: RegisterEmailSent,
  register_profile: RegisterProfile, company_feed: CompanyFeed, public_feed: PublicFeed, post_detail: PostDetail,
  create_post: CreatePost, groups_list: GroupsList, group_detail: GroupDetail,
  create_group: CreateGroup, profile_view: ProfileView, edit_profile: EditProfile,
  notifications_settings: NotificationsSettings, appearance_settings: AppearanceSettings,
  feed_display_settings: FeedDisplaySettings, member_invite: MemberInvite,
  login_screen: LoginScreen, login_faceid: LoginFaceID, login_appcode: LoginAppCode,
  reset_credentials: ResetCredentials, security_settings: SecuritySettings, set_app_code: SetAppCode,
  admin_dashboard: AdminDashboard,
  company_branding: CompanyBranding,
};

const SCREEN_GROUPS = [
  { label: 'Login', color: '#C41230', screens: [
    { id: 'login_screen', label: 'Login Screen' },
    { id: 'login_faceid', label: 'Login — Face ID' },
    { id: 'login_appcode', label: 'Login — App Code' },
    { id: 'reset_credentials', label: 'Reset Credentials' },
  ]},
  { label: 'Onboarding', color: '#8B6914', screens: [
    { id: 'invite_gate', label: 'Invite Gate ✦' },
    { id: 'register_verify_choice', label: 'Choose Verify Method ✦ NEW' },
    { id: 'register_phone', label: 'Enter Phone' },
    { id: 'register_otp', label: 'OTP Verify' },
    { id: 'register_email', label: 'Enter Email ✦ NEW' },
    { id: 'register_email_sent', label: 'Magic Link Sent ✦ NEW' },
    { id: 'register_profile', label: 'Profile Setup' },
  ]},
  { label: 'Main App', color: '#C41230', screens: [
    { id: 'company_feed', label: 'Company Feed ✦' },
    { id: 'public_feed', label: 'Public Feed ✦ NEW' },
    { id: 'post_detail', label: 'Post Detail' },
    { id: 'create_post', label: 'Create Post ✦' },
  ]},
  { label: 'Groups', color: '#D4A017', screens: [
    { id: 'groups_list', label: 'Groups List ✦' },
    { id: 'group_detail', label: 'Group Detail ✦' },
    { id: 'create_group', label: 'Create Group' },
  ]},
  { label: 'Profile & Settings', color: '#8B8BCC', screens: [
    { id: 'profile_view', label: 'My Profile ✦' },
    { id: 'edit_profile', label: 'Edit Profile' },
    { id: 'notifications_settings', label: 'Notifications' },
    { id: 'appearance_settings', label: 'Appearance' },
    { id: 'feed_display_settings', label: 'Feed Display' },
    { id: 'security_settings', label: 'Login & Security ✦' },
    { id: 'set_app_code', label: 'Set App Code' },
    { id: 'member_invite', label: 'Invite a Member ✦' },
  ]},
  { label: 'Admin', color: '#FF4757', screens: [
    { id: 'admin_dashboard', label: 'Admin Dashboard ✦' },
    { id: 'company_branding', label: 'Company Branding ✦ NEW' },
  ]},
];


// ─── Production exports ────────────────────────────────────────────────────────
export { SCREENS, ThemeCtx, DARK, LIGHT, hexToRgba };
