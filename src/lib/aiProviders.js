const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function callAI({ provider, model, apiKey, systemPrompt, messages }) {
  const formattedMessages = messages.map(m => ({ role: m.role, content: m.content }));

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: model || 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, ...formattedMessages],
    });
    return response.choices[0].message.content;
  }

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: model || 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: formattedMessages,
    });
    return response.content[0].text;
  }

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-1.5-flash' });
    const chat = geminiModel.startChat({
      history: formattedMessages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });
    const last = formattedMessages[formattedMessages.length - 1];
    const result = await chat.sendMessage(last.content);
    return result.response.text();
  }

  throw new Error(`Unknown provider: ${provider}`);
}

module.exports = { callAI };
