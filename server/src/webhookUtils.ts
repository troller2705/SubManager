import * as crypto from 'crypto';

/**
 * Verifies the signature of an incoming Patreon webhook.
 */
export function verifyPatreonSignature(signature: string, body: string, secret: string): boolean {
  const hash = crypto
    .createHmac('md5', secret) // Patreon uses MD5 for signatures
    .update(body)
    .digest('hex');
  return hash === signature;
}

/**
 * Verifies a SubscribeStar signature (typically uses HMAC-SHA256).
 */
export function verifySubStarSignature(signature: string, body: string, secret: string): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return hash === signature;
}