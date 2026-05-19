// app.js
const gameState = {
  username: "",          // Current player's username
  opponent: "",          // Opponent's username
  roomId: "",            // The room ID (e.g., "room:Zoro")
  questions: [],         // Array of 5 questions fetched from the server
  currentIndex: 0,       // Track which question we are on (0 to 4)
  timer: null,           // Holds the setInterval reference for the countdown
  timeLeft: 10,          // Time left per question in seconds
  startTime: null,       // Millisecond timestamp when the question appeared
  timeTaken: null,       // How long the user took to click an answer
  hasAnswered: false     // Prevents double-clicking choices
};

// Starts the 10-second countdown for the current question
function startQuestionTimer() {
  gameState.timeLeft = 10;
  gameState.hasAnswered = false;
  gameState.startTime = Date.now(); // Record exact start time
  
  updateTimerUI(gameState.timeLeft);

  gameState.timer = setInterval(() => {
    gameState.timeLeft -= 0.1; // Smooth countdown tracking
    
    if (gameState.timeLeft <= 0) {
      clearInterval(gameState.timer);
      handleAnswerSelection(null); // Time ran out!
    } else {
      updateTimerUI(Math.ceil(gameState.timeLeft));
    }
  }, 100);
}

// Triggered when a user clicks an option or times out
function handleAnswerSelection(selectedChoice) {
  if (gameState.hasAnswered) return; // Prevent clicking multiple options
  gameState.hasAnswered = true;
  clearInterval(gameState.timer);

  // Calculate precision timing in seconds (e.g., 1.45s)
  gameState.timeTaken = (Date.now() - gameState.startTime) / 1000;
  if (selectedChoice === null) gameState.timeTaken = 10.0; // Max time if skipped

  // Highlight selected choice locally for instant visual feedback
  highlightUISelection(selectedChoice);

  // Send the answer instantly to your Vercel API
  submitAnswerToServer(selectedChoice, gameState.timeTaken);
}

async function submitAnswerToServer(choice, timeTaken) {
  showWaitingUI("Waiting for your opponent to answer...");

  try {
    const response = await fetch('https://your-vercel-project.vercel.app/api/submit-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: gameState.roomId,
        username: gameState.username,
        questionIndex: gameState.currentIndex,
        choice: choice,
        timeTaken: timeTaken
      })
    });

    const result = await response.json();

    if (result.status === 'waiting') {
      // Opponent is still thinking. Start checking periodically.
      startPollingForRoundResolution();
    } else if (result.status === 'round_resolved') {
      // Both players finished! Display results.
      displayRoundResults(result.roundData);
    }
  } catch (error) {
    console.error("Error submitting answer:", error);
  }
}

function startPollingForRoundResolution() {
  const poll = setInterval(async () => {
    try {
      const response = await fetch(`https://your-vercel-project.vercel.app/api/check-round?roomId=${gameState.roomId}&index=${gameState.currentIndex}`);
      const result = await response.json();

      if (result.status === 'round_resolved') {
        clearInterval(poll);
        displayRoundResults(result.roundData);
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  }, 1000); // Polls every 1 second
}

function advanceToNextRound() {
  gameState.currentIndex += 1;

  if (gameState.currentIndex < gameState.questions.length) {
    // Load next question into the UI
    renderQuestion(gameState.questions[gameState.currentIndex]);
    startQuestionTimer();
  } else {
    // End of 5-question set
    displayFinalMatchResults();
  }
}