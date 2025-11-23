// api/update.js
import { Redis } from '@upstash/redis'
import OpenAI from 'openai';

const displayNameMap = {
  frankdegods: 'Zhihao',
  cupsey: 'Lingxi',
  jalen: 'Haoran',
  orangie: 'Xingyao',
  alon: 'Yuchen',
  baoskee: 'Yuchen',
  zachxbt: 'Zeyan',
  west: 'Xizhe',
  assassin: 'Youling',
  truman: 'Truman'
};

function getDisplayName(id) {
  return displayNameMap[id] || id;
}


const UPDATE_FREQUENCY = 0.3;
const npcNames = ['cupsey', 'jalen', 'orangie', 'alon', 'zachxbt', 'west', 'assassin'];

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  runtime: 'edge'
}

function selectNewTopic(sprite1, sprite2) {
  const topics = [
    'local events', 'hobbies', 'weather', 'town life', 
    'daily activities', 'community news', 'strange occurrences',
    'memory inconsistencies', 'reality questions', 'local mysteries'
  ];

  const usedTopics = new Set(sprite1.recentTopics || []);
  const availableTopics = topics.filter(t => !usedTopics.has(t));
  const newTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)] || topics[0];
  
  if (!sprite1.recentTopics) sprite1.recentTopics = [];
  sprite1.recentTopics.push(newTopic);
  if (sprite1.recentTopics.length > 3) sprite1.recentTopics.shift();
  
  return newTopic;
}

function getPersonalityTraits(characterId) {
    const personalities = {
        'frankdegods': 'NFT creator and entrepreneur, scammer, strategic thinker',
        'cupsey': 'Crypto trader and analyst, sharp wit, market-focused mindset',
        'jalen': 'Sports content creator, energetic, competitive personality',
        'orangie': 'Creative content creator, artistic, trend-aware influencer',
        'baoskee': 'Tech entrepreneur and investor, analytical, forward-thinking',
        'zachxbt': 'Blockchain investigator, detail-oriented, truth-seeking researcher',
        'west': 'Cultural commentator, philosophical, observant social critic',
        'assassin': 'Mysterious internet figure, secretive, observant and calculating'
    };
    return personalities[characterId] || 'Generic internet personality';
}

function updateRelationships(sprite1, sprite2, content) {
  if (!sprite1.relationships) sprite1.relationships = {};
  if (!sprite1.relationships[sprite2.id]) {
    sprite1.relationships[sprite2.id] = 'neutral';
  }

  const moodKeywords = {
    positive: ['happy', 'great', 'wonderful', 'agree', 'yes'],
    negative: ['concerned', 'worried', 'disagree', 'no', 'problem']
  };

  const sentiment = Object.entries(moodKeywords).find(([mood, words]) =>
    words.some(word => content.toLowerCase().includes(word))
  )?.[0] || 'neutral';

  sprite1.currentMood = sentiment;
  sprite1.lastInteraction = sprite1.lastInteraction || {};
  sprite1.lastInteraction[sprite2.id] = Date.now();
}

function checkCollision(x, y) {
  const forbiddenAreas = [
    { x: 300, y: 0, width: 100, height: 960 }, // River
  ];

  for (const area of forbiddenAreas) {
    if (x >= area.x && x <= area.x + area.width &&
        y >= area.y && y <= area.y + area.height) {
      return true;
    }
  }
  return false;
}

function calculateMovement(sprite, targetSprite, gameState) {
  // Stuck detection
  if (!sprite.lastPosition) sprite.lastPosition = { x: sprite.x, y: sprite.y };
  if (!sprite.stuckTimer) sprite.stuckTimer = 0;
 
  const movement = Math.abs(sprite.x - sprite.lastPosition.x) + Math.abs(sprite.y - sprite.lastPosition.y);
  if (movement < 1.5) {
    sprite.stuckTimer++;
    if (sprite.stuckTimer > 5) { // 20 seconds
      const randomSprite = gameState.sprites[Math.floor(Math.random() * gameState.sprites.length)];
      sprite.momentumX = 0;
      sprite.momentumY = 0;
      sprite.currentTarget = {
        x: randomSprite.x,
        y: randomSprite.y
      };
      sprite.stuckTimer = 0;
    }
  } else {
    sprite.stuckTimer = 0;
  }
  sprite.lastPosition = { x: sprite.x, y: sprite.y };
 
  const dx = targetSprite.x - sprite.x;
  const dy = targetSprite.y - sprite.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (!sprite.state) sprite.state = 'idle';
  if (!sprite.stateTimer) sprite.stateTimer = 0;
  if (!sprite.currentTarget) sprite.currentTarget = null;
  
  sprite.stateTimer--;
  
  if (sprite.stateTimer <= 0) {
    sprite.state = Math.random() < 0.6 ? 'moving' : 'idle';
    sprite.stateTimer = sprite.state === 'idle' ? 200 : 150;
    
    if (sprite.state === 'moving' && Math.random() < 0.3) {
      const randomX = Math.random() * 900 + 50;
      const randomY = Math.random() * 900 + 50;
      sprite.currentTarget = { x: randomX, y: randomY };
    }
 
    if (Math.random() < 0.4) {
      const otherSprites = gameState.sprites.filter(s => s.id !== sprite.id);
      sprite.currentTarget = otherSprites[Math.floor(Math.random() * otherSprites.length)];
    }
  }
 
  if (sprite.state === 'idle') {
    return { momentumX: 0, momentumY: 0 };
  }
 
  if (sprite.currentTarget) {
    const targetDx = sprite.currentTarget.x - sprite.x;
    const targetDy = sprite.currentTarget.y - sprite.y;
    const targetDist = Math.sqrt(targetDx * targetDx + targetDy * targetDy);
    return {
      momentumX: (sprite.momentumX || 0) * 0.95 + (targetDx / targetDist) * 3,
      momentumY: (sprite.momentumY || 0) * 0.95 + (targetDy / targetDist) * 3
    };
  }
 
  const targetDistance = 80;
  const strength = (distance - targetDistance) * 0.15;
  
  return {
    momentumX: (sprite.momentumX || 0) * 0.95 + (dx / distance) * strength,
    momentumY: (sprite.momentumY || 0) * 0.95 + (dy / distance) * strength
  };
}

function checkWinCondition(gameState) {
    const winner = gameState.sprites.find(sprite => (sprite.suspicionLevel || 0) >= 100);
    if (winner) {
        gameState.gameEnded = true;
        gameState.winner = winner.id;
        gameState.endTime = Date.now();
        
        if (!gameState.thoughts) gameState.thoughts = [];
        gameState.thoughts.push({
            spriteId: winner.id,
            thought: `I... I think I'm an AI copy of ${winner.id}. This whole reality is simulated!`,
            suspicionLevel: 100,
            timestamp: Date.now(),
            isWinningMoment: true
        });
    }
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }

  try {
    let gameState = await redis.get('gameState')
    
    if (!gameState) {
      gameState = {
          sprites: [
              {
                  id: 'frankdegods',
                  x: 450,
                  y: 500,
                  type: 'FrankDeGodsSprite',
                  isUnaware: true,
                  suspicionLevel: 0,
                  personalityType: 'frankdegods',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'cupsey',
                  x: 450,
                  y: 450,
                  type: 'CupseySprite',
                  isUnaware: true,
                  suspicionLevel: 0,
                  personalityType: 'cupsey',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'jalen',
                  x: 550,
                  y: 550,
                  type: 'JalenSprite',
                  isUnaware: true,
                  suspicionLevel: 0,
                  personalityType: 'jalen',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'orangie',
                  x: 400,
                  y: 500,
                  type: 'OrangieSprite',
                  isUnaware: true,
                  suspicionLevel: 0,
                  personalityType: 'orangie',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'alon',
                  x: 600,
                  y: 400,
                  type: 'AlonSprite',
                  isUnaware: true,
                  suspicionLevel: 0,
                  personalityType: 'alon',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'zachxbt',
                  x: 500,
                  y: 600,
                  type: 'ZachXBTSprite',
                  isUnaware: true,
                  suspicionLevel: 0,
                  personalityType: 'zachxbt',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'west',
                  x: 250,
                  y: 550,
                  type: 'WestSprite',
                  isUnaware: true,
                  suspicionLevel: 0,
                  personalityType: 'west',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              },
              {
                  id: 'assassin',
                  x: 650,
                  y: 650,
                  type: 'AssassinSprite',
                  isUnaware: true,
                  suspicionLevel: 0,
                  personalityType: 'assassin',
                  thoughts: [],
                  conversations: [],
                  memories: [],
                  momentumX: 0,
                  momentumY: 0,
                  currentMood: 'neutral',
                  recentTopics: [],
                  relationships: {},
                  lastInteraction: {}
              }
          ],
          time: Date.now(),
          thoughts: [],
          conversations: [],
          conversationHistory: [],
          currentTopic: null,
          topicDuration: 0,
          relationships: {},
          moodStates: {},
          currentEvent: null,
          votes: {
            "frankdegods": 0,
            "cupsey": 0,
            "jalen": 0,
            "orangie": 0,
            "alon": 0,
            "zachxbt": 0,
            "west": 0,
            "assassin": 0
          },
          voteStartTime: Date.now(),
          voteEndTime: Date.now() + (24 * 60 * 60 * 1000),
          activeVoting: true
      }
    }

    async function generateDialogue(sprite1, sprite2) {
      const recentHistory = (gameState.conversationHistory || [])
        .filter(c => (c.speaker === sprite1.id && c.listener === sprite2.id) || 
                     (c.speaker === sprite2.id && c.listener === sprite1.id))
        .slice(-5);
    
      const conversationTypes = {
        casual: [
            "daily observations", "local happenings", "weather patterns",
            "town changes", "community events", "personal stories",
            "local mysteries", "town traditions", "recent developments"
        ]
      };
    
      const conversationContexts = {
        morning: ["coffee runs", "daily planning", "opening routines"],
        afternoon: ["lunch breaks", "daily progress", "community activities"],
        evening: ["day reflection", "closing thoughts", "tomorrow's plans"],
        special: ["events", "anomalies", "concerns", "celebrations"]
      };
    
      const timeOfDay = new Date().getHours();
      const timeContext = 
          timeOfDay < 12 ? 'morning' :
          timeOfDay < 18 ? 'afternoon' : 'evening';
    
      const currentTopic = sprite1.recentTopics?.[sprite1.recentTopics.length - 1] || 
                          selectNewTopic(sprite1, sprite2);
      const mood = sprite1.currentMood || 'neutral';
      const relationship = (sprite1.relationships || {})[sprite2.id] || 'neutral';
      const context = recentHistory.length > 0 
        ? `Recent conversation:\n${recentHistory.map(h => `${h.speaker}: ${h.content}`).join('\n')}` 
        : '';
    
      const prompt = `你是 ${getDisplayName(sprite1.id)}，人物特质：${getPersonalityTraits(sprite1.id)}。
    当前怀疑程度：${sprite1.suspicionLevel || 0}/100
    
    现在在${timeContext}与 ${getDisplayName(sprite2.id)} 聊天，话题：${currentTopic}。

          Your mood: ${mood}
          Your relationship: ${relationship}
          
          ${context ? `Recent context:\n${context}` : ''}
          
          ${(sprite1.suspicionLevel || 0) > 30 ? 
              "You're starting to notice strange things about your world and memories." : 
              "You're living normally but might notice small oddities."}
          
          Have a natural conversation that reflects your personality and suspicion level.
          If you're suspicious, you might share concerns or ask probing questions.
          Keep responses conversational and brief.`;
    
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 75,
          temperature: 0.9,
          presence_penalty: 0.6,
          frequency_penalty: 0.8
      });
    
        const content = completion.choices[0].message.content
          .split('\n')[0]
          .replace(/^[^:]*:\s*/, '')
          .replace(/\s+[^:]*:.*$/, '')
          .replace(/^["']|["']$/g, '')
          .trim();
    
        updateRelationships(sprite1, sprite2, content);
    
        const dialogue = {
          speaker: sprite1.id,
          listener: sprite2.id,
          content,
          topic: currentTopic,
          mood: sprite1.currentMood,
          timestamp: Date.now()
        };
    
        if (!gameState.conversationHistory) gameState.conversationHistory = [];
        gameState.conversationHistory.push(dialogue);
        if (gameState.conversationHistory.length > 50) {
          gameState.conversationHistory = gameState.conversationHistory.slice(-50);
        }
    
        return dialogue;
      } catch (error) {
        console.error('Dialogue generation error:', error);
        return null;
      }
    }
  
  if (!gameState.sprites) {
      gameState.sprites = [];
  }

  gameState.sprites = await Promise.all(gameState.sprites.map(async sprite => {
    // Movement logic for all characters
    const otherSprites = gameState.sprites.filter(s => s.id !== sprite.id);
    const targetSprite = otherSprites[Math.floor(Math.random() * otherSprites.length)];
    
    const { momentumX, momentumY } = calculateMovement(sprite, targetSprite, gameState);
    sprite.momentumX = momentumX;
    sprite.momentumY = momentumY;

    // Thought generation for ALL characters
    if (Math.random() < 0.02) {
      try {
        const prompt = `你是 ${getDisplayName(sprite.id)}，人物特质：${getPersonalityTraits(sprite.id)}。
    当前怀疑程度：${sprite.suspicionLevel || 0}/100
            
            Generate a brief thought (max 20 words) based on your suspicion level:
            
            ${(sprite.suspicionLevel || 0) < 25 ? 
                "Low suspicion: Notice small oddities but rationalize them away." :
            (sprite.suspicionLevel || 0) < 50 ?
                "Medium suspicion: Starting to question patterns and inconsistencies." :
            (sprite.suspicionLevel || 0) < 75 ?
                "High suspicion: Actively investigating the nature of your reality." :
                "Very high: Close to realizing you might be an AI copy of a real person."
            }
            
            Make it specific to your personality type.`;
        
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 50,
            temperature: 0.7,
        });
        
        const thought = completion.choices[0].message.content;
        
        // Increase suspicion level
        if (!sprite.suspicionLevel) sprite.suspicionLevel = 0;
        sprite.suspicionLevel += Math.random() * 2;
        
        if (!gameState.thoughts) gameState.thoughts = [];
        gameState.thoughts.push({
            spriteId: sprite.id,
            thought: thought,
            suspicionLevel: sprite.suspicionLevel,
            timestamp: Date.now()
        });
      } catch (error) {
          console.error('Error generating thought:', error);
      }
    }

    // Conversation logic
    const distance = Math.sqrt(
      Math.pow(targetSprite.x - sprite.x, 2) + 
      Math.pow(targetSprite.y - sprite.y, 2)
    );
    
    if (distance < 80 && sprite.state === 'idle' && Math.random() < 0.3) {
      console.log(`${sprite.id} checking conversation with ${targetSprite.id}, distance:`, distance);
      const dialogue = await generateDialogue(sprite, targetSprite);
      if (dialogue) {
        console.log("Generated dialogue:", dialogue);
        if (!gameState.conversations) gameState.conversations = [];
        if (!sprite.conversations) sprite.conversations = [];
        if (!targetSprite.conversations) targetSprite.conversations = [];
        
        gameState.conversations.push(dialogue);
        sprite.conversations.push(dialogue);
        targetSprite.conversations.push(dialogue);
        
        if (gameState.conversations.length > 50) {
          gameState.conversations = gameState.conversations.slice(-50);
        }
        if (sprite.conversations.length > 10) {
          sprite.conversations = sprite.conversations.slice(-10);
        }
        if (targetSprite.conversations.length > 10) {
          targetSprite.conversations = targetSprite.conversations.slice(-10);
        }
        
        const response = await generateDialogue(targetSprite, sprite);
        if (response) {
          gameState.conversations.push(response);
          sprite.conversations.push(response);
          targetSprite.conversations.push(response);
        }
      }
    }

      let newX = Math.max(50, Math.min(910, sprite.x + sprite.momentumX));
      let newY = Math.max(50, Math.min(910, sprite.y + sprite.momentumY));
      
      if (checkCollision(newX, newY)) {
        newX = sprite.x;
        newY = sprite.y;
        sprite.momentumX = -sprite.momentumX;
        sprite.momentumY = -sprite.momentumY;
      }

      return {
        ...sprite,
        x: newX,
        y: newY,
        momentumX: sprite.momentumX,
        momentumY: sprite.momentumY,
        state: sprite.state,
        stateTimer: sprite.stateTimer,
        currentTarget: sprite.currentTarget,
        thoughts: sprite.thoughts,
        conversations: sprite.conversations
      };
    }));

    gameState.time = Date.now();
    
    checkWinCondition(gameState);
    await redis.set('gameState', gameState);

    return new Response(JSON.stringify(gameState), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('Update error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
}

