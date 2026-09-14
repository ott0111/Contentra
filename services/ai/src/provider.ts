export interface AIProviderRequest { model:string; input:string|unknown; context?:Record<string,unknown>; }
export interface AIProviderResponse<T=unknown> { output:T; inputUnits:number; outputUnits:number; model:string; provider:string; }
export interface AIProvider { generateText(request:AIProviderRequest):Promise<AIProviderResponse<string>>; generateStructuredOutput<T>(request:AIProviderRequest,schema:unknown):Promise<AIProviderResponse<T>>; analyze(request:AIProviderRequest):Promise<AIProviderResponse<unknown>>; classify(request:AIProviderRequest):Promise<AIProviderResponse<unknown>>; embed(request:AIProviderRequest):Promise<AIProviderResponse<number[]>>; }

type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };

export class GeminiProvider implements AIProvider {
  constructor(private readonly apiKey:string){ if(!apiKey) throw new Error('Gemini provider requires GEMINI_API_KEY'); }
  private async request<T>(request: AIProviderRequest, structured = false, schema?: unknown): Promise<AIProviderResponse<T>> {
    const model = request.model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const context = request.context ? `\nWorkspace context:\n${JSON.stringify(request.context)}` : '';
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: `${typeof request.input === 'string' ? request.input : JSON.stringify(request.input)}${context}` }] }],
      generationConfig: structured ? { responseMimeType: 'application/json', ...(schema ? { responseSchema: schema } : {}) } : undefined,
    };
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`GEMINI_HTTP_${response.status}`);
    const payload = await response.json() as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('') ?? '';
    if (!text) throw new Error('GEMINI_EMPTY_RESPONSE');
    const inputUnits = payload.usageMetadata?.promptTokenCount ?? 0;
    const outputUnits = payload.usageMetadata?.candidatesTokenCount ?? 0;
    return { output: (structured ? JSON.parse(text) : text) as T, inputUnits, outputUnits, model, provider: 'gemini' };
  }
  generateText(request:AIProviderRequest){ return this.request<string>(request); }
  generateStructuredOutput<T>(request:AIProviderRequest,schema:unknown){ return this.request<T>(request, true, schema); }
  analyze(request:AIProviderRequest){ return this.generateText({ ...request, input: `Analyze the following and return concise actionable findings:\n${typeof request.input === 'string' ? request.input : JSON.stringify(request.input)}` }); }
  classify(request:AIProviderRequest){ return this.generateText({ ...request, input: `Classify the following and return the best labels as JSON:\n${typeof request.input === 'string' ? request.input : JSON.stringify(request.input)}` }); }
  embed(_request:AIProviderRequest):Promise<AIProviderResponse<number[]>> { throw new Error('GEMINI_EMBEDDING_NOT_IMPLEMENTED'); }
}
