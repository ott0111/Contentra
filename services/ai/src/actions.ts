export const AI_ACTIONS = ['create_content','analyze_content','find_opportunities','recommend_format','recommend_topic','create_calendar_plan','repurpose_content','improve_content','analyze_performance','create_campaign','prepare_publish','schedule_content'] as const;
export type AIActionType=typeof AI_ACTIONS[number];
export const requiresConfirmation=(type:AIActionType)=>['prepare_publish','schedule_content'].includes(type);
export function assertKnownAction(type:string):asserts type is AIActionType { if(!(AI_ACTIONS as readonly string[]).includes(type)) throw new Error(`Unsupported AI action: ${type}`); }
