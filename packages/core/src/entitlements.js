"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canUseAdvancedAnalytics = exports.canUseFamilySeats = exports.canUseMultipleWorkspaces = exports.canUseAdvancedAI = exports.canUseCampaigns = exports.canUseBusinessApi = exports.canUseBusinessMode = exports.getLimit = exports.hasLimit = exports.hasFeature = exports.PLANS = void 0;
exports.PLANS = {
    FREE: {
        code: "FREE",
        features: [],
        limits: { workspaces: 1, team_members: 1, ai_credits: 100, connected_accounts: 2 },
    },
    PRO: {
        code: "PRO",
        features: [
            "advanced_analytics",
            "advanced_ai",
            "multiple_workspaces",
            "team_members",
            "advanced_recommendations",
            "advanced_publishing",
            "campaigns",
        ],
        limits: { workspaces: 5, team_members: 5, ai_credits: 2000, connected_accounts: 10 },
    },
    BUSINESS: {
        code: "BUSINESS",
        features: [
            "advanced_analytics",
            "advanced_ai",
            "business_intelligence",
            "business_api",
            "multiple_workspaces",
            "team_members",
            "advanced_recommendations",
            "advanced_publishing",
            "campaigns",
        ],
        limits: { workspaces: 25, team_members: 50, ai_credits: 10000, connected_accounts: 50 },
    },
    AGENCY: {
        code: "AGENCY",
        features: [
            "advanced_analytics",
            "advanced_ai",
            "business_intelligence",
            "business_api",
            "multiple_workspaces",
            "team_members",
            "advanced_recommendations",
            "advanced_publishing",
            "campaigns",
        ],
        limits: { workspaces: 100, team_members: 250, ai_credits: 25000, connected_accounts: 200 },
    },
};
var hasFeature = function (plan, feature) { var _a, _b; return (_b = (_a = exports.PLANS[plan]) === null || _a === void 0 ? void 0 : _a.features.includes(feature)) !== null && _b !== void 0 ? _b : false; };
exports.hasFeature = hasFeature;
var hasLimit = function (plan, key, value) {
    var _a;
    var limit = (_a = exports.PLANS[plan]) === null || _a === void 0 ? void 0 : _a.limits[key];
    return limit === undefined || value <= limit;
};
exports.hasLimit = hasLimit;
var getLimit = function (plan, key) { var _a; return (_a = exports.PLANS[plan]) === null || _a === void 0 ? void 0 : _a.limits[key]; };
exports.getLimit = getLimit;
// Semantic gates used by routes and clients. Prefer these over ad-hoc
// `plan === ...` comparisons so gating stays centralized.
var canUseBusinessMode = function (plan) { return (0, exports.hasFeature)(plan, "business_intelligence"); };
exports.canUseBusinessMode = canUseBusinessMode;
var canUseBusinessApi = function (plan) { return (0, exports.hasFeature)(plan, "business_api"); };
exports.canUseBusinessApi = canUseBusinessApi;
var canUseCampaigns = function (plan) { return (0, exports.hasFeature)(plan, "campaigns"); };
exports.canUseCampaigns = canUseCampaigns;
var canUseAdvancedAI = function (plan) { return (0, exports.hasFeature)(plan, "advanced_ai"); };
exports.canUseAdvancedAI = canUseAdvancedAI;
var canUseMultipleWorkspaces = function (plan) { return (0, exports.hasFeature)(plan, "multiple_workspaces"); };
exports.canUseMultipleWorkspaces = canUseMultipleWorkspaces;
var canUseFamilySeats = function (plan) { return (0, exports.hasFeature)(plan, "team_members"); };
exports.canUseFamilySeats = canUseFamilySeats;
var canUseAdvancedAnalytics = function (plan) { return (0, exports.hasFeature)(plan, "advanced_analytics"); };
exports.canUseAdvancedAnalytics = canUseAdvancedAnalytics;
