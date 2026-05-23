// api/accept.js
import { createClient } from '@vercel/kv';
import { katasumiQuestionPool } from '../questions.js';

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  // CORS Preflight Management
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', 'https://sysimus.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ONLY extraction point for roomId from the body
  const { roomId, guestUser } = req.body;

  try {
    const roomDataText = await kv.get(roomId);
    if (!roomDataText) {
      return res.status(404).json({ error: 'Challenge expired or not found' });
    }

    const room = typeof roomDataText === 'string' ? JSON.parse(roomDataText) : roomDataText;

    if (room.guest.toLowerCase() !== guestUser.toLowerCase()) {
      return res.status(403).json({ error: 'Unauthorized to accept this match' });
    }

    // Select 5 random questions
    const shuffled = [...katasumiQuestionPool].sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffled.slice(0, 5);

    // Strip out real answers for the client
    const clientQuestions = selectedQuestions.map(q => ({
      question: q.question,
      choices: q.choices,
      arc: q.arc
    }));

    // Mutate the existing object properties without using 'const' or 'let' on them
    room.status = 'playing';
    room.questionsPool = selectedQuestions; 
    room.clientQuestions = clientQuestions;   

    await kv.set(roomId, JSON.stringify(room), { ex: 1800 });

    return res.status(200).json({ status: 'ready', room });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server update failed' });
  }
}
