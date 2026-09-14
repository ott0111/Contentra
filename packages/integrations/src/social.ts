/** Provider-neutral OAuth and social API boundary. Provider URLs and credentials are
 * supplied by the API host; this package never reads or stores secrets. */
export type SocialProvider = 'instagram'|'tiktok'|'youtube'|'x';
export type SocialCapability = 'profile'|'content.read'|'metrics.read'|'audience.read'|'media.upload'|'publish.image'|'publish.video'|'publish.text'|'publish.scheduled'|'publish.delete'|'refresh';
export interface SocialPage<T>{items:T[];nextCursor?:string}
export interface SocialPost{externalId:string;publishedAt?:Date;caption?:string;permalink?:string;contentType?:string;media?:Record<string,unknown>;thumbnailUrl?:string;status?:string;metadata?:Record<string,unknown>}
export interface SocialMetrics{capturedAt?:Date;views?:number;reach?:number;likes?:number;comments?:number;shares?:number;saves?:number;clicks?:number;followers?:number;watchTimeSeconds?:number;engagementRate?:number;metadata?:Record<string,unknown>}
export interface SocialAudienceSnapshot{capturedAt?:Date;followers?:number;metadata?:Record<string,unknown>}
export interface PublishContentInput{caption?:string;media:Array<{url:string;mimeType:string}>;idempotencyKey:string;scheduledFor?:Date}
export interface PublishContentResult{externalId:string;status:'PUBLISHED'|'PROCESSING'|'QUEUED';permalink?:string;publishedAt?:Date;metadata?:Record<string,unknown>}

export interface OAuthProviderConfig {
  provider: SocialProvider;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
  capabilities: SocialCapability[];
  profileEndpoint?: string;
  revokeEndpoint?: string;
  postsEndpoint?: string;
  metricsEndpoint?: string;
  audienceEndpoint?: string;
  publishEndpoint?: string;
  normalizeProfile?: (payload: unknown) => SocialProfile;
}
export interface OAuthTokens { accessToken:string; refreshToken?:string; expiresAt?:Date; scopes:string[] }
export interface SocialProfile { externalId:string; username?:string; profile:Record<string,unknown> }
export interface Page<T> { items:T[]; nextCursor?:string }
export class ProviderError extends Error { constructor(public readonly provider:SocialProvider, public readonly code:string, message:string, public readonly retryAfterSeconds?:number){super(message)} }

function form(values:Record<string,string|undefined>){const body=new URLSearchParams();for(const [key,value] of Object.entries(values))if(value)body.set(key,value);return body}
function expiresAt(value:unknown){const seconds=typeof value==='number'?value:Number(value);return Number.isFinite(seconds)&&seconds>0?new Date(Date.now()+seconds*1000):undefined}

export class OAuthSocialAdapter {
  constructor(readonly config:OAuthProviderConfig, private readonly request:typeof fetch=fetch) {}
  supports(capability:SocialCapability){return this.config.capabilities.includes(capability)}
  authorizationUrl(state:string, codeChallenge?:string){
    const url=new URL(this.config.authorizationEndpoint);url.searchParams.set('client_id',this.config.clientId);url.searchParams.set('redirect_uri',this.config.redirectUri);url.searchParams.set('response_type','code');url.searchParams.set('scope',this.config.scopes.join(' '));url.searchParams.set('state',state);if(codeChallenge){url.searchParams.set('code_challenge',codeChallenge);url.searchParams.set('code_challenge_method','S256')}return url.toString();
  }
  async exchangeCode(code:string, codeVerifier?:string):Promise<OAuthTokens>{return this.token({grant_type:'authorization_code',code,redirect_uri:this.config.redirectUri,client_id:this.config.clientId,client_secret:this.config.clientSecret,code_verifier:codeVerifier})}
  async refresh(refreshToken:string):Promise<OAuthTokens>{if(!this.supports('refresh'))throw new ProviderError(this.config.provider,'UNSUPPORTED','This provider configuration does not support token refresh.');return this.token({grant_type:'refresh_token',refresh_token:refreshToken,client_id:this.config.clientId,client_secret:this.config.clientSecret})}
  async revoke(token:string):Promise<void>{if(!this.config.revokeEndpoint) return;let response:Response;try{response=await this.request(this.config.revokeEndpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:form({token,client_id:this.config.clientId,client_secret:this.config.clientSecret}),signal:AbortSignal.timeout(15_000)})}catch{throw new ProviderError(this.config.provider,'NETWORK_ERROR','The provider revocation endpoint could not be reached.')}if(!response.ok)throw new ProviderError(this.config.provider,`HTTP_${response.status}`,'The provider rejected the revocation request.',response.status===429?60:undefined)}
  async getProfile(tokens:OAuthTokens):Promise<SocialProfile>{if(!this.supports('profile')||!this.config.profileEndpoint||!this.config.normalizeProfile)throw new ProviderError(this.config.provider,'UNSUPPORTED','This provider configuration does not support profile retrieval.');let response:Response;try{response=await this.request(this.config.profileEndpoint,{headers:{authorization:`Bearer ${tokens.accessToken}`,accept:'application/json'},signal:AbortSignal.timeout(15_000)})}catch{throw new ProviderError(this.config.provider,'NETWORK_ERROR','The provider profile endpoint could not be reached.')}const payload=await response.json().catch(()=>({}));if(!response.ok)throw new ProviderError(this.config.provider,`HTTP_${response.status}`,'The provider rejected the profile request.',response.status===429?60:undefined);const profile=this.config.normalizeProfile(payload);if(!profile.externalId)throw new ProviderError(this.config.provider,'INVALID_PROFILE_RESPONSE','The provider did not return an account identifier.');return profile}
  async getPosts(tokens:OAuthTokens,cursor?:string):Promise<SocialPage<SocialPost>>{return this.operation('content.read',this.config.postsEndpoint,tokens,cursor)}
  async getPostMetrics(tokens:OAuthTokens,cursor?:string):Promise<SocialPage<SocialMetrics>>{return this.operation('metrics.read',this.config.metricsEndpoint,tokens,cursor)}
  async getAudience(tokens:OAuthTokens):Promise<SocialAudienceSnapshot>{const page=await this.operation('audience.read',this.config.audienceEndpoint,tokens);return page.items[0]??{}}
  async publishContent(tokens:OAuthTokens,input:PublishContentInput):Promise<PublishContentResult>{if(!this.supports('publish.text')&&!this.supports('publish.image')&&!this.supports('publish.video'))throw new ProviderError(this.config.provider,'UNSUPPORTED','This provider configuration does not support publishing.');if(!this.config.publishEndpoint)throw new ProviderError(this.config.provider,'NOT_CONFIGURED','Publishing is not configured for this provider.');const response=await this.request(this.config.publishEndpoint,{method:'POST',headers:{authorization:`Bearer ${tokens.accessToken}`,'content-type':'application/json','idempotency-key':input.idempotencyKey},body:JSON.stringify(input),signal:AbortSignal.timeout(30_000)}).catch(()=>{throw new ProviderError(this.config.provider,'NETWORK_ERROR','The provider publishing endpoint could not be reached.')});const payload=await response.json().catch(()=>({})) as Record<string,unknown>;if(!response.ok)throw new ProviderError(this.config.provider,`HTTP_${response.status}`,'The provider rejected publishing.',response.status===429?60:undefined);if(typeof payload.id!=='string'&&typeof payload.externalId!=='string')throw new ProviderError(this.config.provider,'INVALID_PUBLISH_RESPONSE','The provider did not return a published identifier.');return {externalId:String(payload.externalId??payload.id),status:payload.status==='PROCESSING'?'PROCESSING':payload.status==='QUEUED'?'QUEUED':'PUBLISHED',permalink:typeof payload.permalink==='string'?payload.permalink:undefined,publishedAt:typeof payload.publishedAt==='string'?new Date(payload.publishedAt):undefined,metadata:payload}}
  private async operation<T>(capability:SocialCapability,endpoint:string|undefined,tokens:OAuthTokens,cursor?:string):Promise<SocialPage<T>>{if(!this.supports(capability))throw new ProviderError(this.config.provider,'UNSUPPORTED',`This provider configuration does not support ${capability}.`);if(!endpoint)throw new ProviderError(this.config.provider,'NOT_CONFIGURED',`This provider operation is not configured.`);const url=new URL(endpoint);if(cursor)url.searchParams.set('cursor',cursor);const response=await this.request(url,{headers:{authorization:`Bearer ${tokens.accessToken}`,accept:'application/json'},signal:AbortSignal.timeout(20_000)}).catch(()=>{throw new ProviderError(this.config.provider,'NETWORK_ERROR','The provider endpoint could not be reached.')});const payload=await response.json().catch(()=>({})) as Record<string,unknown>;if(!response.ok)throw new ProviderError(this.config.provider,`HTTP_${response.status}`,'The provider rejected the request.',response.status===429?60:undefined);if(!Array.isArray(payload.items)&&!Array.isArray(payload.data))throw new ProviderError(this.config.provider,'INVALID_RESPONSE','The provider returned an unsupported response.');return {items:(Array.isArray(payload.items)?payload.items:payload.data) as T[],nextCursor:typeof payload.nextCursor==='string'?payload.nextCursor:typeof payload.cursor==='string'?payload.cursor:undefined}}
  private async token(values:Record<string,string|undefined>):Promise<OAuthTokens>{let response:Response;try{response=await this.request(this.config.tokenEndpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:form(values),signal:AbortSignal.timeout(15_000)})}catch{throw new ProviderError(this.config.provider,'NETWORK_ERROR','The provider token endpoint could not be reached.')}const payload=await response.json().catch(()=>({})) as Record<string,unknown>;if(!response.ok)throw new ProviderError(this.config.provider,String(payload.error??`HTTP_${response.status}`),typeof payload.error_description==='string'?payload.error_description:'The provider rejected the token request.',response.status===429?60:undefined);const accessToken=typeof payload.access_token==='string'?payload.access_token:'';if(!accessToken)throw new ProviderError(this.config.provider,'INVALID_TOKEN_RESPONSE','The provider did not return an access token.');return {accessToken,refreshToken:typeof payload.refresh_token==='string'?payload.refresh_token:undefined,expiresAt:expiresAt(payload.expires_in),scopes:typeof payload.scope==='string'?payload.scope.split(/[ ,]+/).filter(Boolean):this.config.scopes}}
}

export function providerFrom(value:string):SocialProvider|null { const provider=value.toLowerCase(); return provider==='instagram'||provider==='tiktok'||provider==='youtube'||provider==='x'?provider:null }
