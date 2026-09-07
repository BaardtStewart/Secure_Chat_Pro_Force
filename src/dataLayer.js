import { supabase } from './supabaseClient.js';

// ─────────────────────────────────────────────────────────────────────────
// Company context — the current user's company_id, and the two "special"
// group ids every company/platform always has (All Members, Public).
// Fetched once and cached in memory for the session, since these rarely
// change and are needed by almost every screen that posts or lists groups.
// ─────────────────────────────────────────────────────────────────────────
let cachedContext = null;

export async function getMyCompanyContext(forceRefresh = false) {
  if (cachedContext && !forceRefresh) return cachedContext;

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) throw new Error('Not signed in.');

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, company_id')
    .eq('id', userData.user.id)
    .single();
  if (profErr) throw profErr;

  const { data: groups, error: groupsErr } = await supabase
    .from('groups')
    .select('id, is_all_members, is_platform_public')
    .or(`company_id.eq.${profile.company_id},is_platform_public.eq.true`);
  if (groupsErr) throw groupsErr;

  const allMembersGroup = groups.find(g => g.is_all_members);
  const publicGroup = groups.find(g => g.is_platform_public);

  cachedContext = {
    userId: userData.user.id,
    companyId: profile.company_id,
    allMembersGroupId: allMembersGroup?.id ?? null,
    publicGroupId: publicGroup?.id ?? null,
  };
  return cachedContext;
}

// Call this after anything that could change the cached values (e.g. sign
// out) so the next fetch is genuinely fresh rather than serving stale data
// from a previous session.
export function clearCompanyContextCache() {
  cachedContext = null;
}

// ─────────────────────────────────────────────────────────────────────────
// Feed
// ─────────────────────────────────────────────────────────────────────────

// Fetches everything the current user can see (RLS-equivalent logic is
// enforced server-side inside get_feed_posts itself — see Section 4.11 /
// 03_functions.sql), then splits it into the three feeds by scope. Done as
// one network call rather than three, since all three screens need the
// same underlying data, just filtered differently.
export async function fetchAllVisiblePosts() {
  const { data, error } = await supabase.rpc('get_feed_posts');
  if (error) throw error;
  return data || [];
}

export function filterCompanyPosts(allPosts) {
  return allPosts.filter(p => p.is_all_members_group && p.group_scope === 'company');
}
export function filterPublicPosts(allPosts) {
  return allPosts.filter(p => p.group_scope === 'platform');
}
export function filterGroupPosts(allPosts, groupId) {
  return allPosts.filter(p => p.group_id === groupId);
}

// ─────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────

export async function fetchMyGroups() {
  const { data, error } = await supabase.rpc('get_my_groups');
  if (error) throw error;
  return data || [];
}

// Aggregates get_my_groups() into the three numbers the bottom nav badges
// actually need — reuses the same real, per-group unread_count rather than
// a separate function, since get_my_groups() already computes exactly
// this on every fetch.
export async function fetchUnreadSummary() {
  const groups = await fetchMyGroups();
  const sum = list => list.reduce((total, g) => total + Number(g.unread_count || 0), 0);
  return {
    company: sum(groups.filter(g => g.is_all_members)),
    groups: sum(groups.filter(g => !g.is_all_members && !g.is_platform_public)),
    public: sum(groups.filter(g => g.is_platform_public)),
  };
}

// Call this whenever a feed is actually viewed, so its unread badge
// genuinely clears rather than staying stuck at whatever it showed when
// the app first loaded.
export async function markGroupRead(groupId) {
  if (!groupId) return;
  const { error } = await supabase.rpc('mark_group_read', { target_group_id: groupId });
  if (error) throw error;
}

// Only the closed/specific groups — excludes All Members and the platform
// Public group, which have their own dedicated tabs (Section 4.11).
export function filterClosedGroups(myGroups) {
  return myGroups.filter(g => !g.is_all_members && !g.is_platform_public);
}

export async function fetchDiscoverableGroups() {
  const { data, error } = await supabase.rpc('get_discoverable_groups');
  if (error) throw error;
  return data || [];
}

export async function joinGroup(groupId) {
  const { userId } = await getMyCompanyContext();
  const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: userId });
  if (error) throw error;
}

export async function fetchGroupMembers(groupId) {
  const { data, error } = await supabase.rpc('get_group_members', { target_group_id: groupId });
  if (error) throw error;
  return data || [];
}

export async function createGroup({ name, description, location, visibility }) {
  const { companyId, userId } = await getMyCompanyContext();
  const { data, error } = await supabase
    .from('groups')
    .insert({
      company_id: companyId,
      scope: 'company',
      name,
      description: description || null,
      location: location || null,
      visibility,
      created_by: userId,
    })
    .select('id, name')
    .single();
  if (error) throw error;
  return data;
}

// Powers Settings/Profile View — the real logged-in person's own details,
// combining the narrowly-scoped decrypt RPC (name/about/phone/email) with
// the plain, non-sensitive columns (role, verification method) that don't
// need decryption at all.
export async function fetchMyProfileSummary() {
  const { userId } = await getMyCompanyContext();
  const [{ data: decrypted, error: decErr }, { data: row, error: rowErr }] = await Promise.all([
    supabase.rpc('get_my_full_profile_decrypted').single(),
    supabase.from('profiles').select('role, verification_method, phone_verified, email_verified').eq('id', userId).single(),
  ]);
  if (decErr) throw decErr;
  if (rowErr) throw rowErr;
  return {
    displayName: decrypted.display_name,
    about: decrypted.about,
    phone: decrypted.phone,
    email: decrypted.email,
    role: row.role,
    verificationMethod: row.verification_method,
    phoneVerified: row.phone_verified,
    emailVerified: row.email_verified,
  };
}

export async function signOut() {
  clearCompanyContextCache();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Powers Invite Gate's real validation — checks the token immediately and
// surfaces which company it belongs to, rather than silently deferring
// that check to the very end of registration (Section 4.9's
// validate_invite already does the real work; this just wraps it and
// normalizes the single-row-or-array shape Postgres RPCs return).
export async function validateInviteToken(token) {
  if (!token) return { valid: false, reason: 'missing' };
  const { data, error } = await supabase.rpc('validate_invite', { raw_token: token });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.valid) return { valid: false, reason: result?.reason || 'invalid' };
  return { valid: true, companyId: result.company_id, companyName: result.company_name || 'this company', groupId: result.group_id };
}

// ─────────────────────────────────────────────────────────────────────────
// Invites
// ─────────────────────────────────────────────────────────────────────────

// groupId is optional — omit it to generate a company-wide invite (the
// normal case), or pass a specific group's id to invite someone directly
// into that one group. Returns both the raw token and the ready-to-share
// URL, since every screen that generates an invite needs both.
export async function createInvite(groupId = null) {
  const { data: token, error } = await supabase.rpc('create_invite', { target_group_id: groupId });
  if (error) throw error;
  const url = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(token)}`;
  return { token, url };
}

// Powers "Your recent invites" — real rows from the invites table you
// created, not the placeholder example that used to sit there. Resolves
// each used invite's consumer name via the same narrowly-scoped decrypt
// used everywhere else (get_profile_decrypted), rather than a new
// generic lookup.
export async function fetchMyRecentInvites(limit = 5) {
  const { userId } = await getMyCompanyContext();
  const { data, error } = await supabase
    .from('invites')
    .select('id, created_at, consumed_at, consumed_by, expires_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return Promise.all((data || []).map(async inv => {
    let consumedByName = null;
    if (inv.consumed_by) {
      try {
        const { data: profile } = await supabase.rpc('get_profile_decrypted', { target_user_id: inv.consumed_by }).single();
        consumedByName = profile?.display_name || null;
      } catch { /* they may have left the company since, or a lookup hiccup — the row still displays fine without a name */ }
    }
    const status = inv.consumed_at ? 'used' : (new Date(inv.expires_at) < new Date() ? 'expired' : 'pending');
    return { id: inv.id, createdAt: inv.created_at, status, consumedByName };
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Posts
// ─────────────────────────────────────────────────────────────────────────

export function filterPostById(allPosts, postId) {
  return allPosts.find(p => p.id === postId) || null;
}

// audiences: array — any combination of 'company' | 'public' | 'groups'.
// A single post creation action can genuinely target more than one feed
// at once (e.g. Company AND Public together) — each target still becomes
// its own separate post row, since the schema ties one post to exactly
// one group (Section 4.11), but the person only has to compose once.
// media, if provided, is { path, type } and is attached to every row
// created this way.
export async function createPost({ audiences, groupIds, body, badgeLabel, media }) {
  const { userId, allMembersGroupId, publicGroupId } = await getMyCompanyContext();
  const { data: ciphertext, error: encErr } = await supabase.rpc('encrypt_field', { plaintext: body });
  if (encErr) throw encErr;

  const targets = [];
  if (audiences.includes('company')) {
    if (!allMembersGroupId) throw new Error('Could not find your company\u2019s All Members group.');
    targets.push({ group_id: allMembersGroupId, visibility: 'all_members' });
  }
  if (audiences.includes('public')) {
    if (!publicGroupId) throw new Error('The platform-wide Public group has not been provisioned yet.');
    targets.push({ group_id: publicGroupId, visibility: 'all_members' });
  }
  if (audiences.includes('groups')) {
    if (!groupIds || groupIds.length === 0) throw new Error('Select at least one group to post to.');
    groupIds.forEach(id => targets.push({ group_id: id, visibility: 'group' }));
  }
  if (targets.length === 0) throw new Error('Choose at least one place to post to.');

  const rows = targets.map(t => ({
    group_id: t.group_id,
    author_id: userId,
    ciphertext,
    visibility: t.visibility,
    badge_label: badgeLabel || null,
    has_media: !!media,
  }));

  const { data: inserted, error: insertErr } = await supabase.from('posts').insert(rows).select('id');
  if (insertErr) throw insertErr;

  if (media && inserted?.length) {
    const mediaRows = inserted.map(p => ({ post_id: p.id, storage_path: media.path, media_type: media.type }));
    const { error: mediaErr } = await supabase.from('post_media').insert(mediaRows);
    if (mediaErr) throw mediaErr; // the posts themselves already succeeded — see note in CreatePost UI about this partial-failure case
  }

  return rows.length;
}

export async function updatePost(postId, newBody) {
  const { data: ciphertext, error: encErr } = await supabase.rpc('encrypt_field', { plaintext: newBody });
  if (encErr) throw encErr;
  const { error } = await supabase.from('posts').update({ ciphertext }).eq('id', postId);
  if (error) throw error;
}

export async function deletePost(postId) {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

export async function toggleLike(postId, currentlyLiked) {
  const { userId } = await getMyCompanyContext();
  if (currentlyLiked) {
    const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
    if (error) throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────────

export async function fetchPostComments(postId) {
  const { data, error } = await supabase.rpc('get_post_comments', { target_post_id: postId });
  if (error) throw error;
  return data || [];
}

export async function addComment(postId, body) {
  const { userId } = await getMyCompanyContext();
  const { data: ciphertext, error: encErr } = await supabase.rpc('encrypt_field', { plaintext: body });
  if (encErr) throw encErr;
  const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: userId, ciphertext });
  if (error) throw error;
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────
// Media upload — real Supabase Storage, not a local-only mock chip.
// Bucket is public (see 02_rls_policies.sql for exactly why, and the
// honest limitation that comes with it: anyone with the resulting URL can
// view the file, since storage access isn't yet re-checking the same
// per-post visibility rules the posts table itself enforces).
// ─────────────────────────────────────────────────────────────────────────

export async function uploadPostMedia(file, type) {
  const { userId } = await getMyCompanyContext();
  const ext = file.name.split('.').pop();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('post-media').upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('post-media').getPublicUrl(path);
  return { path, type, url: data.publicUrl };
}
