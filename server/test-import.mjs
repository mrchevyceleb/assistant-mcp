console.error('Step 1: Starting imports...');

try {
  console.error('Step 2: Importing @modelcontextprotocol/sdk...');
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  console.error('Step 2: Done');

  console.error('Step 3: Importing StdioServerTransport...');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  console.error('Step 3: Done');

  console.error('Step 4: Importing express...');
  const express = await import('express');
  console.error('Step 4: Done');

  console.error('Step 5: Importing supabase lib...');
  const { initSupabase } = await import('./dist/lib/supabase.js');
  console.error('Step 5: Done');

  console.error('Step 6: Importing logger...');
  const { logger } = await import('./dist/lib/logger.js');
  console.error('Step 6: Done');

  console.error('Step 7: Importing tools...');
  const { metaTools } = await import('./dist/tools/meta.js');
  console.error('Step 7: Done - metaTools has', Object.keys(metaTools).length, 'tools');

  console.error('All imports successful!');
} catch (err) {
  console.error('ERROR:', err.message);
  console.error(err.stack);
}
