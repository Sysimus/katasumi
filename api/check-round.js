// api/check-round.js
import { createClient } from '@vercel/kv';

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { roomId, index } = req.query;

  try {
    const roomDataText = await kv.get(roomId);
    if (!roomDataText) return res.status(404).json({ error: 'Room dead' });
    
    const room = typeof roomDataText === 'string' ? JSON.parse(roomDataText) : roomDataText;

    // If the round has been fully resolved by the second player, a summary will exist
    if (room.roundSummaries && room.roundSummaries[index]) {
      return res.status(200).json({ status: 'round_resolved', roundData: room.roundSummaries[index] });
    }

    return res.status(200).json({ status: 'waiting' });
  } catch (error) {
    return res.status(500).json({ error: 'Polling error' });
  }
}