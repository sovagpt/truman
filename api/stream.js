// api/stream.js
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export const config = {
  runtime: 'edge'
}

export default async function handler(request) {
  try {
    let gameState = await redis.get('gameState')
    if (!gameState) {
      gameState = {
        sprites: [
          {
            id: 'truman',
            x: 500,
            y: 500,
            type: 'TrumanSprite',
            isUnaware: true,
            thoughts: [],
            memories: []
          },
          {
            id: 'sarah',
            x: 450,
            y: 450,
            type: 'SarahSprite',
            thoughts: [],
            memories: []
          },
          {
            id: 'michael',
            x: 550,
            y: 550,
            type: 'MichaelSprite',
            thoughts: [],
            memories: []
          },
          {
            id: 'emma',
            x: 400,
            y: 500,
            type: 'EmmaSprite',
            thoughts: [],
            memories: []
          },
          {
            id: 'james',
            x: 600,
            y: 400,
            type: 'JamesSprite',
            thoughts: [],
            memories: []
          },
          {
            id: 'olivia',
            x: 500,
            y: 600,
            type: 'OliviaSprite',
            thoughts: [],
            memories: []
          },
          {
            id: 'william',
            x: 350,
            y: 350,
            type: 'WilliamSprite',
            thoughts: [],
            memories: []
          },
          {
            id: 'sophia',
            x: 650,
            y: 650,
            type: 'SophiaSprite',
            thoughts: [],
            memories: []
          }
        ],
        time: Date.now(),
        thoughts: [],
        currentEvent: null,
        votes: {
          "Deforest the eastern woods": 0,
          "Start a fire downtown": 0,
          "Give Frank internet access": 0,
          "Remove an NPC permanently": 0
        },
        voteStartTime: Date.now(),
        voteEndTime: Date.now() + (24 * 60 * 60 * 1000),
        activeVoting: true
      };
      await redis.set('gameState', gameState)
    }

    console.log('Current game state:', {
      spriteCount: gameState.sprites?.length,
      spritePositions: gameState.sprites?.map(s => ({id: s.id, x: s.x, y: s.y}))
    });

    const message = `data: ${JSON.stringify(gameState)}\n\n`;
    return new Response(message, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('Stream error:', error);
    return new Response(`data: ${JSON.stringify({ error: error.message })}\n\n`, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}
