import type { ChatMessage, McpTool, ToolCaller, ToolTraceEntry } from '../types';
import { toGeminiSchema } from '../tool-schema';

type GeminiPart = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: unknown };

export async function runGeminiConversation(
  apiKey: string | undefined, model: string, messages: ChatMessage[], systemPrompt: string,
  tools: McpTool[], toolCaller?: ToolCaller,
): Promise<{ reply: string; toolTrace: ToolTraceEntry[] }> {
  if (!apiKey?.trim()) return { reply: 'ยังไม่ได้ตั้งค่า Gemini API key กรุณาตั้งค่า GEMINI_API_KEY ก่อนใช้งาน', toolTrace: [] };
  const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }],
  }));
  const toolTrace: ToolTraceEntry[] = [];
  for (let round = 0; round < 4; round += 1) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: systemPrompt }] }, contents,
      generationConfig: { temperature: 0.7 },
    };
    if (tools.length) body.tools = [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: toGeminiSchema(tool.inputSchema) })) }];
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) return { reply: `Gemini ตอบกลับผิดพลาด (${response.status}) กรุณาตรวจสอบ API key และ model`, toolTrace };
      const data = await response.json() as { candidates?: Array<{ content?: { role?: 'model'; parts?: GeminiPart[] } }> };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const call = parts.find((part) => part.functionCall)?.functionCall;
      if (!call || !toolCaller) return { reply: parts.find((part) => part.text)?.text ?? 'Gemini ไม่ได้ส่งข้อความตอบกลับ', toolTrace };
      const tool = tools.find((item) => item.name === call.name);
      if (!tool) return { reply: `ไม่พบ tool ${call.name}`, toolTrace };
      const args = call.args ?? {};
      const result = await toolCaller(tool, args);
      toolTrace.push({ serverId: tool.serverId, toolName: tool.name, arguments: args, result });
      contents.push({ role: 'model', parts });
      contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: { result } } }] });
    } catch { return { reply: 'เชื่อมต่อ Gemini ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', toolTrace }; }
  }
  return { reply: 'การเรียกเครื่องมือใช้จำนวนรอบเกินกำหนด กรุณาลองใหม่', toolTrace };
}