export type ThemeMode = 'obsidian' | 'cyberpunk' | 'nordic' | 'matrix' | 'solar';

export interface EncryptedPayload {
  algorithm: string; // "ECDH-P256+AES-GCM-256"
  iv: string; // Base64
  ciphertext: string; // Base64
  senderPublicKeyJwk: string; // serialized JWK
  timestamp: number;
  ephemeralKeyId: string;
}

export interface Message {
  id: string;
  senderId: string; // "me" or contactId
  recipientId: string;
  plaintext: string; // In-memory decrypted content
  encryptedPayload: EncryptedPayload;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  isDecrypted: boolean;
  imageUrl?: string; // Encrypted photo message
  audioUrl?: string; // Encrypted voice note (WhatsApp feature)
  audioDuration?: number; // duration in seconds
  isViewOnce?: boolean; // WhatsApp-style View Once media
  isViewed?: boolean; // whether view-once was already opened
  reactions?: Record<string, string>; // Instagram-style emoji reactions { userId: '❤️' }
  isStarred?: boolean; // WhatsApp starred message
  replyTo?: { id: string; sender: string; text: string }; // Instagram/WhatsApp quote reply
  safetyStatus?: 'safe' | 'warning' | 'flagged'; // Content safety check ("koi galat cheez na aye")
  safetyWarning?: string; // Reason for warning/flagging
  expiresAt?: number; // For disappearing messages (timestamp ms)
  expiresInSeconds?: number; // original countdown in seconds (e.g. 10, 30, 60)
  decryptionError?: string;
}

export interface CallSession {
  contact: Contact;
  type: 'voice' | 'video';
  status: 'ringing' | 'connected' | 'ended';
  startedAt: number;
  durationSeconds: number;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  encryptionCipher: string; // "AES-256-GCM + ECDH P-256"
}

export interface Story {
  id: string;
  userId: string;
  userName: string;
  userHandle: string;
  userAvatarColor: string;
  imageUrl?: string;
  gradientBg?: string;
  text?: string;
  timestamp: number;
  expiresAt: number;
  viewsCount: number;
  hasSeen?: boolean;
}

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userHandle: string;
  userAvatarColor: string;
  imageUrl: string;
  caption: string;
  location?: string;
  distance?: string;
  timestamp: number;
  likes: number;
  isLiked?: boolean;
  commentsCount: number;
}

export interface FriendUser {
  id: string;
  name: string;
  handle: string; // unique username (@...)
  bio: string;
  location: string;
  distance: string; // e.g., "11,200 km away"
  avatarColor: string;
  publicKeyFingerprint: string;
  mutualFriends: number;
  status: 'online' | 'offline';
  isFriend: boolean;
  requestSent?: boolean;
}

export interface Contact {
  id: string;
  name: string;
  handle: string; // Unique username e.g. @elena.v
  avatarColor: string;
  publicKeyJwk: JsonWebKey;
  publicKeyFingerprint: string; // Short hex fingerprint
  status: 'online' | 'offline' | 'last seen recently';
  isVerified: boolean; // Safety number manually verified
  unreadCount: number;
  lastMessage?: string;
  lastMessageTime?: number;
  disappearingTime?: number; // 0 = off, or 10, 30, 60, 300
  location?: string;
  distance?: string;
}

export interface UserSession {
  userId: string;
  username: string;
  publicKeyFingerprint: string;
  biometricEnrolled: boolean;
  biometricType: 'touch_id' | 'face_id' | 'windows_hello' | 'fingerprint' | 'biometric_key';
  isLocked: boolean;
  autoLockMinutes: number;
}
