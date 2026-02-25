import { AxiosInstance } from "axios";
import axios from 'axios';
import type { QueryableDB } from '../db/db';

class AI {
    private db: QueryableDB;
    private apiKey: string;
    private client: AxiosInstance;

    constructor(db: QueryableDB) {
        this.db = db;
        this.apiKey = process?.env?.OPENAI_API_KEY ?? '';
        this.client = axios.create({
            baseURL: 'https://api.openai.com/v1',
            timeout: 30000, // 30 seconds
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
        }) as AxiosInstance;
    }

    async getContext(key: string): Promise<string> {
        const [rows] = await this.db.query<({ content: string })[]>('SELECT content FROM ai_context WHERE key_name = ?', [key]);
        return (rows as { content: string }[])[0]?.content || '';
    }

    async getContexts(): Promise<{ key_name: string; content: string }[] | undefined> {
        const [rows] = await this.db.query<({ key_name: string; content: string })[]>('SELECT key_name, content FROM ai_context');
        return (rows as { key_name: string; content: string }[]);
    }

    async setContext(key: string, content: string): Promise<void> {
        await this.db.query('INSERT INTO ai_context (key_name, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)', [key, content]);
    }

    async getCompletion(prompt: string, contextKey: string | null): Promise<string> {
        const context = contextKey ? await this.getContext(contextKey) : '';
        const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;
        const response = await this.client.post('/chat/completions', {
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: 'You are a fantasy baseball expert providing strategic advice.' },
                { role: 'user', content: fullPrompt }
            ],
        });
        return response.data.choices[0].message.content.trim();
    }
}