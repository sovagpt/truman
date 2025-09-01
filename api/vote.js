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
  // For character betting, we don't trigger events
  // Just track the votes and reset periodically
  return null;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  try {
    const { option } = await req.json();
    const gameState = await kv.get('gameState');

    if (!gameState.activeVoting || Date.now() > gameState.voteEndTime) {
      // Reset voting every 24 hours but keep cumulative totals
      gameState.votes = {
        "frankdegods": gameState.votes?.frankdegods || 0,
        "cupsey": gameState.votes?.cupsey || 0,
        "jalen": gameState.votes?.jalen || 0,
        "orangie": gameState.votes?.orangie || 0,
        "baoskee": gameState.votes?.baoskee || 0,
        "zachxbt": gameState.votes?.zachxbt || 0,
        "west": gameState.votes?.west || 0,
        "assassin": gameState.votes?.assassin || 0
      };
      gameState.voteStartTime = Date.now();
      gameState.voteEndTime = Date.now() + (24 * 60 * 60 * 1000);
      gameState.activeVoting = true;
    }

    // Initialize vote count if it doesn't exist
    if (!gameState.votes[option]) {
      gameState.votes[option] = 0;
    }

    gameState.votes[option] += 1;

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

