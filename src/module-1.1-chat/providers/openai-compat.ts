import type { ChatMessage, McpTool, ToolCaller, ToolTraceEntry } from '../types';

type OpenAiMessage = { role: string; content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string; name?: string };

export async function runOpenAiCompatConversation(
  baseUrl: string | undefined, apiKey: string | undefined, model: string, messages: ChatMessage[], systemPrompt: string,
  tools: McpTool[], toolCaller?: ToolCaller,
): Promise<{ reply: string; toolTrace: ToolTraceEntry[] }> {
  if (!baseUrl?.trim() || baseUrl.trim() === 'Replace base url') return { reply: 'ยังไม่ได้ตั้งค่า base URL ของ Custom gateway กรุณาตั้งค่า OPENAI_COMPAT_BASE_URL ก่อนใช้งาน', toolTrace: [] };
  if (!apiKey?.trim()) return { reply: 'ยังไม่ได้ตั้งค่า API key ของ provider นี้ กรุณาตั้งค่า OPENAI_COMPAT_API_KEY ก่อนใช้งาน', toolTrace: [] };
  const apiMessages: OpenAiMessage[] = [{ role: 'system', content: systemPrompt }, ...messages.map((message) => ({ role: message.role, content: message.content }))];
  const toolTrace: ToolTraceEntry[] = [];
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  for (let round = 0; round < 4; round += 1) {
    const body: Record<string, unknown> = { model, messages: apiMessages, temperature: 0.7 };
    if (tools.length) { body.tools = tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })); body.tool_choice = 'auto'; }
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
      if (!response.ok) return { reply: `AI provider ตอบกลับผิดพลาด (${response.status}) กรุณาตรวจสอบการตั้งค่า`, toolTrace };
      const data = await response.json() as { choices?: Array<{ message?: OpenAiMessage }> };
      const message = data.choices?.[0]?.message;
      if (!message) return { reply: 'AI provider ไม่ได้ส่งข้อความตอบกลับ', toolTrace };
      if (!message.tool_calls?.length || !toolCaller) return { reply: message.content ?? 'AI provider ไม่ได้ส่งข้อความตอบกลับ', toolTrace };
      apiMessages.push(message);
      for (const call of message.tool_calls) {
        const tool = tools.find((item) => item.name === call.function.name);
        if (!tool) continue;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments) as Record<string, unknown>; } catch { /* provider supplied invalid args */ }
        const result = await toolCaller(tool, args);
        toolTrace.push({ serverId: tool.serverId, toolName: tool.name, arguments: args, result });
        apiMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    } catch { return { reply: 'เชื่อมต่อ AI provider ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', toolTrace }; }
  }
  return { reply: 'การเรียกเครื่องมือใช้จำนวนรอบเกินกำหนด กรุณาลองใหม่', toolTrace };
}