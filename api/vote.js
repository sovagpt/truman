import { createClient } from '@vercel/kv';
import OpenAI from 'openai';

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  runtime: 'edge',
};

async function concludeVoting(gameState) {
  let maxVotes = 0;
  let winningOption = null;
  
  Object.entries(gameState.votes).forEach(([option, votes]) => {
    if (votes > maxVotes) {
      maxVotes = votes;
      winningOption = option;
    }
  });

  if (!winningOption) return null;

  const allSprites = gameState.sprites.filter(s => s.isUnaware);
const randomSprite = allSprites[Math.floor(Math.random() * allSprites.length)];
  if (trumanSprite) {
    try {
      const prompt = `You live in Simulife. Write a personal diary thought about ${winningOption}. Share something that strikes you as strange about the town or its people, but try to rationalize it in a natural way. Focus on small oddities that make you question things.`;
      
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
        temperature: 0.7,
      });

      const reaction = completion.choices[0].message.content;
      randomSprite.thoughts.push(reaction);
randomSprite.memories.push(`Experienced: ${winningOption}`);
if (!randomSprite.suspicionLevel) randomSprite.suspicionLevel = 0;
randomSprite.suspicionLevel += 10;

gameState.thoughts.push({
  spriteId: randomSprite.id,
  thought: reaction,
  suspicionLevel: randomSprite.suspicionLevel,
  timestamp: Date.now()
});
    } catch (error) {
      console.error('Error generating reaction:', error);
    }
  }
  return winningOption;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  try {
    const { option } = await req.json();
    const gameState = await kv.get('gameState');

    if (!gameState.activeVoting || Date.now() > gameState.voteEndTime) {
      // Reset voting
      gameState.votes = {
        "frankdegods": 0,
  "cupsey": 0,
  "jalen": 0,
  "orangie": 0,
  "alon": 0,
  "zachxbt": 0,
  "west": 0,
  "assassin": 0
      };
      gameState.voteStartTime = Date.now();
      gameState.voteEndTime = Date.now() + (24 * 60 * 60 * 1000);
      gameState.activeVoting = true;
    }

    gameState.votes[option] = (gameState.votes[option] || 0) + 1;
    
    if (Object.values(gameState.votes).reduce((a, b) => a + b) >= 10) {
      const winningEvent = await concludeVoting(gameState);
      gameState.activeVoting = false;
      gameState.currentEvent = winningEvent;
    }

    await kv.set('gameState', gameState);
    return new Response(JSON.stringify(gameState.votes), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('Error processing vote:', error);
    return new Response('Error processing vote', { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
