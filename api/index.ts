import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration for Vercel Serverless deployment
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Info, apikey, X-Processor-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { default: app } = await import('../server/src/index.js');
  return (app as any)(req, res);
}
