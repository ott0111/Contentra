"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creditCost = creditCost;
exports.isCreditExempt = isCreditExempt;
var DEFAULT_COSTS = {
    "ai.generate_text": 2,
    "ai.analyze": 3,
    "ai.classify": 1,
    "ai.structured": 3,
    "ai.embed": 1,
    "intelligence.brand_analyze": 4,
    "intelligence.content_dna": 3,
    "intelligence.website_extract": 2,
    "recommendation.generate": 0,
    "content.generate": 5,
    "content.improve": 3,
    "content.repurpose": 3,
};
function creditCost(operation, override) {
    var _a, _b, _c;
    var configured = Number((_a = process.env["CREDIT_COST_".concat(operation.replaceAll(".", "_").toUpperCase())]) !== null && _a !== void 0 ? _a : "");
    if (Number.isFinite(configured) && configured >= 0)
        return configured;
    return (_c = (_b = override === null || override === void 0 ? void 0 : override[operation]) !== null && _b !== void 0 ? _b : DEFAULT_COSTS[operation]) !== null && _c !== void 0 ? _c : 0;
}
function isCreditExempt(operation) {
    return creditCost(operation) === 0;
}
