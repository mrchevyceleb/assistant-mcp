import { z } from 'zod';
import { registerTool } from './meta.js';
import { getCredential } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

// Gemini 3 Pro Image Preview - the recommended model for image generation
const IMAGE_MODEL = 'gemini-3-pro-image-preview';

export const imageTools = {
  generate_image: {
    description: 'Generate an image using Gemini 3 Pro Image Preview',
    inputSchema: z.object({
      prompt: z.string().min(1).max(2000).describe('Detailed description of the image to generate'),
      aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional().default('1:1'),
    }),
    handler: async ({ prompt, aspect_ratio = '1:1' }: any) => {
      const apiKey = await getCredential('gemini');

      // Gemini 3 uses generateContent endpoint with image generation config
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
              imageGenerationConfig: {
                aspectRatio: aspect_ratio,
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        logger.error('Gemini image generation error:', error);
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${error}`);
      }

      const data = await response.json() as any;

      // Extract images from response
      const images: Array<{ base64: string; mimeType: string }> = [];
      
      if (data.candidates && data.candidates[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
          if (part.inlineData) {
            images.push({
              base64: part.inlineData.data,
              mimeType: part.inlineData.mimeType || 'image/png',
            });
          }
        }
      }

      return {
        prompt,
        images,
        count: images.length,
        model: IMAGE_MODEL,
      };
    },
  },

  edit_image: {
    description: 'Edit an existing image using Gemini 3 Pro (provide image + edit instructions)',
    inputSchema: z.object({
      prompt: z.string().min(1).max(2000).describe('Instructions for how to edit the image'),
      image_base64: z.string().describe('Base64 encoded image to edit'),
      mime_type: z.string().optional().default('image/png').describe('MIME type of the input image'),
    }),
    handler: async ({ prompt, image_base64, mime_type = 'image/png' }: any) => {
      const apiKey = await getCredential('gemini');

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: mime_type,
                      data: image_base64,
                    },
                  },
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        logger.error('Gemini image edit error:', error);
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${error}`);
      }

      const data = await response.json() as any;

      // Extract edited images from response
      const images: Array<{ base64: string; mimeType: string }> = [];
      
      if (data.candidates && data.candidates[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
          if (part.inlineData) {
            images.push({
              base64: part.inlineData.data,
              mimeType: part.inlineData.mimeType || 'image/png',
            });
          }
        }
      }

      return {
        prompt,
        edited_images: images,
        count: images.length,
        model: IMAGE_MODEL,
      };
    },
  },
};

// Register image tools
registerTool('generate_image', 'images', imageTools.generate_image.description, imageTools.generate_image.inputSchema);
registerTool('edit_image', 'images', imageTools.edit_image.description, imageTools.edit_image.inputSchema);
