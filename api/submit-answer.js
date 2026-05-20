// api/submit-answer.js
import { createClient } from '@vercel/kv';

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

  const { roomId, username, questionIndex, choice, timeTaken } = req.body;

  try {
    // 1. Get current match state from Redis
    const roomDataText = await kv.get(roomId);
    if (!roomDataText) {
      return res.status(404).json({ error: 'Match not found or expired' });
    }
    const room = typeof roomDataText === 'string' ? JSON.parse(roomDataText) : roomDataText;

    // Initialize the tracking object for this specific question index if empty
    if (!room.answers[questionIndex]) {
      room.answers[questionIndex] = {};
    }

    // 2. Save this player's submission locally into the room state
    room.answers[questionIndex][username] = {
      choice: choice,
      timeTaken: parseFloat(timeTaken)
    };

    // Determine who the host and guest are for comparison
    const hostPlayer = room.host;
    const guestPlayer = room.guest;

    // 3. Check if BOTH players have locked in their answers for this question
    const hostAnswer = room.answers[questionIndex][hostPlayer];
    const guestAnswer = room.answers[questionIndex][guestPlayer];

    if (!hostAnswer || !guestAnswer) {
      // One player is still thinking! Save current state and tell frontend to poll
      await kv.set(roomId, JSON.stringify(room), { ex: 1800 });
      return res.status(200).json({ status: 'waiting' });
    }

    // 4. BOTH ARE IN! Time to resolve the round and score it
    const correctAnswer = room.questionsPool[questionIndex].answer;
    
    let hostRoundPoints = 0;
    let guestRoundPoints = 0;
    let speedBonusWinner = null;

    // A. Check base correctness and calculate time-decay scores (Max 20 base points)
    const hostIsCorrect = (hostAnswer.choice === correctAnswer);
    const guestIsCorrect = (guestAnswer.choice === correctAnswer);

    if (hostIsCorrect) {
      // Formula: Max 20 points, dropping linearily based on seconds taken
      hostRoundPoints = Math.max(0, Math.floor(((10 - hostAnswer.timeTaken) / 10) * 20));
    }
    if (guestIsCorrect) {
      guestRoundPoints = Math.max(0, Math.floor(((10 - guestAnswer.timeTaken) / 10) * 20));
    }

    // B. Apply the Katasumi Speed Bonus! (+5 points to the faster CORRECT answer)
    if (hostIsCorrect && guestIsCorrect) {
      if (hostAnswer.timeTaken < guestAnswer.timeTaken) {
        hostRoundPoints += 5;
        speedBonusWinner = hostPlayer;
      } else if (guestAnswer.timeTaken < hostAnswer.timeTaken) {
        guestRoundPoints += 5;
        speedBonusWinner = guestPlayer;
      }
    } else if (hostIsCorrect && !guestIsCorrect) {
      // Host gets it automatically if guest is wrong, provided they answered
      hostRoundPoints += 5;
      speedBonusWinner = hostPlayer;
    } else if (guestIsCorrect && !hostIsCorrect) {
      guestRoundPoints += 5;
      speedBonusWinner = guestPlayer;
    }

    // C. Update total cumulative match scores
    room.scores[hostPlayer] += hostRoundPoints;
    room.scores[guestPlayer] += guestRoundPoints;

    // D. Assemble a detailed summary packet for the frontend UI to display
    const roundSummary = {
      correctAnswer: correctAnswer,
      speedBonusWinner: speedBonusWinner,
      playerResults: {
        [hostPlayer]: { correct: hostIsCorrect, time: hostAnswer.timeTaken, pointsEarned: hostRoundPoints },
        [guestPlayer]: { correct: guestIsCorrect, time: guestAnswer.timeTaken, pointsEarned: guestRoundPoints }
      },
      currentScores: room.scores
    };

    // Store the summary inside the room data so a player polling can read it instantly
    if (!room.roundSummaries) room.roundSummaries = {};
    room.roundSummaries[questionIndex] = roundSummary;

    // Save completely processed state back to Redis
    await kv.set(roomId, JSON.stringify(room), { ex: 1800 });

    // Send data back to the second player who just submitted to unlock their UI
    return res.status(200).json({ status: 'round_resolved', roundData: roundSummary });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to process round score' });
  }
}
