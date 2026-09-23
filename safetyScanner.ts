/**
 * Zero-Knowledge On-Device Content Safety & Anti-Fraud Scanner
 * Analyzes messages, media payloads, and handles locally without ever sending plaintexts to servers.
 * Prevents phishing, malicious links, abusive content, and impersonation fraud ("koi galat cheez na aye").
 */

export interface SafetyScanResult {
  isSafe: boolean;
  status: 'safe' | 'warning' | 'flagged';
  warning?: string;
  reasons: string[];
  sanitizedPreview?: string;
  suggestsBlur: boolean;
}

// Known phishing patterns and deceptive domain indicators
const SUSPICIOUS_DOMAIN_PATTERNS = [
  /paypa[l1]\./i,
  /faceb[o0]{2}k\./i,
  /metamask.*verify/i,
  /binance.*login/i,
  /secure.*update.*login/i,
  /free.*crypto.*claim/i,
  /\.tk$|\.ml$|\.ga$|\.cf$|\.gq$/i,
  /t\.me\/.*claim/i,
];

// High risk fraudulent phrases
const FRAUD_KEYWORDS = [
  'send your private key',
  'give me your seed phrase',
  'claim your free bitcoin',
  'urgent: account suspended click here',
  'send money immediately',
  'transfer funds to verify',
  'otp will be sent, forward it to me',
  'password reset code request',
];

// Toxic / harmful patterns
const HARMFUL_PATTERNS = [
  /\b(kill yourself|die in a fire)\b/i,
  /\b(bomb threat|terrorist attack)\b/i,
  /\b(leak your private photos|blackmail)\b/i,
];

/**
 * Scan message content locally before displaying or transmitting
 */
export function scanContentSafety(
  text: string,
  senderHandle?: string,
  knownHandles?: string[]
): SafetyScanResult {
  const normalized = text.toLowerCase();
  const reasons: string[] = [];
  let status: 'safe' | 'warning' | 'flagged' = 'safe';
  let suggestsBlur = false;

  // 1. Check for Phishing & Malicious URLs
  for (const pattern of SUSPICIOUS_DOMAIN_PATTERNS) {
    if (pattern.test(normalized)) {
      status = 'flagged';
      reasons.push('Contains suspicious or unverified phishing link pattern');
      suggestsBlur = true;
      break;
    }
  }

  // 2. Check for Credential Theft & Scam keywords
  for (const phrase of FRAUD_KEYWORDS) {
    if (normalized.includes(phrase)) {
      if (status !== 'flagged') status = 'warning';
      reasons.push(`Suspicious credential solicitation detected: "${phrase}"`);
      suggestsBlur = true;
    }
  }

  // 3. Check for Extreme Harm / Threats
  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(normalized)) {
      status = 'flagged';
      reasons.push('Violates community safety guidelines (harmful / threatening intent)');
      suggestsBlur = true;
      break;
    }
  }

  // 4. Impersonation / Lookalike Handle Check
  if (senderHandle && knownHandles && knownHandles.length > 0) {
    const cleanSender = senderHandle.replace(/^@/, '').toLowerCase();
    for (const kh of knownHandles) {
      const cleanKnown = kh.replace(/^@/, '').toLowerCase();
      if (cleanSender !== cleanKnown && isLookalike(cleanSender, cleanKnown)) {
        status = 'warning';
        reasons.push(`Possible handle spoofing: @${cleanSender} resembles verified @${cleanKnown}`);
      }
    }
  }

  if (reasons.length > 0) {
    return {
      isSafe: status === 'safe',
      status,
      warning: reasons.join(' • '),
      reasons,
      suggestsBlur,
    };
  }

  return {
    isSafe: true,
    status: 'safe',
    reasons: [],
    suggestsBlur: false,
  };
}

/**
 * Basic Levenshtein / character replacement distance for handle spoof detection (e.g., "elena.v" vs "e1ena.v")
 */
function isLookalike(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  // Replace typical leetspeak substitutions
  const normalize = (s: string) =>
    s
      .replace(/1/g, 'l')
      .replace(/0/g, 'o')
      .replace(/3/g, 'e')
      .replace(/5/g, 's')
      .replace(/8/g, 'b');

  return normalize(a) === normalize(b);
}
