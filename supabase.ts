import { createClient, User as SupabaseUser, Session } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env and fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export type { SupabaseUser };

/**
 * Authentication Helpers
 */
export async function loginWithEmail(email: string, pass: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: pass,
  });
  if (error) throw error;
  return data.user;
}

export async function registerWithEmail(
  email: string,
  pass: string,
  displayName: string,
  handle: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password: pass,
    options: {
      data: {
        display_name: displayName,
        name: displayName,
        handle: handle.startsWith('@') ? handle : '@' + handle,
      },
    },
  });
  if (error) throw error;

  // Upsert user profile to 'users' table
  if (data.user) {
    try {
      await supabase.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        display_name: displayName,
        name: displayName,
        handle: handle.startsWith('@') ? handle : '@' + handle,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('User profile upsert note:', err);
    }
  }

  return data.user;
}

export async function loginAnonymously() {
  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (!error && data.user) {
      return data.user;
    }
  } catch (err) {
    console.warn('Anonymous auth note (may be disabled on project):', err);
  }

  // Fallback: create or sign in a deterministic guest demo user
  const guestEmail = `guest_${Math.random().toString(36).substring(2, 8)}@cipher.local`;
  const guestPass = 'CipherGuest123!';
  const { data, error } = await supabase.auth.signUp({
    email: guestEmail,
    password: guestPass,
    options: {
      data: {
        display_name: 'Guest User',
        name: 'Guest User',
        handle: '@guest',
      },
    },
  });
  if (error) throw error;
  return data.user;
}

export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) console.warn('Supabase sign out note:', error);
}

/**
 * Upload a photo (base64 data URL) to Supabase Storage.
 * Falls back to returning the base64 URL if storage upload fails or bucket is not created yet.
 */
export async function uploadPhotoToSupabaseStorage(
  dataUrl: string,
  filePath: string,
  bucketName = 'media'
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }

  try {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,(.+)$/);
    if (!match) return dataUrl;

    const contentType = match[1];
    const base64Data = match[2];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });

    const cleanPath = `${Date.now()}_${filePath.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    // Try primary bucket first, then 'photos' or 'public'
    const bucketsToTry = [bucketName, 'photos', 'public', 'attachments'];
    for (const b of bucketsToTry) {
      const { data, error } = await supabase.storage.from(b).upload(cleanPath, blob, {
        contentType,
        upsert: true,
      });

      if (!error && data) {
        const { data: publicData } = supabase.storage.from(b).getPublicUrl(cleanPath);
        if (publicData?.publicUrl) {
          return publicData.publicUrl;
        }
      }
    }
  } catch (err) {
    console.warn('Supabase storage upload note, preserving data URL:', err);
  }

  return dataUrl;
}

/**
 * Realtime Chat Messages Subscription
 */
export function subscribeToChatMessages(
  contactId: string,
  callback: (messages: any[]) => void
): () => void {
  let isSubscribed = true;

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && data && isSubscribed) {
        // Filter messages for this contact (either sender or recipient or chat_id matches)
        const filtered = data.filter((m: any) => {
          const s = String(m.sender_id || m.senderId || '');
          const r = String(m.recipient_id || m.recipientId || '');
          const c = String(m.chat_id || m.chatId || '');
          return (
            s === contactId ||
            r === contactId ||
            c === contactId ||
            c === `chat_${contactId}` ||
            (!s && !r && !c)
          );
        });

        callback(
          filtered.map((m: any) => ({
            id: String(m.id),
            senderId: m.sender_id || m.senderId || 'contact',
            recipientId: m.recipient_id || m.recipientId || 'me',
            ciphertext: m.ciphertext || m.payload || '',
            iv: m.iv || '',
            senderPublicKeyJwk:
              typeof m.sender_public_key_jwk === 'string'
                ? JSON.parse(m.sender_public_key_jwk || '{}')
                : m.sender_public_key_jwk || m.senderPublicKeyJwk || {},
            plaintextPreview: m.plaintext_preview || m.plaintextPreview || m.content || '',
            imageUrl: m.image_url || m.imageUrl || null,
            audioUrl: m.audio_url || m.audioUrl || null,
            voiceDuration: m.voice_duration || m.voiceDuration || 0,
            isViewOnce: !!(m.is_view_once ?? m.isViewOnce),
            viewOnceOpened: !!(m.view_once_opened ?? m.viewOnceOpened ?? m.is_viewed),
            reactions:
              typeof m.reactions === 'string'
                ? JSON.parse(m.reactions || '{}')
                : m.reactions || {},
            isStarred: !!(m.is_starred ?? m.isStarred),
            hasSafetyFlag: !!(m.has_safety_flag ?? m.hasSafetyFlag),
            safetyReason: m.safety_reason || m.safetyReason || '',
            timestamp: m.created_at ? new Date(m.created_at).getTime() : m.timestamp || Date.now(),
          }))
        );
      }
    } catch (err) {
      console.warn('Fetch messages note:', err);
    }
  };

  fetchMessages();

  // Supabase Realtime channel listener
  const channel = supabase
    .channel(`realtime:messages:${contactId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
      },
      () => {
        fetchMessages();
      }
    )
    .subscribe();

  return () => {
    isSubscribed = false;
    supabase.removeChannel(channel);
  };
}

/**
 * Send Chat Message to Supabase
 */
export async function sendChatMessageToSupabase(
  contactId: string,
  payload: {
    senderId: string;
    ciphertext: string;
    iv: string;
    senderPublicKeyJwk?: any;
    plaintextPreview?: string;
    hasSafetyFlag?: boolean;
    safetyReason?: string;
    voiceDuration?: number;
    isViewOnce?: boolean;
    viewOnceOpened?: boolean;
  }
) {
  const insertPayload = {
    chat_id: contactId,
    recipient_id: contactId,
    sender_id: payload.senderId,
    ciphertext: payload.ciphertext,
    iv: payload.iv,
    sender_public_key_jwk: payload.senderPublicKeyJwk
      ? JSON.stringify(payload.senderPublicKeyJwk)
      : null,
    plaintext_preview: payload.plaintextPreview || '',
    has_safety_flag: payload.hasSafetyFlag || false,
    safety_reason: payload.safetyReason || null,
    voice_duration: payload.voiceDuration || 0,
    is_view_once: payload.isViewOnce || false,
    view_once_opened: payload.viewOnceOpened || false,
    created_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from('messages').insert([insertPayload]);
    if (error) {
      // Try fallback with relaxed fields if schema differs
      await supabase.from('messages').insert([
        {
          sender_id: payload.senderId,
          recipient_id: contactId,
          content: payload.plaintextPreview || payload.ciphertext,
          created_at: new Date().toISOString(),
        },
      ]);
    }
  } catch (err) {
    console.warn('Send message note:', err);
  }
}

/**
 * Update Message Reactions
 */
export async function updateMessageReactionInSupabase(
  messageId: string,
  reactions: Record<string, string>
) {
  try {
    await supabase
      .from('messages')
      .update({ reactions: JSON.stringify(reactions) })
      .eq('id', messageId);
  } catch (err) {
    console.warn('Update reaction note:', err);
  }
}

/**
 * Mark View-Once Message Opened
 */
export async function markViewOnceOpenedInSupabase(messageId: string) {
  try {
    await supabase
      .from('messages')
      .update({
        view_once_opened: true,
        is_viewed: true,
        ciphertext: '[EXPIRED_VIEW_ONCE_PAYLOAD]',
      })
      .eq('id', messageId);
  } catch (err) {
    console.warn('Mark view once opened note:', err);
  }
}

/**
 * Realtime Stories Subscription
 */
export function subscribeToStoriesFromSupabase(
  callback: (stories: any[]) => void
): () => void {
  let isSubscribed = true;

  const fetchStories = async () => {
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && isSubscribed) {
        callback(
          data.map((s: any) => ({
            id: String(s.id),
            userId: s.user_id || s.userId || 'remote',
            userName: s.author || s.user_name || s.userName || 'Anonymous',
            userHandle: s.handle || s.user_handle || s.userHandle || '@user',
            userAvatarColor:
              s.avatar_color || s.userAvatarColor || 'from-indigo-500 to-cyan-500',
            imageUrl: s.image_url || s.image || s.imageUrl,
            text: s.caption || s.text || '',
            timestamp: s.created_at ? new Date(s.created_at).getTime() : Date.now(),
            expiresAt: s.expires_at ? new Date(s.expires_at).getTime() : Date.now() + 86400000,
            viewsCount: s.views_count || s.viewsCount || 0,
            hasSeen: !!(s.has_seen ?? s.hasSeen),
          }))
        );
      }
    } catch (err) {
      console.warn('Fetch stories note:', err);
    }
  };

  fetchStories();

  const channel = supabase
    .channel('realtime:stories')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'stories',
      },
      () => {
        fetchStories();
      }
    )
    .subscribe();

  return () => {
    isSubscribed = false;
    supabase.removeChannel(channel);
  };
}

export async function publishStoryToSupabase(story: {
  author: string;
  handle: string;
  avatarColor: string;
  image?: string;
  caption?: string;
  timestamp?: string;
}) {
  try {
    await supabase.from('stories').insert([
      {
        author: story.author,
        handle: story.handle,
        avatar_color: story.avatarColor,
        image_url: story.image,
        caption: story.caption,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (err) {
    console.warn('Publish story note:', err);
  }
}

/**
 * Realtime Posts Subscription
 */
export function subscribeToPostsFromSupabase(
  callback: (posts: any[]) => void
): () => void {
  let isSubscribed = true;

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && isSubscribed) {
        callback(
          data.map((p: any) => ({
            id: String(p.id),
            userId: p.user_id || p.userId || 'remote',
            userName: p.author || p.user_name || p.userName || 'Anonymous',
            userHandle: p.handle || p.user_handle || p.userHandle || '@user',
            userAvatarColor:
              p.avatar_color || p.userAvatarColor || 'from-cyan-500 to-blue-600',
            location: p.location || 'Mesh Node',
            distance: p.distance || 'Nearby',
            imageUrl: p.image_url || p.image || p.imageUrl,
            caption: p.caption || '',
            timestamp: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
            likes: Number(p.likes_count ?? p.likes ?? 0),
            isLiked: !!p.is_liked,
            commentsCount: Number(p.comments_count ?? p.comments ?? 0),
          }))
        );
      }
    } catch (err) {
      console.warn('Fetch posts note:', err);
    }
  };

  fetchPosts();

  const channel = supabase
    .channel('realtime:posts')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'posts',
      },
      () => {
        fetchPosts();
      }
    )
    .subscribe();

  return () => {
    isSubscribed = false;
    supabase.removeChannel(channel);
  };
}

export async function publishPostToSupabase(post: {
  author: string;
  handle: string;
  avatarColor: string;
  location: string;
  distance: string;
  image: string;
  caption: string;
  timestamp?: string;
}) {
  try {
    await supabase.from('posts').insert([
      {
        author: post.author,
        handle: post.handle,
        avatar_color: post.avatarColor,
        location: post.location,
        distance: post.distance,
        image_url: post.image,
        caption: post.caption,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (err) {
    console.warn('Publish post note:', err);
  }
}

export async function togglePostLikeInSupabase(postId: string, increment: number) {
  try {
    // Try updating likes count on posts table
    const { data: post } = await supabase
      .from('posts')
      .select('likes, likes_count')
      .eq('id', postId)
      .single();

    if (post) {
      const current = Number(post.likes_count ?? post.likes ?? 0);
      const nextLikes = Math.max(0, current + increment);
      await supabase
        .from('posts')
        .update({ likes: nextLikes, likes_count: nextLikes })
        .eq('id', postId);
    }
  } catch (err) {
    console.warn('Toggle like note:', err);
  }
}

/**
 * User Profile Sync & Discovery
 */
export async function syncUserProfileToSupabase(profile: {
  uid: string;
  displayName: string;
  handle: string;
  fingerprint: string;
  publicKeyJwk: JsonWebKey;
  isOnline: boolean;
}) {
  try {
    await supabase.from('users').upsert({
      id: profile.uid,
      display_name: profile.displayName,
      name: profile.displayName,
      handle: profile.handle,
      fingerprint: profile.fingerprint,
      public_key_jwk: JSON.stringify(profile.publicKeyJwk),
      is_online: profile.isOnline,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Sync user profile note:', err);
  }
}

export function subscribeToUsersFromSupabase(
  callback: (users: any[]) => void
): () => void {
  let isSubscribed = true;

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (!error && data && isSubscribed) {
        callback(data);
      }
    } catch (err) {
      console.warn('Fetch users note:', err);
    }
  };

  fetchUsers();

  const channel = supabase
    .channel('realtime:users')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'users',
      },
      () => {
        fetchUsers();
      }
    )
    .subscribe();

  return () => {
    isSubscribed = false;
    supabase.removeChannel(channel);
  };
}
