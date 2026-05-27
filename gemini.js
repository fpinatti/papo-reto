const { GoogleGenAI } = require('@google/genai');

/**
 * Initializes the Google Gen AI client.
 * The SDK automatically picks up the GEMINI_API_KEY environment variable.
 */
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  const project = process.env.GCP_PROJECT;
  
  if (apiKey) {
    console.log('Gemini Client: Authenticating via Google AI Studio (API Key)...');
    return new GoogleGenAI({ apiKey });
  } else if (project) {
    console.log(`Gemini Client: Authenticating via Vertex AI (GCP Project: ${project}, Location: ${process.env.GCP_LOCATION || 'us-central1'})...`);
    return new GoogleGenAI({
      project: project,
      location: process.env.GCP_LOCATION || 'us-central1'
    });
  } else {
    console.log('Gemini Client: No GEMINI_API_KEY or GCP_PROJECT defined. Attempting to authenticate via standard Application Default Credentials (ADC)...');
    return new GoogleGenAI({});
  }
}

/**
 * Summarizes a set of WhatsApp group messages using Gemini.
 * @param {string} chatName The name of the WhatsApp group
 * @param {Array<Object>} messages List of message records from the database
 * @returns {Promise<string>} The markdown summary
 */
async function generateGroupSummary(chatName, messages) {
  if (!messages || messages.length === 0) {
    return 'No new messages were found in the selected timeframe to summarize.';
  }

  const ai = getGeminiClient();

  // Format the transcript for the LLM
  let transcript = '';
  for (const msg of messages) {
    const dateStr = new Date(msg.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const sender = msg.sender_name || msg.sender_id || 'Unknown';
    transcript += `[${dateStr}] ${sender}: ${msg.body || '(Media or Empty)'}\n`;
  }

  const prompt = `You are "Papo Reto" (straight talk / sincere conversation), a direct, honest, and high-level AI summarization assistant. Your goal is to cut through the clutter of excessive chatter in the WhatsApp group "${chatName}" and extract only the main, straightforward, and sincere outcomes.

Generate a structured, straightforward, and visually engaging "Papo Reto" digest in Markdown format.

Your output must contain the following sections:
1. **💬 Papo Reto (Executive Straight Talk)**: A direct, honest 2-sentence summary of the conversation's core theme and tone. Avoid fluff.
2. **🎯 Direct Outcomes & Decisions**: Bullet points of key decisions, agreements, or solutions. Keep them extremely action-oriented and straightforward.
3. **🔥 Hot Topics & Debates**: Briefly highlight the main topics debated, capturing the different viewpoints sincerely.
4. **🔗 Shared Links & Resources**: List all shared URLs with a concise 1-sentence description.
5. **🛠️ Tools & Repositories Highlighted**: Bullet points of any tools, libraries, or GitHub repositories mentioned, with brief explanations.

If a section has no content, write a brief sentence explaining that nothing was shared in that category. Keep the tone concise, authentic, and direct.

Here is the transcript of the messages:
---
${transcript}
---
`;

  try {
    console.log(`Sending transcript of ${messages.length} messages for group "${chatName}" to Gemini API...`);
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    if (response && response.text) {
      return response.text;
    } else {
      throw new Error('Gemini API returned an empty response.');
    }
  } catch (error) {
    console.error('Error generating summary from Gemini:', error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

module.exports = {
  generateGroupSummary
};
