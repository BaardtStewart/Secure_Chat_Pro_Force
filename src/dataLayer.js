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

// ─────────────────────────────────────────────────────────────────────────
// Posts
// ─────────────────────────────────────────────────────────────────────────

// audience: 'company' | 'public' | 'groups'
// groupIds: only used when audience === 'groups' — one post row is created
// per selected group, since the schema ties a post to exactly one group
// (Section 4.11) rather than supporting a many-to-many post/group link.
// Posting to N groups genuinely creates N separate (identically-worded)
// posts, not one post visible in N places.
export async function createPost({ audience, groupIds, body, badgeLabel }) {
  const { userId, allMembersGroupId, publicGroupId } = await getMyCompanyContext();
  const { data: ciphertext, error: encErr } = await supabase.rpc('encrypt_field', { plaintext: body });
  if (encErr) throw encErr;

  let targets = [];
  if (audience === 'company') {
    if (!allMembersGroupId) throw new Error('Could not find your company\u2019s All Members group.');
    targets = [{ group_id: allMembersGroupId, visibility: 'all_members' }];
  } else if (audience === 'public') {
    if (!publicGroupId) throw new Error('The platform-wide Public group has not been provisioned yet.');
    targets = [{ group_id: publicGroupId, visibility: 'all_members' }];
  } else {
    if (!groupIds || groupIds.length === 0) throw new Error('Select at least one group to post to.');
    targets = groupIds.map(id => ({ group_id: id, visibility: 'group' }));
  }

  const rows = targets.map(t => ({
    group_id: t.group_id,
    author_id: userId,
    ciphertext,
    visibility: t.visibility,
    badge_label: badgeLabel || null,
  }));

  const { error: insertErr } = await supabase.from('posts').insert(rows);
  if (insertErr) throw insertErr;
  return rows.length;
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
