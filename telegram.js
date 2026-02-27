import { Telegraf } from 'telegraf';
import { buffer } from 'micro';
import { fileTypeFromBuffer } from 'file-type';
import { TextDecoder } from 'util';
import ExifParser from 'exif-parser';

const bot = new Telegraf(process.env.BOT_TOKEN);

// Start command
bot.start(async (ctx) => {
  await ctx.replyWithMarkdown(`
👋 *Welcome to SD Metadata Parser Bot!*

I help analyze metadata from images created with Stable Diffusion.

Just send me a PNG or JPEG file (up to 20MB), and I'll extract:
- Prompts and negative prompts
- Generation parameters
- ComfyUI workflow (if available)

Use /help for command list.
  `);
});

// Help command
bot.help(async (ctx) => {
  await ctx.replyWithMarkdown(`
📚 *Available commands:*

/start - Welcome message
/help - Bot help guide

📁 *How to use:*
1. Send a PNG/JPEG file (max 20MB)
2. I'll automatically analyze metadata
3. Receive structured information:

📝 Prompt - Main generation prompt
🚫 Negative prompt - Negative prompt
⚙️ Parameters - Generation parameters
📋 Other metadata - Additional data

🛠 *Supported formats:*
- PNG with A1111 metadata
- JPEG with EXIF data (JPEG is broken)
- ComfyUI workflow (embedded in PNG)

⚠️ *Limitations:*
- Max file size: 20MB
- No .safetensors file support
  `);
});

function detectActualImageType(buf) {
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
    return 'png';
  }
  if (buf.slice(0, 2).equals(Buffer.from([0xFF, 0xD8]))) {
    return 'jpeg';
  }
  return 'unknown';
}

function parsePNG(buf) {
  let offset = 8;
  const chunks = {};
  let decodedWorkflow = null;

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'tEXt') {
      const data = buf.slice(offset + 8, offset + 8 + length);
      const [key, value] = data.toString().split('\0');
      chunks[key] = value;

      if (key === 'workflow') {
        try {
          const decoded = Buffer.from(value, 'base64').toString('utf-8');
          decodedWorkflow = JSON.parse(decoded);
        } catch {}
      }
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }

  if (decodedWorkflow) {
    chunks.workflow_decoded = decodedWorkflow;
  }

  return chunks;
}

function parseJPEG(buf) {
  const output = {};
  
  try {
    const parser = ExifParser.create(buf);
    const result = parser.parse();
    
    const fields = ['UserComment', 'ImageDescription', 'XPComment', 'Artist', 'Copyright', 'Software', 'DocumentName'];
    
    for (const field of fields) {
      let value = result.tags[field];
      if (!value) continue;
      
      if (Buffer.isBuffer(value)) {
        value = value.filter(b => b !== 0).toString('utf-8').trim();
      } else {
        value = String(value).trim();
      }
      
      if (!value) continue;
      
      if (value.includes('Negative prompt:') || value.includes('Steps:') || value.includes('Sampler:')) {
        output.parameters = value;
        continue;
      }
      
      if (value.includes('{') && value.includes('"class_type"')) {
        try {
          output.workflow_decoded = JSON.parse(value);
          continue;
        } catch {
          try {
            const decoded = Buffer.from(value, 'base64').toString('utf-8');
            output.workflow_decoded = JSON.parse(decoded);
            continue;
          } catch {}
        }
      }
      
      if (value.length > 100 && /^[A-Za-z0-9+/]+=*$/.test(value)) {
        try {
          const decoded = Buffer.from(value, 'base64').toString('utf-8');
          if (decoded.includes('Negative prompt:') || decoded.includes('Steps:')) {
            output.parameters = decoded;
            continue;
          }
          if (decoded.includes('"class_type"')) {
            try {
              output.workflow_decoded = JSON.parse(decoded);
              continue;
            } catch {}
          }
        } catch {}
      }
      
      output[field] = value;
    }
    
  } catch (e) {
    console.error('EXIF parsing failed:', e);
  }
  
  return output;
}

// Escapes special characters for MarkdownV2
function escapeMarkdownV2(text) {
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let escaped = text;
  for (const char of specialChars) {
    escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
  }
  return escaped;
}

function extractLoraHashesFromMetadata(metadata) {
  const loraHashes = {};
  
  if (metadata.parameters) {
    const hashesMatch = metadata.parameters.match(/Hashes:\s*({[^}]+})/);
    if (hashesMatch) {
      try {
        const hashesJson = JSON.parse(hashesMatch[1]);
        for (const [key, hash] of Object.entries(hashesJson)) {
          if (key.startsWith('lora:')) {
            const loraName = key.replace('lora:', '');
            loraHashes[loraName] = hash;
          }
        }
      } catch (e) {
        console.error('Error parsing hashes JSON:', e);
      }
    }
  }
  
  return loraHashes;
}

async function getCivitaiModelInfo(hash) {
  try {
    const response = await fetch(`https://civitai.com/api/v1/model-versions/by-hash/${hash}`);
    if (response.ok) {
      const data = await response.json();
      return {
        modelId: data.modelId,
        name: data.model?.name || 'Unknown',
        versionName: data.name || 'Unknown Version',
        url: `https://civitai.com/models/${data.modelId}`
      };
    }
  } catch (error) {
    console.error('Error fetching from Civitai API:', error);
  }
  return null;
}

async function getCivitaiModelsInfo(hashes) {
  const results = {};
  const promises = [];
  
  for (const [name, hash] of Object.entries(hashes)) {
    promises.push(
      getCivitaiModelInfo(hash).then(info => {
        if (info) {
          results[name] = info;
        }
      })
    );
  }
  
  await Promise.all(promises);
  return results;
}

async function extractLoraNamesFromPrompt(text, loraHashes = {}) {
  const loraRegex = /<lora:([\w\-\\\/\.]+):([\d\.]+)>/gi;
  const found = [];
  let match;
  
  while (match = loraRegex.exec(text)) {
    const fullName = match[1];
    const name = fullName.split(/[\\/]/).pop();
    const strength = match[2];
    
    let hash = null;
    
    if (loraHashes[fullName]) {
      hash = loraHashes[fullName];
    } else if (loraHashes[name]) {
      hash = loraHashes[name];
    }
    
    found.push({
      name,
      strength,
      hash
    });
  }
  
  return found;
}

async function extractComfyLorasWithHashes(workflow, loraHashes = {}) {
  const comfyLoras = [];
  
  for (const node of Object.values(workflow)) {
    if (
      node?.class_type?.toLowerCase().includes('loader') &&
      typeof node?.inputs === 'object'
    ) {
      for (const [key, val] of Object.entries(node.inputs)) {
        if (
          key.startsWith('lora_') &&
          typeof val === 'object' &&
          val.lora &&
          val.on !== false
        ) {
          const name = val.lora.replace(/\\/g, '/').split('/').pop();
          const strength = typeof val.strength === 'number' ? val.strength : '?';
          
          let hash = loraHashes[name] || null;
          
          comfyLoras.push({
            name,
            strength,
            hash
          });
        }
      }
    }
  }
  
  return comfyLoras;
}

async function formatLorasWithCivitaiInfo(loras, ctx) {
  if (loras.length === 0) return;
  
  const hashesToQuery = {};
  loras.forEach(lora => {
    if (lora.hash) {
      hashesToQuery[lora.name] = lora.hash;
    }
  });
  
  const civitaiInfo = await getCivitaiModelsInfo(hashesToQuery);
  
  const formatted = loras.map(lora => {
    const info = civitaiInfo[lora.name];
    const escapedName = escapeMarkdownV2(lora.name);
    const escapedStrength = escapeMarkdownV2(String(lora.strength));
    if (info) {
      const escapedModel = escapeMarkdownV2(info.name);
      const escapedVersion = escapeMarkdownV2(info.versionName);
      return `• [${escapedModel}](${info.url}) \\- ${escapedVersion} \\(strength: ${escapedStrength}\\)`;
    } else {
      return `• ${escapedName} \\(strength: ${escapedStrength}\\)`;
    }
  });

  await ctx.reply('🎨 LoRAs:\n' + formatted.join('\n'), { parse_mode: 'MarkdownV2' });
}

async function sendFormattedMetadata(ctx, plainMetadata) {
  try {
    let mainPrompt = '';
    let negativePrompt = '';
    let technicalParams = '';
    
    const loraHashes = extractLoraHashesFromMetadata(plainMetadata);

    if (plainMetadata.parameters) {
      const paramsText = plainMetadata.parameters;
      const negativeIndex = paramsText.indexOf('Negative prompt:');

      if (negativeIndex >= 0) {
        const nextLine = paramsText.indexOf('\n', negativeIndex);
        negativePrompt = paramsText.substring(
          negativeIndex + 'Negative prompt:'.length,
          nextLine > negativeIndex ? nextLine : paramsText.length
        ).trim();
      }

      mainPrompt = negativeIndex >= 0
        ? paramsText.substring(0, negativeIndex).trim()
        : paramsText;

      if (negativeIndex >= 0) {
        const paramsStart = paramsText.indexOf('\n', negativeIndex + negativePrompt.length);
        if (paramsStart > 0) {
          technicalParams = paramsText.substring(paramsStart).trim();
        }
      }
    }

    if (mainPrompt) {
      await ctx.reply(`📝 Prompt:\n\`\`\`\n${escapeMarkdownV2(mainPrompt.substring(0, 4000))}\n\`\`\``, { parse_mode: 'MarkdownV2' });
    }

    if (negativePrompt) {
      await ctx.reply(`🚫 Negative prompt:\n\`\`\`\n${escapeMarkdownV2(negativePrompt.substring(0, 4000))}\n\`\`\``, { parse_mode: 'MarkdownV2' });
    }

    if (technicalParams) {
      await ctx.reply(`⚙️ Parameters:\n\`\`\`\n${escapeMarkdownV2(technicalParams)}\n\`\`\``, { parse_mode: 'MarkdownV2' });
    }

    // LoRA из промпта
    const combinedPrompt = (mainPrompt || '') + '\n' + (negativePrompt || '');
    const promptLoras = await extractLoraNamesFromPrompt(combinedPrompt, loraHashes);

    // ComfyUI workflow
    for (const [key, val] of Object.entries(plainMetadata)) {
      if (typeof val === 'string' && val.includes('"class_type"')) {
        const parsed = tryParseJson(val);
        if (parsed && Object.values(parsed).some(n => n?.class_type)) {
          await ctx.reply(`📄 Embedded ComfyUI workflow found in "${key}". Sending as comfyui_workflow.json...`);
          await sendMetadataAsTxt(ctx, parsed, 'comfyui_workflow.json');

          const comfyLoras = await extractComfyLorasWithHashes(parsed, loraHashes);
          if (comfyLoras.length > 0) {
            await formatLorasWithCivitaiInfo(comfyLoras, ctx);
          }
          break;
        }
      }
    }

    if (promptLoras.length > 0) {
      await formatLorasWithCivitaiInfo(promptLoras, ctx);
    }

  } catch (err) {
    console.error('Error in sendFormattedMetadata:', err);
    await ctx.reply('⚠️ Failed to format metadata.');
  }
}

async function sendMetadataAsTxt(ctx, metadata, filename) {
  try {
    const content = typeof metadata === 'string'
      ? metadata
      : JSON.stringify(metadata, null, 2);
    await ctx.replyWithDocument({
      source: Buffer.from(content, 'utf-8'),
      filename: filename
    });
  } catch (error) {
    console.error('Error sending file:', error);
    await ctx.reply('❌ Failed to send file.');
  }
}

function tryParseJson(str) {
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return null;
}

bot.on('document', async (ctx) => {
  try {
    const file = ctx.message.document;
    
    const ext = file.file_name.toLowerCase().split('.').pop();
    if (!['png', 'jpg', 'jpeg'].includes(ext)) {
      return await ctx.reply('❌ I only process PNG and JPEG images.\nUse /help for guidance.');
    }

    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const res = await fetch(fileLink.href);
    
    if (res.headers.get('content-length') > 20 * 1024 * 1024) {
      return await ctx.reply('❌ File is too big (max 20MB).\nUse /help for guidance.');
    }

    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    let type = await fileTypeFromBuffer(buf);
    let actualType = detectActualImageType(buf);

    if (actualType === 'png') type = { mime: 'image/png' };
    else if (actualType === 'jpeg') type = { mime: 'image/jpeg' };

    if (type?.mime === 'image/png') {
      const metadata = parsePNG(buf);
      const { workflow_decoded, ...plainMetadata } = metadata;

      await ctx.reply('🖼️ PNG Metadata:');
      await sendFormattedMetadata(ctx, plainMetadata);

      if (workflow_decoded) {
        await ctx.reply('📄 ComfyUI workflow detected. Sending as comfyui_workflow.json...');
        await sendMetadataAsTxt(ctx, workflow_decoded, 'comfyui_workflow.json');
      }
      return;
    }

    if (type?.mime === 'image/jpeg') {
      const metadata = parseJPEG(buf);
      const { workflow_decoded, ...plainMetadata } = metadata;

      await ctx.reply('📷 JPEG Metadata:');
      await sendFormattedMetadata(ctx, plainMetadata);

      if (workflow_decoded) {
        await ctx.reply('📄 ComfyUI workflow detected in JPEG. Sending as comfyui_workflow.json...');
        await sendMetadataAsTxt(ctx, workflow_decoded, 'comfyui_workflow.json');
      }
      return;
    }

    await ctx.reply('❌ Unsupported file type.');
  } catch (error) {
    console.error('Document processing error:', error);
    
    if (error.response?.description?.includes('file is too big')) {
      await ctx.reply('❌ Telegram rejected the file: too large (max 20MB).\nUse /help for guidance.');
    } else {
      await ctx.reply('❌ Error processing file. Please try another or use /help.');
    }
  }
});

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const buf = await buffer(req);
      await bot.handleUpdate(JSON.parse(buf.toString()));
      res.status(200).send('ok');
    } catch (error) {
      console.error('Handler error:', error);
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.status(200).send('This is the Telegram bot endpoint.');
  }
}
