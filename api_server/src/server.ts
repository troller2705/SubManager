// @ts-ignore
import express, { type Request, type Response, type NextFunction } from 'express';
// @ts-ignore
import cors from 'cors';
import axios from 'axios';
// @ts-ignore
import crypto from 'crypto';
// @ts-ignore
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const SHARED_SECRET = process.env.API_SHARED_SECRET!;
// Must be exactly 32 bytes (64 hex characters)
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

// 1. Dynamic Subdomain CORS
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow non-browser server-to-server requests
    if (!origin) return callback(null, true);
    const allowedDomainPattern = /^(https?:\/\/([a-z0-9-]+\.)*rootapp\.com)$/i;

    // For local development, allow localhost
    if (origin.startsWith('http://localhost') || allowedDomainPattern.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));

// 2. Encryption Utility
function encryptData(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// 3. HMAC Signature Verification Middleware
function verifyRequestSignature(req: Request, res: Response, next: NextFunction) {
  const timestamp = req.headers['x-api-timestamp'] as string;
  const clientSignature = req.headers['x-api-signature'] as string;

  if (!timestamp || !clientSignature) {
    return res.status(401).json({ error: 'Missing security headers' });
  }

  // Prevent Replay Attacks (5 minute window)
  const timeDiff = Date.now() - parseInt(timestamp, 10);
  if (Math.abs(timeDiff) > 5 * 60 * 1000) {
    return res.status(401).json({ error: 'Request expired' });
  }

  const stringifiedPayload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', SHARED_SECRET)
    .update(`${timestamp}.${stringifiedPayload}`)
    .digest('hex');

  if (crypto.timingSafeEqual(Buffer.from(clientSignature), Buffer.from(expectedSignature))) {
    next();
  } else {
    res.status(403).json({ error: 'Invalid signature' });
  }
}

// 4. The Token Exchange Endpoint
app.post('/api/oauth/exchange', verifyRequestSignature, async (req: Request, res: Response) => {
  const { provider, code, redirect_uri } = req.body;

  try {
    let tokenEndpoint = '';
    let payload: Record<string, string> = {
      code,
      grant_type: 'authorization_code',
      redirect_uri
    };

    if (provider === 'patreon') {
      tokenEndpoint = 'https://www.patreon.com/api/oauth2/token';
      payload.client_id = process.env.PATREON_CLIENT_ID!;
      payload.client_secret = process.env.PATREON_CLIENT_SECRET!;
    } else if (provider === 'substar') {
      tokenEndpoint = 'https://www.subscribestar.com/oauth2/token';
      payload.client_id = process.env.SUBSTAR_CLIENT_ID!;
      payload.client_secret = process.env.SUBSTAR_CLIENT_SECRET!;
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    const response = await axios.post(tokenEndpoint, new URLSearchParams(payload).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in } = response.data;

    // Encrypt the tokens before sending them back to the main server
    res.json({
      access_token: encryptData(access_token),
      refresh_token: encryptData(refresh_token),
      expires_in
    });

  } catch (error: any) {
    console.error(`OAuth Exchange Failed [${provider}]:`, error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to exchange tokens' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`OAuth API Security Server running on port ${PORT}`));