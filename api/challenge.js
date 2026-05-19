// api/challenge.js
import { createClient } from '@vercel/kv';

// Initialize the Redis client using Vercel's automatic environment variables
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { hostUser, challengedUser } = req.body;

  if (!hostUser || !challengedUser) {
    return res.status(400).json({ error: 'Missing usernames' });
  }

  // Create a unique room key based on who is being challenged
  const roomKey = `room:${challengedUser.toLowerCase()}`;

  // Define the initial pending room state
  const pendingRoom = {
    roomId: roomKey,
    host: hostUser,
    guest: challengedUser,
    status: 'pending_acceptance',
    currentQuestionIndex: 0,
    scores: {
      [hostUser]: 0,
      [challengedUser]: 0
    },
    answers: {} // Will hold round submissions
  };

  try {
    // Save the room to Redis. Set an expiration time (TTL) of 30 minutes 
    // so dead or ignored challenges automatically clean themselves up.
    await kv.set(roomKey, JSON.stringify(pendingRoom), { ex: 1800 });
    
    return res.status(200).json({ status: 'success', roomId: roomKey });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database connection failed' });
  }
}