import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Contact,
  Message,
  EncryptedPayload,
  Story,
  Post,
  FriendUser,
  ThemeMode,
  CallSession,
} from '../types';
import {
  generateECDHKeyPair,
  exportKey,
  computeKeyFingerprint,
  encryptMessage,
  decryptMessage,
  importPublicKey,
  generateSafetyNumber,
} from '../crypto/e2e';
import {
  checkBiometricSupport,
  authenticateWithBiometrics,
  BiometricAvailability,
} from '../crypto/biometrics';
import {
  validateUsernameFormat,
  isUsernameAvailable,
  generateUniqueSuggestions,
} from '../crypto/usernameAlgorithm';
import { scanContentSafety } from '../crypto/safetyScanner';
import {
  supabase,
  SupabaseUser,
  loginWithEmail,
  registerWithEmail,
  loginAnonymously,
  logoutUser,
  uploadPhotoToSupabaseStorage,
  subscribeToChatMessages,
  sendChatMessageToSupabase,
  updateMessageReactionInSupabase,
  markViewOnceOpenedInSupabase,
  subscribeToStoriesFromSupabase,
  publishStoryToSupabase,
  subscribeToPostsFromSupabase,
  publishPostToSupabase,
  togglePostLikeInSupabase,
  syncUserProfileToSupabase,
  subscribeToUsersFromSupabase,
} from '../supabase';

export function useMessenger() {
  // Theme Engine State
  const [theme, setTheme] = useState<ThemeMode>('obsidian');
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);

  // Session & Cryptography State
  const [userKeyPair, setUserKeyPair] = useState<CryptoKeyPair | null>(null);
  const [userPublicKeyJwk, setUserPublicKeyJwk] = useState<JsonWebKey | null>(null);
  const [userFingerprint, setUserFingerprint] = useState<string>('');
  const [currentUsername, setCurrentUsername] = useState<string>('alex.cipher');

  // Supabase Authentication & Cloud Sync State
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [supabaseAuthError, setSupabaseAuthError] = useState<string | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(true);

  // Biometric & Lock State
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [biometricInfo, setBiometricInfo] = useState<BiometricAvailability | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [biometricEnrolled, setBiometricEnrolled] = useState<boolean>(true);
  const [autoLockSeconds, setAutoLockSeconds] = useState<number>(300); // 5 minutes

  // Active View Tab in Sidebar/Navigation
  const [activeTab, setActiveTab] = useState<'chats' | 'stories' | 'discover' | 'posts'>('chats');

  // Chat & Contact State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [messagesByContact, setMessagesByContact] = useState<Record<string, Message[]>>({});
  const [isContactTyping, setIsContactTyping] = useState<boolean>(false);

  // E2E Call Session State (WhatsApp feature)
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);

  // Stories System State
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [isCreateStoryOpen, setIsCreateStoryOpen] = useState<boolean>(false);

  // Photo Posts System State
  const [posts, setPosts] = useState<Post[]>([]);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState<boolean>(false);

  // Friendship / Global Discovery Directory State
  const [discoverUsers, setDiscoverUsers] = useState<FriendUser[]>([]);

  // Modals & Inspection
  const [inspectingMessage, setInspectingMessage] = useState<Message | null>(null);
  const [safetyNumberContact, setSafetyNumberContact] = useState<Contact | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState<boolean>(false);
  const [cipherViewMode, setCipherViewMode] = useState<boolean>(false);

  // Inactive lock timer
  const lastActiveRef = useRef<number>(Date.now());

  // 1. Supabase Authentication Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
      setAuthLoading(false);
      if (session?.user) {
        const u = session.user;
        const dName =
          u.user_metadata?.display_name ||
          u.user_metadata?.name ||
          u.email?.split('@')[0] ||
          'Encrypted User';
        setCurrentUsername(dName.toLowerCase().replace(/\s+/g, '.'));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      setAuthLoading(false);
      if (user) {
        const dName =
          user.user_metadata?.display_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'Encrypted User';
        setCurrentUsername(dName.toLowerCase().replace(/\s+/g, '.'));

        if (userPublicKeyJwk && userFingerprint) {
          syncUserProfileToSupabase({
            uid: user.id,
            displayName: dName,
            handle: '@' + (user.user_metadata?.handle || dName.toLowerCase().replace(/\s+/g, '.')),
            fingerprint: userFingerprint,
            publicKeyJwk: userPublicKeyJwk,
            isOnline: true,
          });
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [userPublicKeyJwk, userFingerprint]);

  // 2. Initialize Cryptographic Keys and Base Contacts
  useEffect(() => {
    async function initKeys() {
      try {
        const support = await checkBiometricSupport();
        setBiometricInfo(support);

        // Generate User's real ECDH P-256 key pair
        const keyPair = await generateECDHKeyPair();
        const pubJwk = await exportKey(keyPair.publicKey);
        const fingerprint = await computeKeyFingerprint(pubJwk);

        setUserKeyPair(keyPair);
        setUserPublicKeyJwk(pubJwk);
        setUserFingerprint(fingerprint);

        // Generate initial contacts with genuine cryptographic keys
        const contactSeeds = [
          {
            id: 'c-elena',
            name: 'Elena Vance',
            handle: '@elena.v',
            avatarColor: 'from-cyan-500 to-blue-600',
            status: 'online' as const,
            initialMsg: 'Our ECDH handshake is verified. Real-time Supabase synchronization is active.',
          },
          {
            id: 'c-marcus',
            name: 'Dr. Marcus Chen',
            handle: '@marcus.c',
            avatarColor: 'from-indigo-500 to-purple-600',
            status: 'online' as const,
            initialMsg: 'The AES-256-GCM authentication tags match. Everything is synced across devices via Supabase.',
          },
          {
            id: 'c-aria',
            name: 'Aria Solis',
            handle: '@aria.zk',
            avatarColor: 'from-emerald-500 to-teal-600',
            status: 'last seen recently' as const,
            initialMsg: 'Quick note: Supabase Realtime channels deliver instant updates across clients.',
          },
        ];

        const initializedContacts: Contact[] = [];
        const initialMessagesMap: Record<string, Message[]> = {};

        for (const seed of contactSeeds) {
          const cKeyPair = await generateECDHKeyPair();
          const cPubJwk = await exportKey(cKeyPair.publicKey);
          const cFingerprint = await computeKeyFingerprint(cPubJwk);

          const encryptedPayload = await encryptMessage(
            seed.initialMsg,
            keyPair.publicKey,
            cKeyPair.privateKey,
            cPubJwk
          );

          const decrypted = await decryptMessage(encryptedPayload, keyPair.privateKey);

          const contactObj: Contact = {
            id: seed.id,
            name: seed.name,
            handle: seed.handle,
            avatarColor: seed.avatarColor,
            publicKeyJwk: cPubJwk,
            publicKeyFingerprint: cFingerprint,
            status: seed.status,
            isVerified: seed.id === 'c-elena',
            unreadCount: 0,
            lastMessage: decrypted,
            lastMessageTime: Date.now() - 1000 * 60 * 15,
            disappearingTime: 0,
          };

          initializedContacts.push(contactObj);

          initialMessagesMap[seed.id] = [
            {
              id: 'm-' + Math.random().toString(36).substring(2, 9),
              senderId: seed.id,
              recipientId: 'me',
              plaintext: decrypted,
              encryptedPayload,
              timestamp: Date.now() - 1000 * 60 * 15,
              status: 'read',
              isDecrypted: true,
            },
          ];
        }

        setContacts(initializedContacts);
        setMessagesByContact(initialMessagesMap);
        setActiveContactId(initializedContacts[0].id);

        // Seed Initial Stories
        const initialStories: Story[] = [
          {
            id: 'story-elena',
            userId: 'c-elena',
            userName: 'Elena Vance',
            userHandle: '@elena.v',
            userAvatarColor: 'from-cyan-500 to-blue-600',
            imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80',
            text: 'Verifying P-256 ratchets at the Alpine summit 🏔️ Zero metadata leak.',
            timestamp: Date.now() - 1000 * 60 * 120,
            expiresAt: Date.now() + 1000 * 60 * 60 * 22,
            viewsCount: 28,
            hasSeen: false,
          },
          {
            id: 'story-marcus',
            userId: 'c-marcus',
            userName: 'Dr. Marcus Chen',
            userHandle: '@marcus.c',
            userAvatarColor: 'from-indigo-500 to-purple-600',
            imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
            text: 'Hardware security module telemetry: 100% entropy preserved ⚡',
            timestamp: Date.now() - 1000 * 60 * 240,
            expiresAt: Date.now() + 1000 * 60 * 60 * 20,
            viewsCount: 45,
            hasSeen: false,
          },
          {
            id: 'story-aria',
            userId: 'c-aria',
            userName: 'Aria Solis',
            userHandle: '@aria.zk',
            userAvatarColor: 'from-emerald-500 to-teal-600',
            gradientBg: 'from-purple-900 via-indigo-900 to-slate-900',
            text: 'Ephemeral keys regenerated every session. Privacy is a fundamental human right. 🛡️',
            timestamp: Date.now() - 1000 * 60 * 360,
            expiresAt: Date.now() + 1000 * 60 * 60 * 18,
            viewsCount: 62,
            hasSeen: false,
          },
        ];
        setStories(initialStories);

        // Seed Initial Photo Posts
        const initialPosts: Post[] = [
          {
            id: 'post-1',
            userId: 'c-elena',
            userName: 'Elena Vance',
            userHandle: '@elena.v',
            userAvatarColor: 'from-cyan-500 to-blue-600',
            imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1000&auto=format&fit=crop&q=80',
            caption: 'Field testing our decentralized mesh node in the Swiss Alps. Keys never leave the local enclave 🏔️✨ #privacy #e2ee #freedom',
            location: 'Zermatt, Switzerland',
            distance: '6,420 km away',
            timestamp: Date.now() - 1000 * 60 * 180,
            likes: 142,
            isLiked: false,
            commentsCount: 18,
          },
          {
            id: 'post-2',
            userId: 'c-marcus',
            userName: 'Dr. Marcus Chen',
            userHandle: '@marcus.c',
            userAvatarColor: 'from-indigo-500 to-purple-600',
            imageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1000&auto=format&fit=crop&q=80',
            caption: 'Auditing constant-time scalar multiplication against side-channel electromagnetic emissions. Clean trace spectrum! 🔬🛡️',
            location: 'MIT Cryptography Lab, Cambridge',
            distance: '1,150 km away',
            timestamp: Date.now() - 1000 * 60 * 360,
            likes: 98,
            isLiked: true,
            commentsCount: 9,
          },
        ];
        setPosts(initialPosts);

        // Seed Discovery Directory Users
        const initialDiscover: FriendUser[] = [
          {
            id: 'disc-tariq',
            name: 'Tariq Al-Mansoor',
            handle: '@tariq.sec',
            bio: 'Applied cryptography researcher, post-quantum lattices, zero-knowledge proofs.',
            location: 'Dubai, UAE',
            distance: '3,800 km away',
            avatarColor: 'from-amber-500 to-red-600',
            publicKeyFingerprint: '9B2E-44A1-FF08-1123',
            mutualFriends: 2,
            status: 'online',
            isFriend: false,
          },
          {
            id: 'disc-maya',
            name: 'Maya Lin',
            handle: '@maya.neo',
            bio: 'Zero-knowledge proofs, cybersecurity architecture & privacy advocacy.',
            location: 'London, UK',
            distance: '7,400 km away',
            avatarColor: 'from-fuchsia-500 to-pink-600',
            publicKeyFingerprint: '7C30-88DE-22F1-9980',
            mutualFriends: 4,
            status: 'online',
            isFriend: false,
          },
          {
            id: 'disc-david',
            name: 'David Morales',
            handle: '@david.zk',
            bio: 'Distributed systems engineer. Never send anything unencrypted over the open wire.',
            location: 'New York, USA',
            distance: '11,200 km away',
            avatarColor: 'from-blue-500 to-cyan-600',
            publicKeyFingerprint: '3F19-55BC-AA44-6721',
            mutualFriends: 1,
            status: 'offline',
            isFriend: false,
          },
        ];
        setDiscoverUsers(initialDiscover);
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }

    initKeys();
  }, []);

  // 3. Real-Time Supabase Sync for Active Chat Messages
  useEffect(() => {
    if (!activeContactId) return;

    setIsCloudSyncing(true);
    const unsubscribe = subscribeToChatMessages(activeContactId, async (remoteMsgs) => {
      if (!remoteMsgs || remoteMsgs.length === 0) {
        setIsCloudSyncing(false);
        return;
      }

      const convertedMsgs: Message[] = [];

      for (const rm of remoteMsgs) {
        let plaintext = rm.plaintextPreview || '';
        let isDecrypted = true;

        if (rm.ciphertext && rm.ciphertext !== '[EXPIRED_VIEW_ONCE_PAYLOAD]') {
          if (rm.plaintextPreview) {
            plaintext = rm.plaintextPreview;
          } else if (userKeyPair && rm.senderId !== 'me' && rm.senderId !== currentUser?.id) {
            try {
              const decrypted = await decryptMessage(
                {
                  algorithm: 'ECDH-P256+AES-GCM-256',
                  ciphertext: rm.ciphertext,
                  iv: rm.iv,
                  senderPublicKeyJwk: JSON.stringify(rm.senderPublicKeyJwk || {}),
                  timestamp: rm.timestamp || Date.now(),
                  ephemeralKeyId: 'live',
                },
                userKeyPair.privateKey
              );
              plaintext = decrypted;
            } catch {
              plaintext = rm.plaintextPreview || '🔒 Encrypted message';
              isDecrypted = false;
            }
          }
        }

        const isFromMe = rm.senderId === 'me' || (currentUser && rm.senderId === currentUser.id);

        convertedMsgs.push({
          id: rm.id,
          senderId: isFromMe ? 'me' : rm.senderId || activeContactId,
          recipientId: isFromMe ? activeContactId : 'me',
          plaintext: plaintext || '🔒 Encrypted message',
          encryptedPayload: {
            algorithm: 'ECDH-P256+AES-GCM-256',
            ciphertext: rm.ciphertext || '',
            iv: rm.iv || '',
            senderPublicKeyJwk: JSON.stringify(rm.senderPublicKeyJwk || {}),
            timestamp: rm.timestamp || Date.now(),
            ephemeralKeyId: 'live',
          },
          timestamp: rm.timestamp || Date.now(),
          status: 'delivered',
          isDecrypted,
          imageUrl: rm.imageUrl,
          audioUrl: rm.audioUrl,
          audioDuration: rm.voiceDuration,
          isViewOnce: rm.isViewOnce,
          isViewed: rm.viewOnceOpened,
          reactions: rm.reactions || {},
          isStarred: rm.isStarred || false,
          safetyStatus: rm.hasSafetyFlag ? 'warning' : 'safe',
          safetyWarning: rm.safetyReason,
        });
      }

      setMessagesByContact((prev) => {
        const localList = prev[activeContactId] || [];
        const remoteIds = new Set(convertedMsgs.map((m) => m.id));
        const pendingLocal = localList.filter(
          (m) => !remoteIds.has(m.id) && m.id.startsWith('m-local-')
        );

        const merged = [...convertedMsgs, ...pendingLocal].sort(
          (a, b) => a.timestamp - b.timestamp
        );
        return {
          ...prev,
          [activeContactId]: merged,
        };
      });

      if (convertedMsgs.length > 0) {
        const latest = convertedMsgs[convertedMsgs.length - 1];
        setContacts((prev) =>
          prev.map((c) =>
            c.id === activeContactId
              ? {
                  ...c,
                  lastMessage: latest.plaintext,
                  lastMessageTime: latest.timestamp,
                }
              : c
          )
        );
      }
      setIsCloudSyncing(false);
    });

    return () => unsubscribe();
  }, [activeContactId, userKeyPair, contacts, currentUser]);

  // 4. Real-Time Supabase Sync for Stories & Posts
  useEffect(() => {
    const unsubStories = subscribeToStoriesFromSupabase((remoteStories) => {
      if (!remoteStories || remoteStories.length === 0) return;
      setStories((prev) => {
        const map = new Map<string, Story>();
        prev.forEach((s) => map.set(s.id, s));
        remoteStories.forEach((rs) => {
          map.set(rs.id, {
            id: rs.id,
            userId: rs.userId || 'remote',
            userName: rs.userName || 'Anonymous',
            userHandle: rs.userHandle || '@user',
            userAvatarColor: rs.userAvatarColor || 'from-indigo-500 to-cyan-500',
            imageUrl: rs.imageUrl,
            text: rs.text,
            timestamp: rs.timestamp || Date.now(),
            expiresAt: rs.expiresAt || Date.now() + 86400000,
            viewsCount: rs.viewsCount || 0,
            hasSeen: rs.hasSeen || false,
          });
        });
        return Array.from(map.values());
      });
    });

    const unsubPosts = subscribeToPostsFromSupabase((remotePosts) => {
      if (!remotePosts || remotePosts.length === 0) return;
      setPosts((prev) => {
        const map = new Map<string, Post>();
        prev.forEach((p) => map.set(p.id, p));
        remotePosts.forEach((rp) => {
          map.set(rp.id, {
            id: rp.id,
            userId: rp.userId || 'remote',
            userName: rp.userName || 'Anonymous',
            userHandle: rp.userHandle || '@user',
            userAvatarColor: rp.userAvatarColor || 'from-cyan-500 to-blue-600',
            location: rp.location || 'Remote Mesh',
            distance: rp.distance || '1,200 km away',
            imageUrl: rp.imageUrl,
            caption: rp.caption || '',
            timestamp: rp.timestamp || Date.now(),
            likes: rp.likes ?? 0,
            isLiked: rp.isLiked || false,
            commentsCount: rp.commentsCount ?? 0,
          });
        });
        return Array.from(map.values());
      });
    });

    return () => {
      unsubStories();
      unsubPosts();
    };
  }, []);

  // 5. Inactivity auto-lock listener
  useEffect(() => {
    if (!isUnlocked || !biometricEnrolled) return;

    const handleActivity = () => {
      lastActiveRef.current = Date.now();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    const interval = setInterval(() => {
      if (Date.now() - lastActiveRef.current > autoLockSeconds * 1000) {
        setIsUnlocked(false);
      }
    }, 10000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearInterval(interval);
    };
  }, [isUnlocked, biometricEnrolled, autoLockSeconds]);

  // 6. Disappearing messages countdown tick
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setMessagesByContact((prev) => {
        let hasChanges = false;
        const nextState = { ...prev };

        for (const contactId in nextState) {
          const list = nextState[contactId];
          const filtered = list.filter((m) => !m.expiresAt || m.expiresAt > now);
          if (filtered.length !== list.length) {
            hasChanges = true;
            nextState[contactId] = filtered;
          }
        }

        return hasChanges ? nextState : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Authentication Handlers
  const signInWithEmail = useCallback(async (email: string, pass: string) => {
    setSupabaseAuthError(null);
    try {
      await loginWithEmail(email, pass);
    } catch (err: any) {
      setSupabaseAuthError(err.message || 'Login failed');
      throw err;
    }
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, pass: string, name: string, handle: string) => {
      setSupabaseAuthError(null);
      try {
        const user = await registerWithEmail(email, pass, name, handle);
        if (user && userPublicKeyJwk && userFingerprint) {
          await syncUserProfileToSupabase({
            uid: user.id,
            displayName: name,
            handle: handle.startsWith('@') ? handle : '@' + handle,
            fingerprint: userFingerprint,
            publicKeyJwk: userPublicKeyJwk,
            isOnline: true,
          });
        }
      } catch (err: any) {
        setSupabaseAuthError(err.message || 'Registration failed');
        throw err;
      }
    },
    [userPublicKeyJwk, userFingerprint]
  );

  const signInGuest = useCallback(async () => {
    setSupabaseAuthError(null);
    try {
      await loginAnonymously();
    } catch (err: any) {
      setSupabaseAuthError(err.message || 'Guest login failed');
      throw err;
    }
  }, []);

  const signOutAccount = useCallback(async () => {
    try {
      await logoutUser();
      setIsUnlocked(false);
      setCurrentUser(null);
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  }, []);

  // Biometric Unlock Handler
  const unlockWithBiometrics = useCallback(async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const result = await authenticateWithBiometrics('Unlock Secure Messenger');
      if (result.success) {
        setIsUnlocked(true);
        lastActiveRef.current = Date.now();
      } else {
        setAuthError(result.error || 'Biometric verification failed');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication error');
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const lockApp = useCallback(() => {
    setIsUnlocked(false);
  }, []);

  // Send Encrypted Message with Supabase Sync
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !activeContactId || !userKeyPair || !userPublicKeyJwk) return;

      const activeContact = contacts.find((c) => c.id === activeContactId);
      if (!activeContact) return;

      const safetyCheck = scanContentSafety(
        text.trim(),
        '@' + currentUsername,
        contacts.map((c) => c.handle)
      );

      const contactPublicKey = await importPublicKey(activeContact.publicKeyJwk);

      const payload: EncryptedPayload = await encryptMessage(
        text.trim(),
        contactPublicKey,
        userKeyPair.privateKey,
        userPublicKeyJwk
      );

      const msgId = 'm-local-' + Math.random().toString(36).substring(2, 9);
      const disappearingTime = activeContact.disappearingTime || 0;
      const expiresAt = disappearingTime > 0 ? Date.now() + disappearingTime * 1000 : undefined;

      const newMsg: Message = {
        id: msgId,
        senderId: 'me',
        recipientId: activeContactId,
        plaintext: text.trim(),
        encryptedPayload: payload,
        timestamp: Date.now(),
        status: 'sent',
        isDecrypted: true,
        safetyStatus: safetyCheck.status,
        safetyWarning: safetyCheck.warning,
        expiresAt,
        expiresInSeconds: disappearingTime > 0 ? disappearingTime : undefined,
      };

      // Optimistic update
      setMessagesByContact((prev) => ({
        ...prev,
        [activeContactId]: [...(prev[activeContactId] || []), newMsg],
      }));

      setContacts((prev) =>
        prev.map((c) =>
          c.id === activeContactId
            ? { ...c, lastMessage: text.trim(), lastMessageTime: Date.now() }
            : c
        )
      );

      // Write to Supabase table 'messages'
      sendChatMessageToSupabase(activeContactId, {
        senderId: currentUser?.id || 'me',
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        senderPublicKeyJwk: userPublicKeyJwk,
        plaintextPreview: text.trim(),
        hasSafetyFlag: safetyCheck.status !== 'safe',
        safetyReason: safetyCheck.warning,
      }).catch((err) => {
        console.warn('Supabase message sync note:', err);
      });

      // Simulate contact reply if chatting with bot contact
      if (activeContact.id.startsWith('c-')) {
        setTimeout(async () => {
          setIsContactTyping(true);

          setTimeout(async () => {
            setIsContactTyping(false);

            const replies = [
              `Ciphertext received via Supabase Realtime channel and verified with AES auth tag.`,
              `Acknowledged. Cryptographic ratchet in sync across all connected clients.`,
              `Decrypted payload: "${text.length > 25 ? text.substring(0, 22) + '...' : text}"`,
              `Perfect forward secrecy confirmed. All ephemeral keys cycled.`,
            ];
            const replyText = replies[Math.floor(Math.random() * replies.length)];

            const simContactKeyPair = await generateECDHKeyPair();
            const simContactPubJwk = await exportKey(simContactKeyPair.publicKey);

            const replyPayload = await encryptMessage(
              replyText,
              userKeyPair.publicKey,
              simContactKeyPair.privateKey,
              simContactPubJwk
            );

            // Write simulated contact reply to Supabase
            sendChatMessageToSupabase(activeContactId, {
              senderId: activeContactId,
              ciphertext: replyPayload.ciphertext,
              iv: replyPayload.iv,
              senderPublicKeyJwk: simContactPubJwk,
              plaintextPreview: replyText,
            }).catch(() => {
              const replyId = 'm-' + Math.random().toString(36).substring(2, 9);
              setMessagesByContact((prev) => ({
                ...prev,
                [activeContactId]: [
                  ...(prev[activeContactId] || []),
                  {
                    id: replyId,
                    senderId: activeContactId,
                    recipientId: 'me',
                    plaintext: replyText,
                    encryptedPayload: replyPayload,
                    timestamp: Date.now(),
                    status: 'read',
                    isDecrypted: true,
                  },
                ],
              }));
            });
          }, 1200);
        }, 1000);
      }
    },
    [activeContactId, userKeyPair, userPublicKeyJwk, contacts, currentUsername, currentUser]
  );

  // Send Voice Note with Supabase Sync
  const sendVoiceNote = useCallback(
    async (audioUrl: string, duration: number) => {
      if (!activeContactId || !userKeyPair || !userPublicKeyJwk) return;
      const activeContact = contacts.find((c) => c.id === activeContactId);
      if (!activeContact) return;

      const contactPublicKey = await importPublicKey(activeContact.publicKeyJwk);
      const textToEncrypt = `[VOICE NOTE • ${duration}s • AES-256-GCM]`;

      const payload: EncryptedPayload = await encryptMessage(
        textToEncrypt,
        contactPublicKey,
        userKeyPair.privateKey,
        userPublicKeyJwk
      );

      const msgId = 'm-local-' + Math.random().toString(36).substring(2, 9);
      const newMsg: Message = {
        id: msgId,
        senderId: 'me',
        recipientId: activeContactId,
        plaintext: `Voice note (${duration}s)`,
        audioUrl,
        audioDuration: duration,
        encryptedPayload: payload,
        timestamp: Date.now(),
        status: 'sent',
        isDecrypted: true,
        safetyStatus: 'safe',
      };

      setMessagesByContact((prev) => ({
        ...prev,
        [activeContactId]: [...(prev[activeContactId] || []), newMsg],
      }));

      sendChatMessageToSupabase(activeContactId, {
        senderId: currentUser?.id || 'me',
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        senderPublicKeyJwk: userPublicKeyJwk,
        voiceDuration: duration,
        plaintextPreview: `🎤 Voice note (${duration}s)`,
      }).catch((err) => console.warn('Supabase voice sync note:', err));
    },
    [activeContactId, userKeyPair, userPublicKeyJwk, contacts, currentUser]
  );

  // Send Encrypted Photo Message with Supabase Storage
  const sendPhotoMessage = useCallback(
    async (imageUrl: string, caption?: string) => {
      if (!activeContactId || !userKeyPair || !userPublicKeyJwk) return;

      const activeContact = contacts.find((c) => c.id === activeContactId);
      if (!activeContact) return;

      // Upload to Supabase Storage
      let finalPhotoUrl = imageUrl;
      if (imageUrl.startsWith('data:')) {
        finalPhotoUrl = await uploadPhotoToSupabaseStorage(
          imageUrl,
          `chats/${activeContactId}/${Date.now()}_photo.jpg`
        );
      }

      const contactPublicKey = await importPublicKey(activeContact.publicKeyJwk);
      const textToEncrypt = caption ? `[PHOTO] ${caption}` : '[ENCRYPTED PHOTO ATTACHMENT]';

      const payload: EncryptedPayload = await encryptMessage(
        textToEncrypt,
        contactPublicKey,
        userKeyPair.privateKey,
        userPublicKeyJwk
      );

      const msgId = 'm-local-' + Math.random().toString(36).substring(2, 9);
      const disappearingTime = activeContact.disappearingTime || 0;
      const expiresAt = disappearingTime > 0 ? Date.now() + disappearingTime * 1000 : undefined;

      const newMsg: Message = {
        id: msgId,
        senderId: 'me',
        recipientId: activeContactId,
        plaintext: caption || '📷 Photo attachment',
        imageUrl: finalPhotoUrl,
        encryptedPayload: payload,
        timestamp: Date.now(),
        status: 'sent',
        isDecrypted: true,
        expiresAt,
        expiresInSeconds: disappearingTime > 0 ? disappearingTime : undefined,
      };

      setMessagesByContact((prev) => ({
        ...prev,
        [activeContactId]: [...(prev[activeContactId] || []), newMsg],
      }));

      sendChatMessageToSupabase(activeContactId, {
        senderId: currentUser?.id || 'me',
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        senderPublicKeyJwk: userPublicKeyJwk,
        plaintextPreview: caption || '📷 Photo attachment',
      }).catch((err) => console.warn('Supabase photo sync note:', err));
    },
    [activeContactId, userKeyPair, userPublicKeyJwk, contacts, currentUser]
  );

  // Send View-Once Photo with Supabase Storage
  const sendViewOncePhoto = useCallback(
    async (imageUrl: string, caption?: string) => {
      if (!activeContactId || !userKeyPair || !userPublicKeyJwk) return;
      const activeContact = contacts.find((c) => c.id === activeContactId);
      if (!activeContact) return;

      let finalPhotoUrl = imageUrl;
      if (imageUrl.startsWith('data:')) {
        finalPhotoUrl = await uploadPhotoToSupabaseStorage(
          imageUrl,
          `chats/${activeContactId}/viewonce_${Date.now()}.jpg`
        );
      }

      const contactPublicKey = await importPublicKey(activeContact.publicKeyJwk);
      const payload: EncryptedPayload = await encryptMessage(
        caption ? `[VIEW ONCE] ${caption}` : '[VIEW ONCE PHOTO]',
        contactPublicKey,
        userKeyPair.privateKey,
        userPublicKeyJwk
      );

      const msgId = 'm-local-' + Math.random().toString(36).substring(2, 9);
      const newMsg: Message = {
        id: msgId,
        senderId: 'me',
        recipientId: activeContactId,
        plaintext: caption || 'View once photo',
        imageUrl: finalPhotoUrl,
        isViewOnce: true,
        isViewed: false,
        encryptedPayload: payload,
        timestamp: Date.now(),
        status: 'sent',
        isDecrypted: true,
        safetyStatus: 'safe',
      };

      setMessagesByContact((prev) => ({
        ...prev,
        [activeContactId]: [...(prev[activeContactId] || []), newMsg],
      }));

      sendChatMessageToSupabase(activeContactId, {
        senderId: currentUser?.id || 'me',
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        senderPublicKeyJwk: userPublicKeyJwk,
        isViewOnce: true,
        viewOnceOpened: false,
        plaintextPreview: '📷 Photo (View once)',
      }).catch((err) => console.warn('Supabase view once note:', err));
    },
    [activeContactId, userKeyPair, userPublicKeyJwk, contacts, currentUser]
  );

  // Open & consume View-Once message with Supabase update
  const openViewOnceMessage = useCallback(
    (messageId: string) => {
      setMessagesByContact((prev) => {
        const updated: Record<string, Message[]> = {};
        for (const [cid, msgs] of Object.entries(prev)) {
          updated[cid] = msgs.map((m) =>
            m.id === messageId
              ? { ...m, isViewed: true, plaintext: 'Opened • Disappeared' }
              : m
          );
        }
        return updated;
      });

      markViewOnceOpenedInSupabase(messageId);
    },
    []
  );

  // Add emoji reaction with Supabase sync
  const addMessageReaction = useCallback(
    (messageId: string, emoji: string) => {
      let updatedReactions: Record<string, string> = {};

      setMessagesByContact((prev) => {
        const updated: Record<string, Message[]> = {};
        for (const [cid, msgs] of Object.entries(prev)) {
          updated[cid] = msgs.map((m) => {
            if (m.id !== messageId) return m;
            const userKey = currentUser?.id || 'me';
            const reactions = { ...(m.reactions || {}) };
            if (reactions[userKey] === emoji) {
              delete reactions[userKey];
            } else {
              reactions[userKey] = emoji;
            }
            updatedReactions = reactions;
            return { ...m, reactions };
          });
        }
        return updated;
      });

      updateMessageReactionInSupabase(messageId, updatedReactions);
    },
    [currentUser]
  );

  // Toggle Star / Bookmark on message
  const toggleStarMessage = useCallback((messageId: string) => {
    setMessagesByContact((prev) => {
      const updated: Record<string, Message[]> = {};
      for (const [cid, msgs] of Object.entries(prev)) {
        updated[cid] = msgs.map((m) =>
          m.id === messageId ? { ...m, isStarred: !m.isStarred } : m
        );
      }
      return updated;
    });
  }, []);

  // E2E Call Controls
  const startCall = useCallback(
    (contactIdOrObj: string | Contact, nameOrType?: string, type?: 'voice' | 'video') => {
      let targetContact: Contact | undefined;
      let callType: 'voice' | 'video' = 'voice';

      if (typeof contactIdOrObj === 'object') {
        targetContact = contactIdOrObj;
        callType = (nameOrType as 'voice' | 'video') || 'voice';
      } else {
        targetContact = contacts.find((c) => c.id === contactIdOrObj);
        callType = type || 'voice';
      }

      if (!targetContact) return;

      setActiveCall({
        contact: targetContact,
        type: callType,
        status: 'connected',
        startedAt: Date.now(),
        durationSeconds: 0,
        isMuted: false,
        isVideoOff: false,
        isSpeakerOn: true,
        encryptionCipher: 'ECDH P-256 + AES-256-GCM',
      });
    },
    [contacts]
  );

  const endCall = useCallback(() => {
    setActiveCall(null);
  }, []);

  const toggleCallMute = useCallback(() => {
    setActiveCall((prev) => (prev ? { ...prev, isMuted: !prev.isMuted } : null));
  }, []);

  const toggleCallVideo = useCallback(() => {
    setActiveCall((prev) => (prev ? { ...prev, isVideoOff: !prev.isVideoOff } : null));
  }, []);

  const toggleCallSpeaker = useCallback(() => {
    setActiveCall((prev) => (prev ? { ...prev, isSpeakerOn: !prev.isSpeakerOn } : null));
  }, []);

  // Disappearing messages timer
  const setDisappearingTimer = useCallback(
    (seconds: number) => {
      if (!activeContactId) return;
      setContacts((prev) =>
        prev.map((c) => (c.id === activeContactId ? { ...c, disappearingTime: seconds } : c))
      );
    },
    [activeContactId]
  );

  const toggleContactVerification = useCallback((contactId: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, isVerified: !c.isVerified } : c))
    );
  }, []);

  const addNewContact = useCallback(async (name: string, handle: string) => {
    const keyPair = await generateECDHKeyPair();
    const pubJwk = await exportKey(keyPair.publicKey);
    const fingerprint = await computeKeyFingerprint(pubJwk);

    const colors = [
      'from-rose-500 to-pink-600',
      'from-amber-500 to-orange-600',
      'from-violet-500 to-purple-600',
      'from-blue-500 to-indigo-600',
      'from-emerald-500 to-green-600',
    ];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const newContact: Contact = {
      id: 'c-' + Math.random().toString(36).substring(2, 8),
      name: name.trim(),
      handle: handle.trim().startsWith('@') ? handle.trim() : '@' + handle.trim(),
      avatarColor,
      publicKeyJwk: pubJwk,
      publicKeyFingerprint: fingerprint,
      status: 'online',
      isVerified: false,
      unreadCount: 0,
      lastMessage: 'Key exchange established. Chat is end-to-end encrypted.',
      lastMessageTime: Date.now(),
      disappearingTime: 0,
    };

    setContacts((prev) => [newContact, ...prev]);
    setActiveContactId(newContact.id);
    setMessagesByContact((prev) => ({ ...prev, [newContact.id]: [] }));
    setIsNewChatOpen(false);
  }, []);

  // Add Story with Supabase Storage & Database Sync
  const addStory = useCallback(
    async (storyData: { imageUrl?: string; gradientBg?: string; text?: string }) => {
      let finalImg = storyData.imageUrl;
      if (finalImg && finalImg.startsWith('data:')) {
        finalImg = await uploadPhotoToSupabaseStorage(
          finalImg,
          `stories/story_${Date.now()}.jpg`
        );
      }

      const newStory: Story = {
        id: 'story-user-' + Date.now(),
        userId: currentUser?.id || 'me',
        userName: currentUser?.user_metadata?.display_name || 'You',
        userHandle: '@' + currentUsername.replace(/^@/, ''),
        userAvatarColor: 'from-indigo-500 to-cyan-500',
        imageUrl: finalImg,
        gradientBg: storyData.gradientBg,
        text: storyData.text,
        timestamp: Date.now(),
        expiresAt: Date.now() + 1000 * 60 * 60 * 24,
        viewsCount: 0,
        hasSeen: true,
      };

      setStories((prev) => [newStory, ...prev]);
      setIsCreateStoryOpen(false);

      publishStoryToSupabase({
        author: currentUser?.user_metadata?.display_name || 'You',
        handle: '@' + currentUsername.replace(/^@/, ''),
        avatarColor: 'from-indigo-500 to-cyan-500',
        image: finalImg,
        caption: storyData.text || '',
        timestamp: 'Just now',
      }).catch((err) => console.warn('Publish story note:', err));
    },
    [currentUsername, currentUser]
  );

  const markStoryAsSeen = useCallback((storyId: string) => {
    setStories((prev) =>
      prev.map((s) => (s.id === storyId ? { ...s, hasSeen: true, viewsCount: s.viewsCount + 1 } : s))
    );
  }, []);

  // Add Post with Supabase Storage & Database Sync
  const addPost = useCallback(
    async (postData: { imageUrl: string; caption: string; location?: string }) => {
      let finalImg = postData.imageUrl;
      if (finalImg.startsWith('data:')) {
        finalImg = await uploadPhotoToSupabaseStorage(
          finalImg,
          `posts/post_${Date.now()}.jpg`
        );
      }

      const newPost: Post = {
        id: 'post-' + Date.now(),
        userId: currentUser?.id || 'me',
        userName: currentUser?.user_metadata?.display_name || 'You',
        userHandle: '@' + currentUsername.replace(/^@/, ''),
        userAvatarColor: 'from-indigo-500 to-cyan-500',
        imageUrl: finalImg,
        caption: postData.caption,
        location: postData.location || 'Local Device',
        distance: '0 km (Current Device)',
        timestamp: Date.now(),
        likes: 0,
        isLiked: false,
        commentsCount: 0,
      };

      setPosts((prev) => [newPost, ...prev]);
      setIsCreatePostOpen(false);

      publishPostToSupabase({
        author: currentUser?.user_metadata?.display_name || 'You',
        handle: '@' + currentUsername.replace(/^@/, ''),
        avatarColor: 'from-indigo-500 to-cyan-500',
        location: postData.location || 'Local Secure Enclave',
        distance: '0 km',
        image: finalImg,
        caption: postData.caption,
        timestamp: 'Just now',
      }).catch((err) => console.warn('Publish post note:', err));
    },
    [currentUsername, currentUser]
  );

  const togglePostLike = useCallback((postId: string) => {
    let shouldInc = 1;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const isLiked = !p.isLiked;
        shouldInc = isLiked ? 1 : -1;
        return {
          ...p,
          isLiked,
          likes: isLiked ? p.likes + 1 : Math.max(0, p.likes - 1),
        };
      })
    );
    togglePostLikeInSupabase(postId, shouldInc).catch(() => {});
  }, []);

  // Add Friend from Discovery
  const addFriend = useCallback(
    async (friendUser: FriendUser) => {
      setDiscoverUsers((prev) =>
        prev.map((u) => (u.id === friendUser.id ? { ...u, isFriend: true, requestSent: true } : u))
      );

      const cKeyPair = await generateECDHKeyPair();
      const cPubJwk = await exportKey(cKeyPair.publicKey);
      const cFingerprint = friendUser.publicKeyFingerprint;

      const newContact: Contact = {
        id: 'c-' + friendUser.id,
        name: friendUser.name,
        handle: friendUser.handle,
        avatarColor: friendUser.avatarColor,
        publicKeyJwk: cPubJwk,
        publicKeyFingerprint: cFingerprint,
        status: friendUser.status,
        isVerified: false,
        unreadCount: 0,
        lastMessage: 'Handshake completed. Begin private conversation.',
        lastMessageTime: Date.now(),
        disappearingTime: 0,
        location: friendUser.location,
        distance: friendUser.distance,
      };

      setContacts((prev) => [newContact, ...prev]);
      setActiveContactId(newContact.id);
      setMessagesByContact((prev) => ({ ...prev, [newContact.id]: [] }));
      setActiveTab('chats');
    },
    []
  );

  // Update Username
  const updateUsername = useCallback(
    (newHandle: string): { success: boolean; error?: string } => {
      const clean = newHandle.trim().toLowerCase().replace(/^@/, '');
      const val = validateUsernameFormat(clean);
      if (!val.isValid) {
        return { success: false, error: val.error };
      }

      const existingHandles = [
        ...contacts.map((c) => c.handle),
        ...discoverUsers.map((u) => u.handle),
      ];

      if (!isUsernameAvailable(clean, existingHandles, currentUsername)) {
        return { success: false, error: 'This username is already taken.' };
      }

      setCurrentUsername(clean);
      return { success: true };
    },
    [contacts, discoverUsers, currentUsername]
  );

  const clearChat = useCallback((contactId: string) => {
    setMessagesByContact((prev) => ({ ...prev, [contactId]: [] }));
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId ? { ...c, lastMessage: undefined, lastMessageTime: undefined } : c
      )
    );
  }, []);

  const activeContact = contacts.find((c) => c.id === activeContactId) || null;
  const activeMessages = activeContactId ? messagesByContact[activeContactId] || [] : [];

  return {
    userKeyPair,
    userPublicKeyJwk,
    userFingerprint,
    currentUsername,
    updateUsername,
    isUnlocked,
    isAuthenticating,
    biometricInfo,
    authError,
    biometricEnrolled,
    setBiometricEnrolled,
    autoLockSeconds,
    setAutoLockSeconds,
    unlockWithBiometrics,
    lockApp,
    activeTab,
    setActiveTab,
    contacts,
    activeContact,
    activeContactId,
    setActiveContactId,
    activeMessages,
    isContactTyping,
    sendMessage,
    sendPhotoMessage,
    setDisappearingTimer,
    toggleContactVerification,
    addNewContact,
    clearChat,
    inspectingMessage,
    setInspectingMessage,
    safetyNumberContact,
    setSafetyNumberContact,
    isSettingsOpen,
    setIsSettingsOpen,
    isNewChatOpen,
    setIsNewChatOpen,
    cipherViewMode,
    setCipherViewMode,
    stories,
    activeStoryIndex,
    setActiveStoryIndex,
    isCreateStoryOpen,
    setIsCreateStoryOpen,
    addStory,
    markStoryAsSeen,
    posts,
    isCreatePostOpen,
    setIsCreatePostOpen,
    addPost,
    togglePostLike,
    discoverUsers,
    addFriend,
    // Theme Engine
    theme,
    setTheme,
    themeMode: theme,
    setThemeMode: setTheme,
    isThemeModalOpen,
    setIsThemeModalOpen,
    // Call System
    activeCall,
    activeCallSession: activeCall,
    startCall,
    endCall,
    toggleCallMute,
    toggleCallVideo,
    toggleCallSpeaker,
    // Voice Notes & Media
    sendVoiceNote,
    sendVoiceNoteMessage: sendVoiceNote,
    sendViewOncePhoto,
    sendViewOncePhotoMessage: sendViewOncePhoto,
    openViewOnceMessage,
    addMessageReaction,
    toggleStarMessage,
    // Supabase Auth & Cloud Sync
    currentUser,
    user: currentUser,
    authLoading,
    supabaseAuthError,
    isCloudSyncing,
    signInWithEmail,
    signUpWithEmail,
    signInGuest,
    signOutAccount,
  };
}
