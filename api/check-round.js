// api/check-round.js
import { createClient } from '@vercel/kv';

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', 'https://sysimus.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { roomId, index } = req.query;

  try {
    const roomDataText = await kv.get(roomId);
    if (!roomDataText) return res.status(404).json({ error: 'Room dead' });
    
    const room = typeof roomDataText === 'string' ? JSON.parse(roomDataText) : roomDataText;

    if (room.roundSummaries && room.roundSummaries[index]) {
      return res.status(200).json({ status: 'round_resolved', roundData: room.roundSummaries[index] });
    }

    // Fallback response so the host knows the guest successfully launched the game
    return res.status(200).json({ status: 'waiting', room: room });
  } catch (error) {
    return res.status(500).json({ error: 'Polling error' });
  }
}
