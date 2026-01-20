#!/usr/bin/env node

/**
 * Migrate Memory from Memory Bank to Supabase
 *
 * Reads memory files from memory-bank storage
 * Inserts into Supabase memory table
 *
 * Note: This is a placeholder - adjust paths based on actual memory-bank structure
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Example memory entries to migrate
 * Replace with actual data from your memory-bank MCP or files
 */
const exampleMemories = [
  {
    title: 'Matt prefers concise communication',
    content: 'Matt dislikes corporate buzzwords and prefers direct, bullet-point style responses. No "wonderful", "magical", or excessive praise.',
    category: 'preference',
    tags: ['communication', 'style'],
  },
  {
    title: 'Kim Garst - AI Integration Project',
    content: 'Working on AI assistant integration for Kim Garst. Dashboard deployed at kim-dashboard.launch.mattjohnston.io. Updates every Monday and Friday.',
    project: 'KG-KimGarst',
    category: 'client',
    tags: ['kim-garst', 'ai', 'dashboard'],
  },
  {
    title: 'Elite Team - Weekly Update Schedule',
    content: 'Send weekly update emails every Monday and Friday to hudson@eliteteam.ai, krystina@eliteteam.ai, csm@eliteteam.ai. CC: mtjohnston42@gmail.com. Send from matt@eliteteam.ai.',
    project: 'EliteTeam',
    category: 'workflow',
    tags: ['elite-team', 'email', 'recurring'],
  },
];

async function main() {
  console.log('\n=== Migrating Memory to Supabase ===\n');

  let migrated = 0;
  let failed = 0;

  for (const memory of exampleMemories) {
    const { error } = await supabase.from('memory').insert(memory);

    if (error) {
      console.error(`✗ Failed to migrate: ${memory.title}`, error.message);
      failed++;
    } else {
      console.log(`✓ Migrated: ${memory.title}`);
      migrated++;
    }
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Failed: ${failed}`);
  console.log('\nNote: This migrated example memories. Update the script with actual memory-bank data.');
}

main().catch(console.error);
