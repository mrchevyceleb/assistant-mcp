#!/usr/bin/env node

/**
 * Setup Script - Store encrypted credentials in Supabase
 *
 * Usage: npm run setup-credentials
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '../src/lib/encryption.js';
import * as readline from 'readline/promises';
import { stdin, stdout } from 'process';

dotenv.config();

const rl = readline.createInterface({ input: stdin, output: stdout });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const services = [
  { name: 'brave_search', envKey: 'BRAVE_SEARCH_API_KEY', description: 'Brave Search API' },
  { name: 'perplexity', envKey: 'PERPLEXITY_API_KEY', description: 'Perplexity API' },
  { name: 'gemini', envKey: 'GEMINI_API_KEY', description: 'Gemini API (images)' },
  { name: 'github', envKey: 'GITHUB_TOKEN', description: 'GitHub Personal Access Token' },
  { name: 'vercel', envKey: 'VERCEL_TOKEN', description: 'Vercel API Token' },
  { name: 'hubspot', envKey: 'HUBSPOT_API_KEY', description: 'HubSpot API Key' },
  { name: 'ghl', envKey: 'GHL_API_KEY', description: 'GoHighLevel API Key' },
  { name: 'n8n', envKey: 'N8N_API_KEY', description: 'n8n API Key' },
  { name: 'elevenlabs', envKey: 'ELEVENLABS_API_KEY', description: 'ElevenLabs API Key' },
  { name: 'openai', envKey: 'OPENAI_API_KEY', description: 'OpenAI API Key (Whisper)' },
];

async function storeCredential(service: string, apiKey: string, metadata: any = {}) {
  const encrypted = encrypt(apiKey);

  const { error } = await supabase
    .from('credentials')
    .upsert({ service, api_key_encrypted: encrypted, metadata });

  if (error) {
    console.error(`Failed to store ${service}:`, error);
    return false;
  }

  console.log(`✓ Stored ${service}`);
  return true;
}

async function main() {
  console.log('\n=== Matt\'s MCP Server - Credential Setup ===\n');

  for (const svc of services) {
    const envValue = process.env[svc.envKey];

    if (envValue) {
      console.log(`\nFound ${svc.description} in .env`);
      const confirm = await rl.question(`Store it in Supabase? (y/n): `);

      if (confirm.toLowerCase() === 'y') {
        const metadata = svc.name === 'n8n' ? { base_url: process.env.N8N_BASE_URL } : {};
        await storeCredential(svc.name, envValue, metadata);
      }
    } else {
      console.log(`\n${svc.description} not found in .env`);
      const manual = await rl.question(`Enter manually? (y/n): `);

      if (manual.toLowerCase() === 'y') {
        const key = await rl.question(`Enter ${svc.description}: `);
        if (key.trim()) {
          const metadata = svc.name === 'n8n'
            ? { base_url: await rl.question('Enter n8n base URL: ') }
            : {};
          await storeCredential(svc.name, key.trim(), metadata);
        }
      }
    }
  }

  console.log('\n✓ Credential setup complete!\n');
  rl.close();
}

main().catch(console.error);
