// File: app/classes/ai.js
const { OpenAI } = require('openai');
const db = require('../db');

class AI {
  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async getContext(key) {
    const [rows] = await db.query('SELECT content FROM ai_context WHERE key_name = ?', [key]);
    return rows[0]?.content || '';
  }

  async setContext(key, content) {
    await db.query(
      'INSERT INTO ai_context (key_name, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
      [key, content]
    );
  }

  async getCompletion(prompt, contextKey = null) {
    const context = contextKey ? await this.getContext(contextKey) : '';
    const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

    const chat = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a fantasy baseball expert providing strategic advice.' },
        { role: 'user', content: fullPrompt }
      ],
    });

    return chat.choices[0].message.content.trim();
  }
}

module.exports = AI;