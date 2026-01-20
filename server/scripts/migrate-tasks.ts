#!/usr/bin/env node

/**
 * Migrate Tasks from Markdown to Supabase
 *
 * Reads task files from ../Assistant/01-Active/tasks/*.md
 * Parses filename format: [Project] - [Title] - Due YYYY-MM-DD.md
 * Inserts into Supabase tasks table
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const tasksDir = process.env.TASKS_DIR || '../../01-Active/tasks';

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const projectMap: Record<string, string> = {
  'EliteTeam': 'EliteTeam',
  'KG-KimGarst': 'KG-KimGarst',
  'YourProfitPartners': 'YourProfitPartners',
  'MattJohnston-io': 'MattJohnston-io',
  'Personal': 'Personal',
};

function parseTaskFilename(filename: string): { project: string; title: string; due_date: string } | null {
  // Format: [Project] - [Title] - Due YYYY-MM-DD.md
  const match = filename.match(/^(.*?)\s*-\s*(.*?)\s*-\s*Due\s*(\d{4}-\d{2}-\d{2})\.md$/i);

  if (!match) {
    console.warn(`Skipping file with invalid format: ${filename}`);
    return null;
  }

  const [, projectRaw, title, due_date] = match;
  const project = projectMap[projectRaw.trim()] || 'Personal';

  return { project, title: title.trim(), due_date };
}

async function parseTaskContent(content: string): Promise<{
  description?: string;
  status: string;
  priority: string;
  checklist: Array<{ text: string; completed: boolean }>;
  notes?: string;
}> {
  const lines = content.split('\n');

  let description = '';
  let status = 'not_started';
  let priority = 'medium';
  const checklist: Array<{ text: string; completed: boolean }> = [];
  let notes = '';

  let inChecklist = false;
  let inNotes = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse status
    if (trimmed.startsWith('**Status:**')) {
      const statusMatch = trimmed.match(/\*\*Status:\*\*\s*(.+)/);
      if (statusMatch) {
        const s = statusMatch[1].toLowerCase();
        if (['not_started', 'in_progress', 'completed', 'blocked'].includes(s)) {
          status = s;
        }
      }
    }

    // Parse priority
    if (trimmed.startsWith('**Priority:**')) {
      const priorityMatch = trimmed.match(/\*\*Priority:\*\*\s*(.+)/);
      if (priorityMatch) {
        const p = priorityMatch[1].toLowerCase();
        if (['low', 'medium', 'high', 'urgent'].includes(p)) {
          priority = p;
        }
      }
    }

    // Parse checklist
    if (trimmed.startsWith('## Checklist') || trimmed.startsWith('## Tasks')) {
      inChecklist = true;
      continue;
    }

    if (inChecklist && trimmed.startsWith('- [ ]')) {
      checklist.push({ text: trimmed.substring(5).trim(), completed: false });
    } else if (inChecklist && trimmed.startsWith('- [x]')) {
      checklist.push({ text: trimmed.substring(5).trim(), completed: true });
    } else if (inChecklist && trimmed.startsWith('##')) {
      inChecklist = false;
    }

    // Parse notes
    if (trimmed.startsWith('## Notes') || trimmed.startsWith('## Description')) {
      inNotes = true;
      continue;
    }

    if (inNotes && !trimmed.startsWith('##')) {
      notes += line + '\n';
    } else if (inNotes && trimmed.startsWith('##')) {
      inNotes = false;
    }

    // First paragraph as description
    if (!description && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('**')) {
      description += line + '\n';
    }
  }

  return {
    description: description.trim() || undefined,
    status,
    priority,
    checklist,
    notes: notes.trim() || undefined,
  };
}

async function main() {
  console.log('\n=== Migrating Tasks from Markdown to Supabase ===\n');

  const files = await readdir(tasksDir);
  const taskFiles = files.filter(f => f.endsWith('.md'));

  console.log(`Found ${taskFiles.length} task files\n`);

  let migrated = 0;
  let skipped = 0;

  for (const file of taskFiles) {
    const parsed = parseTaskFilename(file);

    if (!parsed) {
      skipped++;
      continue;
    }

    const filepath = join(tasksDir, file);
    const content = await readFile(filepath, 'utf-8');
    const taskData = await parseTaskContent(content);

    const { error } = await supabase.from('tasks').insert({
      project: parsed.project,
      title: parsed.title,
      due_date: parsed.due_date,
      description: taskData.description,
      status: taskData.status,
      priority: taskData.priority,
      checklist: taskData.checklist,
      notes: taskData.notes,
    });

    if (error) {
      console.error(`✗ Failed to migrate ${file}:`, error.message);
      skipped++;
    } else {
      console.log(`✓ Migrated: ${parsed.project} - ${parsed.title}`);
      migrated++;
    }
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch(console.error);
