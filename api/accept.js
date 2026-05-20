// api/accept.js
import { createClient } from '@vercel/kv';
// Assume your questions array is accessible here or imported locally
import { katasumiQuestionPool } from '../questions.js';

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  // 1. Force CORS headers onto every single response stream manually
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', 'https://sysimus.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // 2. Intercept the browser's preflight check and force a 200 OK success exit
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { roomId, guestUser } = req.body;

  try {
    // Fetch the current room data from Redis
    const roomDataText = await kv.get(roomId);
    if (!roomDataText) {
      return res.status(404).json({ error: 'Challenge expired or not found' });
    }

    const room = typeof roomDataText === 'string' ? JSON.parse(roomDataText) : roomDataText;

    // Verify this match belongs to the user trying to accept it
    if (room.guest.toLowerCase() !== guestUser.toLowerCase()) {
      return res.status(403).json({ error: 'Unauthorized to accept this match' });
    }

    // 1. SELECT QUESTIONS: Shuffle and grab 5 questions from your pool
    const shuffled = [...katasumiQuestionPool].sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffled.slice(0, 5);

    // 2. CREATE A SECURE CLIENT VERSION: Remove correct answers so they aren't exposed
    const clientQuestions = selectedQuestions.map(q => ({
      question: q.question,
      choices: q.choices,
      arc: q.arc
    }));

    // Update room state
    room.status = 'playing';
    room.questionsPool = selectedQuestions; // Master key kept safely on server
    room.clientQuestions = clientQuestions;   // Safe version sent to frontend

    // Save updated match state back to Redis (refreshing the 30-min timer)
    await kv.set(roomId, JSON.stringify(room), { ex: 1800 });

    // Return the safe questions and room data to the guest player to launch their UI
    return res.status(200).json({ status: 'ready', room });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server update failed' });
  }
}
