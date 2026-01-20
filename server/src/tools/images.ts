import { z } from 'zod';
import { registerTool } from './meta.js';
import { getCredential } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

export const imageTools = {
  generate_image: {
    description: 'Generate an image using Gemini Imagen 3',
    inputSchema: z.object({
      prompt: z.string().min(1).max(1000),
      aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional().default('1:1'),
      number_of_images: z.number().min(1).max(4).optional().default(1),
    }),
    handler: async ({ prompt, aspect_ratio = '1:1', number_of_images = 1 }: any) => {
      const apiKey = await getCredential('gemini');

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImages?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            config: {
              aspectRatio: aspect_ratio,
              numberOfImages: number_of_images,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        logger.error('Gemini image generation error:', error);
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const data = await response.json() as any;

      return {
        prompt,
        images: data.generatedImages || [],
        count: data.generatedImages?.length || 0,
      };
    },
  },

  edit_image: {
    description: 'Edit an existing image using Gemini Imagen (mask-based editing)',
    inputSchema: z.object({
      prompt: z.string().min(1).max(1000),
      reference_image_base64: z.string().describe('Base64 encoded reference image'),
      mask_base64: z.string().optional().describe('Base64 encoded mask (white = edit area)'),
    }),
    handler: async ({ prompt, reference_image_base64, mask_base64 }: any) => {
      const apiKey = await getCredential('gemini');

      const payload: any = {
        prompt,
        image: {
          bytesBase64Encoded: reference_image_base64,
        },
      };

      if (mask_base64) {
        payload.mask = {
          bytesBase64Encoded: mask_base64,
        };
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-fast-generate-001:generateImages?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        logger.error('Gemini image edit error:', error);
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const data = await response.json() as any;

      return {
        prompt,
        edited_images: data.generatedImages || [],
        count: data.generatedImages?.length || 0,
      };
    },
  },
};

// Register image tools
registerTool('generate_image', 'images', imageTools.generate_image.description, imageTools.generate_image.inputSchema);
registerTool('edit_image', 'images', imageTools.edit_image.description, imageTools.edit_image.inputSchema);
